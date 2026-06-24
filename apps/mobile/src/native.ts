import { App, type URLOpenListenerEvent } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Keyboard } from '@capacitor/keyboard';
import { PushNotifications, type Token } from '@capacitor/push-notifications';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { readMobileRuntimeConfig, type MobileRuntimeConfig } from './config';

export interface MobileBootstrapOptions {
  config?: MobileRuntimeConfig;
  onDeepLink?: (url: URL) => void;
  onPushToken?: (token: string) => Promise<void> | void;
  onPushAction?: (data: unknown) => void;
  onOfflineChange?: (offline: boolean) => void;
  onCrashReport?: (error: unknown, context?: Record<string, unknown>) => void;
}

export interface NativeAppInfo {
  version: string;
  build: string;
  platform: string;
}

export interface PushPermissionResult {
  receive?: string;
}

export interface PushActionEventLike {
  notification: {
    data?: unknown;
  };
}

export async function bootstrapMobileApp(options: MobileBootstrapOptions = {}) {
  const config = options.config ?? readMobileRuntimeConfig();
  const cleanup: Array<() => void | Promise<void>> = [];

  /*
   * Configure each native capability in turn, accumulating its dispose callback
   * as we go. If any step throws (e.g. push permission requests reject on a
   * restricted/MDM device), tear down everything we already wired up before
   * re-throwing — otherwise the App 'appUrlOpen' listener (and any window
   * listeners) would be orphaned with no reachable handle to remove them.
   */
  try {
    await configureChrome();
    cleanup.push(await configureDeepLinks(options.onDeepLink));
    cleanup.push(
      config.allowPushNotifications
        ? await configurePushNotifications(options.onPushToken, options.onPushAction)
        : () => undefined,
    );
    cleanup.push(configureOfflineState(options.onOfflineChange));
    cleanup.push(configureCrashReporting(options.onCrashReport));
  } catch (error) {
    await runCleanup(cleanup);
    throw error;
  }

  Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => undefined);
  SplashScreen.hide().catch(() => undefined);

  return {
    config,
    cleanup: () => runCleanup(cleanup),
  };
}

/**
 * Run (and drain) the accumulated dispose callbacks. Each callback is awaited
 * and isolated so one failing teardown cannot prevent the rest from running.
 */
export async function runCleanup(cleanup: Array<() => void | Promise<void>>) {
  for (const dispose of cleanup.splice(0)) {
    try {
      await dispose();
    } catch {
      // Best-effort teardown — keep removing the remaining listeners.
    }
  }
}

export async function configureChrome() {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  await StatusBar.setStyle({ style: Style.Dark });
  await StatusBar.setBackgroundColor({ color: '#080B12' });
}

export async function configureDeepLinks(onDeepLink?: (url: URL) => void) {
  const listener = await App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
    handleDeepLink(event.url, onDeepLink);
  });

  /*
   * Cold start: when the app is launched by tapping a vibecore:// or https
   * link (e.g. from a push notification or shared project link), the launch
   * URL is delivered to the OS before this JS listener attaches, so
   * 'appUrlOpen' never fires for it. getLaunchUrl() is the documented path to
   * recover it — without this the app falls through to the default /projects
   * frame instead of the linked project/IDE/panel.
   */
  try {
    const launch = await App.getLaunchUrl();

    if (launch?.url) {
      handleDeepLink(launch.url, onDeepLink);
    }
  } catch {
    // getLaunchUrl is unavailable on some platforms/web — ignore.
  }

  return () => listener.remove();
}

export function handleDeepLink(value: string, onDeepLink?: (url: URL) => void) {
  const url = parseDeepLink(value);

  if (url) {
    dispatchMobileDeepLink(url);
    onDeepLink?.(url);
  }

  return url;
}

