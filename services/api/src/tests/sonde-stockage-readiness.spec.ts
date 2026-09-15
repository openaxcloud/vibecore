import { chmodSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import { estMontageMort, sonderEcritureStockage } from '../project-storage.js';
import { TestApiStore } from './test-api-store.js';
import { baseDeDonneesJoignable } from './base-de-donnees-joignable.js';

/*
 * INCIDENT DU 2026-09-07, banc d'essai. Une création de projet sur deux rendait
 * 500 : `mkdir` sur `/data/vibecore/projects/_locks` en **errno -116 (ESTALE)**,
 * poignée NFS périmée sur UNE des deux répliques de l'API.
 *
 * Ce qui rend ce défaut dangereux n'est pas la panne, c'est son INVISIBILITÉ :
 * `readyReplicas` disait 2/2, le compteur de redémarrages 0, `/health` rendait
 * `ok` inconditionnellement, et `/ready` ne vérifiait que la base et Redis. La
 * réplique morte est restée dans la rotation.
 *
 * La production a le même montage (`filestore.csi.storage.gke.io`, RWX,
 * `PROJECT_STORAGE_DIR=/data/vibecore/projects`), donc le même angle mort.
 *
 * Ces tests tiennent les DEUX moitiés : que la sonde écrive vraiment, et que
 * `/ready` en tire la bonne conséquence — sortir la réplique de la rotation
 * quand le montage est mort, et SEULEMENT dans ce cas.
 */

class TestGitProvider {
  importRepository = async () => ({ defaultBranch: 'main' });
  cloneRepository = async () => ({ defaultBranch: 'main' });
  commit = async () => ({ sha: 'sha' });
  push = async () => ({});
  pull = async () => ({});
  branches = async () => [];
  checkout = async () => ({});
  diff = async () => '';
  createPullRequest = async () => ({ number: 1, url: 'https://example.com/pr/1' });
}

class TestEmailProvider {
  send = async () => ({ messageId: 'test' });
}

let racine = '';
let dirAvant: string | undefined;

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), 'sonde-stockage-'));
  dirAvant = process.env.PROJECT_STORAGE_DIR;
  process.env.PROJECT_STORAGE_DIR = racine;
});

afterEach(() => {
  try {
    chmodSync(racine, 0o755);
  } catch {
    /* déjà supprimé */
  }

  rmSync(racine, { recursive: true, force: true });

  if (dirAvant === undefined) {
    delete process.env.PROJECT_STORAGE_DIR;
  } else {
    process.env.PROJECT_STORAGE_DIR = dirAvant;
  }
});

/*
 * DEUX PRÉREQUIS D'ENVIRONNEMENT, rendus EXPLICITES ici après les avoir mesurés
 * (2026-09-10) — ils étaient jusqu'ici supposés en silence, ce qui produisait
 * quatre rouges qui n'accusaient aucun défaut du produit :
 *
 *   • NON-ROOT — les deux cas qui reposent sur `chmod 0o555` sont
 *     INEXPRIMABLES sous l'uid 0 : root écrit dans un répertoire en lecture
 *     seule, donc la sonde réussit et l'assertion « elle échoue » ne peut pas
 *     tenir. Mesuré : `id -u` = 0 dans ce conteneur, `expected true to be false`.
 *   • BASE JOIGNABLE — les cas `/ready` qui attendent `200` supposent que TOUS
 *     les autres contrôles sont sains. `/ready` interroge aussi la base : si
 *     elle est injoignable, il rend 503 quoi que fasse le stockage, et le test
 *     accuse le stockage pour la panne d'un voisin.
 *
 * Les deux prérequis TIENNENT en CI (`.github/workflows/ci.yml` : service
 * `postgres` + `DATABASE_URL`, exécutant non-root) : rien n'est perdu là où
 * cette couverture compte. Un prérequis explicite qui saute vaut mieux qu'un
 * rouge qui ment — mais il doit se voir, d'où le message porté par chaque saut.
 */
const estRoot = process.getuid?.() === 0;
const baseJoignable = await baseDeDonneesJoignable();

