import { describe, expect, it, vi } from 'vitest';

import { CnpgProvisioner, DB_NAMESPACE } from './database-provisioner.js';

/*
 * BUG-QA-DB-PROVISIONING-STUCK — « PROVISIONING » qui ne finit jamais.
 *
 * Reproduit en réel dans l'environnement de test, opérateur CNPG v1.29.1
 * installé et cluster partagé sain :
 *
 *   Database db-<projet>   APPLIED=false
 *   ERROR: role "t_<projet>" does not exist (SQLSTATE 42704)
 *
 * Le provisionneur créait le rôle propriétaire AVANT la `Database` CR — mais en
 * « best-effort », échec avalé. Quand la création du rôle ne se faisait pas, la
 * CR était posée quand même ; CNPG refusait alors indéfiniment de créer la base,
 * et la ligne côté produit restait « PROVISIONING » sans que rien ne la
 * réconcilie ni ne permette de réessayer.
 *
 * Le déclencheur le plus simple est l'absence de `DB_SHARED_TENANT_SECRET`, mais
 * TOUTE défaillance empruntait le même trou : cluster partagé injoignable,
 * secret `<cluster>-app` absent, erreur SQL, RBAC refusé.
 */

function harness(overrides: { getSecret?: unknown; provisionTenant?: unknown } = {}) {
  const applied: Array<{ kind: string; name: string }> = [];

  const k8s = {
    apply: vi.fn(async (manifest: any) => {
      applied.push({ kind: manifest.kind, name: manifest.metadata?.name });
    }),
    get: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    getSecret: (overrides.getSecret as any) ?? vi.fn(async () => ({ username: 'app', password: 'pw', dbname: 'app' })),
  };

  const sqlExec = {
    provisionTenant: (overrides.provisionTenant as any) ?? vi.fn(async () => undefined),
  };

  return { k8s, sqlExec, applied };
}

const INPUT = {
  projectId: 'cmsqdbhgg00060ng2vf7n6w41',
  organizationId: 'org-1',
  retentionDays: 7,
  tier: 'shared' as const,
};

describe('provisionInstance (tier partagé) — plus de ressource empoisonnée', () => {
  it("APRÈS : sans secret de locataire, AUCUNE Database CR n'est posée", async () => {
    const previous = process.env.DB_SHARED_TENANT_SECRET;
    delete process.env.DB_SHARED_TENANT_SECRET;

    try {
      const { k8s, sqlExec, applied } = harness();
      const provisioner = new CnpgProvisioner(k8s as never, 'bkt', undefined, sqlExec as never);

      const result = await provisioner.provisionInstance(INPUT);

      expect(result.applied).toBe(false);
      expect(result.reason).toBe('SHARED_TENANT_UNAVAILABLE');

      // C'est CETTE CR qui restait en échec pour toujours.
      expect(applied.find((a) => a.kind === 'Database')).toBeUndefined();
      expect(applied).toEqual([]);
    } finally {
      if (previous === undefined) {
        delete process.env.DB_SHARED_TENANT_SECRET;
      } else {
        process.env.DB_SHARED_TENANT_SECRET = previous;
      }
    }
  });

  it("APRÈS : si le secret admin du cluster est introuvable, rien n'est posé non plus", async () => {
    process.env.DB_SHARED_TENANT_SECRET = 'secret-de-test';

    const { k8s, sqlExec, applied } = harness({ getSecret: vi.fn(async () => undefined) });
    const provisioner = new CnpgProvisioner(k8s as never, 'bkt', undefined, sqlExec as never);

    const result = await provisioner.provisionInstance(INPUT);

    expect(result.applied).toBe(false);
    expect(applied).toEqual([]);
  });

  it("APRÈS : si le SQL de création du locataire échoue, rien n'est posé", async () => {
    process.env.DB_SHARED_TENANT_SECRET = 'secret-de-test';

    const { k8s, sqlExec, applied } = harness({
      provisionTenant: vi.fn(async () => {
        throw new Error('connexion refusée vers shared-pg-0-rw');
      }),
    });

    const provisioner = new CnpgProvisioner(k8s as never, 'bkt', undefined, sqlExec as never);

    const result = await provisioner.provisionInstance(INPUT);

    expect(result.applied).toBe(false);
    expect(applied).toEqual([]);
  });

  it('le chemin nominal pose bien le Pooler PUIS la Database, et le locataire d_abord', async () => {
    process.env.DB_SHARED_TENANT_SECRET = 'secret-de-test';

    const { k8s, sqlExec, applied } = harness();
    const provisioner = new CnpgProvisioner(k8s as never, 'bkt', undefined, sqlExec as never);

    const result = await provisioner.provisionInstance(INPUT);

    expect(result.applied).toBe(true);
    expect(result.reason).toBeUndefined();

    // Le rôle propriétaire est créé AVANT la CR qui le référence.
    expect(sqlExec.provisionTenant).toHaveBeenCalledOnce();
    expect(applied.map((a) => a.kind)).toEqual(['Pooler', 'Database']);

    const tenant = (sqlExec.provisionTenant as any).mock.calls[0][0];
    expect(tenant.role).toBe(`t_${INPUT.projectId}`);
    expect(tenant.db).toBe(`proj_${INPUT.projectId}`);
    expect(tenant.adminUri).toContain(`.${DB_NAMESPACE}.svc:5432/`);
  });
});
