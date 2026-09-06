/*
 * Le serveur de production reste un MIROIR de `@react-router/serve`.
 *
 * LE MODE DE DÉFAILLANCE. C'est `@react-router/serve` qui pose le `immutable`
 * des assets. `server.mjs` le remplace pour poser `no-store` sur `/api/*` — et un
 * remplacement qui oublie une couche statique DÉMARRE PARFAITEMENT : aucune
 * erreur, aucun test rouge, et chaque visite redevient une première visite. La
 * perte est silencieuse, générale, et ne se voit que sur une facture de bande
 * passante ou un ressenti de lenteur.
 *
 * `scripts/parite-serveur-assets.mjs` compare les DEUX serveurs sur une vraie
 * construction, asset par asset — c'est la preuve forte, mesurée le 2026-09-07 sur
 * **1 398 assets : 0 écart, 0 asset sans `immutable`**. Mais elle exige un build
 * complet, donc elle ne tourne pas à chaque commit.
 *
 * CE FICHIER est le garde de tous les jours. Il lit les options réellement
 * utilisées par `@react-router/serve` DANS `node_modules` et exige que
 * `server.mjs` les porte. L'ancrage est l'amont, pas une copie : si une mise à
 * jour de React Router change ces options, ce test rougit et nous force à suivre —
 * au lieu de figer en silence les valeurs d'une version périmée.
 *
 * Lancer : pnpm vitest --run scripts/serveur-parite-statique.spec.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOTRE_SERVEUR = readFileSync(join(RACINE, 'server.mjs'), 'utf8');
const AMONT = readFileSync(join(RACINE, 'node_modules/@react-router/serve/dist/cli.js'), 'utf8');

describe('server.mjs reste un miroir de @react-router/serve', () => {
  it('TÉMOIN — la source amont est bien celle qu’on croit lire', () => {
    /*
     * Sans ce témoin, un fichier renommé ou vide rendrait toutes les assertions
     * suivantes vertes sur du vide. C'est le « 0 résultat d'une recherche qui n'a
     * pas tourné ».
     */
    expect(AMONT).toMatch(/\.default\.static\(/);
    expect(AMONT.length).toBeGreaterThan(2000);
  });

  it('la couche des assets empreintés garde immutable et 1 an', () => {
    /* Ce que l'amont fait, lu chez lui. */
    expect(AMONT).toContain('immutable: true');
    expect(AMONT).toContain('maxAge: "1y"');

    /* Ce que nous faisons. */
    expect(NOTRE_SERVEUR).toMatch(/immutable:\s*true/);
    expect(NOTRE_SERVEUR).toMatch(/maxAge:\s*'1y'/);
  });

  it('la couche `public/` garde son heure', () => {
    expect(AMONT).toMatch(/\.static\("public", \{ maxAge: "1h" \}\)/);
    expect(NOTRE_SERVEUR).toMatch(/express\.static\('public',\s*\{\s*maxAge:\s*'1h'\s*\}\)/);
  });

  it('les QUATRE couches sont présentes, dans le même ordre', () => {
    /*
     * L'ordre compte autant que la présence : la couche des assets empreintés doit
     * précéder la couche générique, sinon la seconde répond la première et sert les
     * assets SANS `immutable` — le défaut visé, en plus discret encore.
     */
    const ordre = [
      /compression\(\)/,
      /posix\.join\(build\.publicPath, 'assets'\)/,
      /express\.static\(build\.assetsBuildDirectory\)/,
      /express\.static\('public'/,
    ];

    let position = -1;

    for (const motif of ordre) {
      const trouve = NOTRE_SERVEUR.search(motif);
      expect(trouve, `couche absente : ${motif}`).toBeGreaterThan(-1);
      expect(trouve, `couche hors ordre : ${motif}`).toBeGreaterThan(position);
      position = trouve;
    }
  });

  it('la couche générique n’a PAS de maxAge — comme l’amont', () => {
    /*
     * Piège inverse : ajouter un `maxAge` ici « pour faire bien » changerait le
     * comportement de fichiers non empreintés, qui doivent rester revalidés.
     */
    expect(AMONT).toMatch(/\.static\(build\.assetsBuildDirectory\)/);
    expect(NOTRE_SERVEUR).toMatch(/express\.static\(build\.assetsBuildDirectory\)\s*\)/);
  });
});

describe('le `no-store` sur /api/* est posé là où il tient', () => {
  it('il intercepte writeHead, pas un setHeader posé trop tôt', () => {
    /*
     * Un `setHeader` avant le gestionnaire serait écrasé par les en-têtes de la
     * `Response` React Router, sans bruit. Le test fixe le MÉCANISME, parce que
     * c'est lui qui est fragile — pas l'intention.
     */
    expect(NOTRE_SERVEUR).toMatch(/response\.writeHead\s*=/);
    expect(NOTRE_SERVEUR).toMatch(/setHeader\('Cache-Control',\s*'no-store'\)/);
  });

  it('il ne s’applique qu’à /api, et après les couches statiques', () => {
    expect(NOTRE_SERVEUR).toMatch(/request\.path\.startsWith\('\/api\/'\)/);
    expect(NOTRE_SERVEUR.search(/express\.static\('public'/)).toBeLessThan(NOTRE_SERVEUR.search(/no-store/));
  });
});