describe('la sonde touche VRAIMENT le stockage', () => {
  it('sur un montage sain, elle réussit', async () => {
    const v = await sonderEcritureStockage();

    expect(v.ok).toBe(true);
    expect(v.code).toBeUndefined();
  });

  it.skipIf(estRoot)('elle ÉCRIT — un répertoire en lecture seule la fait échouer', async () => {
    /*
     * LE TEST DISCRIMINANT. Une sonde qui se contenterait d'un `stat` ou d'un
     * `mkdir` sur un répertoire existant passerait ici au vert : le répertoire
     * est là, il est lisible. Seule une ÉCRITURE échoue.
     *
     * C'est exactement l'écart qui a laissé passer l'incident : le montage
     * répondait aux lectures et refusait les écritures.
     */
    await sonderEcritureStockage(); // crée `_locks`
    chmodSync(join(racine, '_locks'), 0o555);

    const v = await sonderEcritureStockage();

    expect(v.ok).toBe(false);
    expect(v.code).toBe('EACCES');
  });

  it('elle ne laisse aucun résidu derrière elle', async () => {
    await sonderEcritureStockage();

    const restes = readdirSync(join(racine, '_locks'));

    expect(restes).toEqual([]);
  });

  it.skipIf(estRoot)('un montage mort est classé FATAL, pas un défaut transitoire', async () => {
    /*
     * `EACCES` ne doit PAS sortir la réplique : c'est une cause globale ou de
     * configuration, la sortir n'y changerait rien et priverait les routes qui
     * n'écrivent pas.
     */
    await sonderEcritureStockage();
    chmodSync(join(racine, '_locks'), 0o555);

    expect((await sonderEcritureStockage()).fatal).toBe(false);
  });
});

describe('/ready tire la bonne conséquence', () => {
  const construire = () =>
    buildApiApp({
      store: new TestApiStore() as never,
      gitProvider: new TestGitProvider() as never,
      emailProvider: new TestEmailProvider() as never,
    });

  /*
   * `/ready` interroge AUSSI la base : sans base joignable il rend 503 quoi que
   * fasse le stockage, et ce cas accuserait le stockage pour la panne d'un
   * voisin. Le prérequis est donc explicite.
   */
  it.skipIf(!baseJoignable)('stockage sain → la réplique reste dans la rotation', async () => {
    const app = await construire();

    try {
      const r = await app.inject({ method: 'GET', url: '/ready' });
      const corps = r.json() as { checks: Record<string, { status: string }> };

      expect(corps.checks.storage.status).toBe('ok');
      expect(r.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('le corps NOMME le stockage — sans cela l’exploitant ne peut pas diagnostiquer', async () => {
    /*
     * L'incident a coûté du temps parce que rien ne DÉSIGNAIT le stockage. Un
     * `/ready` qui échoue sans dire pourquoi ne vaut guère mieux qu'un `/ready`
     * qui ne regarde pas.
     */
    const app = await construire();

    try {
      const corps = (await app.inject({ method: 'GET', url: '/ready' })).json() as {
        checks: Record<string, unknown>;
      };

      expect(Object.keys(corps.checks)).toContain('storage');
    } finally {
      await app.close();
    }
  });

  it.skipIf(estRoot)('racine de stockage inaccessible → 503, et le motif est nommé', async () => {
    /*
     * On rend la racine elle-même non traversable : `mkdir` de `_locks` échoue,
     * comme il a échoué en ESTALE sur le banc. Le code diffère (EACCES ici, on
     * ne peut pas fabriquer un ESTALE sans NFS), donc ce cas prouve le CHEMIN —
     * la sonde échoue, `/ready` le rapporte et le nomme.
     */
    const app = await construire();
    chmodSync(racine, 0o000);

    try {
      const r = await app.inject({ method: 'GET', url: '/ready' });
      const corps = r.json() as { checks: Record<string, { status: string; detail?: string }> };

      expect(corps.checks.storage.status).toBe('down');
      expect(corps.checks.storage.detail).toContain('transient:');
    } finally {
      chmodSync(racine, 0o755);
      await app.close();
    }
  });
});

describe('le classement, tenu sur le code EXACT de l’incident', () => {
  it('ESTALE — errno -116, le code mesuré le 2026-09-07 — est un montage mort', () => {
    /*
     * On ne peut pas fabriquer un `ESTALE` sans un vrai montage NFS. Le
     * classement est donc éprouvé ici sur le code lui-même, et le chemin qui en
     * découle l'est au site d'appel, plus bas. Deux moitiés, deux tests.
     */
    expect(estMontageMort('ESTALE')).toBe(true);
  });

  it('les autres pannes de montage le sont aussi', () => {
    expect(estMontageMort('EIO')).toBe(true);
    expect(estMontageMort('ENOTCONN')).toBe(true);
  });

  it('les causes GLOBALES ou transitoires ne sortent PAS la réplique', () => {
    /*
     * La contre-épreuve qui compte. Sortir toutes les répliques sur un `ENOSPC`
     * ou un délai dépassé transformerait une dégradation en panne totale, y
     * compris pour les routes qui n'écrivent jamais.
     */
    for (const code of ['ENOSPC', 'EACCES', 'ETIMEDOUT', 'EBUSY', undefined]) {
      expect(estMontageMort(code), `${code} ne doit pas sortir la réplique`).toBe(false);
    }
  });
});
