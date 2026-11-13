/** Real cooperating processes only. Not a cloud adapter or an exhaustive consumer registry. */
import { fork, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { observePostgresRestoreDrain } from '../database-restore-drain.js';

const url = process.env.RESTORE_TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

type Reply = { id?: number; ready?: boolean; result?: unknown; error?: string };

class Participant {
  private _sequence = 0;
  private _pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  readonly child: ChildProcess;
  readonly ready: Promise<void>;
  readonly exited: Promise<void>;
  constructor() {
    this.child = fork(fileURLToPath(new URL('./restore-fence-child.fixture.mts', import.meta.url)), [], {
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test' },
    });
    this.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('TEST_PARTICIPANT_START_TIMEOUT')), 10000);
      this.child.on('message', (message: Reply) => {
        if (message.ready) {
          clearTimeout(timer);
          resolve();
        }
      });
      this.child.once('exit', () => {
        clearTimeout(timer);
        reject(new Error('TEST_PARTICIPANT_EXITED'));
      });
    });
    this.child.on('message', (message: Reply) => {
      if (message.id === undefined) {
        return;
      }

      const request = this._pending.get(message.id);

      if (!request) {
        return;
      }

      this._pending.delete(message.id);
      clearTimeout(request.timer);

      if (message.error) {
        request.reject(new Error(message.error));
      } else {
        request.resolve(message.result);
      }
    });
    this.exited = new Promise<void>((resolve) =>
      this.child.once('exit', () => {
        for (const request of this._pending.values()) {
          clearTimeout(request.timer);
          request.reject(new Error('TEST_PARTICIPANT_EXITED'));
        }
        this._pending.clear();
        resolve();
      }),
    );
  }
  async call(command: Record<string, unknown>) {
    await this.ready;

    if (!this.child.connected) {
      throw new Error('TEST_PARTICIPANT_EXITED');
    }

    return new Promise<unknown>((resolve, reject) => {
      const id = ++this._sequence;

      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error('TEST_PARTICIPANT_COMMAND_TIMEOUT'));
      }, 15000);
      this._pending.set(id, { resolve, reject, timer });
      this.child.send({ ...command, id }, (error) => {
        if (error) {
          clearTimeout(timer);
          this._pending.delete(id);
          reject(new Error('TEST_PARTICIPANT_IPC_FAILED'));
        }
      });
    });
  }
  async close() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      return;
    }

    const timer = setTimeout(() => this.child.kill('SIGKILL'), 10000);

    try {
      await this.call({ action: 'close' });
      await this.exited;
    } finally {
      clearTimeout(timer);

      if (this.child.exitCode === null && this.child.signalCode === null) {
        this.child.kill('SIGKILL');
        await this.exited;
      }
    }
  }
}

