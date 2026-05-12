import { App, type URLOpenListenerEvent } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Keyboard } from '@capacitor/keyboard';
import { PushNotifications, type Token } from '@capacitor/push-notifications';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
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

  await configureChrome();
  cleanup.push(await configureDeepLinks(options.onDeepLink));
  cleanup.push(config.allowPushNotifications ? await configurePushNotifications(options.onPushToken, options.onPushAction) : () => undefined);
  cleanup.push(configureOfflineState(options.onOfflineChange));
  cleanup.push(configureCrashReporting(options.onCrashReport));

  Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => undefined);
  SplashScreen.hide().catch(() => undefined);

  return {
    config,
    cleanup: async () => {
      for (const dispose of cleanup.splice(0)) {
        await dispose();
      }
    },
  };
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
    const url = parseDeepLink(event.url);

    if (url) {
      dispatchMobileDeepLink(url);
      onDeepLink?.(url);
    }
  });

  return () => listener.remove();
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

  const permission = await PushNotifications.requestPermissions();

  if (shouldRegisterForPush(permission)) {
    await PushNotifications.register();
  }

  return async () => {
    await registration.remove();
    await registrationError.remove();
    await action.remove();
  };
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
    title: 'Vibecore project',
    text: `Open project ${projectId}`,
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
