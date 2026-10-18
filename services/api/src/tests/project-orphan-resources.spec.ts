import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line no-restricted-imports -- Service tests use NodeNext imports, not the web app alias.
import { buildApiApp } from '../app.js';
// eslint-disable-next-line no-restricted-imports -- Service tests use NodeNext imports, not the web app alias.
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * AUDX-171 — supprimer un projet doit supprimer ce qu'il a créé HORS de PostgreSQL.
 *
 * Les LIGNES cascadent (24 des 25 relations vers `Project` sont en
 * `onDelete: Cascade`). Les ressources EXTERNES, non — et rien ne les touchait :
 * `DatabaseProvisioner.teardown()` existait, promettait « no orphaned production
 * database behind », et n'était appelé PAR PERSONNE. La route
 * `DELETE /projects/:id/permanent` faisait `hardDeleteProject` + un audit, fin.
 *
 * Ces tests échouent sur le code d'origine : le provisionneur n'est jamais
 * sollicité, le seau reste, le PVC reste.
 */
class QuietEmailProvider implements EmailProvider {
  async send() {
    return;
  }
}

function recorder() {
  const calls: string[] = [];

  return {
    calls,
    databaseProvisioner: {
      async teardown(input: { projectId: string }) {
        calls.push(`db:${input.projectId}`);
      },
    },
    objectStorage: {
      active: true,
      async deleteBucket(projectId: string) {
        calls.push(`bucket:${projectId}`);

        return { deleted: true, bucket: `vc-${projectId}` };
      },
      async ensureBucket(projectId: string) {
        return { bucket: `vc-${projectId}`, created: false, location: 'EU' };
      },
      async bucketExists() {
        return true;
      },
      async listObjects() {
        return { objects: [], folders: [] };
      },
      async createUploadUrl() {
        return { url: 'u', method: 'PUT' as const, headers: {}, expiresAt: 'x' };
      },
      async createDownloadUrl() {
        return { url: 'd', expiresAt: 'x' };
      },
      async putObject() {
        return { key: 'k', size: 0 };
      },
      async moveObject() {
        return { moved: true, key: 'k' };
      },
      async deleteObject() {
        return { deleted: true, count: 0 };
      },
      async deletePrefix() {
        return { deleted: true, count: 0 };
      },
    },
  };
}

async function setup(overrides: Record<string, unknown> = {}) {
  const rec = recorder();
  const store = new TestApiStore();

  const app = await buildApiApp({
    store,
    emailProvider: new QuietEmailProvider(),
    databaseProvisioner: rec.databaseProvisioner as never,
    objectStorage: rec.objectStorage as never,
    ...overrides,
  });

  const user = await store.createUser({
    email: 'orph@example.com',
    name: 'O',
    passwordHash: hashPassword('password123'),
  });

  const org = await store.createOrganization({ name: 'Orph', slug: 'orph', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'orph-token', expiresAt: new Date(Date.now() + 3_600_000) });

  const project = await store.createProject({ organizationId: org.id, name: 'Doomed', slug: 'doomed' });

  return { app, store, org, project, rec, auth: { authorization: 'Bearer orph-token' } };
}

const ORIGINAL_FLAG = process.env.OBJECT_STORAGE_ENABLED;

describe('AUDX-171 project hard delete tears down external resources', () => {
  it('tears down the database and the object-storage bucket', async () => {
    process.env.OBJECT_STORAGE_ENABLED = 'true';

    try {
      const { app, project, rec, auth } = await setup();

      const response = await app.inject({
        method: 'DELETE',
        url: `/projects/${project.id}/permanent`,
        headers: auth,
        payload: { confirmName: 'Doomed' },
      });

      expect(response.statusCode).toBe(200);

      /*
       * Le cœur du défaut : sur le code d'origine ce tableau est VIDE. La base
       * du projet continuait de tourner et le seau restait, indéfiniment.
       */
      expect(rec.calls).toContain(`db:${project.id}`);
      expect(rec.calls).toContain(`bucket:${project.id}`);
      expect(response.json().externalTeardown.complete).toBe(true);
    } finally {
      if (ORIGINAL_FLAG === undefined) {
        delete (process.env as Record<string, string | undefined>).OBJECT_STORAGE_ENABLED;
      } else {
        process.env.OBJECT_STORAGE_ENABLED = ORIGINAL_FLAG;
      }
    }
  });

  it('retains project handles and refuses restore after partial teardown, then permits retry', async () => {
    let unavailable = true;

    const { app, store, project, auth } = await setup({
      databaseProvisioner: {
        async teardown() {
          if (unavailable) {
            throw new Error('isolated teardown unavailable');
          }
        },
      } as never,
    });

    const response = await app.inject({
      method: 'DELETE',
      url: `/projects/${project.id}/permanent`,
      headers: auth,
      payload: { confirmName: 'Doomed' },
    });

    expect(response.statusCode, response.body).toBe(502);
    expect(response.json().code).toBe('PROJECT_TEARDOWN_INCOMPLETE');
    expect(await store.getProject(project.id)).toMatchObject({ runtimeDeletionPending: true });
    expect((await store.getProject(project.id))?.deletedAt).toBeTruthy();

    const restore = await app.inject({ method: 'POST', url: `/projects/${project.id}/restore`, headers: auth });
    expect(restore.statusCode, restore.body).toBe(409);
    expect(restore.json().code).toBe('PROJECT_DELETION_PENDING');
    unavailable = false;

    const retry = await app.inject({
      method: 'DELETE',
      url: `/projects/${project.id}/permanent`,
      headers: auth,
      payload: { confirmName: 'Doomed' },
    });
    expect(retry.statusCode, retry.body).toBe(200);
    expect(await store.getProject(project.id)).toBeUndefined();
    await app.close();
  });

  it('records the teardown outcome in the durable audit trail', async () => {
    const { app, store, org, project, auth } = await setup();

    await app.inject({
      method: 'DELETE',
      url: `/projects/${project.id}/permanent`,
      headers: auth,
      payload: { confirmName: 'Doomed' },
    });

    const logs = await store.listAuditLogs(org.id);
    const entry = logs.find((log) => log.action === 'project.hard_delete');

    /*
     * L'audit est la seule trace qui SURVIT au projet : ses lignes d'activité
     * cascadent avec lui. Si le démontage n'y figure pas, plus rien ne dit ce
     * qui a été supprimé ni ce qui est resté.
     */
    expect(entry).toBeTruthy();

    const metadata = entry!.metadata as { externalTeardown?: { complete: boolean; outcomes: unknown[] } };
    expect(metadata.externalTeardown?.complete).toBe(true);
    expect(metadata.externalTeardown?.outcomes.length).toBeGreaterThan(0);
  });
});

