import { describe, expect, it, vi } from 'vitest';

import { CnpgProvisioner, DB_NAMESPACE } from './database-provisioner.js';

/**
 * BUG-QA-DB-ORPHAN-CR-001 — une base survivait à la suppression de son projet.
 *
 * Un projet en tier PARTAGÉ ne reçoit pas de `Cluster` dédié : il reçoit une CR
 * `Database` qui lie une base logique au cluster partagé. Or `teardown()` ne
 * supprimait que `Cluster` et `ScheduledBackup` — donc, pour ces projets, il ne
 * supprimait RIEN.
 *
 * Constaté en production le 2026-09-01, puis RE-VÉRIFIÉ avant correctif : 2 CR
 * `Database` `APPLIED=true` dans `project-databases` dont le projet n'existe
 * plus (`Project` : 0 ligne) et qu'aucune `DatabaseInstance` ne référence
 * (0 ligne) — `db-cmshm3gni00400nai23ilaq9f` et
 * `db-cmtfxq12z00170ndhhz666nrx-prod`. Les trois autres CR du namespace
 * appartiennent bien à des projets vivants : l'orphelinat est réel, pas un
 * artefact de lecture.
 *
 * Le nom de la CR `Database` est le MÊME que celui du `Cluster`, ce qui rendait
 * l'oubli facile à ne pas voir : la ligne de démontage semblait déjà couverte.
 */

function harness() {
  const supprimes: Array<{ kind: string; name: string }> = [];

  const k8s = {
    apply: vi.fn(async () => undefined),
    get: vi.fn(async () => undefined),
    delete: vi.fn(async (kind: string, _ns: string, name: string) => {
      supprimes.push({ kind, name });
    }),
    getSecret: vi.fn(async () => undefined),
  };

  return { k8s, supprimes };
}

const PROJET = 'cmshm3gni00400nai23ilaq9f';

describe('BUG-QA-DB-ORPHAN-CR-001 — le démontage n’oublie plus la base partagée', () => {
  it('supprime la CR `Database` des DEUX environnements', async () => {
    const { k8s, supprimes } = harness();

    await new CnpgProvisioner(k8s as never, 'bkt').teardown({ projectId: PROJET });

    const bases = supprimes.filter((s) => s.kind === 'Database').map((s) => s.name);

    expect(bases, 'dev ET prod, sinon la base de production survit').toEqual([`db-${PROJET}`, `db-${PROJET}-prod`]);
  });

  it('supprime toujours le `Cluster` et le `ScheduledBackup` — rien n’a régressé', () => {
    /*
     * Contre-garde : ajouter la `Database` ne doit pas remplacer ce qui marchait
     * déjà pour le tier dédié.
     */
    const { k8s, supprimes } = harness();

    return new CnpgProvisioner(k8s as never, 'bkt').teardown({ projectId: PROJET }).then(() => {
      expect(supprimes.filter((s) => s.kind === 'Cluster').map((s) => s.name)).toEqual([
        `db-${PROJET}`,
        `db-${PROJET}-prod`,
      ]);
      expect(supprimes.filter((s) => s.kind === 'ScheduledBackup')).toHaveLength(2);
    });
  });

  it('agit dans le namespace des bases de projet, pas ailleurs', async () => {
    const { k8s } = harness();

    await new CnpgProvisioner(k8s as never, 'bkt').teardown({ projectId: PROJET });

    for (const appel of k8s.delete.mock.calls) {
      expect(appel[1], 'namespace').toBe(DB_NAMESPACE);
    }
  });

  it('un échec de suppression ne fait pas échouer le démontage', async () => {
    /*
     * Le démontage est best-effort : une CR déjà absente (suppression rejouée,
     * projet jamais provisionné) ne doit pas interrompre le reste. Sinon un
     * premier échec laisserait tout le reste en place — l'inverse du but.
     */
    const { k8s, supprimes } = harness();
    k8s.delete.mockImplementationOnce(async () => {
      throw new Error('déjà supprimée');
    });

    await expect(new CnpgProvisioner(k8s as never, 'bkt').teardown({ projectId: PROJET })).resolves.toBeUndefined();
    expect(supprimes.length, 'les suppressions suivantes ont bien eu lieu').toBeGreaterThan(3);
  });
});
