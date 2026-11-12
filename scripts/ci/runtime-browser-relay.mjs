// @ts-check
import net from 'node:net';
import { isAbsolute } from 'node:path';

/** @typedef {{ host: '127.0.0.1', port: number } | { path: string }} RelayEndpoint */

const LISTEN_TIMEOUT_MS = 5000;
const CLOSE_TIMEOUT_MS = 1000;
const MAX_TIMER_MS = 2 ** 31 - 1;
const SAFE_ERROR_CODES = new Set(['EPERM', 'EACCES', 'EADDRINUSE', 'ENOENT', 'ENAMETOOLONG']);

/** @param {string} message @param {unknown} [original] */
function failure(message, original) {
  /** @type {Error & { code?: string }} */
  const error = new Error(message);

  // Keep only a useful capability/error category, never native messages or addresses.
  if (
    original &&
    typeof original === 'object' &&
    'code' in original &&
    typeof original.code === 'string' &&
    SAFE_ERROR_CODES.has(original.code)
  ) {
    error.code = original.code;
  }

  return error;
}

/** @param {unknown} value @param {boolean} listening @returns {RelayEndpoint} */
function endpoint(value, listening) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw failure('relay_endpoint_invalid');
  }

  const keys = Object.keys(value);

  if (keys.length === 1 && keys[0] === 'path' && 'path' in value) {
    if (typeof value.path !== 'string' || !isAbsolute(value.path) || value.path.includes('\0')) {
      throw failure('relay_endpoint_invalid');
    }

    return { path: value.path };
  }

  if (
    keys.length !== 2 ||
    !keys.includes('host') ||
    !keys.includes('port') ||
    !('host' in value) ||
    !('port' in value) ||
    value.host !== '127.0.0.1' ||
    typeof value.port !== 'number' ||
    !Number.isInteger(value.port) ||
    value.port < (listening ? 0 : 1) ||
    value.port > 65535
  ) {
    throw failure('relay_endpoint_invalid');
  }

  // Copy only explicitly allowed fields; no DNS lookup, fd, or net option passthrough.
  return { host: '127.0.0.1', port: value.port };
}

/** @param {unknown} value @param {number} maximum */
function positiveInteger(value, maximum) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > maximum) {
    throw failure('relay_limit_invalid');
  }
}

/**
 * Start a byte-transparent relay. Endpoints are an absolute Unix socket path or
 * exactly 127.0.0.1; port 0 is allowed only for listening. The caller owns the Unix
 * socket directory and its access controls. Existing paths are never removed.
 *
 * No HTTP parsing, rewriting, buffering of entire messages, logging, child
 * processes, or network configuration is performed. Stream pipes apply normal
 * backpressure and preserve half-closes, including HTTP upgrades and binary data.
 *
 * @param {{ listen: RelayEndpoint, target: RelayEndpoint, maxConnections?: number,
 *   idleTimeoutMs?: number, connectTimeoutMs?: number }} options
 * @returns {Promise<{ address: import('node:net').AddressInfo | string, close: () => Promise<void> }>}
 */
export async function startRelay({
  listen,
  target,
  maxConnections = 128,
  idleTimeoutMs = 120000,
  connectTimeoutMs = 5000,
}) {
  const listenOptions = endpoint(listen, true);
  const targetOptions = endpoint(target, false);
  positiveInteger(maxConnections, 4096);
  positiveInteger(idleTimeoutMs, MAX_TIMER_MS);
  positiveInteger(connectTimeoutMs, MAX_TIMER_MS);

  /** @type {Set<() => void>} */
  const connections = new Set();

  let closed = false;

  /** @type {Promise<void> | undefined} */
  let closing;

  const server = net.createServer({ allowHalfOpen: true, pauseOnConnect: true }, (incoming) => {
    if (closed || connections.size >= maxConnections) {
      incoming.on('error', () => {});
      incoming.destroy();

      return;
    }

    /** @type {import('node:net').Socket | undefined} */
    let outgoing;

    /** @type {NodeJS.Timeout | undefined} */
    let connectTimer;
    let stopped = false;

    const stop = () => {
      if (stopped) {
        return;
      }

      stopped = true;
      clearTimeout(connectTimer);
      connections.delete(stop);
      incoming.destroy();
      outgoing?.destroy();
    };

    /** @param {import('node:net').Socket} socket */
    const peerClosed = (socket) => {
      /*
       * A graceful half-close can precede the other socket flushing its writes.
       * Destroying that peer here would truncate a backpressured response.
       */
      if (!socket.readableEnded || !socket.writableFinished || (incoming.destroyed && outgoing?.destroyed)) {
        stop();
      }
    };

    connections.add(stop);
    incoming.on('error', stop);
    incoming.once('close', () => peerClosed(incoming));
    incoming.setTimeout(idleTimeoutMs, stop);
    incoming.pause();

    try {
      outgoing = net.createConnection({ ...targetOptions, allowHalfOpen: true });
      outgoing.on('error', stop);
      outgoing.once('close', () => {
        if (outgoing) {
          peerClosed(outgoing);
        }
      });
      outgoing.setTimeout(idleTimeoutMs, stop);
      connectTimer = setTimeout(stop, connectTimeoutMs);
      connectTimer.unref();
      outgoing.once('connect', () => {
        clearTimeout(connectTimer);

        if (stopped || closed || incoming.destroyed || !outgoing || outgoing.destroyed) {
          stop();

          return;
        }

        incoming.pipe(outgoing);
        outgoing.pipe(incoming);
      });
    } catch {
      stop();
    }
  });

  // Idempotent, bounded cleanup also covers pending connects and upgraded sockets.
  /** @returns {Promise<void>} */
  function close() {
    if (closing) {
      return closing;
    }

    closed = true;

    for (const stop of connections) {
      stop();
    }

    closing = new Promise((resolve) => {
      const timer = setTimeout(() => {
        server.unref();
        resolve();
      }, CLOSE_TIMEOUT_MS);

      const finish = () => {
        clearTimeout(timer);
        resolve();
      };

      try {
        server.close(finish);
      } catch {
        finish();
      }
    });

    return closing;
  }

  /** @type {Promise<void>} */
  const listening = new Promise((resolve, reject) => {
    const timer = setTimeout(() => fail(failure('relay_listen_timeout')), LISTEN_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timer);
      server.off('listening', ready);
      server.off('error', failed);
    };

    /** @param {Error} error */
    const fail = (error) => {
      cleanup();
      void close().then(() => reject(error));
    };

    /** @param {unknown} error */
    const failed = (error) => fail(failure('relay_listen_failed', error));

    const ready = () => {
      cleanup();
      resolve();
    };

    server.once('listening', ready);
    server.once('error', failed);
    server.on('error', () => void close());

    try {
      server.listen(listenOptions);
    } catch (error) {
      failed(error);
    }
  });

  await listening;

  const address = server.address();

  if (closed || address === null) {
    await close();
    throw failure('relay_listener_closed');
  }

  return Object.freeze({ address, close });
}
