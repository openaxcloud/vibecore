/** Disposable PostgreSQL test child. No inherited provider credentials or external HTTP. */
import { createDatabaseClient } from '@vibecore/database';
import { buildApiApp } from './app.js';
import { PrismaApiStore } from './prisma-store.js';

const ERROR_CODES = {
  target: 'DATABASE_PANEL_CHILD_TARGET_REFUSED',
  http: 'DATABASE_PANEL_EXTERNAL_HTTP_FORBIDDEN',
  email: 'DATABASE_PANEL_EMAIL_FORBIDDEN',
  address: 'DATABASE_PANEL_CHILD_ADDRESS_INVALID',
} as const;

async function main() {
  const target = new URL(process.env.DATABASE_URL ?? '');

  if (
    !process.send ||
    !['127.0.0.1', 'localhost'].includes(target.hostname) ||
    target.pathname !== '/database_audit' ||
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    target.search !== '' ||
    target.hash !== ''
  ) {
    throw new Error(ERROR_CODES.target);
  }

  globalThis.fetch = async () => {
    throw new Error(ERROR_CODES.http);
  };

  const prisma = createDatabaseClient({ poolMax: 2 });

  const app = await buildApiApp({
    store: new PrismaApiStore(prisma),
    emailProvider: {
      async send() {
        throw new Error(ERROR_CODES.email);
      },
    },
  });

  let stopping = false;

  const stop = async () => {
    if (stopping) {
      return;
    }

    stopping = true;

    try {
      await app.close();
    } finally {
      await prisma.$disconnect();

      if (process.connected) {
        process.disconnect?.();
      }
    }
  };
  process.on('message', (message) => {
    if (message === 'shutdown') {
      void stop().catch(() => {
        process.exitCode = 1;
      });
    }
  });
  process.on('SIGTERM', () => {
    void stop().catch(() => {
      process.exitCode = 1;
    });
  });
  process.on('disconnect', () => {
    void stop().catch(() => {
      process.exitCode = 1;
    });
  });
  await app.listen({ host: '127.0.0.1', port: 0 });

  const address = app.server.address();

  if (!address || typeof address === 'string') {
    throw new Error(ERROR_CODES.address);
  }

  process.send({ type: 'ready', port: address.port, pid: process.pid });
}
main().catch(() => {
  // Parent receives no raw error, URL or credential, and can terminate this owned child.
  process.send?.({ type: 'failed' });
  process.exitCode = 1;
});
