import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { connect, isIP, type Socket, type AddressInfo } from 'node:net';
import { Transform, type Duplex } from 'node:stream';

export const HISTORY_TRANSFER_BYTES = 64 * 1024 * 1024;
export const IMPORT_WORKTREE_BYTES = 32 * 1024 * 1024;

export function importTooLarge() {
  return Object.assign(new Error('Git import exceeds the resource limit'), { code: 'IMPORT_TOO_LARGE' });
}

/** Check the selected tree before checkout can expand compressed objects on disk. */
export function checkImportTree(listing: string) {
  const blobs: Array<{ oid: string; path: string; size: number }> = [];
  let bytes = 0;
  let count = 0;
  for (const record of listing.split('\0')) {
    if (!record) continue;
    const tab = record.indexOf('\t');
    const fields = /^(\d+) (tree|blob|commit) ([a-f0-9]+) +(-|\d+)$/.exec(record.slice(0, tab));
    if (!fields || tab < 0) throw new Error('Invalid Git tree record');
    const length = fields[4] === '-' ? 0 : Number(fields[4]);
    bytes += length;
    if (++count > 5000 || length > 25 * 1024 * 1024 || bytes > IMPORT_WORKTREE_BYTES) throw importTooLarge();
    if (fields[1] === '100644' || fields[1] === '100755') {
      blobs.push({ oid: fields[3], path: record.slice(tab + 1), size: length });
    }
  }
  return blobs;
}

/** Git keeps end-to-end TLS. Only this import's prevalidated address and port can be dialled. */
export async function withImportTransfer<T>(
  origin: URL,
  addresses: readonly string[],
  run: (proxy: string) => Promise<T>,
  byteLimit = HISTORY_TRANSFER_BYTES,
): Promise<T> {
  if (origin.protocol !== 'https:' || !addresses.length) throw new Error('Git history import requires HTTPS');
  const port = Number(origin.port || 443);
  const password = randomBytes(24).toString('hex');
  const authorization = 'Basic ' + Buffer.from('git:' + password).toString('base64');
  const sockets = new Set<Duplex>();
  let transferred = 0;
  let exceeded = false;
  const closeSockets = () => {
    for (const socket of sockets) socket.destroy();
  };
  const server = createServer((_request, reply) => {
    reply.writeHead(403).end();
  });
  server.maxConnections = 8;
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('error', () => socket.destroy());
    socket.once('close', () => sockets.delete(socket));
  });
  server.on('connect', (request, client, head) => {
    if (request.headers['proxy-authorization'] !== authorization) {
      client.end(
        'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Git import"\r\nConnection: close\r\n\r\n',
      );
      return;
    }
    if (exceeded || request.url !== `${origin.hostname}:${port}` || head.length) {
      client.destroy();
      return;
    }
    // Try vetted IPv4/IPv6 addresses using Node's connection fallback, with
    // no second DNS resolution. The TLS name still belongs to Git.
    const upstream: Socket = connect({
      host: 'git-import.invalid',
      port,
      autoSelectFamily: true,
      lookup: (_host, options, callback) => {
        const vetted = addresses.map((address) => ({ address, family: isIP(address) }));
        if (options.all) callback(null, vetted);
        else callback(null, vetted[0].address, vetted[0].family);
      },
    });
    sockets.add(upstream);
    upstream.on('error', () => client.destroy());
    upstream.once('close', () => {
      sockets.delete(upstream);
      client.destroy();
    });
    client.once('close', () => upstream.destroy());
    const meter = () =>
      new Transform({
        transform(chunk: Buffer, _encoding, done) {
          transferred += chunk.length;
          if (transferred > byteLimit) {
            exceeded = true;
            closeSockets();
            done();
          } else {
            done(null, chunk);
          }
        },
      });
    upstream.once('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      client.pipe(meter()).pipe(upstream);
      upstream.pipe(meter()).pipe(client);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    return await run(`http://git:${password}@127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    closeSockets();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (exceeded) throw importTooLarge();
  }
}
