import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KubectlWorkspaceK8sClient, type K8sObject } from '@vibecore/k8s-client';
import { JsonWorkspaceStore, WorkspaceManager } from './manager.js';
import { buildWorkspaceManagerApp } from './app.js';

const reservation = {
  workspaceId: 'ws-admission',
  projectId: 'project-admission',
  orgId: 'org-admission',
  plan: 'free' as const,
};
const startInput = { ...reservation, namespace: 'workspaces', image: 'agent:test', env: {}, allowedSecretKeys: [] };

describe('workspace admission: real local store, instrumented Kubernetes', () => {
  let directory: string;
  let store: JsonWorkspaceStore;
  let manager: WorkspaceManager;
  let k8s: KubectlWorkspaceK8sClient;
  let objects: Map<string, K8sObject>;
  const key = (kind: string, name: string) => `${kind}:${name}`;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'workspace-admission-'));
    store = new JsonWorkspaceStore(join(directory, 'registry.json'));
    objects = new Map();
    k8s = new KubectlWorkspaceK8sClient();
    vi.spyOn(k8s, 'get').mockImplementation(async (kind, _namespace, name) => objects.get(key(kind, name)));
    vi.spyOn(k8s, 'getPod').mockImplementation(async (_namespace, name) => {
      const object = objects.get(key('Pod', name));
      return object
        ? ({ ...object, status: { conditions: [{ type: 'Ready', status: 'True' }] } } as K8sObject)
        : undefined;
    });
    vi.spyOn(k8s, 'apply').mockImplementation(async (object) => {
      objects.set(key(object.kind, object.metadata.name), object);
      return object;
    });
    vi.spyOn(k8s, 'delete').mockImplementation(async (kind, _namespace, name) => {
      objects.delete(key(kind, name));
    });
    manager = new WorkspaceManager(store, k8s, { publish: async () => undefined }, 'local-admission-tests-only');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it('only one claim/release wins across JSON store instances', async () => {
    const first = await store.reserveAdmission(reservation);
    const peer = new JsonWorkspaceStore(store.filePath);
    const results = await Promise.all([
      store.compareAdmission(first.id, first.admission!, { ...first.admission!, state: 'PROVISIONING' }),
      peer.compareAdmission(first.id, first.admission!, { ...first.admission!, state: 'RELEASED' }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('reservation retries preserve the generation; legacy rows remain legacy', async () => {
    const first = await store.reserveAdmission(reservation);
    const duplicate = await store.reserveAdmission(reservation);
    expect(duplicate.admission).toEqual(first.admission);
    const { createdAt: _createdAt, lastActiveAt: _lastActiveAt, admission: _admission, ...legacy } = first;
    await store.create({ ...legacy, id: 'legacy' });
    expect((await store.reserveAdmission({ ...reservation, workspaceId: 'legacy' })).admission).toBeUndefined();
    await expect(store.reserveAdmission({ ...reservation, orgId: 'other-org' })).rejects.toMatchObject({
      code: 'WORKSPACE_ADMISSION_OWNER_MISMATCH',
    });
  });

  it('released generations cannot start after a newer reservation', async () => {
    const first = await store.reserveAdmission(reservation);
    expect(
      (await manager.releaseWorkspaceAdmission('workspaces', first.id, first.admission!.generation, 0)).released,
    ).toBe(true);
    const second = await store.reserveAdmission(reservation);
    expect(second.admission!.generation).not.toBe(first.admission!.generation);
    await expect(
      manager.startAdmittedWorkspace({ ...startInput, admissionGeneration: first.admission!.generation }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'WORKSPACE_ADMISSION_STALE' });
    expect(k8s.apply).not.toHaveBeenCalled();
    expect((await store.get(first.id))?.admission).toEqual(second.admission);
  });

  it('a claim during the absence probe prevents restitution', async () => {
    const reserved = await store.reserveAdmission(reservation);
    vi.mocked(k8s.getPod).mockImplementationOnce(async () => {
      await store.compareAdmission(reserved.id, reserved.admission!, { ...reserved.admission!, state: 'PROVISIONING' });
      return undefined;
    });
    expect(
      (await manager.releaseWorkspaceAdmission('workspaces', reserved.id, reserved.admission!.generation, 0)).released,
    ).toBe(false);
    expect((await store.get(reserved.id))?.admission?.state).toBe('PROVISIONING');
  });

  it('an existing pod or a Kubernetes read error never frees RESERVED', async () => {
    const reserved = await store.reserveAdmission(reservation);
    objects.set(key('Pod', reserved.podName), { apiVersion: 'v1', kind: 'Pod', metadata: { name: reserved.podName } });
    expect(
      (await manager.releaseWorkspaceAdmission('workspaces', reserved.id, reserved.admission!.generation, 0)).released,
    ).toBe(false);
    vi.mocked(k8s.getPod).mockRejectedValueOnce(new Error('control plane unavailable'));
    await expect(
      manager.releaseWorkspaceAdmission('workspaces', reserved.id, reserved.admission!.generation, 0),
    ).rejects.toThrow('control plane unavailable');
    expect((await store.get(reserved.id))?.admission?.state).toBe('RESERVED');
  });

  it('reapplies changed runtime configuration on ACTIVE and preserves the PVC', async () => {
    const reserved = await store.reserveAdmission(reservation);
    const generation = reserved.admission!.generation;
    const running = await manager.startAdmittedWorkspace({ ...startInput, admissionGeneration: generation });
    expect(running.admission?.state).toBe('ACTIVE');
    const reapplied = await manager.startAdmittedWorkspace({
      ...startInput,
      image: 'agent:changed',
      admissionGeneration: generation,
    });
    expect(reapplied.admission?.attemptId).not.toBe(running.admission?.attemptId);
    expect(vi.mocked(k8s.apply).mock.calls.filter(([object]) => object.kind === 'PersistentVolumeClaim')).toHaveLength(
      1,
    );
    const pod = objects.get(key('Pod', reserved.podName));
    expect(JSON.stringify(pod)).toContain('agent:changed');
    const stopped = await manager.stopAdmittedWorkspace('workspaces', reserved.id, generation);
    expect(stopped?.admission?.state).toBe('RELEASED');
    expect(objects.has(key('PersistentVolumeClaim', reserved.pvcName))).toBe(true);
    expect(vi.mocked(k8s.delete).mock.calls.some(([kind]) => kind === 'PersistentVolumeClaim')).toBe(false);
  });

  it('keeps uncertain provisioning after a failed apply, rejects stop and never retries Kubernetes', async () => {
    const reserved = await store.reserveAdmission(reservation);
    const generation = reserved.admission!.generation;
    vi.mocked(k8s.apply).mockRejectedValueOnce(new Error('apply outcome unknown'));
    const failed = await manager.startAdmittedWorkspace({ ...startInput, admissionGeneration: generation });
    expect(failed.status).toBe('FAILED');
    expect(failed.admission?.state).toBe('PROVISIONING');
    const calls = vi.mocked(k8s.apply).mock.calls.length;
    await expect(
      manager.startAdmittedWorkspace({ ...startInput, admissionGeneration: generation }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'WORKSPACE_ADMISSION_UNCERTAIN' });
    expect(k8s.apply).toHaveBeenCalledTimes(calls);
    await expect(manager.stopAdmittedWorkspace('workspaces', reserved.id, generation)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect((await store.reserveAdmission(reservation)).admission?.generation).toBe(generation);
  });

  it('preserves STOPPING after an uncertain delete and refuses a restart', async () => {
    const reserved = await store.reserveAdmission(reservation);
    const input = { ...startInput, admissionGeneration: reserved.admission!.generation };
    await manager.startAdmittedWorkspace(input);
    vi.mocked(k8s.delete).mockRejectedValueOnce(new Error('delete outcome unknown'));
    await expect(manager.stopAdmittedWorkspace('workspaces', reserved.id, input.admissionGeneration)).rejects.toThrow(
      'delete outcome unknown',
    );
    expect((await store.get(reserved.id))?.admission?.state).toBe('STOPPING');
    await expect(manager.startAdmittedWorkspace(input, true)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('keeps STOPPING when Kubernetes acknowledges deletion but the pod still exists', async () => {
    const record = await store.reserveAdmission(reservation);
    const generation = record.admission!.generation;
    await manager.startAdmittedWorkspace({ ...startInput, admissionGeneration: generation });
    vi.mocked(k8s.delete).mockResolvedValueOnce(undefined);
    await expect(manager.stopAdmittedWorkspace('workspaces', record.id, generation)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect((await store.get(record.id))?.admission?.state).toBe('STOPPING');
    expect(objects.has(key('Pod', record.podName))).toBe(true);
  });

  it('GC releases idle ACTIVE compute through the stop protocol and preserves its data', async () => {
    const record = await store.reserveAdmission(reservation);
    await manager.startAdmittedWorkspace({ ...startInput, admissionGeneration: record.admission!.generation });
    await store.update(record.id, { lastActiveAt: '2020-01-01T00:00:00.000Z' });
    await manager.garbageCollect('workspaces', 1, 1);
    expect((await store.get(record.id))?.admission?.state).toBe('RELEASED');
    expect(objects.has(key('Pod', record.podName))).toBe(false);
    expect(objects.has(key('PersistentVolumeClaim', record.pvcName))).toBe(true);
    expect(vi.mocked(k8s.delete).mock.calls.some(([kind]) => kind === 'PersistentVolumeClaim')).toBe(false);
  });

  it('restart claims before stop; failure cannot start a replacement', async () => {
    const reserved = await store.reserveAdmission(reservation);
    const input = { ...startInput, admissionGeneration: reserved.admission!.generation };
    await manager.startAdmittedWorkspace(input);
    const calls = vi.mocked(k8s.apply).mock.calls.length;
    vi.mocked(k8s.delete).mockRejectedValueOnce(new Error('stop unconfirmed'));
    const failed = await manager.startAdmittedWorkspace(input, true);
    expect(failed.status).toBe('FAILED');
    expect(failed.admission?.state).toBe('PROVISIONING');
    expect(k8s.apply).toHaveBeenCalledTimes(calls);
    expect((await store.get(reserved.id))?.admission?.state).toBe('PROVISIONING');
  });

  it('releases an ended readiness failure after confirmed cleanup and permits a new generation', async () => {
    const reserved = await store.reserveAdmission(reservation);
    const getPod = vi.mocked(k8s.getPod).getMockImplementation()!;
    vi.mocked(k8s.getPod).mockImplementation(async (namespace, name) => {
      if (objects.has(key('Pod', name)))
        return { apiVersion: 'v1', kind: 'Pod', metadata: { name }, status: { phase: 'Failed' } } as K8sObject;
      return getPod(namespace, name);
    });
    const failed = await manager.startAdmittedWorkspace({
      ...startInput,
      admissionGeneration: reserved.admission!.generation,
    });
    expect(failed).toMatchObject({ status: 'FAILED', admission: { state: 'RELEASED' } });
    expect(objects.has(key('Pod', reserved.podName))).toBe(false);
    expect(objects.has(key('PersistentVolumeClaim', reserved.pvcName))).toBe(true);
    const next = await store.reserveAdmission(reservation);
    expect(next.admission!.generation).not.toBe(reserved.admission!.generation);
    vi.mocked(k8s.getPod).mockImplementation(getPod);
    expect(
      (await manager.startAdmittedWorkspace({ ...startInput, admissionGeneration: next.admission!.generation })).status,
    ).toBe('RUNNING');
  });

  it('does not release a failed pod apply even when no pod is currently observable', async () => {
    const reserved = await store.reserveAdmission(reservation);
    const apply = vi.mocked(k8s.apply).getMockImplementation()!;
    vi.mocked(k8s.apply).mockImplementation(async (object) => {
      if (object.kind === 'Pod') throw new Error('pod apply timed out; server may still commit');
      return apply(object);
    });
    const failed = await manager.startAdmittedWorkspace({
      ...startInput,
      admissionGeneration: reserved.admission!.generation,
    });
    expect(failed).toMatchObject({ status: 'FAILED', admission: { state: 'PROVISIONING' } });
    expect(objects.has(key('Pod', reserved.podName))).toBe(false);
    expect(k8s.delete).not.toHaveBeenCalled();
  });

  it('can release a failure before Kubernetes mutations only after confirming absence', async () => {
    const reserved = await store.reserveAdmission(reservation);
    vi.mocked(k8s.get).mockRejectedValue(new Error('PVC inspection failed'));
    const failed = await manager.startAdmittedWorkspace({
      ...startInput,
      admissionGeneration: reserved.admission!.generation,
    });
    expect(failed).toMatchObject({ status: 'FAILED', admission: { state: 'RELEASED' } });
    expect(k8s.apply).not.toHaveBeenCalled();
    expect(vi.mocked(k8s.delete).mock.calls.some(([kind]) => kind === 'PersistentVolumeClaim')).toBe(false);
  });

  it('a late result from an earlier attempt cannot delete or overwrite a successor', async () => {
    const reserved = await store.reserveAdmission(reservation);
    const input = { ...startInput, admissionGeneration: reserved.admission!.generation };
    let notifyCommitted!: () => void;
    let continueFirst!: () => void;
    const committed = new Promise<void>((resolve) => {
      notifyCommitted = resolve;
    });
    const pause = new Promise<void>((resolve) => {
      continueFirst = resolve;
    });
    const compare = store.compareAdmission.bind(store);
    let first = true;
    vi.spyOn(store, 'compareAdmission').mockImplementation(async (...args) => {
      const result = await compare(...args);
      if (first && args[2].state === 'ACTIVE' && result) {
        first = false;
        notifyCommitted();
        await pause;
      }
      return result;
    });
    const original = manager.startAdmittedWorkspace(input);
    await committed;
    const successor = await manager.startAdmittedWorkspace({ ...input, image: 'agent:successor' });
    const assertion = expect(original).rejects.toMatchObject({ statusCode: 409, code: 'WORKSPACE_ADMISSION_STALE' });
    continueFirst();
    await assertion;
    expect((await store.get(reserved.id))?.admission).toEqual(successor.admission);
    expect(k8s.delete).not.toHaveBeenCalled();
    expect(JSON.stringify(objects.get(key('Pod', reserved.podName)))).toContain('agent:successor');
  });

  it('only a released admission can adopt another organization, with a new generation', async () => {
    const reserved = await store.reserveAdmission(reservation);
    await expect(store.reserveAdmission({ ...reservation, orgId: 'destination' })).rejects.toMatchObject({
      code: 'WORKSPACE_ADMISSION_OWNER_MISMATCH',
    });
    await manager.releaseWorkspaceAdmission('workspaces', reserved.id, reserved.admission!.generation, 0);
    const adopted = await store.reserveAdmission({ ...reservation, orgId: 'destination' });
    expect(adopted.orgId).toBe('destination');
    expect(adopted.admission!.generation).not.toBe(reserved.admission!.generation);
    expect(await store.listAdmissions(reservation.orgId)).toEqual([]);
    expect((await store.listAdmissions('destination')).map((record) => record.id)).toEqual([reserved.id]);
    await expect(
      store.reserveAdmission({ ...reservation, orgId: 'destination', projectId: 'different' }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_ADMISSION_OWNER_MISMATCH' });
  });

  it('returns transferred legacy rows unchanged but never accepts a different project', async () => {
    const reserved = await store.reserveAdmission(reservation);
    const { createdAt: _createdAt, lastActiveAt: _lastActiveAt, admission: _admission, ...legacy } = reserved;
    await store.create({ ...legacy, id: 'legacy-transfer' });
    const input = { ...reservation, workspaceId: 'legacy-transfer', orgId: 'destination' };
    expect(await store.reserveAdmission(input)).toMatchObject({ orgId: reservation.orgId });
    expect((await store.reserveAdmission(input)).admission).toBeUndefined();
    await expect(store.reserveAdmission({ ...input, projectId: 'different' })).rejects.toMatchObject({
      code: 'WORKSPACE_ADMISSION_OWNER_MISMATCH',
    });
  });

  it('only explicit permanent deletion removes the PVC after release', async () => {
    const reserved = await store.reserveAdmission(reservation);
    const generation = reserved.admission!.generation;
    await manager.startAdmittedWorkspace({ ...startInput, admissionGeneration: generation });
    await expect(manager.deleteAdmittedWorkspace('workspaces', reserved.id, generation)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(k8s.delete).not.toHaveBeenCalled();
    await manager.stopAdmittedWorkspace('workspaces', reserved.id, generation);
    const deleted = await manager.deleteAdmittedWorkspace('workspaces', reserved.id, generation);
    expect(deleted).toMatchObject({ status: 'DELETED', admission: { state: 'RELEASED' } });
    expect(objects.size).toBe(0);
  });

  it('a concurrent reservation defeats permanent deletion before any resource mutation', async () => {
    const record = await store.reserveAdmission(reservation);
    await manager.releaseWorkspaceAdmission('workspaces', record.id, record.admission!.generation, 0);
    vi.mocked(k8s.getPod).mockImplementationOnce(async () => {
      await store.reserveAdmission(reservation);
      return undefined;
    });
    await expect(
      manager.deleteAdmittedWorkspace('workspaces', record.id, record.admission!.generation),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(k8s.delete).not.toHaveBeenCalled();
  });

  it('an uncertain permanent deletion retains STOPPING and cannot admit a new start', async () => {
    const record = await store.reserveAdmission(reservation);
    const generation = record.admission!.generation;
    await manager.startAdmittedWorkspace({ ...startInput, admissionGeneration: generation });
    await manager.stopAdmittedWorkspace('workspaces', record.id, generation);
    const remove = vi.mocked(k8s.delete).getMockImplementation()!;
    vi.mocked(k8s.delete).mockImplementation(async (kind, namespace, name) => {
      if (kind === 'PersistentVolumeClaim') throw new Error('PVC deletion outcome unknown');
      return remove(kind, namespace, name);
    });
    await expect(manager.deleteAdmittedWorkspace('workspaces', record.id, generation)).rejects.toThrow(
      'PVC deletion outcome unknown',
    );
    expect((await store.get(record.id))?.admission?.state).toBe('STOPPING');
    expect((await store.reserveAdmission(reservation)).admission?.state).toBe('STOPPING');
    await expect(
      manager.startAdmittedWorkspace({ ...startInput, admissionGeneration: generation }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('GC keeps uncertain and released generations even beyond the legacy deletion deadline', async () => {
    for (const state of ['RESERVED', 'PROVISIONING', 'STOPPING', 'RELEASED'] as const) {
      const record = await store.reserveAdmission({ ...reservation, workspaceId: `ws-${state}` });
      await store.compareAdmission(
        record.id,
        record.admission!,
        { ...record.admission!, state },
        { lastActiveAt: '2020-01-01T00:00:00.000Z' },
      );
    }
    await manager.garbageCollect('workspaces', 1, 1);
    expect(k8s.delete).not.toHaveBeenCalled();
  });

  it('a fresh activity mutation wins against an old GC observation', async () => {
    const record = await store.reserveAdmission(reservation);
    await manager.startAdmittedWorkspace({ ...startInput, admissionGeneration: record.admission!.generation });
    const old = '2020-01-01T00:00:00.000Z';
    await store.update(record.id, { lastActiveAt: old });
    vi.mocked(k8s.getPod).mockImplementationOnce(async () => {
      await store.update(record.id, { lastActiveAt: new Date().toISOString() });
      return undefined;
    });
    await manager.garbageCollect('workspaces', 1, 1);
    expect(k8s.delete).not.toHaveBeenCalled();
    expect((await store.get(record.id))?.admission?.state).toBe('ACTIVE');
  });

  it('v1 hides the timestamp and rejects mutations; v2 reports the durable admission', async () => {
    const record = await store.reserveAdmission(reservation);
    const app = buildWorkspaceManagerApp(manager);
    const secret = process.env.WORKSPACE_MANAGER_SHARED_SECRET?.trim();
    const headers = secret ? { authorization: `Bearer ${secret}` } : {};
    try {
      expect(
        (await app.inject({ method: 'GET', url: `/workspaces/${record.id}`, headers })).json().updatedAt,
      ).toBeUndefined();
      expect(
        (await app.inject({ method: 'GET', url: `/v2/workspaces/${record.id}`, headers })).json().admission,
      ).toEqual(record.admission);
      expect(
        (await app.inject({ method: 'POST', url: '/workspaces/start', headers, payload: startInput })).statusCode,
      ).toBe(503);
      expect((await app.inject({ method: 'POST', url: `/workspaces/${record.id}/stop`, headers })).statusCode).toBe(
        503,
      );
      expect((await app.inject({ method: 'DELETE', url: `/workspaces/${record.id}`, headers })).statusCode).toBe(503);
      expect(k8s.apply).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
