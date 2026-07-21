/*
 * Negative-first specs pour l'enforcement des AccessGrants sur les ressources
 * NON-projet (P0-EX-07) : ARTIFACT (ProjectSnapshot), DEPLOYMENT, DATASET
 * (instance de base managée). Tout est vérifié SERVER-side à travers les vraies
 * routes (app.inject) — un grant ouvre SA ressource seule, jamais le projet
 * parent ni les ressources sœurs ; expiré/révoqué/cross-tenant ⇒ rien.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

function buildTestApiApp(options: ApiAppOptions = {}) {
  return buildApiApp({ emailProvider: new QuietEmailProvider(), ...options });
}

async function register(app: Awaited<ReturnType<typeof buildTestApiApp>>, email: string, organizationName: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: 'Resource Grant Tester', organizationName },
  });
  expect(response.statusCode).toBe(201);

  return response.json() as { token: string; user: { id: string }; organization: { id: string } };
}

describe('AccessGrants sur ARTIFACT / DEPLOYMENT / DATASET — enforcement serveur', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'rag-state-secret-do-not-ship';
    process.env.ENCRYPTION_SECRET = 'rag-encryption-secret-do-not-ship';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  async function setup() {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const owner = await register(app, 'owner@example.com', 'Resource Org');

    const project = await app.inject({
      method: 'POST',
      url: `/orgs/${owner.organization.id}/projects`,
      headers: auth(owner.token),
      payload: { name: 'Resource Project' },
    });
    expect(project.statusCode).toBe(201);

    const projectId = (project.json() as { project: { id: string } }).project.id;

    return { store, app, owner, projectId };
  }

  /** Crée un grant via la vraie route de gestion (members:manage). */
  async function createGrant(
    app: Awaited<ReturnType<typeof buildTestApiApp>>,
    token: string,
    projectId: string,
    payload: Record<string, unknown>,
  ) {
    return app.inject({
      method: 'POST',
      url: `/projects/${projectId}/access-grants`,
      headers: auth(token),
      payload,
    });
  }

  describe('négatifs — les refus d’abord', () => {
    it('un grant ARTIFACT n’ouvre ni le projet parent ni la liste des snapshots — seulement CE snapshot', async () => {
      const { store, app, owner, projectId } = await setup();
      const outsider = await register(app, 'artifact@example.com', 'Artifact Own Org');

      const snapshot = await store.createSnapshot({
        projectId,
        label: 'granted snapshot',
        kind: 'manual',
        manifest: { files: [] },
        createdByUserId: owner.user.id,
      });

      const grantRes = await createGrant(app, owner.token, projectId, {
        subjectType: 'USER',
        subjectUserId: outsider.user.id,
        roleKey: 'viewer',
        resourceType: 'ARTIFACT',
        resourceId: snapshot.id,
      });
      expect(grantRes.statusCode).toBe(201);

      // Le projet parent reste invisible (anti-énumération).
      const files = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/files`,
        headers: auth(outsider.token),
      });
      expect(files.statusCode).toBe(404);

      // La liste des snapshots (ressources sœurs) reste invisible.
      const list = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/snapshots`,
        headers: auth(outsider.token),
      });
      expect(list.statusCode).toBe(404);

      // Un AUTRE snapshot du même projet reste invisible.
      const sibling = await store.createSnapshot({
        projectId,
        label: 'ungranted snapshot',
        kind: 'manual',
        manifest: { files: [] },
        createdByUserId: owner.user.id,
      });
      const siblingRead = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/snapshots/${sibling.id}/restore-preview`,
        headers: auth(outsider.token),
      });
      expect(siblingRead.statusCode).toBe(404);
    });

    it('un grant DEPLOYMENT n’ouvre pas un autre deployment du même projet (ni la liste)', async () => {
      const { store, app, owner, projectId } = await setup();
      const outsider = await register(app, 'deploy@example.com', 'Deploy Own Org');

      const granted = await store.createDeployment({ projectId, provider: 'static', status: 'READY' });
      const sibling = await store.createDeployment({ projectId, provider: 'static', status: 'READY' });

      const grantRes = await createGrant(app, owner.token, projectId, {
        subjectType: 'USER',
        subjectUserId: outsider.user.id,
        roleKey: 'viewer',
        resourceType: 'DEPLOYMENT',
        resourceId: granted.id,
      });
      expect(grantRes.statusCode).toBe(201);

      // La ressource accordée est lisible…
      const grantedRead = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/deployments/${granted.id}`,
        headers: auth(outsider.token),
      });
      expect(grantedRead.statusCode).toBe(200);

      // …la sœur ne l’est pas, ni la liste, ni le projet parent.
      const siblingRead = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/deployments/${sibling.id}`,
        headers: auth(outsider.token),
      });
      expect(siblingRead.statusCode).toBe(404);

      const list = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/deployments`,
        headers: auth(outsider.token),
      });
      expect(list.statusCode).toBe(404);

      const files = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/files`,
        headers: auth(outsider.token),
      });
      expect(files.statusCode).toBe(404);
    });

    it('un grant DEPLOYMENT expiré ne confère RIEN (404)', async () => {
      const { store, app, owner, projectId } = await setup();
      const outsider = await register(app, 'expired-res@example.com', 'Expired Res Org');
      const deployment = await store.createDeployment({ projectId, provider: 'static', status: 'READY' });

      const grantRes = await createGrant(app, owner.token, projectId, {
        subjectType: 'USER',
        subjectUserId: outsider.user.id,
        roleKey: 'viewer',
        resourceType: 'DEPLOYMENT',
        resourceId: deployment.id,
        expiresAt: new Date(Date.now() - 60_000).toISOString(), // déjà expiré
      });
      expect(grantRes.statusCode).toBe(201);

      const read = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/deployments/${deployment.id}`,
        headers: auth(outsider.token),
      });
      expect(read.statusCode).toBe(404);
    });

    it('une permission retirée = 404 : révocation d’un grant DEPLOYMENT, même appel 200 → 404', async () => {
      const { store, app, owner, projectId } = await setup();
      const outsider = await register(app, 'revoked-res@example.com', 'Revoked Res Org');
      const deployment = await store.createDeployment({ projectId, provider: 'static', status: 'READY' });

      const grantRes = await createGrant(app, owner.token, projectId, {
        subjectType: 'USER',
        subjectUserId: outsider.user.id,
        roleKey: 'viewer',
        resourceType: 'DEPLOYMENT',
        resourceId: deployment.id,
      });

      const grantId = (grantRes.json() as { grant: { id: string } }).grant.id;

      const before = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/deployments/${deployment.id}`,
        headers: auth(outsider.token),
      });
      expect(before.statusCode).toBe(200);

      const revoke = await app.inject({
        method: 'DELETE',
        url: `/projects/${projectId}/access-grants/${grantId}`,
        headers: auth(owner.token),
      });
      expect(revoke.statusCode).toBe(200);
      expect((revoke.json() as { grant: { revokedAt?: string } }).grant.revokedAt).toBeTruthy();

      const after = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/deployments/${deployment.id}`,
        headers: auth(outsider.token),
      });
      expect(after.statusCode).toBe(404);
    });

    it('cross-tenant : un grant forgé dans une AUTRE org ne confère rien (404)', async () => {
      const { store, app, projectId } = await setup();
      const outsider = await register(app, 'cross-res@example.com', 'Cross Res Org');
      const deployment = await store.createDeployment({ projectId, provider: 'static', status: 'READY' });

      // Ligne forgée directement dans le store : org du GRANT ≠ org du PROJET.
      await store.createAccessGrant({
        organizationId: outsider.organization.id,
        subjectType: 'USER',
        subjectUserId: outsider.user.id,
        resourceType: 'DEPLOYMENT',
        resourceId: deployment.id,
        roleKey: 'editor',
      });

      const read = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/deployments/${deployment.id}`,
        headers: auth(outsider.token),
      });
      expect(read.statusCode).toBe(404);
    });

    it('guest via grant DEPLOYMENT : lecture 200, écriture 403 PROJECT_ROLE_READ_ONLY', async () => {
      const { store, app, owner, projectId } = await setup();
      const guest = await register(app, 'guest-res@example.com', 'Guest Res Org');
      const deployment = await store.createDeployment({ projectId, provider: 'static', status: 'QUEUED' });

      const grantRes = await createGrant(app, owner.token, projectId, {
        subjectType: 'USER',
        subjectUserId: guest.user.id,
        roleKey: 'guest',
        resourceType: 'DEPLOYMENT',
        resourceId: deployment.id,
      });
      expect(grantRes.statusCode).toBe(201);

      const read = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/deployments/${deployment.id}`,
        headers: auth(guest.token),
      });
      expect(read.statusCode).toBe(200);

      const write = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/deployments/${deployment.id}/cancel`,
        headers: auth(guest.token),
      });
      expect(write.statusCode).toBe(403);
      expect((write.json() as { code: string }).code).toBe('PROJECT_ROLE_READ_ONLY');
    });

    it('la création de grant refuse une ressource qui n’appartient pas au projet (404 RESOURCE_NOT_FOUND)', async () => {
      const { store, app, owner, projectId } = await setup();
      const outsider = await register(app, 'binding@example.com', 'Binding Org');

      // Deployment d'un AUTRE projet de la même org.
      const otherProject = await app.inject({
        method: 'POST',
        url: `/orgs/${owner.organization.id}/projects`,
        headers: auth(owner.token),
        payload: { name: 'Other Project' },
      });

      const otherProjectId = (otherProject.json() as { project: { id: string } }).project.id;
      const foreign = await store.createDeployment({ projectId: otherProjectId, provider: 'static', status: 'READY' });

      const grantRes = await createGrant(app, owner.token, projectId, {
        subjectType: 'USER',
        subjectUserId: outsider.user.id,
        roleKey: 'viewer',
        resourceType: 'DEPLOYMENT',
        resourceId: foreign.id,
      });
      expect(grantRes.statusCode).toBe(404);
      expect((grantRes.json() as { code: string }).code).toBe('RESOURCE_NOT_FOUND');

      // resourceId manquant pour un type non-PROJECT ⇒ 400.
      const missingId = await createGrant(app, owner.token, projectId, {
        subjectType: 'USER',
        subjectUserId: outsider.user.id,
        roleKey: 'viewer',
        resourceType: 'ARTIFACT',
      });
      expect(missingId.statusCode).toBe(400);
    });

    it('DATASET : sans grant ⇒ 404 ; grant viewer ⇒ lecture 200 mais écriture 403', async () => {
      process.env.DB_ROLLBACK_ENABLED = 'true';

      const { store, app, owner, projectId } = await setup();
      const granted = await register(app, 'dataset@example.com', 'Dataset Org');
      const ungranted = await register(app, 'dataset-none@example.com', 'Dataset None Org');

      const instance = await store.createDatabaseInstance({
        projectId,
        organizationId: owner.organization.id,
        retentionDays: 7,
      });

      const grantRes = await createGrant(app, owner.token, projectId, {
        subjectType: 'USER',
        subjectUserId: granted.user.id,
        roleKey: 'viewer',
        resourceType: 'DATASET',
        resourceId: instance.id,
      });
      expect(grantRes.statusCode).toBe(201);

      // Sans grant ni rôle projet : la ressource n'existe pas (404).
      const anon = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/database`,
        headers: auth(ungranted.token),
      });
      expect(anon.statusCode).toBe(404);

      // Avec grant viewer : lecture du panneau 200…
      const read = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/database`,
        headers: auth(granted.token),
      });
      expect(read.statusCode).toBe(200);
      expect((read.json() as { instance: { id: string } }).instance?.id).toBe(instance.id);

      // …mais écriture (snapshot manuel) refusée : rôle read-only.
      const write = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/database/snapshots`,
        headers: auth(granted.token),
        payload: { label: 'viewer write attempt' },
      });
      expect(write.statusCode).toBe(403);
      expect((write.json() as { code: string }).code).toBe('PROJECT_ROLE_READ_ONLY');

      // Le projet parent reste invisible malgré le grant DATASET.
      const files = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/files`,
        headers: auth(granted.token),
      });
      expect(files.statusCode).toBe(404);
    });
  });

  describe('chemins positifs (élévation bornée, et son retrait)', () => {
    it('membre org viewer + grant DEPLOYMENT editor : écrit CE deployment, pas la sœur', async () => {
      const { store, app, owner, projectId } = await setup();
      const member = await register(app, 'elevated@example.com', 'Elevated Org');
      await store.addMember({ organizationId: owner.organization.id, userId: member.user.id, roleKey: 'viewer' });

      const granted = await store.createDeployment({ projectId, provider: 'static', status: 'QUEUED' });
      const sibling = await store.createDeployment({ projectId, provider: 'static', status: 'QUEUED' });

      const grantRes = await createGrant(app, owner.token, projectId, {
        subjectType: 'USER',
        subjectUserId: member.user.id,
        roleKey: 'editor',
        resourceType: 'DEPLOYMENT',
        resourceId: granted.id,
      });
      expect(grantRes.statusCode).toBe(201);

      // Écriture sur la ressource accordée : passe (cancel d'un QUEUED → 200).
      const write = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/deployments/${granted.id}/cancel`,
        headers: auth(member.token),
      });
      expect(write.statusCode).toBe(200);

      // La même écriture sur la sœur reste refusée (403 : membre sans permission).
      const siblingWrite = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/deployments/${sibling.id}/cancel`,
        headers: auth(member.token),
      });
      expect(siblingWrite.statusCode).toBe(403);
    });

    it('grant de GROUPE sur un deployment : accès via l’appartenance, coupé quand on quitte le groupe', async () => {
      const { store, app, owner, projectId } = await setup();
      const member = await register(app, 'grouped-res@example.com', 'Grouped Res Org');
      await store.addMember({ organizationId: owner.organization.id, userId: member.user.id, roleKey: 'viewer' });

      const deployment = await store.createDeployment({ projectId, provider: 'static', status: 'QUEUED' });

      const groupRes = await app.inject({
        method: 'POST',
        url: `/orgs/${owner.organization.id}/groups`,
        headers: auth(owner.token),
        payload: { name: 'deployers' },
      });

      const groupId = (groupRes.json() as { group: { id: string } }).group.id;

      await app.inject({
        method: 'POST',
        url: `/orgs/${owner.organization.id}/groups/${groupId}/members`,
        headers: auth(owner.token),
        payload: { userId: member.user.id },
      });

      const grantRes = await createGrant(app, owner.token, projectId, {
        subjectType: 'GROUP',
        subjectGroupId: groupId,
        roleKey: 'editor',
        resourceType: 'DEPLOYMENT',
        resourceId: deployment.id,
      });
      expect(grantRes.statusCode).toBe(201);

      const write = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/deployments/${deployment.id}/cancel`,
        headers: auth(member.token),
      });
      expect(write.statusCode).toBe(200);

      // Quitter le groupe coupe l'accès immédiatement (résolution par requête).
      const removeRes = await app.inject({
        method: 'DELETE',
        url: `/orgs/${owner.organization.id}/groups/${groupId}/members/${member.user.id}`,
        headers: auth(owner.token),
      });
      expect(removeRes.statusCode).toBe(204);

      const readAfter = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/deployments/${deployment.id}`,
        headers: auth(member.token),
      });

      // Le rôle org viewer garde la LECTURE projet-wide ; c'est l'élévation qui tombe.
      expect(readAfter.statusCode).toBe(200);

      const writeAfter = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/deployments/${deployment.id}/cancel`,
        headers: auth(member.token),
      });
      expect(writeAfter.statusCode).toBe(403);
    });

    it('grant ARTIFACT viewer : restore-preview de CE snapshot lisible par un outsider', async () => {
      const { app, owner, projectId } = await setup();
      const outsider = await register(app, 'artifact-read@example.com', 'Artifact Read Org');

      // Snapshot réel via la vraie route (archive réellement stockée).
      const snapshotRes = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/snapshots`,
        headers: auth(owner.token),
        payload: { label: 'Readable artifact', kind: 'manual' },
      });
      expect(snapshotRes.statusCode).toBe(201);

      const snapshotId = (snapshotRes.json() as { snapshot: { id: string } }).snapshot.id;

      const grantRes = await createGrant(app, owner.token, projectId, {
        subjectType: 'USER',
        subjectUserId: outsider.user.id,
        roleKey: 'viewer',
        resourceType: 'ARTIFACT',
        resourceId: snapshotId,
      });
      expect(grantRes.statusCode).toBe(201);

      const preview = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/snapshots/${snapshotId}/restore-preview`,
        headers: auth(outsider.token),
      });
      expect(preview.statusCode).toBe(200);
    });

    it('les grants de ressource se listent par ressource (members:manage)', async () => {
      const { store, app, owner, projectId } = await setup();
      const outsider = await register(app, 'list-res@example.com', 'List Res Org');
      const deployment = await store.createDeployment({ projectId, provider: 'static', status: 'READY' });

      await createGrant(app, owner.token, projectId, {
        subjectType: 'USER',
        subjectUserId: outsider.user.id,
        roleKey: 'viewer',
        resourceType: 'DEPLOYMENT',
        resourceId: deployment.id,
      });

      const list = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}/access-grants?resourceType=DEPLOYMENT&resourceId=${deployment.id}`,
        headers: auth(owner.token),
      });
      expect(list.statusCode).toBe(200);

      const grants = (list.json() as { grants: Array<{ resourceType: string; resourceId: string }> }).grants;
      expect(grants).toHaveLength(1);
      expect(grants[0].resourceType).toBe('DEPLOYMENT');
      expect(grants[0].resourceId).toBe(deployment.id);
    });
  });
});
