import { describe, expect, it, vi } from 'vitest';

import { claudeConnector } from './claude.js';
import { figmaConnector } from './figma.js';

describe('Figma and Claude API-key connector validation', () => {
  it('validates a Figma token against /v1/me and returns only public account identity', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(String(input)).toBe('https://api.figma.com/v1/me');
      expect(new Headers(init?.headers).get('x-figma-token')).toBe('figma-credential');

      return Response.json({ id: 'figma-user-1', handle: 'Design team', email: 'design@example.com' });
    });

    await expect(figmaConnector.testApiKey?.({ apiKey: 'figma-credential', fetchImpl })).resolves.toEqual({
      ok: true,
      userInfo: { externalAccountId: 'figma-user-1', externalAccountLabel: 'Design team' },
    });
  });

  it('uses a one-way stable Claude connection id and exposes no credential fragment', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ data: [{ id: 'claude-model-id', display_name: 'Claude verified model' }] }),
    );

    const first = await claudeConnector.testApiKey?.({ apiKey: 'claude-credential', fetchImpl });
    const second = await claudeConnector.testApiKey?.({ apiKey: 'claude-credential', fetchImpl });

    expect(first?.ok).toBe(true);
    expect(first?.userInfo?.externalAccountId).toBe(second?.userInfo?.externalAccountId);
    expect(first?.userInfo?.externalAccountId).toMatch(/^anthropic-key-[a-f0-9]{32}$/u);
    expect(JSON.stringify(first)).not.toContain('claude-credential');
  });

  it.each([
    [figmaConnector, 401, 'API_KEY_INVALID'],
    [claudeConnector, 401, 'API_KEY_INVALID'],
    [claudeConnector, 403, 'API_KEY_INSUFFICIENT_SCOPE'],
  ] as const)('fails closed for rejected provider credentials', async (connector, status, code) => {
    const fetchImpl = vi.fn(async () => new Response('provider diagnostic', { status }));

    await expect(connector.testApiKey?.({ apiKey: 'rejected-credential', fetchImpl })).resolves.toMatchObject({
      ok: false,
      code,
    });
  });
});
