import { hashPassword } from '@vibecore/auth';
import { describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * AUDX-014 — l'import doit survivre à deux replicas.
 *
 * `services/api/src/app.ts` tient TROIS `Map` en processus : `importStaging`,
 * `importLedger` (ImportCreditLedger) et `importIdemIndex`. Le code l'admet
 * lui-même — « In-process index; durable idempotency = UsageReservation
 * follow-up » et « A multi-replica prod would back this with a shared ephemeral
 * store ».
 *
 * En production l'api tourne `replicas: 2` (HPA jusqu'à 6) et n'a AUCUNE
 * affinité de session : l'Ingress à cookie ne couvre que `/` et `/runtime`, et
 * l'api est jointe par un Service ClusterIP sans `sessionAffinity` — donc
 * round-robin kube-proxy.
 *
 * Deux instances partageant UN store, c'est exactement deux pods partageant un
 * PostgreSQL. C'est le montage de tous les tests ci-dessous.
 */
class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/** Deux « pods » distincts, un seul store — la topologie de production. */
async function twoPods() {
  const store = new TestApiStore();

  const podA = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });
  const podB = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

  const user = await store.createUser({
    email: 'imp@example.com',
    name: 'Imp',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Imp Org', slug: 'imp-org', ownerUserId: user.id });

  /*
   * Une seule Session en base, presentee aux DEUX pods : c'est exactement ce que
   * fait un navigateur derriere un round-robin. Le jeton est porte par le store
   * partage, donc les deux instances l'authentifient — la seule chose qui n'est
   * PAS partagee est l'etat en processus, ce que ces tests mesurent.
   */
  await store.createSession({ userId: user.id, token: 'imp-token', expiresAt: new Date(Date.now() + 3_600_000) });
  await store.upsertSubscription({ organizationId: org.id, planKey: 'team', status: 'ACTIVE' });

  const auth = { authorization: 'Bearer imp-token' };

  return { store, podA, podB, org, auth };
}

const FILES = [
  { path: 'src/index.ts', content: 'export const hello = 1;\n' },
  { path: 'README.md', content: '# hi\n' },
];

describe('AUDX-014 import across two api replicas', () => {
  it('commits an import staged on another pod', async () => {
    const { store, podA, podB, org, auth } = await twoPods();

    const created = await podA.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth,
      payload: { provider: 'zip', idempotencyKey: 'k-1', files: FILES },
    });

    expect(created.statusCode).toBeLessThan(300);
    const importJobId = created.json().import.importJobId;

    /*
     * Le commit atterrit sur l'AUTRE pod — un tirage sur deux avec 2 replicas.
     * Pré-correctif : 409 IMPORT_STAGING_GONE, parce que `importStaging` du pod
     * B ne contient rien. L'import échoue FERMÉ (pas de perte de données), mais
     * il échoue.
     */
    const committed = await podB.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/commit`,
      headers: auth,
      payload: { consent: {} },
    });

    // 201 + the created project: the commit is what mounts the target.
    expect(committed.statusCode).toBe(201);
    expect(committed.json().project?.id).toBeTruthy();

    // The durable outcome, not just the HTTP code.
    const job = await store.getImportJob(importJobId);
    expect(job?.state).toBe('COMMITTED');
    expect(job?.targetProjectId).toBe(committed.json().project.id);

    // Staging disposed on success — it is ephemeral by contract.
    expect(await store.getImportStagedFiles(importJobId)).toBeUndefined();
  });

  it('replays the same import when the idempotent create is retried on another pod', async () => {
    const { store, podA, podB, org, auth } = await twoPods();

    const first = await podA.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth,
      payload: { provider: 'zip', idempotencyKey: 'k-same', files: FILES },
    });

    const second = await podB.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth,
      payload: { provider: 'zip', idempotencyKey: 'k-same', files: FILES },
    });

    /*
     * Pré-correctif : `importIdemIndex` est par pod, donc le pod B ne voit pas
     * la clé et crée un SECOND job — avec une SECONDE réservation de crédits.
     * C'est le double débit que la clé d'idempotence existe pour empêcher.
     */
    expect(second.json().import.importJobId).toBe(first.json().import.importJobId);
    expect(second.json().import.replayed).toBe(true);

    const jobs = [...store.importJobs.values()].filter((job) => job.organizationId === org.id);
    expect(jobs).toHaveLength(1);
  });

  it('cancels on one pod an import created on the other, releasing its reservation', async () => {
    const { store, podA, podB, org, auth } = await twoPods();

    const created = await podA.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports`,
      headers: auth,
      payload: { provider: 'zip', idempotencyKey: 'k-cancel', files: FILES },
    });
    const importJobId = created.json().import.importJobId;

    const cancelled = await podB.inject({
      method: 'POST',
      url: `/orgs/${org.id}/imports/${importJobId}/cancel`,
      headers: auth,
      payload: {},
    });

    expect(cancelled.statusCode).toBe(200);

    /*
     * La réservation avait été prise sur le pod A. `compensateByJob` tournant sur
     * le pod B ne trouvait rien (`keyByJob` est local) : la réservation restait
     * ouverte pour toujours. C'est la fuite de crédits, distincte de l'échec de
     * commit ci-dessus.
     */
    const job = await store.getImportJob(importJobId);
    expect(job?.state).toBe('CANCELLED');
    expect(job?.creditsReserved).toBe(false);
  });
});
