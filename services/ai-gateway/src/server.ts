import { buildAiGatewayApp } from './app.js';

const app = await buildAiGatewayApp();
const port = Number(process.env.AI_GATEWAY_PORT ?? 3030);

/*
 * Process-level safety nets. Streaming code paths spawn fire-and-forget lane
 * tasks and background fetches; a stray rejection or a synchronous throw outside
 * a request handler would otherwise terminate the pod with no structured log
 * (Node prints to stderr and, for unhandledRejection, may exit). Log them with
 * the app logger so incidents are diagnosable. We deliberately do NOT exit on an
 * unhandledRejection (keep serving healthy traffic); an uncaughtException leaves
 * the process in an undefined state, so we log then exit non-zero for k8s to
 * restart the pod cleanly.
 */
process.on('unhandledRejection', (reason) => {
  app.log.error({ err: reason }, 'ai-gateway unhandledRejection');
});

process.on('uncaughtException', (error) => {
  app.log.error({ err: error }, 'ai-gateway uncaughtException — exiting for restart');
  void app
    .close()
    .catch(() => undefined)
    .finally(() => process.exit(1));
});

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
