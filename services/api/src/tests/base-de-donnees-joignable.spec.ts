import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  baseDeDonneesJoignable,
  DELAI_DE_FERMETURE_MS,
  DELAI_DE_SONDE_MS,
  fermerSansBloquer,
} from './base-de-donnees-joignable.js';

/*
 * BUG-TEST-DB-HANG-001 — voir l'en-tête de `base-de-donnees-joignable.ts` pour
 * la mesure. En deux phrases : `prisma.$disconnect()` ne se dénoue jamais quand
 * le client n'a pas pu se connecter, et comme il vivait dans le `finally` de la
 * sonde, la suite entière restait en l'air — 93 minutes constatées, deux fois
 * sur deux (règle 17 : déterministe, pas une course).
 *
 * ⚠️ Ce défaut est de la classe la plus dangereuse : il est SILENCIEUX. Le
 * fichier figé n'imprime aucun échec et les fichiers voisins sautent sans
 * bruit. Sans ces gardes, une suite qui ne mesure plus rien se lit comme verte.
 */

const RACINE = join(process.cwd(), '..', '..');

describe('la sonde rend TOUJOURS, même sur une base injoignable', () => {
  it('ne bloque pas quand `$disconnect` ne se dénoue jamais', async () => {
    /*
     * Le client qui gelait, reproduit : sa fermeture ne se résout à AUCUN
     * moment. Sans le bornage, ce test ne finirait pas — c'est exactement la
     * panne qu'il épingle.
     */
    const jamais = { $disconnect: () => new Promise<never>(() => {}) };

    const debut = Date.now();
    await fermerSansBloquer(jamais);
    const duree = Date.now() - debut;

    expect(duree).toBeLessThan(DELAI_DE_FERMETURE_MS + 3_000);
  });

  it('laisse passer une fermeture qui, elle, se dénoue — sans attendre le budget', async () => {
    /* Témoin positif : le bornage ne doit pas ralentir le cas normal. */
    const normal = { $disconnect: async () => undefined };

    const debut = Date.now();
    await fermerSansBloquer(normal);

    expect(Date.now() - debut).toBeLessThan(500);
  });

  it('une fermeture qui LÈVE ne fait pas échouer la sonde', async () => {
    await expect(fermerSansBloquer({ $disconnect: async () => { throw new Error('boum'); } })).resolves.toBeUndefined();
  });

  it('rend `false` sans DATABASE_URL, immédiatement', async () => {
    const precedent = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      const debut = Date.now();
      await expect(baseDeDonneesJoignable()).resolves.toBe(false);
      expect(Date.now() - debut).toBeLessThan(500);
    } finally {
      if (precedent === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = precedent;
      }
    }
  });

  it('les deux budgets sont bornés et cohérents', () => {
    expect(DELAI_DE_SONDE_MS).toBeGreaterThan(0);
    expect(DELAI_DE_FERMETURE_MS).toBeGreaterThan(0);

    /* La fermeture est un sous-budget de la sonde : l'inverse n'aurait pas de sens. */
    expect(DELAI_DE_FERMETURE_MS).toBeLessThan(DELAI_DE_SONDE_MS);

    /*
     * Et surtout : sous le `hookTimeout` de la configuration. Un budget plus
     * long rendrait la garde inutile — vitest abandonnerait avant elle.
     */
    const config = readFileSync(join(RACINE, 'services/api/vitest.config.ts'), 'utf8');
    const hookTimeout = Number((config.match(/hookTimeout:\s*([\d_]+)/)?.[1] ?? '0').replaceAll('_', ''));

    expect(hookTimeout, 'hookTimeout illisible — la garde ne mesure rien (règle 14)').toBeGreaterThan(0);
    expect(DELAI_DE_SONDE_MS).toBeLessThan(hookTimeout);
  });
});

describe('GARDE — plus aucune sonde ne réattend `$disconnect` sans bornage', () => {
  /*
   * Règle 7 : huit copies indépendantes portaient le même `finally { await
   * prisma.$disconnect() }`. Ce test empêche la neuvième.
   */
  const SONDES = [
    'services/api/src/tests/snapshot-list-order.prisma.spec.ts',
    'services/api/src/tests/connector-isolation.spec.ts',
    'services/api/src/tests/mcp-marketplace.spec.ts',
    'services/api/src/tests/connector-store.spec.ts',
    'services/api/src/tests/ledger-store-db.spec.ts',
    'services/api/src/tests/prisma-store.spec.ts',
    'services/workspace-manager/src/prisma-store.spec.ts',
    'services/ai-gateway/src/agent-run-persistence.spec.ts',
  ] as const;

  it.each(SONDES)('%s passe par le point de passage borné', (chemin) => {
    const source = readFileSync(join(RACINE, chemin), 'utf8');

    expect(source).toMatch(/base-de-donnees-joignable/);
  });

  it.each(SONDES)('%s ne redéfinit plus sa propre sonde bloquante', (chemin) => {
    const source = readFileSync(join(RACINE, chemin), 'utf8');

    /*
     * Ancré sur le COUPLE qui gelait — une sonde locale qui attend la
     * fermeture — et non sur `$disconnect` seul, que les tests légitimes
     * appellent après une connexion RÉUSSIE (là, il se dénoue).
     */
    expect(source).not.toMatch(/async function canReachDatabase[\s\S]{0,400}?finally \{\s*await prisma\.\$disconnect\(\);/);
  });

  it('la recherche fonctionne (règle 14 : témoin positif)', () => {
    /* Le motif interdit doit se reconnaître lui-même sur un cas fabriqué. */
    const temoin = `async function canReachDatabase() {
  try { return true; } catch { return false; } finally {
    await prisma.$disconnect();
  }
}`;

    expect(temoin).toMatch(/async function canReachDatabase[\s\S]{0,400}?finally \{\s*await prisma\.\$disconnect\(\);/);
  });
});
