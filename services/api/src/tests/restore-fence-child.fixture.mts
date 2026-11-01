/** Test-only IPC participant; never a server entrypoint or cloud fencing agent. */
import assert from 'node:assert/strict';
// eslint-disable-next-line no-restricted-imports -- Node IPC fixture uses the real server module, not the web alias.
import {
  PostgresRestoreConsumer,
  RestoreConsumerError,
  type ConsumerAttempt,
  type ConsumerBinding,
} from '../database-restore-consumer.js';

type Verification = Parameters<PostgresRestoreConsumer['verify']>[0];
type Command = {
  id: number;
  action: 'connect' | 'query' | 'quiesce' | 'verify' | 'reconnect' | 'release' | 'fence' | 'close';
  connectionUri?: string;
  binding?: ConsumerBinding;
  attempt?: ConsumerAttempt;
  previous?: ConsumerAttempt;
  next?: ConsumerAttempt;
  verification?: Verification;
  text?: string;
  values?: unknown[];
};
assert.ok(process.send, 'Test participant requires IPC');

let consumer: PostgresRestoreConsumer | undefined;
process.on('message', (command: Command) => {
  void (async () => {
    try {
      let result: unknown;

      if (command.action === 'connect') {
        assert.ok(!consumer && command.connectionUri && command.binding);

        const url = new URL(command.connectionUri);
        assert.equal(url.hostname, '127.0.0.1');
        assert.ok(url.port && url.port !== '55439');
        assert.ok(url.pathname === '/restore_fence_proof' || /^\/vibecore_restore_ci_[a-f0-9]+$/.test(url.pathname));
        consumer = await PostgresRestoreConsumer.connect(command.connectionUri, command.binding);
      } else {
        assert.ok(consumer);

        if (command.action === 'query') {
          result = (await consumer.query(command.text!, command.values)).rows;
        } else if (command.action === 'quiesce') {
          await consumer.quiesce(command.attempt!);
        } else if (command.action === 'verify') {
          result = await consumer.verify(command.verification!);
        } else if (command.action === 'reconnect') {
          result = await consumer.reconnectVerified(command.verification!);
        } else if (command.action === 'release') {
          await consumer.release(command.attempt!, command.binding!);
        } else if (command.action === 'fence') {
          await consumer.fenceAndAdopt(command.previous!, command.next!);
        } else if (command.action === 'close') {
          await consumer.close();
        } else {
          throw new Error('Unsupported test command');
        }
      }

      process.send?.({ id: command.id, result: result ?? null });

      if (command.action === 'close') {
        process.disconnect?.();
      }
    } catch (error) {
      process.send?.({
        id: command.id,
        error: error instanceof RestoreConsumerError ? error.code : 'TEST_PARTICIPANT_FAILED',
      });
    }
  })();
});
process.on('disconnect', () => {
  void consumer?.close().finally(() => process.exit(0));
});
process.send?.({ ready: true });
