import Fastify from 'fastify';
import { Redis } from 'ioredis';
import {
  authorizeAgentRun,
  createAgentRunRateLimiter,
  createRedisAgentRunRateLimiter,
  executeAgentRun,
  parseAgentRunRequest,
  positiveIntegerOrDefault,
  type AgentRunRateLimiter,
  type RedisRateLimitClient,
} from './agent-executor.js';
import { createDefaultAgentRunPersistence, type AgentRunPersistence } from './agent-run-persistence.js';
import { AiGateway, type AiChatRequest } from './gateway.js';

export interface AiGatewayAppOptions {
  gateway?: AiGateway;
  env?: Record<string, string | undefined>;
  logger?: boolean;
  agentRunRateLimiter?: AgentRunRateLimiter;
  agentRunPersistence?: AgentRunPersistence | null;
}

export async function buildAiGatewayApp(options: AiGatewayAppOptions = {}) {
  const env = options.env ?? process.env;
  const app = Fastify({ logger: options.logger ?? true });
  const gateway = options.gateway ?? new AiGateway();
  const agentRunRateLimitPerMinute = Number(env.ECODE_SUBAGENT_EXECUTOR_RATE_LIMIT_PER_MINUTE ?? 30);
  const agentRunRateLimit = positiveIntegerOrDefault(agentRunRateLimitPerMinute, 30);
  const redis =
    !options.agentRunRateLimiter && env.REDIS_URL
      ? new Redis(env.REDIS_URL, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        })
      : undefined;
  const agentRunRateLimiter =
    options.agentRunRateLimiter ??
    (redis
      ? createRedisAgentRunRateLimiter({
          redis: redis as unknown as RedisRateLimitClient,
          limit: agentRunRateLimit,
          windowMs: 60_000,
          prefix: env.ECODE_SUBAGENT_EXECUTOR_RATE_LIMIT_REDIS_PREFIX ?? 'vibecore',
        })
      : createAgentRunRateLimiter({
          limit: agentRunRateLimit,
          windowMs: 60_000,
        }));

  const agentRunPersistence =
    options.agentRunPersistence === null
      ? undefined
      : (options.agentRunPersistence ?? (await createDefaultAgentRunPersistence()));

  app.addHook('onClose', async () => {
    await agentRunRateLimiter.close?.();
  });

  app.get('/health', async () => ({ status: 'ok', service: 'ai-gateway' }));
  app.get('/providers/health', async () => ({ providers: await gateway.health() }));
  app.get('/models', async (request) => {
    const plan =
      typeof (request.query as { plan?: unknown }).plan === 'string' ? (request.query as { plan: any }).plan : 'free';

    return { models: gateway.models(plan) };
  });

  app.post('/chat/completions', async (request, reply) => {
    /*
     * Shared-secret auth, gated on AI_GATEWAY_REQUIRE_AUTH so the rollout never
     * 401s prod chat: the api is deployed sending the secret (and the secret is
     * provisioned to both pods) BEFORE this flag is flipped to 'true'. Until then
     * the endpoint stays open exactly as before. /health stays unauthenticated
     * (probes). Reuses the timing-safe Bearer check from the agent-run path.
     */
    if ((env.AI_GATEWAY_REQUIRE_AUTH ?? '').trim() === 'true') {
      const authorized = authorizeAgentRun({
        authorizationHeader: request.headers.authorization,
        expectedToken: env.AI_GATEWAY_SHARED_SECRET,
        allowInsecure: false,
      });

      if (!authorized) {
        return reply.code(401).send({ error: 'Unauthorized ai-gateway request.', code: 'AI_GATEWAY_UNAUTHORIZED' });
      }
    }

    const body = request.body as AiChatRequest;

    if (!Array.isArray(body?.messages)) {
      return reply.code(400).send({ error: 'messages is required', code: 'AI_MESSAGES_REQUIRED' });
    }

    if (body.stream) {
      const abortController = new AbortController();
      const onClientClose = () => abortController.abort();
      request.raw.on('close', onClientClose);

      /*
       * gateway.stream() is a lazy generator: route() (which throws 403
       * AI_MODEL_PLAN_BLOCKED / 503 AI_PROVIDER_UNAVAILABLE) and the first provider
       * call only run on the first .next(). Pull that first chunk BEFORE committing
       * the 200 + SSE headers, so those errors return a proper HTTP status instead
       * of a hung 200 stream with no error event (the headers can't be unsent once
       * written).
       */
      const iterator = gateway.stream(body, abortController.signal)[Symbol.asyncIterator]();
      let firstResult: IteratorResult<unknown>;

      try {
        firstResult = await iterator.next();
      } catch (error) {
        request.raw.off('close', onClientClose);

        const rawStatus = (error as { statusCode?: unknown }).statusCode;
        const statusCode = typeof rawStatus === 'number' ? rawStatus : 500;

        return reply.code(statusCode).send({
          error: error instanceof Error ? error.message : 'AI stream failed.',
          code: statusCode >= 400 && statusCode < 500 ? 'AI_STREAM_BAD_REQUEST' : 'AI_STREAM_FAILED',
        });
      }

      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });

      try {
        let result = firstResult;

        while (!result.done) {
          if (abortController.signal.aborted || reply.raw.writableEnded) {
            break;
          }

          const flushed = reply.raw.write(`data: ${JSON.stringify(result.value)}\n\n`);

          /*
           * Respect backpressure: when the socket buffer is full write() returns
           * false. Without waiting for 'drain', a fast provider + slow client
           * buffers the entire stream in the pod's memory. Wait for drain (or a
           * disconnect) before pulling the next delta.
           */
          if (!flushed) {
            await new Promise<void>((resolve) => {
              const finish = () => {
                reply.raw.off('drain', finish);
                reply.raw.off('close', finish);
                resolve();
              };

              reply.raw.once('drain', finish);
              reply.raw.once('close', finish);
            });
          }

          result = await iterator.next();
        }
      } finally {
        request.raw.off('close', onClientClose);
        await iterator.return?.(undefined);
      }

      if (!reply.raw.writableEnded) {
        reply.raw.end();
      }

      return reply;
    }

    /*
     * Wire client-disconnect to an abort, like the streaming branch. Without it,
     * a non-streaming completion kept the (paid) upstream LLM call running to
     * completion after the client gave up — wasted tokens/cost and a leaked
     * upstream connection per abandoned request.
     */
    const abortController = new AbortController();
    const onClientClose = () => abortController.abort();
    request.raw.on('close', onClientClose);

    try {
      return await gateway.complete(body, abortController.signal);
    } finally {
      request.raw.off('close', onClientClose);
    }
  });

  app.post('/v1/agent-runs', async (request, reply) => {
    if (
      !authorizeAgentRun({
        authorizationHeader: request.headers.authorization,
        expectedToken: env.ECODE_SUBAGENT_EXECUTOR_TOKEN,
        // Only fail-open with no token outside production (local dev/test convenience).
        allowInsecure: (env.NODE_ENV ?? 'production') !== 'production',
      })
    ) {
      return reply.code(401).send({ error: 'Unauthorized agent executor request.', code: 'AGENT_RUN_UNAUTHORIZED' });
    }

    try {
      const body = parseAgentRunRequest(request.body);
      // Prefer an explicit per-tenant key, then the org id, then the (pod) IP.
      // Without rateLimitKey/organizationId the limiter collapsed to one global
      // bucket keyed on the caller pod's IP → cross-tenant DoS.
      const rateLimitKey = body.rateLimitKey ?? body.organizationId ?? request.ip;
      const rateLimit = await agentRunRateLimiter.check(rateLimitKey);

      reply.header('x-ratelimit-limit', String(agentRunRateLimit));
      reply.header('x-ratelimit-remaining', String(rateLimit.remaining));
      reply.header('x-ratelimit-reset', String(Math.ceil(rateLimit.resetAt / 1000)));
      reply.header('x-ratelimit-backend', agentRunRateLimiter.backend);

      if (!rateLimit.allowed) {
        return reply.code(429).send({
          error: 'Agent executor rate limit exceeded.',
          code: 'AGENT_RUN_RATE_LIMITED',
          retryAfterSeconds: Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
        });
      }

      const abortController = new AbortController();
      const onClientClose = () => abortController.abort();
      request.raw.on('close', onClientClose);

      try {
        return await executeAgentRun({
          gateway,
          request: body,
          persistence: agentRunPersistence,
          signal: abortController.signal,
        });
      } finally {
        request.raw.off('close', onClientClose);
      }
    } catch (error) {
      /*
       * Use the error's ACTUAL statusCode (the old ternary collapsed every coded
       * error to 400 and everything else to 500, discarding 401/403/429/etc).
       */
      const rawStatus = (error as { statusCode?: unknown }).statusCode;
      const statusCode = typeof rawStatus === 'number' ? rawStatus : 500;
      return reply.code(statusCode).send({
        error: error instanceof Error ? error.message : 'Agent run failed.',
        code: statusCode >= 400 && statusCode < 500 ? 'AGENT_RUN_BAD_REQUEST' : 'AGENT_RUN_FAILED',
      });
    }
  });

  return app;
}
