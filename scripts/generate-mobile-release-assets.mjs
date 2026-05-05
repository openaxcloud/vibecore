import fs from 'node:fs';

const env = process.env;
const dryRun = process.argv.includes('--dry-run');

const appLinkHost = required('MOBILE_APP_LINK_HOST');
const iosAssociatedDomainHost = env.MOBILE_IOS_ASSOCIATED_DOMAIN_HOST || appLinkHost;
const iosAppIds = list('MOBILE_IOS_APP_IDS');
const androidPackageName = env.MOBILE_ANDROID_PACKAGE_NAME || 'app.vibecore.mobile';
const androidFingerprints = list('MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS');
const apsEnvironment = env.MOBILE_IOS_APS_ENVIRONMENT || 'production';

if (!/^[a-z0-9.-]+$/i.test(appLinkHost) || appLinkHost.endsWith('.example.com')) {
  throw new Error('MOBILE_APP_LINK_HOST must be a production host, not an example domain.');
}
if (!/^[a-z0-9.-]+$/i.test(iosAssociatedDomainHost) || iosAssociatedDomainHost.endsWith('.example.com')) {
  throw new Error('MOBILE_IOS_ASSOCIATED_DOMAIN_HOST must be a production host, not an example domain.');
}
if (!['development', 'production'].includes(apsEnvironment)) {
  throw new Error('MOBILE_IOS_APS_ENVIRONMENT must be development or production.');
}
for (const appId of iosAppIds) {
  if (!/^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(appId)) {
    throw new Error(`Invalid MOBILE_IOS_APP_IDS entry: ${appId}`);
  }
}
for (const fingerprint of androidFingerprints) {
  if (!/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(fingerprint)) {
    throw new Error(`Invalid MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS entry: ${fingerprint}`);
  }
}

const assetLinks = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: androidPackageName,
      sha256_cert_fingerprints: androidFingerprints,
    },
  },
];

const appleAssociation = {
  applinks: {
    apps: [],
    details: [
      {
        appIDs: iosAppIds,
        components: [
          {
            '/': '/projects/*',
            comment: 'Project and IDE deep links',
          },
          {
            '/': '/invitations/*',
            comment: 'Invitation accept deep links',
          },
        ],
      },
    ],
  },
};

const stringsXml = `<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">Vibecore</string>
    <string name="title_activity_main">Vibecore</string>
    <string name="package_name">${escapeXml(androidPackageName)}</string>
    <string name="custom_url_scheme">vibecore</string>
    <string name="app_link_host">${escapeXml(appLinkHost)}</string>
</resources>
`;

const entitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>aps-environment</key>
\t<string>${apsEnvironment}</string>
\t<key>com.apple.developer.associated-domains</key>
\t<array>
\t\t<string>applinks:${escapeXml(iosAssociatedDomainHost)}</string>
\t</array>
</dict>
</plist>
`;

if (!dryRun) {
  writeJson('apps/mobile/assets/assetlinks.json', assetLinks);
  writeJson('apps/mobile/assets/apple-app-site-association', appleAssociation);
  writeText('apps/mobile/android/app/src/main/res/values/strings.xml', stringsXml);
  writeText('apps/mobile/ios/App/App/App.entitlements', entitlements);
}

console.log(
  JSON.stringify({
    ok: true,
    dryRun,
    appLinkHost,
    iosAssociatedDomainHost,
    iosAppIds: iosAppIds.length,
    androidFingerprints: androidFingerprints.length,
  }),
);

function required(name) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function list(name) {
  const values = required(name)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw new Error(`${name} must contain at least one value.`);
  }

  return values;
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(file, value) {
  fs.writeFileSync(file, value);
}

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
