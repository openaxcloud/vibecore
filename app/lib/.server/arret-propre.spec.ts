import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSync } from 'esbuild';
import { describe, expect, it } from 'vitest';

/*
 * LE VRAI `server.mjs`, LANCÉ COMME EN PRODUCTION, REÇOIT SIGTERM PENDANT UN TOUR.
 *
 * Mesuré en production le 2026-09-30 à 18:19 : un pod remplacé par un déploiement
 * a tué un tour en cours — aucune fin de tour, nulle part. Le faux bundle ouvre
 * un tour avec le VRAI module (compilé à la volée, pas recopié) ; le serveur doit
 * attendre qu'il se termine avant de sortir, et ne jamais dépasser sa borne.
 * Contre-épreuve mesurée à la main : le `server.mjs` de main sortait en 86 ms.
 */
const racine = path.resolve(__dirname, '../../..');

function preparer(fermetureMs: number | null, poigneeOuverte = false) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'arret-propre-'));
  mkdirSync(path.join(dossier, 'public'));
  buildSync({
    entryPoints: [path.join(racine, 'app/lib/.server/tours-en-cours.ts')],
    format: 'esm',
    bundle: true,
    platform: 'node',
    outfile: path.join(dossier, 'tours-en-cours.mjs'),
    logLevel: 'silent',
  });
  writeFileSync(
    path.join(dossier, 'build.mjs'),
    `import { ouvrirUnTour } from './tours-en-cours.mjs';
export const publicPath = '/';
export const assetsBuildDirectory = new URL('./public', import.meta.url).pathname;
export const routes = {};
export const entry = { module: { default: () => new Response('ok') } };
export const assets = { routes: {}, entry: { module: '', imports: [] }, url: '', version: '1' };
export const future = {};
const fermer = ouvrirUnTour('chat:test');
${fermetureMs === null ? '' : `setTimeout(() => { fermer(); console.log(JSON.stringify({ event: 'test.tour-ferme' })); }, ${fermetureMs}).unref();`}
${poigneeOuverte ? 'setInterval(() => {}, 1000); // une poignée ouverte, comme un client Redis' : ''}
`,
  );

  return path.join(dossier, 'build.mjs');
}

function lancerPuisArreter(build: string, attenteMaxMs: number, signalApresMs: number) {
  return new Promise<{ delaiMs: number; code: number | null; journal: string }>((resolve, reject) => {
    const enfant = spawn(process.execPath, ['server.mjs'], {
      cwd: racine,
      env: {
        ...process.env,
        PORT: String(40_000 + Math.floor(Math.random() * 20_000)),
        BUILD_PATH: build,
        ARRET_ATTENTE_MAX_MS: String(attenteMaxMs),
      },
    });

    let journal = '';
    let signalA = 0;

    enfant.stdout.on('data', (d) => (journal += d));
    enfant.stderr.on('data', (d) => (journal += d));
    enfant.on('error', reject);

    /* Comme Kubernetes au bout de la grâce : un processus qui ne sort pas est tué. */
    const tueur = setTimeout(() => enfant.kill('SIGKILL'), signalApresMs + 12_000);

    enfant.on('exit', (code, signal) => {
      clearTimeout(tueur);
      resolve({ delaiMs: Date.now() - signalA, code: signal === 'SIGKILL' ? -9 : code, journal });
    });
    setTimeout(() => {
      signalA = Date.now();
      enfant.kill('SIGTERM');
    }, signalApresMs);
  });
}

describe('arrêt propre du serveur web', () => {
  it('attend la fin du tour en cours avant de sortir', async () => {
    const { delaiMs, code, journal } = await lancerPuisArreter(preparer(4_000), 10_000, 2_000);

    expect(journal).toContain('"event":"arret.attente-des-tours","enCours":1');
    expect(journal).toContain('test.tour-ferme');
    expect(journal).toContain('"event":"arret.fin","restants":0');
    expect(delaiMs).toBeGreaterThanOrEqual(1_500);
    expect(code).toBe(0);
  }, 30_000);

  it('ne dépasse jamais sa borne, même si un tour ne se termine pas', async () => {
    const { delaiMs, code, journal } = await lancerPuisArreter(preparer(null), 1_500, 1_500);

    expect(journal).toContain('"event":"arret.borne-atteinte","restants":1');
    expect(delaiMs).toBeLessThan(6_000);
    expect(code).toBe(0);
  }, 30_000);

  it('un pod SANS tour sort vite, même quand l’application garde des poignées ouvertes', async () => {
    /*
     * Mesuré par la chaîne de livraison le 2026-09-30 à 19:51:46 : un pod web
     * sans travail consommait ses 30 s de grâce et finissait tué. Reproduit :
     * avec une poignée ouverte (client Redis, minuterie), le server.mjs de main
     * est encore vivant 8 s après SIGTERM ; il n'appelait jamais process.exit.
     */
    const { delaiMs, code } = await lancerPuisArreter(preparer(0, true), 10_000, 2_000);

    expect(code).toBe(0);
    expect(delaiMs).toBeLessThan(2_000);
  }, 30_000);
});
