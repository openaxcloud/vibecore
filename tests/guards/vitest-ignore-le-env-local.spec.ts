import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Les tests unitaires lisaient le `.env` DU DÉVELOPPEUR.
 *
 * Mesuré le 2026-09-30 : `provider-fallback.spec.ts` et `managed-models.spec.ts`
 * échouaient sur ma machine (« expected 'OpenAI' to be 'Google' », « expected true
 * to be false »), et passaient 34/34 une fois le `.env` local mis de côté.
 * `vite.config.ts` fait `dotenv.config()` à chaque lecture de la configuration —
 * Vitest compris — et versait donc les clés et drapeaux locaux dans
 * `process.env` des tests. La CI n'a pas de `.env` : un test rouge chez un
 * développeur et vert en CI envoie chercher un défaut qui n'existe pas.
 *
 * Ce garde charge la VRAIE configuration, par la fonction même de Vite, dans un
 * dossier qui contient un `.env` témoin : sous Vitest, le témoin ne doit pas
 * entrer ; hors Vitest (serveur de dev, build), il doit toujours entrer.
 */

const CONFIG = resolve(__dirname, '../../vite.config.ts');

// Vite résolu depuis le dépôt : le script tourne dans un dossier temporaire, où `import 'vite'` ne trouverait rien.
const VITE = pathToFileURL(createRequire(CONFIG).resolve('vite')).href;

function chargerLaConfig(sousVitest: boolean): { dotenv: string; importMetaEnv: string } {
  const dossier = mkdtempSync(join(tmpdir(), 'vite-env-'));

  writeFileSync(join(dossier, '.env'), 'TEMOIN_ENV_LOCAL=present\nVITE_TEMOIN_ENV_LOCAL=present\n');

  const script = `
    const vite = await import(${JSON.stringify(VITE)});
    const loadConfigFromFile = vite.loadConfigFromFile ?? vite.default.loadConfigFromFile;
    const charge = await loadConfigFromFile({ command: 'serve', mode: 'test' }, ${JSON.stringify(CONFIG)}, undefined, 'silent');
    const loadEnv = vite.loadEnv ?? vite.default.loadEnv;
    // Second chemin : ce que Vite chargerait lui-même dans import.meta.env, depuis le envDir que retient la configuration.
    const importMetaEnv = loadEnv('test', charge.config.envDir ?? process.cwd(), 'VITE_');
    process.stdout.write(JSON.stringify({ dotenv: process.env.TEMOIN_ENV_LOCAL ?? 'absent', importMetaEnv: importMetaEnv.VITE_TEMOIN_ENV_LOCAL ?? 'absent' }));
  `;

  const env = { ...process.env };

  delete env.TEMOIN_ENV_LOCAL;
  delete env.VITEST;

  if (sousVitest) {
    env.VITEST = 'true';
  }

  try {
    return JSON.parse(
      execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: dossier,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
    );
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

describe('le .env local n’entre pas dans les tests', () => {
  it('sous Vitest, la configuration ne verse pas le .env dans process.env', () => {
    // Les DEUX chemins : `dotenv` dans process.env, et le chargement natif de Vite dans import.meta.env.
    expect(chargerLaConfig(true)).toEqual({ dotenv: 'absent', importMetaEnv: 'absent' });
  }, 60_000);

  it('CONTRE-ÉPREUVE — hors Vitest (dev, build), le .env est toujours chargé', () => {
    expect(chargerLaConfig(false)).toEqual({ dotenv: 'present', importMetaEnv: 'present' });
  }, 60_000);
});
