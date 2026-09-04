import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApiApp, type ApiAppOptions } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

function buildTestApiApp(options: ApiAppOptions = {}) {
  return buildApiApp({ emailProvider: new QuietEmailProvider(), ...options });
}

async function registerUser(app: Awaited<ReturnType<typeof buildTestApiApp>>, email: string) {
  const register = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'password123', name: 'Feedback Tester', organizationName: 'FeedbackOrg' },
  });
  expect(register.statusCode).toBe(201);

  return (register.json() as { token: string }).token;
}

describe('AI message feedback routes', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'msgfb-state-secret-do-not-ship';
    process.env.ENCRYPTION_SECRET = 'msgfb-encryption-secret-do-not-ship';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('requires authentication', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });

    const response = await app.inject({
      method: 'POST',
      url: '/api/ai/message-feedback',
      payload: { messageId: 'msg-1', vote: 'up' },
    });

    expect(response.statusCode).toBe(401);
    expect(store.aiMessageFeedback.size).toBe(0);

    await app.close();
  });

  it('records, changes, and retracts a vote without duplicating rows', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const token = await registerUser(app, 'voter@example.com');

    const up = await app.inject({
      method: 'POST',
      url: '/api/ai/message-feedback',
      headers: { authorization: `Bearer ${token}` },
      payload: { messageId: 'msg-1', vote: 'up', chatId: 'chat-1' },
    });

    expect(up.statusCode).toBe(201);

    const upFeedback = (up.json() as { feedback: { id: string; vote: string; chatId: string | null } }).feedback;
    expect(upFeedback.vote).toBe('up');
    expect(upFeedback.chatId).toBe('chat-1');

    const down = await app.inject({
      method: 'POST',
      url: '/api/ai/message-feedback',
      headers: { authorization: `Bearer ${token}` },
      payload: { messageId: 'msg-1', vote: 'down' },
    });

    expect(down.statusCode).toBe(201);

    const downFeedback = (down.json() as { feedback: { id: string; vote: string; chatId: string | null } }).feedback;
    expect(downFeedback.id).toBe(upFeedback.id);
    expect(downFeedback.vote).toBe('down');
    expect(downFeedback.chatId).toBe('chat-1');
    expect(store.aiMessageFeedback.size).toBe(1);

    const retract = await app.inject({
      method: 'POST',
      url: '/api/ai/message-feedback',
      headers: { authorization: `Bearer ${token}` },
      payload: { messageId: 'msg-1', vote: null },
    });

    expect(retract.statusCode).toBe(200);
    expect((retract.json() as { removed: boolean }).removed).toBe(true);
    expect(store.aiMessageFeedback.size).toBe(0);

    const retractAgain = await app.inject({
      method: 'POST',
      url: '/api/ai/message-feedback',
      headers: { authorization: `Bearer ${token}` },
      payload: { messageId: 'msg-1', vote: null },
    });

    expect(retractAgain.statusCode).toBe(200);
    expect((retractAgain.json() as { removed: boolean }).removed).toBe(false);

    await app.close();
  });

  it("cannot retract another user's vote", async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const tokenA = await registerUser(app, 'usera@example.com');
    const tokenB = await registerUser(app, 'userb@example.com');

    const vote = await app.inject({
      method: 'POST',
      url: '/api/ai/message-feedback',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { messageId: 'shared-msg', vote: 'up' },
    });
    expect(vote.statusCode).toBe(201);

    const retract = await app.inject({
      method: 'POST',
      url: '/api/ai/message-feedback',
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { messageId: 'shared-msg', vote: null },
    });

    expect(retract.statusCode).toBe(200);
    expect((retract.json() as { removed: boolean }).removed).toBe(false);
    expect(store.aiMessageFeedback.size).toBe(1);

    await app.close();
  });

  it('rejects an invalid vote value', async () => {
    const store = new TestApiStore();
    const app = await buildTestApiApp({ store });
    const token = await registerUser(app, 'invalid@example.com');

    const response = await app.inject({
      method: 'POST',
      url: '/api/ai/message-feedback',
      headers: { authorization: `Bearer ${token}` },
      payload: { messageId: 'msg-1', vote: 'sideways' },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);
    expect(store.aiMessageFeedback.size).toBe(0);

    await app.close();
  });
});