/*
 * Garde d'inventaire. Une ressource externe absente de PROJECT_EXTERNAL_RESOURCES
 * ne sera jamais supprimée : c'est ainsi que les orphelines sont nées. Ce bloc
 * épingle l'inventaire ET la liste des trous connus, pour qu'un ajout silencieux
 * de l'un ou de l'autre casse un test au lieu de passer inaperçu.
 */
describe('AUDX-171 inventaire des ressources externes', () => {
  it('couvre les ressources démontables connues, et chacune est idempotente sur l’absence', async () => {
    const { PROJECT_EXTERNAL_RESOURCES, teardownProjectExternalResources } = await import('../project-teardown.js');

    /*
     * `persistent-volume-claim` a QUITTÉ cet inventaire le 2026-09-07 pour la liste
     * des trous connus. Son `remove` ne touchait rien — le nom enregistré sur le
     * projet (`pvc-<org>-<slug>`) ne désigne aucun volume existant, le vrai étant
     * `pvc-<workspaceId>` — et il rapportait pourtant `removed: true`. C'est
     * exactement le mensonge que la note du second cas décrit.
     */
    expect(PROJECT_EXTERNAL_RESOURCES.map((resource) => resource.id)).toEqual([
      'database',
      'object-storage-bucket',
      'workspace-runtime',
      'published-app',
      'project-files',
    ]);

    /*
     * Sans aucune dépendance branchée, le démontage doit être un no-op RÉUSSI et
     * non une erreur : un rejeu après échec partiel ne doit pas trébucher sur ce
     * qui est déjà parti.
     */
    const report = await teardownProjectExternalResources({}, { id: 'p1', organizationId: 'o1' });
    expect(report.complete).toBe(true);
    expect(report.outcomes).toHaveLength(5);
  });

  it('accepts persisted Prisma workspace IDs and refuses paths or arbitrary resource names', async () => {
    const { teardownProjectExternalResources } = await import('../project-teardown.js');
    const removed: string[] = [];
    const valid = ['ws-example123', 'cmve4a35w0008blmsxxxao0td'];

    const complete = await teardownProjectExternalResources(
      {
        demonterWorkspace: async (id) => {
          removed.push(id);
        },
      },
      { id: 'fixture', organizationId: 'fixture', workspaceIds: valid },
    );
    expect(complete.complete).toBe(true);
    expect(removed).toEqual(valid);

    for (const invalid of ['../neighbor', 'workspace-neighbor', '', 'cshort']) {
      const report = await teardownProjectExternalResources(
        {
          demonterWorkspace: async (id) => {
            removed.push(id);
          },
        },
        { id: 'fixture', organizationId: 'fixture', workspaceIds: [invalid] },
      );
      expect(report.failed).toEqual(['workspace-runtime']);
    }
    expect(removed).toEqual(valid);
  });

  it('déclare explicitement les ressources auditées mais NON couvertes', async () => {
    const { KNOWN_UNCOVERED_PROJECT_RESOURCES } = await import('../project-teardown.js');

    /*
     * Les sauvegardes CNPG survivent toujours. Les inscrire ici est délibéré :
     * une entrée d'inventaire dont le `remove` ne ferait rien rapporterait
     * `removed: true` sur une ressource bien vivante — un mensonge pire que le
     * trou lui-même.
     */
    expect(KNOWN_UNCOVERED_PROJECT_RESOURCES.map((entry) => entry.id)).toContain('cnpg-backups-gcs');

    /*
     * `workspace-pvc` a QUITTÉ cette liste le 2026-09-07 : le trou est comblé. Le
     * volume part désormais avec son workspace, démonté par le manager — le seul à
     * connaître son vrai nom. Voir `workspace-runtime` dans l'inventaire.
     */
    expect(KNOWN_UNCOVERED_PROJECT_RESOURCES.map((entry) => entry.id)).not.toContain('workspace-pvc');
  });
});
