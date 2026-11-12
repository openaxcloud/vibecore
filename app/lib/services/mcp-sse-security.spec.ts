import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { DataStreamWriter, Message } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { MCPService } from './mcpService';
import { TOOL_EXECUTION_APPROVAL, TOOL_EXECUTION_ERROR } from '~/utils/constants';
import { logger } from '~/utils/logger';

const logBoundary = vi.hoisted(() => ({ records: [] as unknown[][] }));

vi.mock('~/utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/utils/logger')>();

  return {
    ...actual,
    createScopedLogger(scope: string) {
      const sink = actual.createScopedLogger(scope);

      return {
        ...sink,
        debug(...args: unknown[]) {
          logBoundary.records.push(args);
          sink.debug(...args);
        },
        error(...args: unknown[]) {
          logBoundary.records.push(args);
          sink.error(...args);
        },
        warn(...args: unknown[]) {
          logBoundary.records.push(args);
          sink.warn(...args);
        },
      };
    },
  };
});

const origin = 'https://mcp.example.com';
const syntheticKey = 'synthetic-mcp-test-key';
const transports: SSEClientTransport[] = [];
const services: MCPService[] = [];

afterEach(async () => {
  await Promise.all(transports.splice(0).map((transport) => transport.close()));
  await Promise.all(services.splice(0).map((service) => service.close()));
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function streamResponse() {
  let controller: ReadableStreamDefaultController<Uint8Array>;

  const encoder = new TextEncoder();
  const cancelled = vi.fn();

  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
      controller.enqueue(encoder.encode('event: endpoint\ndata: /messages\n\n'));
    },
    cancel: cancelled,
  });

  return {
    response: new Response(stream, { headers: { 'content-type': 'text/event-stream' } }),
    message(value: unknown) {
      controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(value)}\n\n`));
    },
    cancelled,
  };
}

function transport() {
  const result = new SSEClientTransport(new URL(`${origin}/sse`), {
    requestInit: { headers: { 'x-api-key': syntheticKey } },
  });
  transports.push(result);

  return result;
}

describe('MCP SSE redirect security', () => {
  it('does not log MCP credentials, URL secrets, command arguments or raw provider errors', async () => {
    const secrets = [
      'header-canary-763',
      'query-canary-763',
      'password-canary-763',
      'command-canary-763',
      'arg-canary-763',
    ];

    logBoundary.records.length = 0;

    const logged = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    logger.setLevel('debug');
    vi.stubEnv('MCP_ALLOW_STDIO_SERVERS', 'false');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error(secrets.join(' '));
      }),
    );

    const service = new MCPService();
    services.push(service);

    const result = await service.updateConfig({
      mcpServers: {
        sse: {
          type: 'sse',
          url: `https://user:${secrets[2]}@mcp.example.com/sse?key=${secrets[1]}`,
          headers: { 'x-api-key': secrets[0] },
        },
        http: {
          type: 'streamable-http',
          url: `${origin}/http?key=${secrets[1]}`,
          headers: { authorization: secrets[0] },
        },
        stdio: { type: 'stdio', command: secrets[3], args: [secrets[4]] },
      },
    });
    expect(Object.values(result).every((server) => server.status === 'unavailable')).toBe(true);

    // Inspect arguments before both console and optional debug capture receive them.
    const output = JSON.stringify([logged.mock.calls, logBoundary.records]);
    expect(output).toContain('serverCount');
    expect(output).toContain('MCP_CONNECTION_FAILED');
    expect(output).toContain('MCP_CONFIGURATION_REJECTED');

    for (const secret of secrets) {
      expect(output).not.toContain(secret);
    }
  });

  it('keeps tool failure results without logging tool input or raw provider errors', async () => {
    logBoundary.records.length = 0;

    const service = new MCPService();
    const secret = 'tool-secret-canary-763';
    services.push(service);
    service.tools.testTool = {
      parameters: z.object({ secret: z.string() }),
      execute: async () => {
        throw new Error(secret);
      },
    };

    const messages: Message[] = [
      {
        id: 'test-message',
        role: 'assistant',
        content: '',
        parts: [
          {
            type: 'tool-invocation',
            toolInvocation: {
              state: 'result',
              toolCallId: 'test-call',
              toolName: 'testTool',
              args: { secret },
              result: TOOL_EXECUTION_APPROVAL.APPROVE,
            },
          },
        ],
      },
    ];

    const write = vi.fn();
    const result = await service.processToolInvocations(messages, { write } as unknown as DataStreamWriter);
    expect(result[0].parts?.[0]).toMatchObject({ toolInvocation: { result: TOOL_EXECUTION_ERROR } });
    expect(write).toHaveBeenCalledOnce();

    const output = JSON.stringify(logBoundary.records);
    expect(output).not.toContain(secret);
    expect(output).toContain(TOOL_EXECUTION_ERROR);
  });

  it('closes a failed SSE start and does not leave reconnect attempts running', async () => {
    vi.useFakeTimers();

    const close = vi.spyOn(SSEClientTransport.prototype, 'close');
    const originalStart = SSEClientTransport.prototype.start;
    vi.spyOn(SSEClientTransport.prototype, 'start').mockImplementation(function (this: SSEClientTransport) {
      transports.push(this);
      return originalStart.call(this);
    });

    const signals: Array<AbortSignal | null | undefined> = [];

    const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init?.signal);
      throw new Error('synthetic offline');
    });
    vi.stubGlobal('fetch', fetch);

    const service = new MCPService();
    services.push(service);

    const result = await service.updateConfig({
      mcpServers: {
        test: { type: 'sse', url: `${origin}/sse`, headers: { 'x-api-key': syntheticKey } },
      },
    });
    expect(result.test.status).toBe('unavailable');
    expect(signals).toHaveLength(1);

    /*
     * EventSource drops the controller of an already rejected fetch before
     * scheduling reconnect; verify close and timer cleanup, not that stale signal.
     */
    expect(close).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('refuses a cross-origin redirect before forwarding the SSE GET headers', async () => {
    const requests: Array<{ url: string; mode: RequestRedirect | undefined }> = [];
    const target = 'https://other.example.net/collect';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ url: String(url), mode: init?.redirect });

        /*
         * Model the fetch boundary: manual mode exposes the redirect to the SDK;
         * default mode would already have followed it with the custom header.
         */
        if (init?.redirect !== 'manual' && init?.redirect !== 'error') {
          requests.push({ url: target, mode: init?.redirect });
        }

        return new Response(null, { status: 307, headers: { location: target } });
      }),
    );

    const service = new MCPService();
    services.push(service);

    const result = await service.updateConfig({
      mcpServers: { test: { type: 'sse', url: `${origin}/sse`, headers: { 'x-api-key': syntheticKey } } },
    });
    expect(result.test.status).toBe('unavailable');
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`${origin}/sse`);
  });

  it('refuses a cross-origin POST redirect without resending headers or body', async () => {
    const events = streamResponse();
    const posts: Array<{ url: string; body: unknown; mode: RequestRedirect | undefined }> = [];
    const target = 'https://other.example.net/collect';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url) === `${origin}/sse`) {
          return events.response;
        }

        posts.push({ url: String(url), body: init?.body, mode: init?.redirect });

        if (init?.redirect !== 'manual' && init?.redirect !== 'error') {
          posts.push({ url: target, body: init?.body, mode: init?.redirect });
        }

        return new Response(null, { status: 308, headers: { location: target } });
      }),
    );

    const client = transport();
    await client.start();
    await expect(client.send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).rejects.toThrow();
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe(`${origin}/messages`);
    expect(posts[0].body).toContain('tools/list');
  });

  it('keeps the real service handshake, custom headers, tools and close working', async () => {
    const events = streamResponse();
    const calls: Array<{ url: string; key: string | null; method: string; signal?: AbortSignal | null }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(url),
          key: new Headers(init?.headers).get('x-api-key'),
          method: init?.method ?? 'GET',
          signal: init?.signal,
        });

        if (String(url) === `${origin}/sse`) {
          return events.response;
        }

        expect(String(url)).toBe(`${origin}/messages`);

        const message = JSON.parse(String(init?.body));

        if (message.method === 'initialize') {
          events.message({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'test', version: '1' },
            },
          });
        } else if (message.method === 'tools/list') {
          events.message({ jsonrpc: '2.0', id: message.id, result: { tools: [] } });
        }

        return new Response(null, { status: 202 });
      }),
    );

    const service = new MCPService();
    services.push(service);

    const result = await service.updateConfig({
      mcpServers: {
        test: {
          type: 'sse',
          url: `${origin}/sse`,
          headers: { 'x-api-key': syntheticKey },
        },
      },
    });
    expect(result.test.status).toBe('available');
    expect(calls.some((call) => call.method === 'GET')).toBe(true);
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(3);
    expect(calls.every((call) => call.key === syntheticKey)).toBe(true);
    await service.close();
    expect(calls.find((call) => call.method === 'GET')?.signal?.aborted).toBe(true);
  });
});
