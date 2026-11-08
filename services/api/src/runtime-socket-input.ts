import type WebSocket from 'ws';

/**
 * Capture early frames synchronously, but release none until every authorization
 * and quota check has passed and the agent transport has opened.
 */
export function captureRuntimeSocketInput(rawSocket: unknown) {
  const socket = ((rawSocket as { socket?: unknown }).socket ?? rawSocket) as WebSocket;
  const pending: string[] = [];
  const closeListeners = new Set<() => void>();

  let bytes = 0;
  let closed = false;
  let forward: ((message: string) => void) | undefined;

  const timer = setTimeout(() => stop(true), 30_000);
  timer.unref();

  function stop(closeSocket = false) {
    if (closed) {
      return;
    }

    closed = true;
    clearTimeout(timer);
    pending.length = 0;
    bytes = 0;
    forward = undefined;
    socket.removeListener('message', onMessage);
    socket.removeListener('close', onClose);

    for (const listener of closeListeners) {
      listener();
    }
    closeListeners.clear();

    if (closeSocket) {
      socket.close();
    }
  }

  function onClose() {
    stop();
  }

  function onMessage(raw: WebSocket.RawData) {
    if (closed) {
      return;
    }

    const message = raw.toString();

    if (forward) {
      try {
        forward(message);
      } catch {
        stop(true);
      }
      return;
    }

    const length = Buffer.byteLength(message);

    if (pending.length >= 1000 || bytes + length > 256 * 1024) {
      stop(true);
      return;
    }

    pending.push(message);
    bytes += length;
  }

  socket.on('message', onMessage);
  socket.on('close', onClose);

  return {
    get closed() {
      return closed;
    },
    activate(send: (message: string) => void) {
      if (closed || forward) {
        return;
      }

      clearTimeout(timer);
      forward = send;

      const queued = pending.splice(0);
      bytes = 0;

      try {
        for (const message of queued) {
          if (closed) {
            break;
          }

          send(message);
        }
      } catch {
        stop(true);
      }
    },
    onClose(listener: () => void) {
      if (closed) {
        listener();
      } else {
        closeListeners.add(listener);
      }
    },
    dispose() {
      stop(true);
    },
  };
}
