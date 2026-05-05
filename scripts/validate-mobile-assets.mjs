import fs from 'node:fs';

const releaseMode = process.argv.includes('--release') || process.env.MOBILE_RELEASE_VALIDATE === '1';

const requiredFiles = [
  'apps/mobile/capacitor.config.ts',
  'apps/mobile/index.html',
  'apps/mobile/package.json',
  'apps/mobile/src/main.ts',
  'apps/mobile/src/native.ts',
  'apps/mobile/src/session.ts',
  'apps/mobile/src/biometric.ts',
  'apps/mobile/src/mobile.spec.ts',
  'apps/mobile/android/app/src/main/AndroidManifest.xml',
  'apps/mobile/android/app/src/main/res/values/strings.xml',
  'apps/mobile/ios/App/App/Info.plist',
  'apps/mobile/ios/App/App/App.entitlements',
  'apps/mobile/assets/assetlinks.json',
  'apps/mobile/assets/apple-app-site-association',
  'scripts/generate-mobile-release-assets.mjs',
  'docs/MOBILE_APPS.md',
  'docs/MOBILE_SECURITY.md',
  'docs/IOS_RELEASE.md',
  'docs/ANDROID_RELEASE.md',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing mobile asset: ${file}`);
  }
}

const packageJson = JSON.parse(fs.readFileSync('apps/mobile/package.json', 'utf8'));
const requiredDependencies = [
  '@capacitor/core',
  '@capacitor/ios',
  '@capacitor/android',
  '@capacitor/app',
  '@capacitor/browser',
  '@capacitor/filesystem',
  '@capacitor/preferences',
  '@capacitor/push-notifications',
  '@capacitor/share',
  '@capacitor/status-bar',
  '@capacitor/splash-screen',
  '@capacitor/haptics',
  '@capacitor/keyboard',
  '@vibecore/editor',
];

for (const dependency of requiredDependencies) {
  if (!packageJson.dependencies?.[dependency]) {
    throw new Error(`apps/mobile/package.json missing dependency ${dependency}`);
  }
}

for (const script of ['build:web', 'sync', 'sync:android', 'sync:ios', 'open:ios', 'open:android', 'build:android', 'build:android:release', 'build:ios:docs', 'release-assets', 'release-assets:check']) {
  if (!packageJson.scripts?.[script]) {
    throw new Error(`apps/mobile/package.json missing script ${script}`);
  }
}

const capacitorConfig = fs.readFileSync('apps/mobile/capacitor.config.ts', 'utf8');
for (const expected of ['webDir: \'dist\'', 'MOBILE_APP_ID', 'VITE_MOBILE_DEV_SERVER_URL', '@capacitor/keyboard']) {
  if (!capacitorConfig.includes(expected)) {
    throw new Error(`capacitor.config.ts missing ${expected}`);
  }
}

const mobileShell = fs.readFileSync('apps/mobile/index.html', 'utf8');
for (const expected of ['viewport-fit=cover', 'data-mobile-nav', 'data-project-upload', 'data-native-version']) {
  if (!mobileShell.includes(expected)) {
    throw new Error(`apps/mobile/index.html missing ${expected}`);
  }
}

const nativeSource = fs.readFileSync('apps/mobile/src/native.ts', 'utf8');
for (const expected of [
  'configureDeepLinks',
  'configurePushNotifications',
  'shareProjectLink',
  'uploadProjectFile',
  'configureOfflineState',
  'configureCrashReporting',
  'shouldRegisterForPush',
]) {
  if (!nativeSource.includes(expected)) {
    throw new Error(`native.ts missing ${expected}`);
  }
}

const mobileTests = fs.readFileSync('apps/mobile/src/mobile.spec.ts', 'utf8');
for (const expected of ['codemirror', 'parseDeepLink', 'shouldRegisterForPush', 'extractPushActionData']) {
  if (!mobileTests.includes(expected)) {
    throw new Error(`mobile.spec.ts missing ${expected}`);
  }
}

const manifest = fs.readFileSync('apps/mobile/android/app/src/main/AndroidManifest.xml', 'utf8');
for (const expected of [
  'android:autoVerify="true"',
  'android:scheme="vibecore"',
  'android:host="@string/app_link_host"',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
]) {
  if (!manifest.includes(expected)) {
    throw new Error(`AndroidManifest.xml missing ${expected}`);
  }
}

const androidBuildGradle = fs.readFileSync('apps/mobile/android/app/build.gradle', 'utf8');
for (const expected of [
  'VIBECORE_ANDROID_KEYSTORE_PATH',
  'VIBECORE_ANDROID_KEYSTORE_PASSWORD',
  'VIBECORE_ANDROID_KEY_ALIAS',
  'VIBECORE_ANDROID_KEY_PASSWORD',
  'verifyReleaseSigning',
  'bundleRelease',
]) {
  if (!androidBuildGradle.includes(expected)) {
    throw new Error(`Android build.gradle missing release signing guard: ${expected}`);
  }
}

const strings = fs.readFileSync('apps/mobile/android/app/src/main/res/values/strings.xml', 'utf8');
for (const expected of ['<string name="custom_url_scheme">vibecore</string>', '<string name="app_link_host">']) {
  if (!strings.includes(expected)) {
    throw new Error(`Android strings.xml missing ${expected}`);
  }
}
const appLinkHost = extractAndroidString(strings, 'app_link_host');

const infoPlist = fs.readFileSync('apps/mobile/ios/App/App/Info.plist', 'utf8');
for (const expected of ['CFBundleURLSchemes', 'vibecore', 'NSFaceIDUsageDescription', 'NSPhotoLibraryUsageDescription']) {
  if (!infoPlist.includes(expected)) {
    throw new Error(`Info.plist missing ${expected}`);
  }
}

const entitlements = fs.readFileSync('apps/mobile/ios/App/App/App.entitlements', 'utf8');
for (const expected of ['aps-environment', 'com.apple.developer.associated-domains', 'applinks:']) {
  if (!entitlements.includes(expected)) {
    throw new Error(`App.entitlements missing ${expected}`);
  }
}

const assetLinks = JSON.parse(fs.readFileSync('apps/mobile/assets/assetlinks.json', 'utf8'));
if (!Array.isArray(assetLinks) || assetLinks.length === 0) {
  throw new Error('assetlinks.json must contain at least one Android app link declaration.');
}
if (assetLinks[0]?.target?.namespace !== 'android_app' || !assetLinks[0]?.target?.package_name) {
  throw new Error('assetlinks.json must declare an android_app package target.');
}
if (!Array.isArray(assetLinks[0]?.target?.sha256_cert_fingerprints)) {
  throw new Error('assetlinks.json must declare sha256_cert_fingerprints as an array.');
}

const appleAssociation = JSON.parse(fs.readFileSync('apps/mobile/assets/apple-app-site-association', 'utf8'));
if (!Array.isArray(appleAssociation.applinks?.details)) {
  throw new Error('apple-app-site-association must declare applinks.details.');
}

if (releaseMode) {
  validateReleaseMobileAssets({ assetLinks, appleAssociation, appLinkHost, entitlements });
}

const rootPackage = JSON.parse(fs.readFileSync('package.json', 'utf8'));
for (const script of ['mobile:dev', 'mobile:build:web', 'mobile:sync', 'mobile:open:ios', 'mobile:open:android', 'mobile:build:android', 'mobile:build:android:release', 'mobile:build:ios:docs', 'mobile:validate', 'mobile:validate:release', 'mobile:release-assets', 'mobile:release-assets:check']) {
  if (!rootPackage.scripts?.[script]) {
    throw new Error(`Root package.json missing script ${script}`);
  }
}

console.log(JSON.stringify({ ok: true, releaseMode, mobileAssets: requiredFiles.length, dependencies: requiredDependencies.length }));

function extractAndroidString(source, name) {
  const match = source.match(new RegExp(`<string\\s+name="${name}">([^<]+)</string>`));
  return match?.[1]?.trim();
}

function validateReleaseMobileAssets({ assetLinks, appleAssociation, appLinkHost, entitlements }) {
  if (!appLinkHost || appLinkHost === 'app.example.com' || appLinkHost.endsWith('.example.com')) {
    throw new Error('Release mobile validation requires a production Android app_link_host, not app.example.com.');
  }

  const associatedDomains = [...entitlements.matchAll(/<string>applinks:([^<]+)<\/string>/g)].map((match) => match[1]);
  if (associatedDomains.length === 0 || associatedDomains.some((host) => host === 'app.example.com' || host.endsWith('.example.com'))) {
    throw new Error('Release mobile validation requires production iOS associated domains, not app.example.com.');
  }

  const fingerprints = assetLinks.flatMap((entry) => entry?.target?.sha256_cert_fingerprints ?? []);
  if (fingerprints.length === 0) {
    throw new Error('Release mobile validation requires at least one Android release SHA256 certificate fingerprint in assetlinks.json.');
  }
  for (const fingerprint of fingerprints) {
    if (!/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(fingerprint)) {
      throw new Error(`Invalid Android SHA256 fingerprint format in assetlinks.json: ${fingerprint}`);
    }
  }

  const appIds = appleAssociation.applinks.details.flatMap((detail) => detail.appIDs ?? []);
  if (appIds.length === 0) {
    throw new Error('Release mobile validation requires at least one Apple appID in apple-app-site-association.');
  }
  for (const appId of appIds) {
    if (!/^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(appId)) {
      throw new Error(`Invalid Apple appID in apple-app-site-association: ${appId}`);
    }
  }
}
