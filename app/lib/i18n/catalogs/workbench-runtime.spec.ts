import { describe, expect, it } from 'vitest';

import {
  formatWorkbenchRuntimeCopy,
  getWorkbenchRuntimeCopy,
  workbenchRuntimeEn,
  workbenchRuntimeFr,
} from './workbench-runtime';

describe('workbench runtime catalog', () => {
  it('keeps strict EN/FR key parity and an English fallback', () => {
    expect(Object.keys(workbenchRuntimeFr).sort()).toEqual(Object.keys(workbenchRuntimeEn).sort());
    expect(getWorkbenchRuntimeCopy('de')).toBe(workbenchRuntimeEn);
  });

  it('localizes user-facing IDE errors while preserving code identifiers', () => {
    const copy = getWorkbenchRuntimeCopy('fr-FR');

    expect(copy['workbenchRuntime.files.lockedTitle']).toBe('Fichier verrouillé');
    expect(copy['workbenchRuntime.write.blockedTitle']).toBe('Écriture du fichier par l’IA bloquée');
    expect(formatWorkbenchRuntimeCopy(copy['workbenchRuntime.write.locked'], { file: 'src/App.tsx' })).toContain(
      'src/App.tsx',
    );
    expect(copy['workbenchRuntime.command.npmDev']).toBe('npm run dev');
    expect(copy['workbenchRuntime.command.npxVite']).toBe('npx vite');
  });

  it('interpolates preview diagnostics without exposing raw keys', () => {
    const copy = getWorkbenchRuntimeCopy('fr');

    expect(
      formatWorkbenchRuntimeCopy(copy['workbenchRuntime.preview.transientRetry'], {
        command: 'pnpm install',
        exitCode: 1,
        seconds: 2,
        attempt: 2,
        maxAttempts: 3,
      }),
    ).toBe('Échec temporaire de pnpm install (code de sortie 1) ; nouvelle tentative dans 2 s (tentative 2/3).');
  });
});
