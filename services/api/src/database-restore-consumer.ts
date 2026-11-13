import { createHash } from 'node:crypto';
import { Pool, type QueryResultRow } from 'pg';

/** Local participating consumer only: this is NOT distributed attempt fencing. */
export type ConsumerAttempt = { operationId: string; attemptToken: string };
export type ConsumerBinding = { targetId: string; bindingVersion: number };
type Verification = ConsumerBinding & { systemIdentifier: string; observedReadbackSha256: string };

type VerificationInput = ConsumerAttempt &
  ConsumerBinding & {
    connectionUri: string;
    systemIdentifier: string;
    expectedReadbackSha256: string;
    readback: { text: string; values?: unknown[] };
  };

export class RestoreConsumerError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/**
 * Owns every ordinary query of ONE cooperating application consumer. No control
 * endpoint is exposed. Callers must authenticate/authorize commands and exclude
 * other processes before claiming global quiescence. Never returns a URI/rows.
 */
export class PostgresRestoreConsumer {
  private pool: Pool | undefined;
  private accepting = false;
  private readonly _failedPools = new WeakSet<Pool>();
  private admissionGeneration = 0;
  private closed = false;
  private attempt: ConsumerAttempt | undefined;
  private verified: Verification | undefined;
  private binding: ConsumerBinding;
  private pending: Promise<unknown> = Promise.resolve();
  private readonly queries = new Set<Promise<unknown>>();
  private readonly usedAttemptTokens = new Set<string>();
  private handoff:
    | { previous: ConsumerAttempt; next: ConsumerAttempt; completed: boolean; promise: Promise<void> }
    | undefined;

  private constructor(binding: ConsumerBinding) {
    this.binding = { ...binding };
  }

  static async connect(connectionUri: string, binding: ConsumerBinding) {
    const consumer = new PostgresRestoreConsumer(binding);
    const pool = consumer.newPool(connectionUri);
    try {
      await pool.query('SELECT 1');
      consumer._assertPoolHealthy(pool);
      consumer.pool = pool;
      consumer.accepting = true;
      return consumer;
    } catch {
      await pool.end();
      throw new RestoreConsumerError('RESTORE_CONSUMER_CONNECT_FAILED');
    }
  }

