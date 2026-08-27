import { describe, expect, it } from 'vitest';

import { resolveProjectWorkspaceId, runtimeWorkspaceId } from './app.js';

/*
 * BUG-WS-ID-SPLIT / BUG-IDE-001 — option D1 : résoudre le workspace du projet
 * au lieu d'en DÉRIVER l'identifiant.
 *
 * Le défaut mesuré : l'écriture de fichiers atteint `workspace-<cuid>` (le
 * workspace réellement créé) pendant que le build provisionne
 * `workspace-ws-<hash>` (l'id recalculé), VIDE — d'où `ENOENT package.json`.
 *
 * Ces tests décrivent la règle de résolution retenue, y compris son garde-fou :
 * ne JAMAIS adopter un workspace dérivé qui appartient à quelqu'un d'autre.
 */

const PROJECT = 'cmsqdbhgg00060ng2vf7n6w41';
const ALICE = 'user-alice';
const BOB = 'user-bob';

type Row = { id: string; projectId: string; createdAt: string; environment?: string };

/** Store minimal : seul `listWorkspaces` est utilisé par le résolveur. */
function storeWith(rows: Row[], onCall?: () => void) {
  return {
    async listWorkspaces(projectId: string) {
      onCall?.();
      return rows.filter((row) => row.projectId === projectId) as never;
    },
  };
}

function row(id: string, createdAt: string, environment = 'development'): Row {
  return { id, projectId: PROJECT, createdAt, environment };
}

describe('resolveProjectWorkspaceId — la règle de résolution', () => {
  it('1. rend l_id dérivé quand il existe vraiment : le cas courant est INCHANGÉ', async () => {
    const derived = runtimeWorkspaceId(PROJECT, ALICE);
    const store = storeWith([row(derived, '2026-08-01T10:00:00Z')]);

    await expect(resolveProjectWorkspaceId(store, PROJECT, ALICE)).resolves.toBe(derived);
  });

  it('AVANT : l_ancienne règle visait un workspace qui n_existe pas — le pod était provisionné VIDE', () => {
    /*
     * L'ancien code, tel qu'il était écrit sur les huit sites :
     *   const workspaceId = runtimeWorkspaceId(project.id, userId);
     * Aucune lecture de la base, donc aucun moyen de voir que le workspace
     * réel du projet porte un `cuid()`.
     */
    const enBase = ['cmsqworkspacecuid0001'];
    const ancienneCible = runtimeWorkspaceId(PROJECT, ALICE);

    expect(enBase).not.toContain(ancienneCible);
  });

  it('2. adopte le workspace réel du projet quand l_id dérivé n_existe pas — LE DÉFAUT', async () => {
    /*
     * Reproduction exacte de BUG-WS-ID-SPLIT : le workspace a été créé par un
     * chemin qui laisse Prisma poser un `cuid()` (API publique, planificateur,
     * publish). L'ancien code dérivait quand même, et provisionnait un pod vide.
     */
    const store = storeWith([row('cmsqworkspacecuid0001', '2026-08-01T10:00:00Z')]);

    const derived = runtimeWorkspaceId(PROJECT, ALICE);
    const resolved = await resolveProjectWorkspaceId(store, PROJECT, ALICE);

    expect(resolved).toBe('cmsqworkspacecuid0001');
    expect(resolved).not.toBe(derived);
  });

  it('3. rend l_id dérivé quand le projet n_a aucun workspace : premier provisionnement', async () => {
    const store = storeWith([]);

    await expect(resolveProjectWorkspaceId(store, PROJECT, ALICE)).resolves.toBe(runtimeWorkspaceId(PROJECT, ALICE));
  });
});

