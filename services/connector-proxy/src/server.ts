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

const resolveConnection = createPrismaConnectionResolver();
const reportConnectionFailure = createPrismaConnectionFailureReporter();

const app = await buildConnectorProxyApp({
  logger: true,
  accessTokenSecret,
  resolveConnection,
  reportConnectionFailure,
});

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3030);

await app.listen({ host, port });
