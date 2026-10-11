import { describe, expect, it } from 'vitest';
import { AgentMemoryConfigurationError } from '../agent-memory.js';
import { appPublicEnglish } from '../app-public-copy.js';
import { buildApiApp } from '../app.js';
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

describe('réponse publique de la mémoire non configurée', () => {
  it('répond honnêtement en anglais et en français sans divulguer la configuration interne', async () => {
    const app = await buildApiApp({ store: new TestApiStore() });

    try {
      const inscription = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'memoire-non-configuree@example.com',
          password: 'password123',
          name: 'Mémoire',
          organizationName: 'Mémoire',
        },
      });
      expect(inscription.statusCode).toBe(201);

      const token = inscription.json().token as string;

      for (const langue of ['en', 'fr']) {
        const reponse = await app.inject({
          method: 'GET',
          url: '/agent-memory',
          headers: {
            authorization: `Bearer ${token}`,
            'accept-language': langue,
          },
        });
        expect(reponse.statusCode).toBe(503);
        expect(reponse.json().code).toBe('AGENT_MEMORY_UNCONFIGURED');
        expect(reponse.json().error).not.toMatch(
          /internal server error|erreur interne|OPENAI_API_KEY|pgvector|PostgreSQL/i,
        );
        expect(reponse.json().error).toMatch(langue === 'fr' ? /configur/i : /not configured/i);
      }
    } finally {
      await app.close();
    }
  });
});