describe('resolveProjectWorkspaceId — le garde-fou d_isolation', () => {
  it('n_adopte JAMAIS le workspace dérivé d_un autre utilisateur', async () => {
    /*
     * La table ne porte pas de `userId` : l'id dérivé est la SEULE trace du
     * propriétaire. Adopter `ws-<hash de Bob>` ferait travailler Alice et Bob
     * dans le même pod à leur insu.
     */
    const bobs = runtimeWorkspaceId(PROJECT, BOB);
    const store = storeWith([row(bobs, '2026-08-01T09:00:00Z')]);

    const resolved = await resolveProjectWorkspaceId(store, PROJECT, ALICE);

    expect(resolved).not.toBe(bobs);
    expect(resolved).toBe(runtimeWorkspaceId(PROJECT, ALICE));
  });

  it('adopte le cuid même lorsqu_un workspace dérivé d_un tiers est PLUS ANCIEN', async () => {
    const bobs = runtimeWorkspaceId(PROJECT, BOB);
    const store = storeWith([row(bobs, '2026-07-01T00:00:00Z'), row('cmsqworkspacecuid0002', '2026-08-01T00:00:00Z')]);

    await expect(resolveProjectWorkspaceId(store, PROJECT, ALICE)).resolves.toBe('cmsqworkspacecuid0002');
  });

  it('n_adopte pas le checkout de PRODUCTION (celui du publish)', async () => {
    /*
     * Le schéma le dit : le checkout de publication est le workspace dont
     * `environment === 'production'`. L'éditer reviendrait à modifier ce qui est
     * publié.
     */
    const store = storeWith([row('cmsqprodcheckout0001', '2026-08-01T00:00:00Z', 'production')]);

    await expect(resolveProjectWorkspaceId(store, PROJECT, ALICE)).resolves.toBe(runtimeWorkspaceId(PROJECT, ALICE));
  });
});

describe('resolveProjectWorkspaceId — le départage multi-workspace', () => {
  it('choisit le PRIMAIRE, c_est-à-dire le plus ancien — même définition que resolveGitWorkspaceId', async () => {
    /*
     * « a project keeps multiple dev workspaces (primary + secondary agent-run
     * checkouts) » (schema.prisma). `resolveGitWorkspaceId` appelle déjà
     * « primaire » le plus ancien par `createdAt` : la règle reste la même ici,
     * pour qu'il n'y ait pas DEUX définitions du workspace actif.
     */
    const store = storeWith([
      row('cmsqsecondary000002', '2026-08-05T00:00:00Z'),
      row('cmsqprimary00000001', '2026-08-01T00:00:00Z'),
      row('cmsqsecondary000003', '2026-08-09T00:00:00Z'),
    ]);

    await expect(resolveProjectWorkspaceId(store, PROJECT, ALICE)).resolves.toBe('cmsqprimary00000001');
  });

  it('ignore les workspaces d_un AUTRE projet', async () => {
    const store = storeWith([
      { id: 'cmsqotherproject001', projectId: 'autre-projet', createdAt: '2026-01-01T00:00:00Z' },
    ]);

    await expect(resolveProjectWorkspaceId(store, PROJECT, ALICE)).resolves.toBe(runtimeWorkspaceId(PROJECT, ALICE));
  });
});

describe('resolveProjectWorkspaceId — dégradation', () => {
  it('retombe sur l_id dérivé si le store est indisponible (jamais une exception)', async () => {
    const store = {
      async listWorkspaces() {
        throw new Error('base injoignable');
      },
    };

    await expect(resolveProjectWorkspaceId(store as never, PROJECT, ALICE)).resolves.toBe(
      runtimeWorkspaceId(PROJECT, ALICE),
    );
  });

  it('sans utilisateur, conserve le comportement historique (id de projet nu)', async () => {
    const store = storeWith([]);

    await expect(resolveProjectWorkspaceId(store, PROJECT, undefined)).resolves.toBe(PROJECT);
  });

  it('un workspace sans `environment` est traité comme du développement', async () => {
    const store = storeWith([{ id: 'cmsqlegacynoenvcol1', projectId: PROJECT, createdAt: '2026-08-01T00:00:00Z' }]);

    await expect(resolveProjectWorkspaceId(store, PROJECT, ALICE)).resolves.toBe('cmsqlegacynoenvcol1');
  });
});

describe('runtimeWorkspaceId — la dérivation elle-même reste inchangée', () => {
  it('produit un id stable, en `ws-` + 16 hexadécimaux', () => {
    const id = runtimeWorkspaceId(PROJECT, ALICE);

    expect(id).toMatch(/^ws-[0-9a-f]{16}$/);
    expect(runtimeWorkspaceId(PROJECT, ALICE)).toBe(id);
  });

  it('sépare bien deux utilisateurs du même projet', () => {
    expect(runtimeWorkspaceId(PROJECT, ALICE)).not.toBe(runtimeWorkspaceId(PROJECT, BOB));
  });
});