export function parseDeepLink(value: string): URL | undefined {
  try {
    const url = new URL(value);

    if (url.protocol === 'vibecore:' || url.protocol === 'https:') {
      return url;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function routeFromDeepLink(url: URL) {
  const rawPath = url.protocol === 'vibecore:' && url.host ? `/${url.host}${url.pathname}` : url.pathname;

  /*
   * Collapse leading slashes to a single '/'. A protocol-relative route like
   * '//evil.com/x' (from `vibecore:` with an empty host, or a crafted path)
   * would otherwise resolve against the origin's PROTOCOL in
   * `new URL(route, webAppOrigin)` and navigate the trusted in-app frame to a
   * foreign origin — an open redirect into the webview.
   */
  const path = `/${rawPath.replace(/^\/+/, '')}`;

  return `${path}${url.search}${url.hash}`;
}

export async function configurePushNotifications(
  onPushToken?: (token: string) => Promise<void> | void,
  onPushAction?: (data: unknown) => void,
) {
  const registration = await PushNotifications.addListener('registration', (token: Token) => {
    dispatchMobilePushToken(token.value);
    void onPushToken?.(token.value);
  });
  const registrationError = await PushNotifications.addListener('registrationError', (error) => {
    window.dispatchEvent(new CustomEvent('vibecore:mobile-push-registration-error', { detail: error }));
    console.error('Push registration failed', error);
  });
  const action = await PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    const data = extractPushActionData(event);
    dispatchMobilePushAction(data);
    onPushAction?.(data);
  });

  /*
   * Build the dispose closure up-front so the three listeners above are always
   * reachable for removal. requestPermissions()/register() are expected to
   * reject on iOS when push is denied/restricted, on MDM-locked devices, or
   * when APNs/FCM registration fails — if we let that rejection propagate
   * before returning dispose, bootstrapMobileApp's `cleanup.push(await ...)`
   * never records these listeners, so they leak across a failed bootstrap.
   * Tear them down ourselves before re-throwing.
   */
  const dispose = async () => {
    await registration.remove();
    await registrationError.remove();
    await action.remove();
  };

  try {
    const permission = await PushNotifications.requestPermissions();

    if (shouldRegisterForPush(permission)) {
      await PushNotifications.register();
    }
  } catch (error) {
    await dispose();
    throw error;
  }

  return dispose;
}

export function shouldRegisterForPush(permission: PushPermissionResult) {
  return permission.receive === 'granted';
}

export function extractPushActionData(event: PushActionEventLike) {
  return event.notification.data;
}

export async function shareProjectLink(projectId: string, url: string) {
  await Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
  await Share.share({
    title: 'E-Code project',
    text: `Open project ${projectId} on E-Code`,
    url,
    dialogTitle: 'Share project',
  });
}

export async function openExternalUrl(url: string) {
  await Browser.open({ url, presentationStyle: 'fullscreen' });
}

export async function importProjectFile(path: string) {
  const result = await Filesystem.readFile({
    path,
    directory: Directory.Documents,
  });

  return {
    path,
    content: String(result.data),
  };
}

export async function uploadProjectFile(projectId: string, file: File, apiBaseUrl: string) {
  const body = new FormData();
  body.set('file', file);

  const response = await fetch(`${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/files/upload`, {
    method: 'POST',
    credentials: 'include',
    body,
  });

  if (!response.ok) {
    throw new Error(`Mobile file upload failed: ${response.status}`);
  }

  return response.json() as Promise<{ path: string; size: number }>;
}

export async function readNativeAppInfo(): Promise<NativeAppInfo> {
  const info = await App.getInfo();

  return {
    version: info.version,
    build: info.build,
    platform: Capacitor.getPlatform(),
  };
}

export function configureOfflineState(onOfflineChange?: (offline: boolean) => void) {
  const emit = () => {
    const offline = !navigator.onLine;
    dispatchMobileNetworkChange(!offline);
    onOfflineChange?.(offline);
  };
  window.addEventListener('online', emit);
  window.addEventListener('offline', emit);
  emit();

  return () => {
    window.removeEventListener('online', emit);
    window.removeEventListener('offline', emit);
  };
}

export function dispatchMobileDeepLink(url: URL) {
  window.dispatchEvent(new CustomEvent('vibecore:mobile-deep-link', { detail: { url: url.toString() } }));
}

export function dispatchMobilePushToken(value: string) {
  window.dispatchEvent(new CustomEvent('vibecore:mobile-push-token', { detail: { value } }));
}

export function dispatchMobilePushAction(data: unknown) {
  window.dispatchEvent(new CustomEvent('vibecore:mobile-push-action', { detail: data }));
}

export function dispatchMobileNetworkChange(connected: boolean) {
  window.dispatchEvent(new CustomEvent('vibecore:mobile-network-change', { detail: { connected } }));
}

export function configureCrashReporting(onCrashReport?: (error: unknown, context?: Record<string, unknown>) => void) {
  const onError = (event: ErrorEvent) => onCrashReport?.(event.error ?? event.message, { source: 'window.error' });
  const onRejection = (event: PromiseRejectionEvent) => onCrashReport?.(event.reason, { source: 'unhandledrejection' });

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
