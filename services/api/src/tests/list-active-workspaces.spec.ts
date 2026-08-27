import { describe, expect, it } from 'vitest';
import { TestApiStore } from './test-api-store.js';

/**
 * listActiveWorkspaces backs the phantom-slot reconciliation: it must return
 * only the org's PENDING/STARTING/RUNNING workspace records (the ones counted by
 * workspaces.active) so the start handler can check each against the manager and
 * free slots whose pod was GC'd. STOPPED/FAILED records must be excluded (they
 * already don't hold a slot), and records from other orgs must never leak in.
 */
describe('listActiveWorkspaces', () => {
  it('returns only active records for the org, excluding stopped/failed and other orgs', async () => {
    const store = new TestApiStore();

    const orgA = await store.createOrganization({ name: 'Org A', slug: 'org-a', ownerUserId: 'user-a' });
    const orgB = await store.createOrganization({ name: 'Org B', slug: 'org-b', ownerUserId: 'user-b' });

    const projectA = await store.createProject({ organizationId: orgA.id, name: 'A', slug: 'a' });
    const projectB = await store.createProject({ organizationId: orgB.id, name: 'B', slug: 'b' });

    const running = await store.createWorkspace({
      projectId: projectA.id,
      expectedOrganizationId: orgA.id,
      name: 'running',
      runtimeMode: 'remote-kubernetes',
    });
    const starting = await store.createWorkspace({
      projectId: projectA.id,
      expectedOrganizationId: orgA.id,
      name: 'starting',
      runtimeMode: 'remote-kubernetes',
    });
    await store.updateWorkspaceStatus({
      workspaceId: starting.id,
      expectedProjectId: projectA.id,
      expectedOrganizationId: orgA.id,
      status: 'STARTING',
    });

    const stopped = await store.createWorkspace({
      projectId: projectA.id,
      expectedOrganizationId: orgA.id,
      name: 'stopped',
      runtimeMode: 'remote-kubernetes',
    });
    await store.updateWorkspaceStatus({
      workspaceId: stopped.id,
      expectedProjectId: projectA.id,
      expectedOrganizationId: orgA.id,
      status: 'STOPPED',
    });

    // A different org's running workspace must not appear in org A's list.
    await store.createWorkspace({
      projectId: projectB.id,
      expectedOrganizationId: orgB.id,
      name: 'other-org',
      runtimeMode: 'remote-kubernetes',
    });

    const active = await store.listActiveWorkspaces(orgA.id);
    const ids = active.map((workspace) => workspace.id).sort();

    expect(ids).toEqual([running.id, starting.id].sort());
    expect(active.every((workspace) => ['PENDING', 'STARTING', 'RUNNING'].includes(workspace.status))).toBe(true);
  });
});
