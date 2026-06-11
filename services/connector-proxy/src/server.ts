import { createDatabaseClient } from '@vibecore/database';
import { buildConnectorProxyApp } from './app.js';
import { createPrismaConnectionFailureReporter, createPrismaConnectionResolver } from './prisma-resolver.js';

const accessTokenSecret = process.env.CONNECTOR_PROXY_ACCESS_TOKEN_SECRET;

if (!accessTokenSecret) {
  // eslint-disable-next-line no-console
  console.error('CONNECTOR_PROXY_ACCESS_TOKEN_SECRET is required to start the connector-proxy service.');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.error('DATABASE_URL is required to start the connector-proxy service.');
  process.exit(1);
}

if (!process.env.ENCRYPTION_SECRET) {
  // eslint-disable-next-line no-console
  console.error('ENCRYPTION_SECRET is required to start the connector-proxy service.');
  process.exit(1);
}

// Share ONE Prisma client (one pg pool) across both factories. Each factory
// defaults to its own createDatabaseClient() when no deps are passed, so calling
// them bare opened two independent pools — double the connections for no reason.
const prisma = createDatabaseClient();
const resolveConnection = createPrismaConnectionResolver({ prisma });
const reportConnectionFailure = createPrismaConnectionFailureReporter({ prisma });

const app = await buildConnectorProxyApp({
  logger: true,
  accessTokenSecret,
  resolveConnection,
  reportConnectionFailure,
});

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3030);

await app.listen({ host, port });
