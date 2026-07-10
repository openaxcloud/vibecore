import { describe, expect, it } from 'vitest';
import { action } from './api.telemetry';

const AUTH = { cookie: 'vc_session=abc123', 'x-real-ip': '10.0.0.1' };

const post = (body: unknown, headers: Record<string, string> = AUTH) =>
  action({
    request: new Request('https://app.e-code.ai/api/telemetry', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
    params: {},
    context: {} as never,
  });

const validEvent = { type: 'diff-edit-apply', outcome: 'applied', estimatedTokensSaved: 900, addedLines: 3 };

describe('api.telemetry action', () => {
  it('rejects non-POST', async () => {
    const res = await action({
      request: new Request('https://app.e-code.ai/api/telemetry', { method: 'GET' }),
      params: {},
      context: {} as never,
    });
    expect(res.status).toBe(405);
  });

  it('accepts a valid authenticated event with 204', async () => {
    const res = await post(validEvent);
    expect(res.status).toBe(204);
  });

  it('drops an anonymous (no session cookie) call with 204, no logging', async () => {
    const res = await post(validEvent, { 'x-real-ip': '10.0.0.2' });
    expect(res.status).toBe(204);
  });

  it('rejects an invalid payload with 400', async () => {
    const res = await post({ type: 'not-a-real-type', estimatedTokensSaved: -5 });
    expect(res.status).toBe(400);
  });

  it('rejects a non-JSON body with 400', async () => {
    const res = await action({
      request: new Request('https://app.e-code.ai/api/telemetry', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...AUTH },
        body: 'not json',
      }),
      params: {},
      context: {} as never,
    });
    expect(res.status).toBe(400);
  });

  it('rate-limits a flood from one IP (429 after the window budget)', async () => {
    const ip = { cookie: 'vc_session=flood', 'x-real-ip': '203.0.113.9' };

    let sawLimit = false;

    for (let i = 0; i < 260; i += 1) {
      const res = await post(validEvent, ip);

      if (res.status === 429) {
        sawLimit = true;
        break;
      }
    }

    expect(sawLimit).toBe(true);
  });
});
