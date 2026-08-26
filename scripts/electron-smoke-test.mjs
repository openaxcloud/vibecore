import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const requiredFiles = [
  'build/electron/main/index.mjs',
  'build/electron/preload/index.cjs',
  'electron-builder.yml',
  'electron/main/desktop/auth.ts',
  'electron/main/desktop/deep-links.ts',
  'electron/main/desktop/native-services.ts',
  'electron/main/desktop/crash-reporting.ts',
  'app/routes/desktop-settings.tsx',
];

for (const file of requiredFiles) {
  if (!existsSync(resolve(file))) {
    throw new Error(`Missing Electron smoke-test file: ${file}`);
  }
}

const preload = readFileSync(resolve('build/electron/preload/index.cjs'), 'utf8');
const main = readFileSync(resolve('build/electron/main/index.mjs'), 'utf8');
const builder = readFileSync(resolve('electron-builder.yml'), 'utf8');
const mainViteConfig = readFileSync(resolve('electron/main/vite.config.ts'), 'utf8');
const preloadViteConfig = readFileSync(resolve('electron/preload/vite.config.ts'), 'utf8');

/*
 * BUG-CI-007 regression guard. `plist@3` calls DOMParser.parseFromString with
 * one argument, which is incompatible with xmldom 0.9. The scoped pnpm
 * override currently resolves plist to a compatible, patched xmldom 0.8, but
 * exercise the behaviour rather than freezing package-version text: this will
 * keep passing if plist itself is upgraded to a compatible implementation.
 */
const rootRequire = createRequire(import.meta.url);
const electronBuilderRequire = createRequire(rootRequire.resolve('electron-builder'));
const plist = electronBuilderRequire('plist');
const parsedPlist = plist.parse(
  '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleName</key><string>E-Code</string></dict></plist>',
);

if (parsedPlist.CFBundleName !== 'E-Code') {
  throw new Error('electron-builder plist parser is incompatible with the resolved DOM implementation');
}

/*
 * BUG-CI-009 regression guard. Main and preload build concurrently into the
 * same directory. If either Vite config copies `public/**`, both writers race
 * on thousands of identical files and Windows fails with EBUSY. The renderer
 * build already owns public assets, so both dependency builds must keep the
 * copy disabled.
 */
for (const [name, source] of [
  ['electron/main/vite.config.ts', mainViteConfig],
  ['electron/preload/vite.config.ts', preloadViteConfig],
]) {
  if (!/\bpublicDir\s*:\s*false\b/u.test(source)) {
    throw new Error(`${name} must disable publicDir to keep concurrent Electron builds race-free on Windows`);
  }
}

for (const marker of ['vibecoreDesktop', 'desktop:auth:get', 'desktop:file:import', 'desktop:settings:get']) {
  if (!preload.includes(marker)) {
    throw new Error(`Preload bridge marker missing: ${marker}`);
  }
}

for (const marker of ['setAsDefaultProtocolClient', 'requestSingleInstanceLock', 'setupAutoUpdater', 'setupCrashReporting']) {
  if (!main.includes(marker)) {
    throw new Error(`Main process marker missing: ${marker}`);
  }
}

for (const marker of ['appId: com.vibecore.desktop', 'productName: E-Code', 'AppImage', 'deb', 'nsis', 'dmg']) {
  if (!builder.includes(marker)) {
    throw new Error(`electron-builder marker missing: ${marker}`);
  }
}

console.log('Electron smoke test passed.');
