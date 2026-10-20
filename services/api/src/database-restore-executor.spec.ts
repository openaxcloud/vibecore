import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DatabaseRestoreError,
  type DatabaseRestorePorts,
  type DatabaseRestoreRepository,
  type RestoreCheckpoint,
  type RestoreExecution,
  type RestorePhase,
  type RestoreRequest,
  type RestoreScope,
} from './database-restore-contract.js';
import { DatabaseRestoreCoordinator } from './database-restore-executor.js';
import type { DatabaseInstanceRecord } from './store.js';

/*
 * Explicit in-memory journal/driver fixtures. Physical PostgreSQL and application
 * pool recovery are exercised separately by the isolated QA harness.
 */
class Journal implements DatabaseRestoreRepository {
  rows = new Map<string, RestoreExecution>();
  bindings = new Map<string, { version: number; encrypted: string; targetId?: string }>();
  async admit(input: RestoreRequest) {
    if ([...this.rows.values()].some((x) => x.active && x.instance.id === input.instance.id)) {
      throw new DatabaseRestoreError('RESTORE_ALREADY_RUNNING');
    }

    const binding = this.bindings.get(input.instance.id) ?? { version: 0, encrypted: 'encrypted:source' };
    this.bindings.set(input.instance.id, binding);

    const id = randomUUID();

    const row: RestoreExecution = {
      instance: input.instance,
      phase: 'PENDING',
      active: true,
      pendingFenceTokens: [],
      expectedBindingVersion: binding.version,
      targetId: `target-${id}`,
      snapshot: input.snapshot,
      restore: {
        id,
        databaseInstanceId: input.instance.id,
        targetTimestamp: input.targetTimestamp,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      },
    };
    this.rows.set(id, structuredClone(row));

    return structuredClone(row);
  }
  async get(id: string) {
    const row = this.rows.get(id);
    return row && structuredClone(row);
  }
  async pending(limit: number) {
    return [...this.rows.values()]
      .filter((x) => x.phase === 'PENDING' && !x.runnerToken && x.active)
      .slice(0, limit)
      .map((x) => x.restore.id);
  }
  async claim(id: string, token: string) {
    const row = this.rows.get(id)!;

    if (!row.active || row.runnerToken || row.phase !== 'PENDING') {
      return undefined;
    }

    row.runnerToken = token;
    row.restore.status = 'RUNNING';

    return structuredClone(row);
  }
  async checkpoint(id: string, token: string, from: RestorePhase, patch: RestoreCheckpoint) {
    const row = this.rows.get(id)!;

    if (!row.active || row.runnerToken !== token || row.phase !== from || row.pendingFenceTokens.length !== 0) {
      return false;
    }

    Object.assign(row, structuredClone(patch));

    return true;
  }
  async cutover(id: string, token: string) {
    const row = this.rows.get(id)!;
    const binding = this.bindings.get(row.instance.id)!;

    if (row.runnerToken !== token || row.phase !== 'CUTOVER') {
      throw new DatabaseRestoreError('RESTORE_ATTEMPT_STALE');
    }
    if (row.pendingFenceTokens.length !== 0) {
      throw new DatabaseRestoreError('RESTORE_FENCE_UNCONFIRMED');
    }

    if (binding.version !== row.expectedBindingVersion) {
      throw new DatabaseRestoreError('RESTORE_BINDING_CHANGED');
    }

    binding.version++;
    binding.encrypted = row.targetConnectionEncrypted!;
    binding.targetId = row.targetId;
    row.appliedBindingVersion = binding.version;
    row.phase = 'VERIFYING';

    return structuredClone(row);
  }
  async complete(id: string, token: string) {
    const row = this.rows.get(id)!;
    const binding = this.bindings.get(row.instance.id)!;

    if (row.runnerToken !== token || row.phase !== 'RELEASING') {
      throw new DatabaseRestoreError('RESTORE_ATTEMPT_STALE');
    }
    if (row.pendingFenceTokens.length !== 0) {
      throw new DatabaseRestoreError('RESTORE_FENCE_UNCONFIRMED');
    }

    if (binding.version !== row.appliedBindingVersion) {
      throw new DatabaseRestoreError('RESTORE_BINDING_CHANGED');
    }

    row.phase = 'COMPLETED';
    row.active = false;
    row.runnerToken = undefined;
    row.restore.status = 'COMPLETED';
    row.restore.completedAt = new Date().toISOString();

    return structuredClone(row);
  }
  async fail(id: string, token: string, code: string) {
    const row = this.rows.get(id)!;

    if (!row.active || row.runnerToken !== token) {
      return;
    }

    if (row.phase !== 'RECOVERY_REQUIRED') {
      row.resumePhase = row.phase;
    }

    const safe =
      row.pendingFenceTokens.length === 0 &&
      code !== 'RESTORE_FENCE_UNCONFIRMED' &&
      ['PENDING', 'VALIDATING'].includes(row.phase);
    row.phase = safe ? 'FAILED' : 'RECOVERY_REQUIRED';
    row.failureCode = code;
    row.restore.status = 'FAILED';
    row.restore.error = code;

    if (safe) {
      row.active = false;
      row.runnerToken = undefined;
    }
  }
  async resume(id: string, previous: string, next: string) {
    const row = this.rows.get(id)!;

    if (!row.active || row.runnerToken !== previous || previous === next) {
      return undefined;
    }

    row.pendingFenceTokens = [...new Set([...row.pendingFenceTokens, previous])];
    row.runnerToken = next;

    if (row.phase === 'RECOVERY_REQUIRED') {
      row.phase = row.resumePhase!;
    }

    row.failureCode = undefined;
    row.restore.status = 'RUNNING';
    row.restore.error = undefined;

    return structuredClone(row);
  }
  async acknowledgeFence(id: string, token: string, excluded: string) {
    const row = this.rows.get(id)!;
    if (!row.active || row.runnerToken !== token || excluded === token) {
      return false;
    }
    row.pendingFenceTokens = row.pendingFenceTokens.filter((value) => value !== excluded);
    return true;
  }
}

