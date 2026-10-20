/**
 * Isolated QA application used by the physical restoration drill.
 * Connection strings travel over parent/child IPC and are never logged.
 */
import { createServer } from 'node:http';
import { Pool } from 'pg';

type Command = {
  id: number;
  action: 'connect' | 'quiesce' | 'release' | 'stop';
  connectionUri?: string;
  bindingVersion?: number;
  activate?: boolean;
};

let pool: Pool | undefined;
let acceptingRequests = false;
let previousPoolClosed = false;
let bindingVersion = 0;

const server = createServer(async (request, response) => {
  const verification = request.url === '/restore-readback';
  if (request.method !== 'GET' || (request.url !== '/value' && !verification)) {
    response.writeHead(404).end();
    return;
  }

  if ((!acceptingRequests && !verification) || !pool) {
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: 'RESTORE_APPLICATION_QUIESCED' }));
    return;
  }

  try {
    const rows = await pool.query<{ id: string; value: string }>('SELECT id, value FROM restore_probe ORDER BY id');
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
        if (!pool || bindingVersion !== command.bindingVersion) throw new Error('Unexpected application binding');
        acceptingRequests = true;
        process.send?.({ id: command.id, result: { acceptingRequests, bindingVersion } });
        return;
      }
      if (command.action === 'quiesce' || command.action === 'stop') {
        acceptingRequests = false;
        if (pool) {
          await pool.end();
          pool = undefined;
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
      if (pool || acceptingRequests) throw new Error('Quiesce the previous application pool first');
      const next = new Pool({ connectionString: command.connectionUri, max: 2, connectionTimeoutMillis: 5000 });
      try {
        const result = await next.query<{ pid: number; system_identifier: string }>(
          'SELECT pg_backend_pid() AS pid, system_identifier::text FROM pg_control_system()',
        );
        pool = next;
        bindingVersion = command.bindingVersion ?? 0;
        acceptingRequests = command.activate === true;
        process.send?.({
          id: command.id,
          result: {
            newConnection: result.rowCount === 1,
            previousPoolClosed,
            backendPid: result.rows[0]?.pid,
            systemIdentifier: result.rows[0]?.system_identifier,
            bindingVersion,
          },
        });
      } catch {
        await next.end();
        throw new Error('New application database connection failed');
      }
    } catch {
      process.send?.({ id: command.id, error: 'QA_APPLICATION_COMMAND_FAILED' });
    }
  });
});

process.on('disconnect', () => {
  acceptingRequests = false;
  void pool?.end().finally(() => server.close(() => process.exit(0)));
  if (!pool) server.close(() => process.exit(0));
});
