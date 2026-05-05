export interface MobileRuntimeConfig {
  apiBaseUrl?: string;
  webAppOrigin?: string;
  universalLinkHost?: string;
  androidAppLinkHost?: string;
  sentryDsn?: string;
  mdmManagedConfigKey: string;
  allowBiometricUnlock: boolean;
  allowPushNotifications: boolean;
}

export function readMobileRuntimeConfig(env: Record<string, string | undefined> = import.meta.env): MobileRuntimeConfig {
  return {
    apiBaseUrl: normalizedOptionalUrl(env.VITE_API_BASE_URL || env.VITE_RUNTIME_API_BASE_URL),
    webAppOrigin: normalizedOptionalUrl(env.VITE_WEB_APP_ORIGIN),
    universalLinkHost: env.VITE_MOBILE_UNIVERSAL_LINK_HOST,
    androidAppLinkHost: env.VITE_MOBILE_ANDROID_APP_LINK_HOST,
    sentryDsn: env.VITE_SENTRY_DSN,
    mdmManagedConfigKey: env.VITE_MOBILE_MDM_CONFIG_KEY || 'app.vibecore.mobile.managed',
    allowBiometricUnlock: env.VITE_MOBILE_BIOMETRIC_UNLOCK !== '0',
    allowPushNotifications: env.VITE_MOBILE_PUSH_NOTIFICATIONS !== '0',
  };
}

function normalizedOptionalUrl(value?: string) {
  if (!value) {
    return undefined;
  }

  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, '');

  return url.toString().replace(/\/$/, '');
}
