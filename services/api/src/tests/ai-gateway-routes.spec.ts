import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import { TestApiStore } from './test-api-store.js';
import type { EmailProvider } from '../email.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const AI_GATEWAY_URL = 'http://ai-gateway.test:3030';

function buildTestApiApp(options: ApiAppOptions = {}) {
  return buildApiApp({ emailProvider: new QuietEmailProvider(), aiGatewayUrl: AI_GATEWAY_URL, ...options });
}

async function registerUser(app: Awaited<ReturnType<typeof buildTestApiApp>>, email: string) {
  const register = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: 'AI Tester', organizationName: 'AiOrg' },
  });
  expect(register.statusCode).toBe(201);

  const body = register.json() as { token: string; organization: { id: string } };

  return { token: body.token, organizationId: body.organization.id };
}

async function createConversation(app: Awaited<ReturnType<typeof buildTestApiApp>>, token: string, orgId: string) {
  const project = await app.inject({
    method: 'POST',
    url: `/orgs/${orgId}/projects`,
    headers: { authorization: `Bearer ${token}` },
    payload: { name: 'ai-project' },
  });
  expect(project.statusCode).toBe(201);
  const projectId = (project.json() as { project: { id: string } }).project.id;

  const conversation = await app.inject({
    method: 'POST',
    url: `/projects/${projectId}/ai/conversations`,
    headers: { authorization: `Bearer ${token}` },
    payload: { title: 'Chat' },
  });
  expect(conversation.statusCode).toBe(201);
  const conversationId = (conversation.json() as { conversation: { id: string } }).conversation.id;

  return { projectId, conversationId };
}

describe('AI conversation message routes', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'ai-state-secret-do-not-ship';
    process.env.ENCRYPTION_SECRET = 'ai-encryption-secret-do-not-ship';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it('returns a coded 502 (not an opaque 500) when the ai-gateway is unreachable', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const { token, organizationId } = await registerUser(app, 'unreachable@example.com');
    const { projectId, conversationId } = await createConversation(app, token, organizationId);

    // Simulate the gateway being unreachable (DNS/connection refused). The
    // un-guarded fetch used to let this bubble up as a generic 500 API_ERROR.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED');
      }),
    );

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/ai/conversations/${conversationId}/messages`,
      headers: { authorization: `Bearer ${token}` },
      payload: { content: 'Build me a hello world page' },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('AI_GATEWAY_UNAVAILABLE');

    await app.close();
  });

  it('persists the assistant reply when the ai-gateway responds', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const { token, organizationId } = await registerUser(app, 'reachable@example.com');
    const { projectId, conversationId } = await createConversation(app, token, organizationId);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Parameters<typeof fetch>[0]) => {
        const url = String(input);
        expect(url).toBe(`${AI_GATEWAY_URL}/chat/completions`);

        return new Response(
          JSON.stringify({
            provider: 'anthropic',
            model: 'claude-sonnet-4-6',
            content: 'Here is your hello world page.',
            usage: { inputTokens: 12, outputTokens: 8, estimatedCostCents: 1 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/ai/conversations/${conversationId}/messages`,
      headers: { authorization: `Bearer ${token}` },
      payload: { content: 'Build me a hello world page' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { assistantMessage: { content: string }; usage: { outputTokens: number } };
    expect(body.assistantMessage.content).toBe('Here is your hello world page.');
    expect(body.usage.outputTokens).toBe(8);

    await app.close();
  });

  it('syncs a streamed IDE transcript without making a second gateway call', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const { token, organizationId } = await registerUser(app, 'transcript-sync@example.com');
    const { projectId, conversationId } = await createConversation(app, token, organizationId);
    const gatewayFetch = vi.fn();
    vi.stubGlobal('fetch', gatewayFetch);

    const payload = {
      messages: [
        { clientId: 'user-turn-1', role: 'user', content: 'Make the composer compact.' },
        { clientId: 'assistant-turn-1', role: 'assistant', content: 'I reduced the composer height.' },
      ],
    };

    const firstSync = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/ai/conversations/${conversationId}/transcript`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(firstSync.statusCode).toBe(200);

    const retrySync = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/ai/conversations/${conversationId}/transcript`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(retrySync.statusCode).toBe(200);

    const messages = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/ai/conversations/${conversationId}/messages`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(messages.statusCode).toBe(200);
    const syncedMessages = (messages.json() as { messages: Array<{ role: string; content: string }> }).messages;

    expect(syncedMessages).toHaveLength(2);
    expect(syncedMessages).toMatchObject([
      { role: 'user', content: 'Make the composer compact.' },
      {
        role: 'assistant',
        content: 'I reduced the composer height.',
      },
    ]);
    expect(gatewayFetch).not.toHaveBeenCalled();

    await app.close();
  });
});
