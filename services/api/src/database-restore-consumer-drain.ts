import { DatabaseRestoreError, type RestoreScope } from './database-restore-contract.js';
import { PostgresRestoreConsumer } from './database-restore-consumer.js';
import type { RegisteredRestoreConsumer, RestoreConsumerRegistry } from './database-restore-consumer-registry.js';

/** Owns immutable local pool handles; no raw pool or reopen method escapes.
 * A new binding requires a new UID and a fresh registry admission.
 */
export class RegisteredApiConsumerHost {
  private readonly handles = new Map<
    string,
    {
      row: RegisteredRestoreConsumer;
      scope: Pick<RestoreScope, 'instanceId' | 'projectId' | 'organizationId' | 'environment'>;
      pool: Promise<PostgresRestoreConsumer>;
      serving: boolean;
      closing: boolean;
    }
  >();
  constructor(private readonly registry: RestoreConsumerRegistry) {}

  async start(
    scope: Parameters<RestoreConsumerRegistry['admit']>[0],
    input: Omit<Parameters<RestoreConsumerRegistry['admit']>[1], 'kind'>,
    connectionUri: string,
  ) {
    const row = await this.registry.admit(scope, { ...input, kind: 'api' });
    const handle = {
      row: { ...row },
      scope: { ...scope },
      serving: false,
      closing: false,
      pool: PostgresRestoreConsumer.connect(connectionUri, { targetId: row.uid, bindingVersion: row.bindingVersion }),
    };
    this.handles.set(row.id, handle);
    try {
      await handle.pool;
      await this.registry.assertCanServe(scope, row);
      if (handle.closing) throw new DatabaseRestoreError('RESTORE_APPLICATION_QUIESCED');
      handle.serving = true;
      return { ...row };
    } catch (error) {
      handle.closing = true;
      await handle.pool.then(
        (pool) => pool.close(),
        () => undefined,
      );
      throw error;
    }
  }

  async query(id: string, text: string, values?: unknown[]) {
    const handle = this.handles.get(id);
    if (!handle) throw new DatabaseRestoreError('RESTORE_CONSUMER_HANDLE_MISMATCH');
    const pool = await handle.pool;
    if (!handle.serving || handle.closing) throw new DatabaseRestoreError('RESTORE_APPLICATION_QUIESCED');
    return pool.query(text, values);
  }

  async drain(scope: RestoreScope, row: RegisteredRestoreConsumer) {
    const handle = this.handles.get(row.id);
    if (
      !handle ||
      row.kind !== 'api' ||
      handle.row.uid !== row.uid ||
      handle.row.generation !== row.generation ||
      handle.row.bindingVersion !== row.bindingVersion ||
      handle.scope.instanceId !== scope.instanceId ||
      handle.scope.projectId !== scope.projectId ||
      handle.scope.organizationId !== scope.organizationId ||
      handle.scope.environment !== scope.environment
    ) {
      throw new DatabaseRestoreError('RESTORE_CONSUMER_HANDLE_MISMATCH');
    }
    await this.registry.assertDrainRequested(scope, row);
    handle.serving = false;
    handle.closing = true;
    await (await handle.pool).close(); // Permanently closed, including pending startup.
    await this.registry.confirmDrained(scope, row);
  }
}

export interface ManagedWorkloadDrainDriver {
  /** Required even for an already terminated UID: also exclude late starts. */
  excludeStarts(
    uid: string,
    generation: string,
    scope: RestoreScope,
  ): Promise<
    RestoreScope & {
      uid: string;
      generation: string;
      attemptToken: string;
      startsExcluded: true;
    }
  >;
  /** Observe this immutable UID/generation, not merely a reused workload name. */
  observe(uid: string, generation: string): Promise<'running' | 'terminated' | 'unknown'>;
  /** Implementation must fence attemptToken at the external effect boundary.
   * Registry preflight alone cannot exclude a worker after crash/takeover. */
  stop(uid: string, generation: string, scope: RestoreScope): Promise<void>;
}

export async function drainRegisteredWorkload(
  registry: RestoreConsumerRegistry,
  scope: RestoreScope,
  row: RegisteredRestoreConsumer,
  driver: ManagedWorkloadDrainDriver,
) {
  scope = { ...scope };
  row = { ...row };
  if (
    row.kind !== 'workload' ||
    row.instanceId !== scope.instanceId ||
    row.drainRestoreId !== scope.operationId ||
    row.drainAttemptToken !== scope.attemptToken
  )
    throw new DatabaseRestoreError('RESTORE_CONSUMER_DRAIN_MISMATCH');
  await registry.assertDrainRequested(scope, row);
  const fence = await driver.excludeStarts(row.uid, row.generation, { ...scope });
  if (
    fence.uid !== row.uid ||
    fence.generation !== row.generation ||
    fence.attemptToken !== scope.attemptToken ||
    fence.operationId !== scope.operationId ||
    fence.instanceId !== scope.instanceId ||
    fence.projectId !== scope.projectId ||
    fence.organizationId !== scope.organizationId ||
    fence.environment !== scope.environment ||
    fence.startsExcluded !== true
  )
    throw new DatabaseRestoreError('RESTORE_WORKLOAD_START_FENCE_UNCONFIRMED');
  const before = await driver.observe(row.uid, row.generation);
  if (before === 'unknown') throw new DatabaseRestoreError('RESTORE_WORKLOAD_STOP_UNCONFIRMED');
  if (before === 'running') await driver.stop(row.uid, row.generation, { ...scope });
  if ((await driver.observe(row.uid, row.generation)) !== 'terminated')
    throw new DatabaseRestoreError('RESTORE_WORKLOAD_STOP_UNCONFIRMED');
  await registry.confirmDrained(scope, row);
}
