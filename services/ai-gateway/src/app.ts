import Fastify from 'fastify';
import { Redis } from 'ioredis';
import {
  authorizeAgentRun,
  createAgentRunRateLimiter,
  createRedisAgentRunRateLimiter,
  executeAgentRun,
  executeAgentRunStream,
  parseAgentRunRequest,
  positiveIntegerOrDefault,
  type AgentRunRateLimiter,
  type RedisRateLimitClient,
} from './agent-executor.js';
import { createDefaultAgentRunPersistence, type AgentRunPersistence } from './agent-run-persistence.js';
import { surDeconnexionClient } from './client-disconnect.js';
import { AiGateway, type AiChatRequest } from './gateway.js';
import { aiGatewayLocaleFromHeader, aiGatewayMessage, localizedAiGatewayError } from './public-i18n.js';

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

  /*
   * ioredis emits a process-level 'error' event on any connection fault; with no
   * listener that becomes an unhandled 'error' and CRASHES the pod on a transient
   * Redis blip. The per-command eval() catch already fails open for rate-limiting,
   * so just log+swallow connection errors here (mirrors the worker's guard).
   */
  redis?.on('error', (error) => {
    console.error('ai-gateway redis client error', error);
  });

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

  app.addHook('onRequest', async (request, reply) => {
    const locale = aiGatewayLocaleFromHeader(request.headers['accept-language']);
    reply.header('content-language', locale);
    reply.header('vary', 'Accept-Language');
  });

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
    const locale = aiGatewayLocaleFromHeader(request.headers['accept-language']);
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
        return reply
          .code(401)
          .send({ error: aiGatewayMessage('gatewayUnauthorized', locale), code: 'AI_GATEWAY_UNAUTHORIZED' });
      }
    }

    const body = { ...(request.body as AiChatRequest), locale };

    if (!Array.isArray(body?.messages)) {
      return reply
        .code(400)
        .send({ error: aiGatewayMessage('chatMessagesRequired', locale), code: 'AI_MESSAGES_REQUIRED' });
    }

    if (body.stream) {
      const abortController = new AbortController();
      const detacherDeconnexion = surDeconnexionClient(reply.raw, () => abortController.abort());

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
        detacherDeconnexion();

        const rawStatus = (error as { statusCode?: unknown }).statusCode;
        const statusCode = typeof rawStatus === 'number' ? rawStatus : 500;

        return reply.code(statusCode).send({
          error: localizedAiGatewayError(error, locale, 'aiStreamFailed'),
          code: statusCode >= 400 && statusCode < 500 ? 'AI_STREAM_BAD_REQUEST' : 'AI_STREAM_FAILED',
        });
      }

      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'content-language': locale,
        vary: 'Accept-Language',
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
                reply.raw.off('error', finish);
                resolve();
              };

              reply.raw.once('drain', finish);
              reply.raw.once('close', finish);
              // Also settle on a socket 'error' — otherwise a write error that does
              // not immediately emit 'close' would hang this await and stall the
              // stream loop, leaking the upstream iterator.
              reply.raw.once('error', finish);
            });
          }

          result = await iterator.next();
        }
      } catch (error) {
        /*
         * A provider error AFTER the first chunk (the 200 + SSE headers are already
         * committed and cannot be unsent). Previously this propagated unhandled,
         * tearing the connection with no signal — the client saw a silent
         * truncation. Emit a terminal SSE error frame so the consumer can surface
         * a real failure, then fall through to the finally for cleanup.
         */
        const message = localizedAiGatewayError(error, locale, 'aiStreamFailed');
        request.log?.error?.({ err: error }, 'ai-gateway stream interrupted mid-flight');

        if (!reply.raw.writableEnded) {
          try {
            reply.raw.write(`data: ${JSON.stringify({ error: message, code: 'AI_STREAM_INTERRUPTED' })}\n\n`);
          } catch {
            // socket already closed — nothing further to emit
          }
        }
      } finally {
        detacherDeconnexion();
        await iterator.return?.(undefined).catch(() => {});
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
    const detacherDeconnexion = surDeconnexionClient(reply.raw, () => abortController.abort());

    try {
      return await gateway.complete(body, abortController.signal);
    } catch (error) {
      /*
       * Preserve the error's ACTUAL statusCode (403 AI_MODEL_PLAN_BLOCKED, 429,
       * provider 4xx, …) instead of letting it surface as a generic Fastify 500.
       * Mirrors the streaming + agent-runs branches.
       */
      const rawStatus = (error as { statusCode?: unknown }).statusCode;
      const statusCode = typeof rawStatus === 'number' ? rawStatus : 500;

      return reply.code(statusCode).send({
        error: localizedAiGatewayError(error, locale, 'completionFailed'),
        code: statusCode >= 400 && statusCode < 500 ? 'AI_COMPLETION_BAD_REQUEST' : 'AI_COMPLETION_FAILED',
      });
    } finally {
      detacherDeconnexion();
    }
  });

  app.post('/v1/agent-runs', async (request, reply) => {
    const locale = aiGatewayLocaleFromHeader(request.headers['accept-language']);
    if (
      !authorizeAgentRun({
        authorizationHeader: request.headers.authorization,

        /*
         * Fall back to the chart-owned AI_GATEWAY_SHARED_SECRET (already
         * provisioned to every pod and used for /chat/completions auth) when no
         * dedicated executor token is configured. This lets parallel sub-agents
         * be enabled with only a flag + URL — no new Secret Manager entry /
         * operator action — while staying fail-closed (both still unset → 401 in
         * prod via allowInsecure:false).
         */
        expectedToken: env.ECODE_SUBAGENT_EXECUTOR_TOKEN || env.AI_GATEWAY_SHARED_SECRET,

        // Only fail-open with no token outside production (local dev/test convenience).
        allowInsecure: (env.NODE_ENV ?? 'production') !== 'production',
      })
    ) {
      return reply
        .code(401)
        .send({ error: aiGatewayMessage('executorUnauthorized', locale), code: 'AGENT_RUN_UNAUTHORIZED' });
    }

    try {
      const body = { ...parseAgentRunRequest(request.body), locale };

      /*
       * Prefer an explicit per-tenant key, then the org id, then the (pod) IP.
       * Without rateLimitKey/organizationId the limiter collapsed to one global
       * bucket keyed on the caller pod's IP → cross-tenant DoS.
       */
      const rateLimitKey = body.rateLimitKey ?? body.organizationId ?? request.ip;
      const rateLimit = await agentRunRateLimiter.check(rateLimitKey);

      reply.header('x-ratelimit-limit', String(agentRunRateLimit));
      reply.header('x-ratelimit-remaining', String(rateLimit.remaining));
      reply.header('x-ratelimit-reset', String(Math.ceil(rateLimit.resetAt / 1000)));
      reply.header('x-ratelimit-backend', agentRunRateLimiter.backend);

      if (!rateLimit.allowed) {
        return reply.code(429).send({
          error: aiGatewayMessage('executorRateLimited', locale),
          code: 'AGENT_RUN_RATE_LIMITED',
          retryAfterSeconds: Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
        });
      }

      const abortController = new AbortController();
      const detacherDeconnexion = surDeconnexionClient(reply.raw, () => abortController.abort());

      try {
        return await executeAgentRun({
          gateway,
          request: body,
          persistence: agentRunPersistence,
          signal: abortController.signal,
        });
      } finally {
        detacherDeconnexion();
      }
    } catch (error) {
      /*
       * Use the error's ACTUAL statusCode (the old ternary collapsed every coded
       * error to 400 and everything else to 500, discarding 401/403/429/etc).
       */
      const rawStatus = (error as { statusCode?: unknown }).statusCode;
      const statusCode = typeof rawStatus === 'number' ? rawStatus : 500;

      return reply.code(statusCode).send({
        error: localizedAiGatewayError(error, locale, 'agentRunFailed'),
        code: statusCode >= 400 && statusCode < 500 ? 'AGENT_RUN_BAD_REQUEST' : 'AGENT_RUN_FAILED',
      });
    }
  });

  /*
   * SSE variant of /v1/agent-runs: streams each specialist lane token-by-token as
   * it works so the IDE can render the parallel sub-agents live (Replit-style),
   * instead of waiting for the whole run. Same auth + rate limit as the JSON route.
   */
  app.post('/v1/agent-runs/stream', async (request, reply) => {
    const locale = aiGatewayLocaleFromHeader(request.headers['accept-language']);
    if (
      !authorizeAgentRun({
        authorizationHeader: request.headers.authorization,
        expectedToken: env.ECODE_SUBAGENT_EXECUTOR_TOKEN || env.AI_GATEWAY_SHARED_SECRET,
        allowInsecure: (env.NODE_ENV ?? 'production') !== 'production',
      })
    ) {
      return reply
        .code(401)
        .send({ error: aiGatewayMessage('executorUnauthorized', locale), code: 'AGENT_RUN_UNAUTHORIZED' });
    }

    let body;

    try {
      body = { ...parseAgentRunRequest(request.body), locale };
    } catch (error) {
      const rawStatus = (error as { statusCode?: unknown }).statusCode;
      const statusCode = typeof rawStatus === 'number' ? rawStatus : 400;

      return reply.code(statusCode).send({
        error: localizedAiGatewayError(error, locale, 'agentRunFailed'),
        code: 'AGENT_RUN_BAD_REQUEST',
      });
    }

    const rateLimitKey = body.rateLimitKey ?? body.organizationId ?? request.ip;
    const rateLimit = await agentRunRateLimiter.check(rateLimitKey);

    const rateLimitHeaders = {
      'x-ratelimit-limit': String(agentRunRateLimit),
      'x-ratelimit-remaining': String(rateLimit.remaining),
      'x-ratelimit-reset': String(Math.ceil(rateLimit.resetAt / 1000)),
      'x-ratelimit-backend': agentRunRateLimiter.backend,
    };

    for (const [header, value] of Object.entries(rateLimitHeaders)) {
      reply.header(header, value);
    }

    if (!rateLimit.allowed) {
      return reply.code(429).send({
        error: aiGatewayMessage('executorRateLimited', locale),
        code: 'AGENT_RUN_RATE_LIMITED',
        retryAfterSeconds: Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
      });
    }

    const abortController = new AbortController();
    const detacherDeconnexion = surDeconnexionClient(reply.raw, () => abortController.abort());

    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'content-language': locale,
      vary: 'Accept-Language',
      ...rateLimitHeaders,
    });

    try {
      for await (const event of executeAgentRunStream({
        gateway,
        request: body,
        persistence: agentRunPersistence,
        signal: abortController.signal,
      })) {
        if (abortController.signal.aborted || reply.raw.writableEnded) {
          break;
        }

        const flushed = reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);

        /*
         * Respect backpressure (see /chat/completions stream): wait for drain so a
         * fast run + slow client can't buffer the whole stream in the pod's heap.
         */
        if (!flushed) {
          await new Promise<void>((resolve) => {
            const finish = () => {
              reply.raw.off('drain', finish);
              reply.raw.off('close', finish);
              reply.raw.off('error', finish);
              resolve();
            };

            reply.raw.once('drain', finish);
            reply.raw.once('close', finish);
            // Settle on a socket 'error' too (matches /chat/completions) so a
            // write error that doesn't emit 'close' can't hang the run loop.
            reply.raw.once('error', finish);
          });
        }
      }
    } catch (error) {
      if (!reply.raw.writableEnded) {
        reply.raw.write(
          `data: ${JSON.stringify({ type: 'error', error: localizedAiGatewayError(error, locale, 'agentRunFailed') })}\n\n`,
        );
      }
    } finally {
      detacherDeconnexion();
    }

    if (!reply.raw.writableEnded) {
      reply.raw.end();
    }

    return reply;
  });

  return app;
}
