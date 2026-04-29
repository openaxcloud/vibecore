import Fastify from 'fastify';
import { AiGateway, type AiChatRequest } from './gateway.js';

const app = Fastify({ logger: true });
const gateway = new AiGateway();

app.get('/health', async () => ({ status: 'ok', service: 'ai-gateway' }));
app.get('/providers/health', async () => ({ providers: await gateway.health() }));
app.get('/models', async (request) => {
  const plan = typeof (request.query as { plan?: unknown }).plan === 'string' ? (request.query as { plan: any }).plan : 'free';

  return { models: gateway.models(plan) };
});

app.post('/chat/completions', async (request, reply) => {
  const body = request.body as AiChatRequest;

  if (!Array.isArray(body?.messages)) {
    return reply.code(400).send({ error: 'messages is required', code: 'AI_MESSAGES_REQUIRED' });
  }

  if (body.stream) {
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });

    for await (const chunk of gateway.stream(body)) {
      reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    reply.raw.end();
    return reply;
  }

  return gateway.complete(body);
});

const port = Number(process.env.AI_GATEWAY_PORT ?? 3030);
await app.listen({ host: '0.0.0.0', port });
