/**
 * Isolated QA application used by the physical restoration drill.
 * Connection strings travel over parent/child IPC and are never logged.
 */
import { createServer } from 'node:http';
import { PostgresRestoreConsumer } from '../../services/api/src/database-restore-consumer.js';

type Command = {
  id: number;
  action: 'connect' | 'quiesce' | 'release' | 'stop' | 'suspend';
  connectionUri?: string;
  bindingVersion?: number;
  activate?: boolean;
  targetId?: string;
  systemIdentifier?: string;
  expectedReadbackSha256?: string;
};

let consumer: PostgresRestoreConsumer | undefined;
const attempt = { operationId: 'isolated-physical-drill', attemptToken: 'single-process-attempt' };
let verified:
  | { observedReadbackSha256: string; systemIdentifier: string; targetId: string; bindingVersion: number }
  | undefined;
let acceptingRequests = false;
let previousPoolClosed = false;
let bindingVersion = 0;

const server = createServer(async (request, response) => {
  const verification = request.url === '/restore-readback';
  if (request.method !== 'GET' || (request.url !== '/value' && !verification)) {
    response.writeHead(404).end();
    return;
  }

  if ((!acceptingRequests && !verification) || !consumer) {
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: 'RESTORE_APPLICATION_QUIESCED' }));
    return;
  }

  try {
    if (verification) {
      if (!verified) throw new Error('Verification not completed');
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(verified));
      return;
    }
    const rows = await consumer.query<{ id: string; value: string }>('SELECT id, value FROM restore_probe ORDER BY id');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ rows: rows.rows, bindingVersion }));
  } catch {
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: 'RESTORE_APPLICATION_READ_FAILED' }));
  }
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address !== 'string') process.send?.({ ready: true, port: address.port });
});

let pending = Promise.resolve();
process.on('message', (command: Command) => {
  pending = pending.then(async () => {
    try {
      if (command.action === 'release') {
        if (!consumer || !verified || bindingVersion !== command.bindingVersion)
          throw new Error('Unexpected application binding');
        await consumer.release(attempt, verified);
        acceptingRequests = true;
        process.send?.({ id: command.id, result: { acceptingRequests, bindingVersion } });
        return;
      }
      if (command.action === 'quiesce' || command.action === 'stop' || command.action === 'suspend') {
        acceptingRequests = false;
        if (consumer) {
          if (command.action === 'stop') await consumer.close();
          else if (command.action === 'suspend') await consumer.pauseVerified(attempt);
          else await consumer.quiesce(attempt);
          previousPoolClosed = true;
        }

        process.send?.({ id: command.id, result: { acceptingRequests, previousPoolClosed } });
        if (command.action === 'stop') server.close(() => process.exit(0));
        return;
      }

      if (command.action !== 'connect' || !command.connectionUri) throw new Error('Invalid QA command');
      const endpoint = new URL(command.connectionUri);
      if (endpoint.hostname !== '127.0.0.1' || endpoint.protocol !== 'postgresql:') {
        throw new Error('Only the isolated loopback database is permitted');
      }
      if (command.activate === true && !consumer) {
        consumer = await PostgresRestoreConsumer.connect(command.connectionUri, {
          targetId: 'source',
          bindingVersion: 0,
        });
        acceptingRequests = true;
        process.send?.({ id: command.id, result: { acceptingRequests, bindingVersion } });
        return;
      }
      if (
        !consumer ||
        acceptingRequests ||
        !previousPoolClosed ||
        !command.targetId ||
        !command.systemIdentifier ||
        !command.expectedReadbackSha256
      ) {
        throw new Error('Quiesce and supply a verification contract first');
      }
      verified = await (verified ? consumer.reconnectVerified.bind(consumer) : consumer.verify.bind(consumer))({
        ...attempt,
        connectionUri: command.connectionUri,
        targetId: command.targetId,
        bindingVersion: command.bindingVersion!,
        systemIdentifier: command.systemIdentifier,
        expectedReadbackSha256: command.expectedReadbackSha256,
        readback: { text: 'SELECT id, value FROM restore_probe ORDER BY id' },
      });
      bindingVersion = verified.bindingVersion;
      process.send?.({
        id: command.id,
        result: {
          newConnection: true,
          previousPoolClosed,
          bindingVersion,
          systemIdentifier: verified.systemIdentifier,
        },
      });
    } catch {
      process.send?.({ id: command.id, error: 'QA_APPLICATION_COMMAND_FAILED' });
    }
  });
});

process.on('disconnect', () => {
  acceptingRequests = false;
  void consumer?.close().finally(() => server.close(() => process.exit(0)));
  if (!consumer) server.close(() => process.exit(0));
});