const instance: DatabaseInstanceRecord = {
  id: 'instance-dev',
  projectId: 'project',
  organizationId: 'organization',
  environment: 'development',
  status: 'ACTIVE',
  engine: 'postgres',
  sizeBytes: 0,
  retentionDays: 7,
  pitrEnabled: true,
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z',
};

const targetTimestamp = '2026-10-20T01:00:00.000Z';
const digest = 'a'.repeat(64);

function scope(input: RestoreScope): RestoreScope {
  return {
    operationId: input.operationId,
    instanceId: input.instanceId,
    projectId: input.projectId,
    organizationId: input.organizationId,
    environment: input.environment,
    attemptToken: input.attemptToken,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function fixture(overrides: Partial<DatabaseRestorePorts> = {}) {
  const repository = new Journal();
  const calls: string[] = [];

  const ports: DatabaseRestorePorts = {
    available: async () => true,
    validateArchive: async (input) => {
      calls.push('archive');
      return {
        ...scope(input),
        archiveId: 'fixture-archive',
        manifestSha256: digest,
        sourceInstanceId: input.instanceId,
        sourceSystemIdentifier: 'physical-fixture',
        targetTimestamp: input.targetTimestamp,
        expectedReadbackSha256: digest,
      };
    },
    prepareTarget: async (input) => {
      calls.push('target');
      return {
        ...scope(input),
        targetId: input.targetId,
        systemIdentifier: 'physical-fixture',
        connectionUri: 'postgresql://fixture:private@localhost/target',
      };
    },
    quiesceApplication: async (input) => {
      calls.push('quiesce');
      return { ...scope(input), receiptId: 'quiesced' };
    },
    reconnectAndReadback: async (input) => {
      calls.push('readback');
      return {
        ...scope(input),
        receiptId: 'readback',
        targetId: input.target.targetId,
        systemIdentifier: input.target.systemIdentifier,
        bindingVersion: input.bindingVersion,
        previousPoolClosed: true,
        newConnection: true,
        observedReadbackSha256: digest,
      };
    },
    releaseApplication: async (input) => {
      calls.push('release');
      return { ...scope(input), receiptId: 'released', targetId: input.targetId, bindingVersion: input.bindingVersion };
    },
    fenceAttempt: async (input) => {
      calls.push('fence');
      return { ...scope(input), excludedAttemptToken: input.previousAttemptToken };
    },
    ...overrides,
  };
  const make = () =>
    new DatabaseRestoreCoordinator({
      repository,
      ports,
      encryptConnection: (value) => `encrypted:${Buffer.from(value).toString('base64')}`,
      decryptConnection: (value) => Buffer.from(value.slice('encrypted:'.length), 'base64').toString(),
    });

  const coordinator = make();

  return { repository, ports, calls, coordinator, make };
}

describe('durable restore coordinator (explicit driver fixtures)', () => {
  it.each(['foreign-organization', undefined])(
    'refuses an unauthorized organization before consulting a driver (%s)',
    async (expectedOrganizationId) => {
      let availabilityChecks = 0;
      const f = fixture({
        available: async () => {
          availabilityChecks += 1;
          return true;
        },
      });
      // The missing-field case deliberately exercises an untyped caller too.
      const input = { instance, expectedOrganizationId, targetTimestamp } as unknown as RestoreRequest;
      await expect(f.coordinator.request(input)).rejects.toMatchObject({ code: 'RESTORE_INSTANCE_CHANGED' });
      expect(availabilityChecks).toBe(0);
      expect(f.repository.rows.size).toBe(0);
      expect(f.repository.bindings.size).toBe(0);
      expect(f.calls).toEqual([]);
    },
  );

  it('requires validated archive, stable target, cutover, new application readback and release in order', async () => {
    const f = fixture();
    const requested = await f.coordinator.request({
      instance,
      expectedOrganizationId: instance.organizationId,
      targetTimestamp,
    });
    expect(requested.status).toBe('PENDING');

    const done = await f.coordinator.execute(requested.id);
    expect(f.calls).toEqual(['archive', 'target', 'quiesce', 'readback', 'release']);
    expect(done).toMatchObject({ status: 'COMPLETED', applicationCutoverVerified: true });
    expect(f.repository.bindings.get(instance.id)?.version).toBe(1);
    expect(JSON.stringify(done)).not.toMatch(/connectionUri|private|encrypted/);
  });

  it('refuses unavailable capabilities before creating any row', async () => {
    const f = fixture({ available: async () => false });
    await expect(
      f.coordinator.request({ instance, expectedOrganizationId: instance.organizationId, targetTimestamp }),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(f.repository.rows.size).toBe(0);
  });

  it('refuses a non-active instance even when the driver declares availability', async () => {
    const f = fixture();
    await expect(
      f.coordinator.request({
        instance: { ...instance, status: 'SUSPENDED' },
        expectedOrganizationId: instance.organizationId,
        targetTimestamp,
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(f.repository.rows.size).toBe(0);
  });

  it('refuses a snapshot belonging to another instance before admission', async () => {
    const f = fixture();
    await expect(
      f.coordinator.request({
        instance,
        expectedOrganizationId: instance.organizationId,
        targetTimestamp,
        snapshot: {
          id: 'foreign',
          databaseInstanceId: 'other-instance',
          kind: 'manual',
          sizeBytes: 0,
          createdAt: targetTimestamp,
        },
      }),
    ).rejects.toMatchObject({ code: 'RESTORE_SOURCE_MISMATCH' });
    expect(f.repository.rows.size).toBe(0);
  });

  it.each(['manifest', 'instance', 'environment', 'timestamp', 'sourceSystem'])(
    'rejects invalid %s archive before target allocation',
    async (kind) => {
      const f = fixture();
      const original = f.ports.validateArchive;
      f.ports.validateArchive = async (input) => ({
        ...(await original(input)),
        ...(kind === 'manifest' ? { manifestSha256: 'invalid' } : {}),
        ...(kind === 'instance' ? { sourceInstanceId: 'other' } : {}),
        ...(kind === 'sourceSystem' ? { sourceSystemIdentifier: '' } : {}),
        ...(kind === 'environment' ? { environment: 'production' as const } : {}),
        ...(kind === 'timestamp' ? { targetTimestamp: '2026-10-20T02:00:00.000Z' } : {}),
      });

      const requested = await f.coordinator.request({
        instance,
        expectedOrganizationId: instance.organizationId,
        targetTimestamp,
      });
      const failed = await f.coordinator.execute(requested.id);
      expect(f.calls).toEqual(['archive']);
      expect(failed?.status).toBe('FAILED');
      expect(f.repository.bindings.get(instance.id)?.encrypted).toBe('encrypted:source');
    },
  );

  it('does not treat a wrong target identity as a usable prepared target', async () => {
    const f = fixture();
    const original = f.ports.prepareTarget;
    f.ports.prepareTarget = async (input) => ({ ...(await original(input)), targetId: 'another-target' });

    const requested = await f.coordinator.request({
      instance,
      expectedOrganizationId: instance.organizationId,
      targetTimestamp,
    });
    expect(await f.coordinator.execute(requested.id)).toMatchObject({ failureCode: 'RESTORE_TARGET_MISMATCH' });
    expect(f.calls).toEqual(['archive', 'target']);
  });

  it('keeps a target preparation with an uncertain outcome reserved for fenced recovery', async () => {
    const f = fixture();
    const prepare = f.ports.prepareTarget;

    f.ports.prepareTarget = async (input) => {
      await prepare(input); // Explicit fixture: the resource exists before the reply fails.
      throw new Error('Target reply lost');
    };

    const requested = await f.coordinator.request({
      instance,
      expectedOrganizationId: instance.organizationId,
      targetTimestamp,
    });
    expect(await f.coordinator.execute(requested.id)).toMatchObject({
      status: 'FAILED',
      phase: 'RECOVERY_REQUIRED',
      applicationCutoverVerified: false,
    });
    expect(await f.repository.get(requested.id)).toMatchObject({
      active: true,
      resumePhase: 'PREPARING',
      targetId: expect.any(String),
    });
    await expect(
      f.coordinator.request({ instance, expectedOrganizationId: instance.organizationId, targetTimestamp }),
    ).rejects.toMatchObject({
      code: 'RESTORE_ALREADY_RUNNING',
    });
    expect(f.calls).toEqual(['archive', 'target']);
    expect(f.repository.bindings.get(instance.id)?.encrypted).toBe('encrypted:source');
  });

  it('rejects a physical target from a different PostgreSQL source system before quiescence', async () => {
    const f = fixture();
    const original = f.ports.prepareTarget;
    f.ports.prepareTarget = async (input) => ({ ...(await original(input)), systemIdentifier: 'other-system' });

    const requested = await f.coordinator.request({
      instance,
      expectedOrganizationId: instance.organizationId,
      targetTimestamp,
    });
    expect(await f.coordinator.execute(requested.id)).toMatchObject({ failureCode: 'RESTORE_TARGET_MISMATCH' });
    expect(f.calls).toEqual(['archive', 'target']);
    expect(f.repository.bindings.get(instance.id)?.version).toBe(0);
  });

  it('keeps the job incomplete until application release confirms the verified binding', async () => {
    const f = fixture();
    const entered = deferred<void>();
    const release = deferred<void>();
    const original = f.ports.releaseApplication;

    f.ports.releaseApplication = async (input) => {
      entered.resolve();
      await release.promise;

      return original(input);
    };

    const requested = await f.coordinator.request({
      instance,
      expectedOrganizationId: instance.organizationId,
      targetTimestamp,
    });
    const running = f.coordinator.execute(requested.id);
    await entered.promise;
    expect(await f.coordinator.evidence(requested.id)).toMatchObject({
      status: 'RUNNING',
      phase: 'RELEASING',
      applicationCutoverVerified: false,
    });
    expect((await f.coordinator.evidence(requested.id))?.completedAt).toBeUndefined();
    release.resolve();
    expect((await running)?.status).toBe('COMPLETED');
  });

  it('holds an uncertain post-cutover failure and resumes only after fencing, using a new coordinator', async () => {
    const f = fixture();
    const original = f.ports.reconnectAndReadback;

    f.ports.reconnectAndReadback = async () => {
      throw new Error('password=do-not-persist');
    };

    const requested = await f.coordinator.request({
      instance,
      expectedOrganizationId: instance.organizationId,
      targetTimestamp,
    });
    expect(await f.coordinator.execute(requested.id)).toMatchObject({
      phase: 'RECOVERY_REQUIRED',
      failureCode: 'RESTORE_READBACK_FAILED',
      applicationCutoverVerified: false,
    });
    await expect(
      f.coordinator.request({ instance, expectedOrganizationId: instance.organizationId, targetTimestamp }),
    ).rejects.toMatchObject({
      code: 'RESTORE_ALREADY_RUNNING',
    });

    const record = await f.repository.get(requested.id);
    expect(record?.active).toBe(true);
    expect(record?.appliedBindingVersion).toBe(1);
    expect(JSON.stringify(await f.coordinator.evidence(requested.id))).not.toContain('password');
    f.ports.reconnectAndReadback = original;
    expect(await f.make().resume(requested.id, record!.runnerToken!)).toMatchObject({ status: 'COMPLETED' });
    expect(f.calls.filter((x) => x === 'target')).toHaveLength(1);
    expect(f.repository.bindings.get(instance.id)?.version).toBe(1);
  });

  it('rejects the old continuation after durable takeover, before any second target or cutover', async () => {
    const f = fixture();
    const firstEntered = deferred<void>();
    const delayed = deferred<void>();
    const original = f.ports.validateArchive;

    let first = true;

    f.ports.validateArchive = async (input) => {
      if (first) {
        first = false;
        firstEntered.resolve();
        await delayed.promise;
      }

      return original(input);
    };

    const requested = await f.coordinator.request({
      instance,
      expectedOrganizationId: instance.organizationId,
      targetTimestamp,
    });
    const old = f.coordinator.execute(requested.id);
    await firstEntered.promise;

    const current = await f.repository.get(requested.id);
    expect(await f.make().resume(requested.id, current!.runnerToken!)).toMatchObject({ status: 'COMPLETED' });
    delayed.resolve();
    await old;
    expect(f.calls.filter((x) => x === 'target')).toHaveLength(1);
    expect(f.repository.bindings.get(instance.id)?.version).toBe(1);
    expect(await f.coordinator.evidence(requested.id)).toMatchObject({
      status: 'COMPLETED',
      applicationCutoverVerified: true,
    });
  });

  it.each(['readback', 'newConnection', 'closedPool', 'binding', 'system'])(
    'quarantines a mismatching %s receipt',
    async (kind) => {
      const f = fixture();
      const original = f.ports.reconnectAndReadback;
      f.ports.reconnectAndReadback = async (input) => ({
        ...(await original(input)),
        ...(kind === 'readback' ? { observedReadbackSha256: 'b'.repeat(64) } : {}),
        ...(kind === 'newConnection' ? { newConnection: false as unknown as true } : {}),
        ...(kind === 'closedPool' ? { previousPoolClosed: false as unknown as true } : {}),
        ...(kind === 'binding' ? { bindingVersion: 99 } : {}),
        ...(kind === 'system' ? { systemIdentifier: 'wrong' } : {}),
      });

      const requested = await f.coordinator.request({
        instance,
        expectedOrganizationId: instance.organizationId,
        targetTimestamp,
      });
      expect(await f.coordinator.execute(requested.id)).toMatchObject({
        phase: 'RECOVERY_REQUIRED',
        failureCode: 'RESTORE_READBACK_MISMATCH',
      });
      expect(f.calls).not.toContain('release');
    },
  );

  it('does not steal a claimed job during automatic maintenance', async () => {
    const f = fixture();
    const requested = await f.coordinator.request({
      instance,
      expectedOrganizationId: instance.organizationId,
      targetTimestamp,
    });
    await f.repository.claim(requested.id, 'claimed-before-crash');
    expect(await f.make().advancePending()).toBe(0);
    expect(f.calls).toEqual([]);
  });

  it('does not invoke any driver twice for concurrent execute calls', async () => {
    const f = fixture();
    const requested = await f.coordinator.request({
      instance,
      expectedOrganizationId: instance.organizationId,
      targetTimestamp,
    });
    await Promise.all([f.coordinator.execute(requested.id), f.make().execute(requested.id)]);
    expect(f.calls).toEqual(['archive', 'target', 'quiesce', 'readback', 'release']);
    expect(f.repository.bindings.get(instance.id)?.version).toBe(1);
  });

  it('keeps a failed fence held and does not run the resumed phase', async () => {
    const f = fixture({
      fenceAttempt: async () => {
        throw new Error('fixture driver still in flight');
      },
    });

    const requested = await f.coordinator.request({
      instance,
      expectedOrganizationId: instance.organizationId,
      targetTimestamp,
    });
    await f.repository.claim(requested.id, 'old-attempt');
    expect(await f.make().resume(requested.id, 'old-attempt')).toMatchObject({
      phase: 'RECOVERY_REQUIRED',
      failureCode: 'RESTORE_FENCE_UNCONFIRMED',
    });

    const record = await f.repository.get(requested.id);
    expect(record?.active).toBe(true);
    expect(record?.runnerToken).not.toBe('old-attempt');
    expect(f.calls).toEqual([]);
    expect(await f.make().advancePending()).toBe(0);
    await expect(
      f.coordinator.request({ instance, expectedOrganizationId: instance.organizationId, targetTimestamp }),
    ).rejects.toMatchObject({
      code: 'RESTORE_ALREADY_RUNNING',
    });
  });

  it('excludes the original attempt after a crash between durable takeover and fencing', async () => {
    const excluded: string[] = [];
    const f = fixture({
      fenceAttempt: async (input) => {
        excluded.push(input.previousAttemptToken);
        return { ...scope(input), excludedAttemptToken: input.previousAttemptToken };
      },
    });
    const originalPrepare = f.ports.prepareTarget;
    let originalStillRunningAtPreparation = false;
    f.ports.prepareTarget = async (input) => {
      originalStillRunningAtPreparation = !excluded.includes('attempt-a');
      return originalPrepare(input);
    };

    const requested = await f.coordinator.request({
      instance,
      expectedOrganizationId: instance.organizationId,
      targetTimestamp,
    });
    await f.repository.claim(requested.id, 'attempt-a');
    // Durable takeover committed, then its process died before calling the port.
    await f.repository.resume(requested.id, 'attempt-a', 'attempt-b');

    expect(await f.make().resume(requested.id, 'attempt-b')).toMatchObject({ status: 'COMPLETED' });
    expect(originalStillRunningAtPreparation).toBe(false);
    expect(excluded).toEqual(['attempt-a', 'attempt-b']);
  });

  it('retries an unconfirmed original exclusion before a second recovery can make effects', async () => {
    const exclusionRequests: string[] = [];
    const excluded = new Set<string>();
    let rejectFirstFence = true;
    const f = fixture({
      fenceAttempt: async (input) => {
        exclusionRequests.push(input.previousAttemptToken);
        if (rejectFirstFence) {
          rejectFirstFence = false;
          throw new Error('exclusion was not confirmed');
        }
        excluded.add(input.previousAttemptToken);
        return { ...scope(input), excludedAttemptToken: input.previousAttemptToken };
      },
    });
    const originalPrepare = f.ports.prepareTarget;
    let originalStillRunningAtPreparation = false;
    f.ports.prepareTarget = async (input) => {
      originalStillRunningAtPreparation = !excluded.has('attempt-a');
      return originalPrepare(input);
    };

    const requested = await f.coordinator.request({
      instance,
      expectedOrganizationId: instance.organizationId,
      targetTimestamp,
    });
    await f.repository.claim(requested.id, 'attempt-a');
    expect(await f.make().resume(requested.id, 'attempt-a')).toMatchObject({
      phase: 'RECOVERY_REQUIRED',
      failureCode: 'RESTORE_FENCE_UNCONFIRMED',
    });
    expect(f.calls).toEqual([]);
    const second = await f.repository.get(requested.id);

    expect(await f.make().resume(requested.id, second!.runnerToken!)).toMatchObject({ status: 'COMPLETED' });
    expect(originalStillRunningAtPreparation).toBe(false);
    expect(exclusionRequests).toEqual(['attempt-a', 'attempt-a', second!.runnerToken!]);
  });

  it('retains exclusion debt when the fence succeeded but its durable acknowledgement was lost', async () => {
    const excluded: string[] = [];
    const f = fixture({
      fenceAttempt: async (input) => {
        excluded.push(input.previousAttemptToken);
        return { ...scope(input), excludedAttemptToken: input.previousAttemptToken };
      },
    });
    const acknowledge = f.repository.acknowledgeFence.bind(f.repository);
    let loseAcknowledgement = true;
    f.repository.acknowledgeFence = async (...args) => {
      if (loseAcknowledgement) {
        loseAcknowledgement = false;
        throw new Error('process stopped before acknowledgement committed');
      }
      return acknowledge(...args);
    };

    const requested = await f.coordinator.request({
      instance,
      expectedOrganizationId: instance.organizationId,
      targetTimestamp,
    });
    await f.repository.claim(requested.id, 'attempt-a');
    expect(await f.make().resume(requested.id, 'attempt-a')).toMatchObject({ phase: 'RECOVERY_REQUIRED' });
    expect(f.calls).toEqual([]);
    const current = await f.repository.get(requested.id);

    expect(await f.make().resume(requested.id, current!.runnerToken!)).toMatchObject({ status: 'COMPLETED' });
    expect(excluded).toEqual(['attempt-a', 'attempt-a', current!.runnerToken!]);
    expect(f.calls.filter((call) => call === 'target')).toHaveLength(1);
  });

  it('does not let a superseded recovery acknowledge debt or run a second preparation', async () => {
    const firstFenceEntered = deferred<void>();
    const releaseOldFence = deferred<void>();
    let first = true;
    const f = fixture({
      fenceAttempt: async (input) => {
        if (first) {
          first = false;
          firstFenceEntered.resolve();
          await releaseOldFence.promise;
        }
        return { ...scope(input), excludedAttemptToken: input.previousAttemptToken };
      },
    });
    const requested = await f.coordinator.request({
      instance,
      expectedOrganizationId: instance.organizationId,
      targetTimestamp,
    });
    await f.repository.claim(requested.id, 'attempt-a');
    const oldRecovery = f.make().resume(requested.id, 'attempt-a');
    await firstFenceEntered.promise;
    const current = await f.repository.get(requested.id);

    expect(await f.make().resume(requested.id, current!.runnerToken!)).toMatchObject({ status: 'COMPLETED' });
    releaseOldFence.resolve();
    expect(await oldRecovery).toMatchObject({ status: 'COMPLETED' });
    expect(f.calls.filter((call) => call === 'target')).toHaveLength(1);
    expect(f.repository.bindings.get(instance.id)?.version).toBe(1);
  });

  it('preserves a committed exclusion when its acknowledgement response is lost', async () => {
    const excluded: string[] = [];
    const f = fixture({
      fenceAttempt: async (input) => {
        excluded.push(input.previousAttemptToken);
        return { ...scope(input), excludedAttemptToken: input.previousAttemptToken };
      },
    });
    const acknowledge = f.repository.acknowledgeFence.bind(f.repository);
    let loseResponse = true;
    f.repository.acknowledgeFence = async (...args) => {
      const acknowledged = await acknowledge(...args);
      if (loseResponse) {
        loseResponse = false;
        throw new Error('acknowledgement committed but its response was lost');
      }
      return acknowledged;
    };

    const requested = await f.coordinator.request({
      instance,
      expectedOrganizationId: instance.organizationId,
      targetTimestamp,
    });
    await f.repository.claim(requested.id, 'attempt-a');
    expect(await f.make().resume(requested.id, 'attempt-a')).toMatchObject({ phase: 'RECOVERY_REQUIRED' });
    expect(f.calls).toEqual([]);
    const current = await f.repository.get(requested.id);
    expect(current?.pendingFenceTokens).toEqual([]);

    expect(await f.make().resume(requested.id, current!.runnerToken!)).toMatchObject({ status: 'COMPLETED' });
    expect(excluded).toEqual(['attempt-a', current!.runnerToken!]);
    expect(f.calls.filter((call) => call === 'target')).toHaveLength(1);
  });

  it('keeps debt and blocks effects when the receipt identifies another excluded attempt', async () => {
    const f = fixture({
      fenceAttempt: async (input) => ({ ...scope(input), excludedAttemptToken: 'unrelated-attempt' }),
    });
    const requested = await f.coordinator.request({
      instance,
      expectedOrganizationId: instance.organizationId,
      targetTimestamp,
    });
    await f.repository.claim(requested.id, 'attempt-a');

    expect(await f.make().resume(requested.id, 'attempt-a')).toMatchObject({
      phase: 'RECOVERY_REQUIRED',
      failureCode: 'RESTORE_FENCE_UNCONFIRMED',
    });
    expect((await f.repository.get(requested.id))?.pendingFenceTokens).toEqual(['attempt-a']);
    expect(f.calls).toEqual([]);
  });

  it('does not release the lock or alter the source secret after an uncertain quiescence', async () => {
    const f = fixture({
      quiesceApplication: async () => {
        throw new Error('fixture acknowledgement lost');
      },
    });

    const requested = await f.coordinator.request({
      instance,
      expectedOrganizationId: instance.organizationId,
      targetTimestamp,
    });
    expect(await f.coordinator.execute(requested.id)).toMatchObject({
      phase: 'RECOVERY_REQUIRED',
      failureCode: 'RESTORE_QUIESCE_FAILED',
    });
    expect(f.repository.bindings.get(instance.id)).toEqual({ version: 0, encrypted: 'encrypted:source' });
    expect((await f.repository.get(requested.id))?.active).toBe(true);
    expect(f.calls).not.toContain('readback');
    expect(f.calls).not.toContain('release');
  });

  it('never persists a driver message disguised as a structured error code', async () => {
    const f = fixture({
      validateArchive: async () => {
        throw new DatabaseRestoreError('postgresql://fixture:private@localhost/archive');
      },
    });

    const requested = await f.coordinator.request({
      instance,
      expectedOrganizationId: instance.organizationId,
      targetTimestamp,
    });
    const result = await f.coordinator.execute(requested.id);
    expect(result).toMatchObject({ failureCode: 'RESTORE_ARCHIVE_INVALID' });
    expect(JSON.stringify(await f.repository.get(requested.id))).not.toContain('private');
  });
});
