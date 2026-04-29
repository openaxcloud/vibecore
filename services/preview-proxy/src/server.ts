import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/health', async () => ({ status: 'ok', service: 'preview-proxy' }));

const port = Number(process.env.PREVIEW_PROXY_PORT ?? 3020);
await app.listen({ host: '0.0.0.0', port });
