import { hashPassword } from '@vibecore/auth';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AgentMemoryConfigurationError } from '../agent-memory.js';
import { appPublicCopy, appPublicEnglish } from '../app-public-copy.js';
import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * Found by the QA sweep on the audit environment: GET /agent-memory answered
 *   503 {"error":"Internal server error","code":"AGENT_MEMORY_UNCONFIGURED"}
 * The code was right, the human-readable half was not — a feature that is
 * simply not wired in this environment was reported as a server FAULT.
 *
 * The 5xx branch of the error handler masks `message` unless the error carries
 * a `publicMessage`, so that is what must be present.
 */
describe('AgentMemoryConfigurationError', () => {
  it('carries the coded 503 contract', () => {
    const error = new AgentMemoryConfigurationError('embeddings provider missing') as Error & {
      statusCode?: number;
      code?: string;
    };

    expect(error.statusCode).toBe(503);
    expect(error.code).toBe('AGENT_MEMORY_UNCONFIGURED');
  });

  it('exposes a public message so the 5xx handler does not fall back to "Internal server error"', () => {
    const error = new AgentMemoryConfigurationError('embeddings provider missing') as Error & {
      publicMessage?: string;
    };

    expect(error.publicMessage).toBe(appPublicEnglish('AGENT_MEMORY_UNCONFIGURED'));
    expect(error.publicMessage).not.toMatch(/internal server error/i);

    // It must say what is actually wrong: a configuration gap, not a crash.
    expect(error.publicMessage).toMatch(/not configured/i);
  });

  it('keeps the internal detail on `message` for the logs', () => {
    const error = new AgentMemoryConfigurationError('embeddings provider missing');

    expect(error.message).toBe('embeddings provider missing');
  });
});

describe('agent memory unconfigured public API contract', () => {
  const store = new TestApiStore();
  const logLines: string[] = [];

  let app: Awaited<ReturnType<typeof buildApiApp>>;

  beforeAll(async () => {
    /* Force the real unconfigured branch even on CI workers that provide an OpenAI key. */
    vi.stubEnv('OPENAI_API_KEY', '');

    const emailProvider: EmailProvider = { send: async () => undefined };
    app = await buildApiApp({
      store,
      emailProvider,
      loggerStream: { write: (line) => logLines.push(line) },
    });

    const user = await store.createUser({
      email: 'unconfigured-memory@example.test',
      passwordHash: hashPassword('password123'),
    });
    await store.createSession({
      userId: user.id,
      token: 'unconfigured-memory-token',
      expiresAt: new Date(Date.now() + 60_000),
    });
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it.each([
    ['en', 'en'],
    ['fr', 'fr'],
  ] as const)(
    'returns the stable coded 503 with honest %s copy while preserving diagnostic logs',
    async (header, locale) => {
      const logStart = logLines.length;

      const response = await app.inject({
        method: 'GET',
        url: '/agent-memory',
        headers: {
          authorization: 'Bearer unconfigured-memory-token',
          'accept-language': header,
        },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: appPublicCopy('AGENT_MEMORY_UNCONFIGURED', locale),
        code: 'AGENT_MEMORY_UNCONFIGURED',
      });
      expect(response.json().error).not.toMatch(/internal server error|erreur interne du serveur/i);
      expect(response.headers['content-language']).toBe(locale);

      const logs = logLines.slice(logStart).join('\n');
      expect(logs).toContain('AGENT_MEMORY_UNCONFIGURED');
      expect(logs).toContain('Agent memory requires PostgreSQL pgvector plus OPENAI_API_KEY');
    },
  );
});
