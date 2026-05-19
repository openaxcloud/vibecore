import { buildConnectorProxyApp } from './app.js';

const accessTokenSecret = process.env.CONNECTOR_PROXY_ACCESS_TOKEN_SECRET;

if (!accessTokenSecret) {
  // eslint-disable-next-line no-console
  console.error('CONNECTOR_PROXY_ACCESS_TOKEN_SECRET is required to start the connector-proxy service.');
  process.exit(1);
}

const app = await buildConnectorProxyApp({
  logger: true,
  accessTokenSecret,
});

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3030);

await app.listen({ host, port });