run('restore handoff across real local PostgreSQL participants', () => {
  let admin: Client;
  let identity: string;

  const participants: Participant[] = [];
  const table = `fence_probe_${randomUUID().replaceAll('-', '')}`;
  const rows = [{ value: 'acknowledged synthetic data' }];
  const digest = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const binding = { targetId: 'local-target', bindingVersion: 1 };
  beforeAll(async () => {
    const endpoint = new URL(url!);

    if (
      endpoint.hostname !== '127.0.0.1' ||
      !endpoint.port ||
      endpoint.port === '55439' ||
      !(endpoint.pathname === '/restore_fence_proof' || /^\/vibecore_restore_ci_[a-f0-9]+$/.test(endpoint.pathname))
    ) {
      throw new Error('Disposable local restore database required');
    }

    admin = new Client({ connectionString: url });
    await admin.connect();
    identity = (await admin.query('SELECT system_identifier::text FROM pg_control_system()')).rows[0]
      .system_identifier as string;
    await admin.query(`CREATE TABLE "${table}" (value text NOT NULL)`);
    await admin.query(`INSERT INTO "${table}" VALUES ($1)`, [rows[0].value]);
  });
  afterAll(async () => {
    const closed = await Promise.allSettled(participants.map((participant) => participant.close()));

    try {
      if (admin) {
        await admin.query(`DROP TABLE IF EXISTS "${table}"`);
      }
    } finally {
      if (admin) {
        await admin.end();
      }
    }

    if (closed.some((result) => result.status === 'rejected')) {
      throw new Error('TEST_PARTICIPANT_CLEANUP_FAILED');
    }
  });

  function verification(attempt: { operationId: string; attemptToken: string }) {
    return {
      ...attempt,
      ...binding,
      connectionUri: url!,
      systemIdentifier: identity,
      expectedReadbackSha256: digest,
      readback: { text: `SELECT value FROM "${table}" ORDER BY value` },
    };
  }

  async function start(attempt: { operationId: string; attemptToken: string }) {
    const participant = new Participant();
    participants.push(participant);
    await participant.call({
      action: 'connect',
      connectionUri: url!,
      binding: { targetId: 'local-source', bindingVersion: 0 },
    });
    await participant.call({ action: 'quiesce', attempt });
    await participant.call({ action: 'verify', verification: verification(attempt) });
    await participant.call({ action: 'release', attempt, binding });

    return participant;
  }

  async function waitForBlocked(pid: number) {
    for (let retry = 0; retry < 100; retry++) {
      const result = await admin.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1', [pid]);

      if (result.rows[0]?.wait_event_type === 'Lock') {
        return;
      }

      await delay(20);
    }
    throw new Error('Real participant query did not reach advisory lock');
  }
  it('requires both drains, rejects old commands, and explicitly reconnects both consumers before serving data', async () => {
    const previous = { operationId: randomUUID(), attemptToken: randomUUID() };
    const next = { ...previous, attemptToken: randomUUID() };
    const [first, second] = await Promise.all([start(previous), start(previous)]);

    const pid = (
      (await first.call({ action: 'query', text: 'SELECT pg_backend_pid() AS pid' })) as Array<{ pid: number }>
    )[0].pid;

    const lock = Math.floor(Math.random() * 1e9);
    await admin.query('SELECT pg_advisory_lock($1)', [lock]);

    const outstanding: Promise<unknown>[] = [];

    const observe = <T>(promise: Promise<T>) => {
      outstanding.push(promise);
      void promise.catch(() => undefined);

      return promise;
    };

    const running = observe(first.call({ action: 'query', text: 'SELECT pg_advisory_xact_lock($1)', values: [lock] }));

    let allDrained = false;
    let firstDrained = false;

    try {
      await waitForBlocked(pid);

      const firstFence = first.call({ action: 'fence', previous, next }).then(() => {
        firstDrained = true;
      });

      const secondFence = second.call({ action: 'fence', previous, next });

      const complete = observe(
        Promise.all([firstFence, secondFence]).then(() => {
          allDrained = true;
        }),
      );
      await secondFence;
      expect(firstDrained).toBe(false);
      expect(allDrained).toBe(false);
      await expect(first.call({ action: 'query', text: 'SELECT 1' })).rejects.toThrow('RESTORE_APPLICATION_QUIESCED');
      await expect(second.call({ action: 'release', attempt: previous, binding })).rejects.toThrow(
        'RESTORE_CONSUMER_ATTEMPT_MISMATCH',
      );
      await admin.query('SELECT pg_advisory_unlock($1)', [lock]);
      await running;
      await complete;

      for (const participant of [first, second]) {
        await participant.call({ action: 'fence', previous, next });
        await expect(participant.call({ action: 'query', text: 'SELECT 1' })).rejects.toThrow(
          'RESTORE_APPLICATION_QUIESCED',
        );
        await participant.call({ action: 'reconnect', verification: verification(next) });
        await participant.call({ action: 'release', attempt: next, binding });
        expect(await participant.call({ action: 'query', text: `SELECT value FROM "${table}"` })).toEqual(rows);
        await expect(participant.call({ action: 'release', attempt: previous, binding })).rejects.toThrow(
          'RESTORE_CONSUMER_ATTEMPT_MISMATCH',
        );
      }
    } finally {
      await admin.query('SELECT pg_advisory_unlock($1)', [lock]);
      await Promise.allSettled(outstanding);
    }
  });
  it('does not turn a dead process or a missing acknowledgement into a fence receipt', async () => {
    // Do not let the previous scenario's live consumers satisfy the count.
    await Promise.all(participants.map((previousParticipant) => previousParticipant.close()));

    const previous = { operationId: randomUUID(), attemptToken: randomUUID() };
    const next = { ...previous, attemptToken: randomUUID() };
    const participant = await start(previous);

    const backend = (
      (await participant.call({
        action: 'query',
        text: `SELECT pid, backend_start::text AS backend_start
          FROM pg_stat_activity WHERE pid = pg_backend_pid()`,
      })) as Array<{ pid: number; backend_start: string }>
    )[0];
    const pid = backend.pid;

    const lock = Math.floor(Math.random() * 1e9);
    await admin.query('SELECT pg_advisory_lock($1)', [lock]);

    const running = participant
      .call({ action: 'query', text: 'SELECT pg_advisory_xact_lock($1)', values: [lock] })
      .catch((error: unknown) => error);

    try {
      await waitForBlocked(pid);

      const fenced = participant.call({ action: 'fence', previous, next }).catch((error: unknown) => error);
      await expect(participant.call({ action: 'query', text: 'SELECT 1' })).rejects.toThrow(
        'RESTORE_APPLICATION_QUIESCED',
      );
      participant.child.kill('SIGKILL');
      await participant.exited;
      expect(await fenced).toMatchObject({ message: 'TEST_PARTICIPANT_EXITED' });
      const observation = await observePostgresRestoreDrain(url!, {
        systemIdentifier: identity,
        databaseName: new URL(url!).pathname.slice(1),
      });
      // Verify the exact backend incarnation is still blocked, not merely
      // unrelated sessions (or a reused PID) contributing to a total count.
      const orphan = await admin.query<{ backend_start: string; wait_event_type: string }>(
        'SELECT backend_start::text, wait_event_type FROM pg_stat_activity WHERE pid = $1',
        [pid],
      );
      expect(orphan.rows).toEqual([{ backend_start: backend.backend_start, wait_event_type: 'Lock' }]);
      // Admin + this confirmed blocked orphan: process death did not drain it.
      expect(observation.otherSessions).toBeGreaterThanOrEqual(2);
      expect(observation.observedEmpty).toBe(false);
      expect(observation.globalFence).toBe(false);
      await expect(participant.call({ action: 'fence', previous, next })).rejects.toThrow('TEST_PARTICIPANT_EXITED');

      /*
       * OS process exit is not a database-side drain receipt. The locked backend
       * may survive until its query wakes; neither exit nor timeout certifies it.
       */
      expect((await admin.query(`SELECT value FROM "${table}"`)).rows).toEqual(rows);
    } finally {
      await admin.query('SELECT pg_advisory_unlock($1)', [lock]);
      await running;
    }
  });
});
