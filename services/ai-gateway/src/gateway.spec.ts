import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { AiGateway } from './gateway.js';

async function startProvider(responder: (body: string, response: import('node:http').ServerResponse) => void) {
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk.toString();
    });
    request.on('end', () => responder(body, response));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Provider test server did not start');
  }

  return { server, url: `http://127.0.0.1:${address.port}/v1` };
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.AI_FALLBACK_PROVIDERS;
});

describe('AiGateway', () => {
  it('routes by plan and falls back to the next configured provider', async () => {
    const failing = await startProvider((_body, response) => {
      response.writeHead(503).end('down');
    });
    const working = await startProvider((body, response) => {
      expect(JSON.parse(body).messages[1].content).toContain('change');
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message: { content: 'patched' } }] }));
    });
    servers.push(failing.server, working.server);
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.OPENROUTER_API_KEY = 'openrouter-key';
    process.env.OPENAI_BASE_URL = failing.url;
    process.env.OPENROUTER_BASE_URL = working.url;
    process.env.AI_FALLBACK_PROVIDERS = 'openrouter';

    const gateway = new AiGateway();
    const result = await gateway.complete({
      plan: 'business',
      provider: 'openai',
      model: 'gpt-4.1',
      messages: [
        { role: 'system', content: 'system policy' },
        { role: 'user', content: 'change the file' },
      ],
    });

    expect(result.provider).toBe('openrouter');
    expect(result.content).toBe('patched');
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.estimatedCostCents).toBeGreaterThanOrEqual(0);
  });

  it('streams deltas from OpenAI-compatible providers', async () => {
    const provider = await startProvider((_body, response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write('data: {"choices":[{"delta":{"content":"hel"}}]}\n\n');
      response.write('data: {"choices":[{"delta":{"content":"lo"}}]}\n\n');
      response.end('data: [DONE]\n\n');
    });
    servers.push(provider.server);
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.OPENAI_BASE_URL = provider.url;

    const gateway = new AiGateway();
    const chunks = [];

    for await (const chunk of gateway.stream({
      plan: 'pro',
      provider: 'openai',
      model: 'gpt-4.1',
      stream: true,
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks.filter((chunk) => chunk.type === 'delta').map((chunk) => chunk.content).join('')).toBe('hello');
    expect(chunks.at(-1)?.type).toBe('done');
  });
});
