// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { readMobileRuntimeConfig } from './config';
import {
  configureOfflineState,
  dispatchMobileDeepLink,
  dispatchMobilePushAction,
  dispatchMobilePushToken,
  extractPushActionData,
  parseDeepLink,
  routeFromDeepLink,
  shouldRegisterForPush,
} from './native';
import { parseSessionLockState } from './session';
import { supportsPlatformBiometrics } from './biometric';
import { editorKindForLayout, getResponsiveLayoutState } from '@vibecore/editor';
import { launchMobileBootstrap } from './bootstrap-launch';

describe('mobile native adapters', () => {
  it('reads runtime config from env without hardcoding API URLs', () => {
    expect(
      readMobileRuntimeConfig({
        VITE_API_BASE_URL: 'https://api.example.com/',
        VITE_WEB_APP_ORIGIN: 'https://app.example.com/',
        VITE_MOBILE_PUSH_NOTIFICATIONS: '0',
      }),
    ).toMatchObject({
      apiBaseUrl: 'https://api.example.com',
      webAppOrigin: 'https://app.example.com',
      allowPushNotifications: false,
    });
  });

  it('parses supported app and universal links', () => {
    expect(parseDeepLink('vibecore://projects/project_123/ide')?.protocol).toBe('vibecore:');
    expect(parseDeepLink('https://app.example.com/projects/project_123/ide')?.pathname).toBe(
      '/projects/project_123/ide',
    );
    expect(parseDeepLink('https://app.example.com/@henri45/voltwatt?panel=preview')?.pathname).toBe(
      '/@henri45/voltwatt',
    );
    expect(parseDeepLink('ftp://example.com')).toBeUndefined();
  });

  it('normalizes custom scheme and canonical project deep-link routes for the web frame', () => {
    expect(routeFromDeepLink(new URL('vibecore://projects/project_123/ide?panel=security'))).toBe(
      '/projects/project_123/ide?panel=security',
    );
    expect(routeFromDeepLink(new URL('https://app.example.com/@henri45/voltwatt?panel=preview'))).toBe(
      '/@henri45/voltwatt?panel=preview',
    );
  });

  it('collapses protocol-relative routes so a deep link cannot escape the web origin', () => {
    // `new URL('//evil.com/x', origin)` would resolve to https://evil.com/x —
    // these must stay single-slash paths anchored to our origin.
    expect(routeFromDeepLink(new URL('vibecore:////evil.com/x'))).toBe('/evil.com/x');
    expect(routeFromDeepLink(new URL('https://app.example.com//evil.com/pwn'))).toBe('/evil.com/pwn');
    expect(routeFromDeepLink(new URL('vibecore://')).startsWith('//')).toBe(false);
  });

  it('uses the mobile CodeMirror editor fallback on phones and tablets', () => {
    expect(editorKindForLayout(getResponsiveLayoutState(390, 844, { coarsePointer: true }))).toBe('codemirror');
    expect(editorKindForLayout(getResponsiveLayoutState(820, 1180, { coarsePointer: true }))).toBe('codemirror');
    expect(editorKindForLayout(getResponsiveLayoutState(1024, 768, { coarsePointer: true }))).toBe('codemirror');
  });

  it('normalizes persisted lock state without storing secrets', () => {
    expect(
      parseSessionLockState(
        JSON.stringify({
          locked: true,
          biometricEnabled: true,
          sessionToken: 'must-not-round-trip',
          userHint: 'ada@example.com',
        }),
      ),
    ).toEqual({
      locked: true,
      biometricEnabled: true,
      userHint: 'ada@example.com',
    });
  });

  it('detects platform biometric capability through WebAuthn', () => {
    expect(supportsPlatformBiometrics({ PublicKeyCredential: function PublicKeyCredential() {} })).toBe(true);
    expect(supportsPlatformBiometrics({ PublicKeyCredential: undefined })).toBe(false);
  });

  it('registers push notifications only after native permission is granted', () => {
    expect(shouldRegisterForPush({ receive: 'granted' })).toBe(true);
    expect(shouldRegisterForPush({ receive: 'denied' })).toBe(false);
    expect(shouldRegisterForPush({})).toBe(false);
  });

  it('extracts push action payloads for project notification routing', () => {
    expect(
      extractPushActionData({
        notification: {
          data: {
            projectId: 'project_123',
            route: '/projects/project_123/ide',
          },
        },
      }),
    ).toEqual({
      projectId: 'project_123',
      route: '/projects/project_123/ide',
    });
  });

  it('dispatches mobile network change events for the embedded web runtime', () => {
    const events: unknown[] = [];
    const listener = (event: Event) => events.push((event as CustomEvent).detail);
    window.addEventListener('vibecore:mobile-network-change', listener);

    const cleanup = configureOfflineState();

    cleanup();
    window.removeEventListener('vibecore:mobile-network-change', listener);

    expect(events).toContainEqual({ connected: navigator.onLine });
  });

  it('dispatches native deep link and push events to the embedded web runtime', () => {
    const events: Array<[string, unknown]> = [];
    const deepLink = (event: Event) => events.push(['deep-link', (event as CustomEvent).detail]);
    const pushToken = (event: Event) => events.push(['push-token', (event as CustomEvent).detail]);
    const pushAction = (event: Event) => events.push(['push-action', (event as CustomEvent).detail]);

    window.addEventListener('vibecore:mobile-deep-link', deepLink);
    window.addEventListener('vibecore:mobile-push-token', pushToken);
    window.addEventListener('vibecore:mobile-push-action', pushAction);

    dispatchMobileDeepLink(new URL('vibecore://projects/project_123/ide?panel=security'));
    dispatchMobilePushToken('push-token-123');
    dispatchMobilePushAction({ route: '/projects/project_123/ide?panel=security' });

    window.removeEventListener('vibecore:mobile-deep-link', deepLink);
    window.removeEventListener('vibecore:mobile-push-token', pushToken);
    window.removeEventListener('vibecore:mobile-push-action', pushAction);

    expect(events).toContainEqual(['deep-link', { url: 'vibecore://projects/project_123/ide?panel=security' }]);
    expect(events).toContainEqual(['push-token', { value: 'push-token-123' }]);
    expect(events).toContainEqual(['push-action', { route: '/projects/project_123/ide?panel=security' }]);
  });

  it('routes bootstrap failures to the crash hook instead of leaking an unhandled rejection', async () => {
    const reported: Array<{ error: unknown; context?: Record<string, unknown> }> = [];
    const unhandled: unknown[] = [];
    const onUnhandled = (event: PromiseRejectionEvent) => unhandled.push(event.reason);
    window.addEventListener('unhandledrejection', onUnhandled);

    const failure = new Error('push permission denied');

    // launchMobileBootstrap must resolve (not reject) even when bootstrap rejects.
    await expect(
      launchMobileBootstrap(
        {
          onCrashReport(error, context) {
            reported.push({ error, context });
          },
        },
        () => Promise.reject(failure),
      ),
    ).resolves.toBeUndefined();

    // Give the microtask queue a tick so any stray rejection would surface.
    await Promise.resolve();
    window.removeEventListener('unhandledrejection', onUnhandled);

    expect(reported).toEqual([{ error: failure, context: { source: 'bootstrap-launch' } }]);
    expect(unhandled).toHaveLength(0);
  });

  it('resolves cleanly on a successful bootstrap without reporting a crash', async () => {
    const reported: unknown[] = [];

    await expect(
      launchMobileBootstrap(
        {
          onCrashReport(error) {
            reported.push(error);
          },
        },
        () => Promise.resolve({ ok: true }),
      ),
    ).resolves.toBeUndefined();

    expect(reported).toHaveLength(0);
  });
});