  private newPool(connectionString: string) {
    const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000 });
    // Idle socket errors must not crash the application or leave it accepting.
    pool.on('error', () => {
      this._failedPools.add(pool);
      this.accepting = false;
      this.admissionGeneration += 1;
    });
    return pool;
  }

  private _assertPoolHealthy(pool: Pool) {
    if (this._failedPools.has(pool)) throw new RestoreConsumerError('RESTORE_CONSUMER_POOL_FAILED');
  }

  query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
    if (!this.accepting || !this.pool || this.closed) {
      return Promise.reject(new RestoreConsumerError('RESTORE_APPLICATION_QUIESCED'));
    }
    // Submit synchronously before quiesce can call pool.end(). No client escapes.
    const pending = this.pool.query<Row>(text, values);
    this.queries.add(pending);
    void pending.then(
      () => this.queries.delete(pending),
      () => this.queries.delete(pending),
    );
    return pending;
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pending.then(operation);
    this.pending = next.catch(() => undefined);
    return next;
  }

  private assertAttempt(attempt: ConsumerAttempt) {
    if (
      this.closed ||
      !this.attempt ||
      this.attempt.operationId !== attempt.operationId ||
      this.attempt.attemptToken !== attempt.attemptToken
    ) {
      throw new RestoreConsumerError('RESTORE_CONSUMER_ATTEMPT_MISMATCH');
    }
  }

  quiesce(attempt: ConsumerAttempt): Promise<void> {
    if (this.closed || !attempt.operationId || !attempt.attemptToken) {
      return Promise.reject(new RestoreConsumerError('RESTORE_CONSUMER_ATTEMPT_MISMATCH'));
    }
    if (
      this.attempt &&
      (this.attempt.operationId !== attempt.operationId || this.attempt.attemptToken !== attempt.attemptToken)
    ) {
      return Promise.reject(new RestoreConsumerError('RESTORE_CONSUMER_ATTEMPT_MISMATCH'));
    }
    // One consumer instance serves one restore operation. A new operation must
    // get a new participating consumer; old control messages cannot be replayed.
    if (this.verified && this.accepting) {
      return Promise.reject(new RestoreConsumerError('RESTORE_CONSUMER_ALREADY_RELEASED'));
    }
    this.attempt = { ...attempt };
    this.usedAttemptTokens.add(attempt.attemptToken);
    this.accepting = false;
    this.admissionGeneration += 1;
    return this.serialize(async () => {
      this.assertAttempt(attempt);
      if (this.verified) throw new RestoreConsumerError('RESTORE_CONSUMER_ALREADY_VERIFIED');
      if (this.pool) {
        await Promise.allSettled([...this.queries]);
        await this.pool.end(); // Never claim closure on a timer.
        this.pool = undefined;
      }
    });
  }

  /**
   * Fence ONE cooperating consumer, not other processes or a distributed worker.
   * The caller must authenticate control messages and persist global fence debt.
   * No timeout/lease authorizes adoption: all admitted work and the pool must end.
   * After adoption admission remains closed; verify/reconnectVerified then release.
   */
  fenceAndAdopt(previous: ConsumerAttempt, next: ConsumerAttempt): Promise<void> {
    previous = { ...previous };
    next = { ...next };
    if (
      this.closed ||
      !previous.operationId ||
      previous.operationId !== next.operationId ||
      !previous.attemptToken ||
      !next.attemptToken ||
      previous.attemptToken === next.attemptToken
    ) {
      return Promise.reject(new RestoreConsumerError('RESTORE_CONSUMER_ATTEMPT_MISMATCH'));
    }
    const existing = this.handoff;
    if (
      existing &&
      existing.previous.operationId === previous.operationId &&
      existing.previous.attemptToken === previous.attemptToken &&
      existing.next.attemptToken === next.attemptToken &&
      this.attempt?.operationId === previous.operationId &&
      [previous.attemptToken, next.attemptToken].includes(this.attempt.attemptToken)
    ) {
      // A lost acknowledgement is replayable only while the adopted owner remains current.
      return existing.promise;
    }
    if (
      (existing && !existing.completed) ||
      this.usedAttemptTokens.has(next.attemptToken) ||
      this.attempt?.operationId !== previous.operationId ||
      this.attempt.attemptToken !== previous.attemptToken
    ) {
      return Promise.reject(new RestoreConsumerError('RESTORE_CONSUMER_ATTEMPT_MISMATCH'));
    }
    this.accepting = false;
    const generation = ++this.admissionGeneration;
    const handoff = { previous, next, completed: false, promise: undefined as unknown as Promise<void> };
    this.handoff = handoff;
    handoff.promise = this.serialize(async () => {
      this.assertAttempt(previous);
      await Promise.allSettled([...this.queries]);
      if (this.pool) {
        await this.pool.end();
        this.pool = undefined;
      }
      this.assertAttempt(previous);
      if (generation !== this.admissionGeneration) {
        throw new RestoreConsumerError('RESTORE_CONSUMER_ADMISSION_CHANGED');
      }
      this.attempt = next;
      this.usedAttemptTokens.add(next.attemptToken);
      handoff.completed = true;
    });
    void handoff.promise.catch(() => {
      // An unconfirmed drain never changes owner; a deliberate retry may drain again.
      if (this.handoff === handoff) this.handoff = undefined;
    });
    return handoff.promise;
  }

  verify(input: VerificationInput): Promise<Verification> {
    return this.performVerification(input, false);
  }

  /** Maintenance reconnect to an ALREADY verified binding, not a new restore. */
  pauseVerified(attempt: ConsumerAttempt): Promise<void> {
    this.assertAttempt(attempt);
    if (!this.verified || this.binding.bindingVersion !== this.verified.bindingVersion) {
      return Promise.reject(new RestoreConsumerError('RESTORE_CONSUMER_BINDING_MISMATCH'));
    }
    this.accepting = false;
    this.admissionGeneration += 1;
    return this.serialize(async () => {
      this.assertAttempt(attempt);
      await Promise.allSettled([...this.queries]);
      if (this.pool) {
        await this.pool.end();
        this.pool = undefined;
      }
    });
  }

  reconnectVerified(input: VerificationInput): Promise<Verification> {
    // A handoff may follow verification before release: revalidate that exact
    // verified target/version, without treating it as another version increment.
    const previous = this.verified;
    if (
      !previous ||
      input.targetId !== previous.targetId ||
      input.bindingVersion !== previous.bindingVersion ||
      input.systemIdentifier !== previous.systemIdentifier ||
      input.expectedReadbackSha256 !== previous.observedReadbackSha256
    ) {
      return Promise.reject(new RestoreConsumerError('RESTORE_CONSUMER_BINDING_MISMATCH'));
    }
    return this.performVerification(input, true);
  }

  private performVerification(input: VerificationInput, reconnecting: boolean): Promise<Verification> {
    const generation = this.admissionGeneration;
    return this.serialize(async () => {
      this.assertAttempt(input);
      if (generation !== this.admissionGeneration) {
        throw new RestoreConsumerError('RESTORE_CONSUMER_ADMISSION_CHANGED');
      }
      if (this.pool || this.accepting || (!reconnecting && this.verified))
        throw new RestoreConsumerError('RESTORE_CONSUMER_NOT_DRAINED');
      if (
        !input.targetId ||
        !Number.isSafeInteger(input.bindingVersion) ||
        input.bindingVersion !== (reconnecting ? this.verified?.bindingVersion : this.binding.bindingVersion + 1) ||
        !/^[a-f0-9]{64}$/.test(input.expectedReadbackSha256)
      ) {
        throw new RestoreConsumerError('RESTORE_CONSUMER_BINDING_MISMATCH');
      }
      const next = this.newPool(input.connectionUri);
      try {
        const client = await next.connect();
        let result: Verification;
        try {
          await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
          const identity = await client.query<{ system_identifier: string }>(
            'SELECT system_identifier::text FROM pg_control_system()',
          );
          if (identity.rows[0]?.system_identifier !== input.systemIdentifier) {
            throw new RestoreConsumerError('RESTORE_CONSUMER_TARGET_MISMATCH');
          }
          // Trusted integration query, never an untrusted control endpoint. The
          // transaction is read-only; caller must define canonical row ordering.
          const rows = await client.query(input.readback.text, input.readback.values);
          const observedReadbackSha256 = createHash('sha256').update(JSON.stringify(rows.rows)).digest('hex');
          if (observedReadbackSha256 !== input.expectedReadbackSha256) {
            throw new RestoreConsumerError('RESTORE_CONSUMER_READBACK_MISMATCH');
          }
          await client.query('COMMIT');
          result = {
            targetId: input.targetId,
            bindingVersion: input.bindingVersion,
            systemIdentifier: input.systemIdentifier,
            observedReadbackSha256,
          };
        } finally {
          client.release();
        }
        this.assertAttempt(input);
        if (generation !== this.admissionGeneration) {
          throw new RestoreConsumerError('RESTORE_CONSUMER_ADMISSION_CHANGED');
        }
        this._assertPoolHealthy(next);
        this.pool = next;
        this.verified = result;
        return { ...result };
      } catch (error) {
        await next.end();
        throw error instanceof RestoreConsumerError
          ? error
          : new RestoreConsumerError('RESTORE_CONSUMER_READBACK_FAILED');
      }
    });
  }

  release(attempt: ConsumerAttempt, binding: ConsumerBinding): Promise<void> {
    const generation = this.admissionGeneration;
    return this.serialize(async () => {
      this.assertAttempt(attempt);
      if (generation !== this.admissionGeneration) throw new RestoreConsumerError('RESTORE_CONSUMER_ADMISSION_CHANGED');
      if (
        !this.pool ||
        !this.verified ||
        binding.targetId !== this.verified.targetId ||
        binding.bindingVersion !== this.verified.bindingVersion
      ) {
        throw new RestoreConsumerError('RESTORE_CONSUMER_BINDING_MISMATCH');
      }
      // An error permanently invalidates this pool, including releases queued
      // after the error. Only a drained, freshly verified pool may admit work.
      this._assertPoolHealthy(this.pool);
      this.binding = { ...binding };
      this.accepting = true;
    });
  }

  close(): Promise<void> {
    this.accepting = false;
    this.admissionGeneration += 1;
    this.closed = true;
    return this.serialize(async () => {
      if (this.pool) {
        await Promise.allSettled([...this.queries]);
        await this.pool.end();
        this.pool = undefined;
      }
    });
  }
}
