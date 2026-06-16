import { buildAiGatewayApp } from './app.js';

const app = await buildAiGatewayApp();
const port = Number(process.env.AI_GATEWAY_PORT ?? 3030);

/*
 * Graceful shutdown: on SIGTERM/SIGINT (k8s pod termination) close Fastify so its
 * onClose hooks run (Redis rate-limiter teardown) and in-flight requests drain
 * before exit, instead of being hard-killed.
 */
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void app
      .close()
      .catch((error) => app.log.error({ err: error }, 'ai-gateway shutdown error'))
      .finally(() => process.exit(0));
  });
}

await app.listen({ host: '0.0.0.0', port });
