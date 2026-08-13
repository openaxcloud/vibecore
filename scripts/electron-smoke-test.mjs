import { existsSync, readFileSync } from 'node:fs';
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

for (const marker of ['appId: com.vibecore.desktop', 'productName: VibeCore', 'AppImage', 'deb', 'nsis', 'dmg']) {
  if (!builder.includes(marker)) {
    throw new Error(`electron-builder marker missing: ${marker}`);
  }
}

console.log('Electron smoke test passed.');
