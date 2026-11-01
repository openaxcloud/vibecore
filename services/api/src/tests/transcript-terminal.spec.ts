import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import type { EmailProvider } from '../email.js';
import { transcriptContentHash } from '../transcript-terminal.js';
import { TestApiStore } from './test-api-store.js';

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

describe('persisted terminal receipts', () => {
  beforeEach(() => {
    vi.stubEnv('OAUTH_STATE_SECRET', 'synthetic-terminal-state');
    vi.stubEnv('ENCRYPTION_SECRET', 'synthetic-terminal-encryption');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it('round trips only validated content-bound receipts, preserves equal bytes and rejects stale snapshots', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    try {
      const { token, organizationId } = await registerUser(app, 'terminal-fixture@example.test');
      const { projectId, conversationId } = await createConversation(app, token, organizationId);
      const url = `/projects/${projectId}/ai/conversations/${conversationId}`;
      const headers = { authorization: `Bearer ${token}` };

      const receipt = {
        type: 'streamTerminal',
        contentSha256: transcriptContentHash('Complete response'),
        status: 'complete',
        finishReason: 'stop',
        reason: 'finished',
        segments: 1,
        fileActions: 0,
        openActions: 0,
        openArtifacts: 0,
        messageId: 'client-a',
      };
      const put = (content: string, terminalReceipt?: unknown) =>
        app.inject({
          method: 'PUT',
          url: `${url}/transcript`,
          headers,
          payload: { messages: [{ clientId: 'client-a', role: 'assistant', content, terminalReceipt }] },
        });

      const saved = await put('Complete response', { ...receipt, privatePayload: 'must not persist' });
      expect(saved.statusCode).toBe(200);

      const id = saved.json().messages[0].id;
      expect(saved.json().messages[0].terminalReceipt).toEqual({ ...receipt, messageId: id });
      expect(store.aiMessages.get(id)?.terminalReceipt).not.toHaveProperty('receipt.privatePayload');
      expect((await put('Complete response')).statusCode).toBe(200);
      expect((await put('Complete')).json().messages[0].content).toBe('Complete response');

      const read = await app.inject({ method: 'GET', url: `${url}/messages`, headers });
      expect(read.json().messages[0].terminalReceipt.status).toBe('complete');
      expect((await put('Complete response', { ...receipt, status: 'invented' })).statusCode).toBe(400);
      expect((await put('Complete response', { ...receipt, messageId: 'another-turn' })).statusCode).toBe(400);
      expect((await put('Different answer', receipt)).statusCode).toBe(409);
      expect((await put('Complete response extended', receipt)).statusCode).toBe(409);
      expect(
        (await put('Different answer', { ...receipt, contentSha256: transcriptContentHash('Different answer') }))
          .statusCode,
      ).toBe(409);
      expect(
        (
          await put('Complete response', {
            ...receipt,
            status: 'incomplete',
            finishReason: 'length',
            reason: 'output-limit',
          })
        ).statusCode,
      ).toBe(409);
      const preserved = await app.inject({ method: 'GET', url: `${url}/messages`, headers });
      expect(preserved.json().messages[0].terminalReceipt).toEqual({ ...receipt, messageId: id });
      expect((await put('Different answer')).json().messages[0].terminalReceipt).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
