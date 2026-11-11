import { afterEach, describe, expect, it, vi } from 'vitest';

import { workspaceAgentRequestFailure } from './agent-client-copy.js';
import { WorkspaceAgentClient } from './index.js';

afterEach(() => vi.unstubAllGlobals());

describe('workspace agent request failure copy', () => {
  it.each([
    [undefined, 'Workspace agent request failed: 503'],
    ['en', 'Workspace agent request failed: 503'],
    ['fr', 'La requête à l’agent de l’espace de travail a échoué : 503'],
  ] as const)('preserves transport failure semantics for %s', async (locale, message) => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const json = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, body: { cancel }, json }));

    const client = new WorkspaceAgentClient('https://agent.example', 'token', locale);
    await expect(client.request('/files')).rejects.toThrow(message);
    expect(cancel).toHaveBeenCalledOnce();
    expect(json).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      'https://agent.example/files',
      expect.objectContaining({
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      }),
    );
  });

  it.each(['en', 'fr'] as const)('leaves successful response content untouched in %s', async (locale) => {
    const payload = { message: 'User-owned data, not translated', files: ['index.ts'] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    expect(await new WorkspaceAgentClient('https://agent.example', 'token', locale).request('/files')).toBe(payload);
  });

  it('retains the HTTP diagnostic when draining the failed response also fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        body: {
          cancel: async () => {
            throw new Error('drain failed');
          },
        },
      }),
    );
    await expect(new WorkspaceAgentClient('https://agent.example', 'token').request('/files')).rejects.toThrow(
      'Workspace agent request failed: 401',
    );
    expect(workspaceAgentRequestFailure(404, 'fr')).toBe('La requête à l’agent de l’espace de travail a échoué : 404');
  });
});
