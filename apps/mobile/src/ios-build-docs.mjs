import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const iosPath = resolve(root, 'ios');
const outDir = resolve(root, 'mobile-artifacts');

mkdirSync(outDir, { recursive: true });

const lines = [
  '# Vibecore iOS Build Evidence',
  '',
  `Generated at: ${new Date().toISOString()}`,
  `iOS project present: ${existsSync(iosPath) ? 'yes' : 'no'}`,
  '',
  'Final signed iOS archives require macOS, Xcode, Apple signing certificates, provisioning profiles, and App Store Connect API credentials.',
  'Use `pnpm mobile:sync` before opening Xcode, then archive the `App` scheme from `apps/mobile/ios/App/App.xcworkspace`.',
];

writeFileSync(resolve(outDir, 'ios-build-readme.md'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
