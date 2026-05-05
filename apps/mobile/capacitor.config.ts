import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';

const devServerUrl = process.env.VITE_MOBILE_DEV_SERVER_URL || process.env.MOBILE_DEV_SERVER_URL;

const config: CapacitorConfig = {
  appId: process.env.MOBILE_APP_ID || 'app.vibecore.mobile',
  appName: process.env.MOBILE_APP_NAME || 'Vibecore',
  webDir: 'dist',
  server: devServerUrl
    ? {
        url: devServerUrl,
        cleartext: devServerUrl.startsWith('http://'),
      }
    : undefined,
  plugins: {
    SplashScreen: {
      launchShowDuration: 700,
      backgroundColor: '#080B12',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#080B12',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: KeyboardResize.Body,
      style: KeyboardStyle.Dark,
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  ios: {
    scheme: process.env.MOBILE_IOS_SCHEME || 'Vibecore',
    contentInset: 'automatic',
    allowsLinkPreview: false,
  },
  android: {
    path: 'android',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: process.env.NODE_ENV !== 'production',
  },
};

export default config;
