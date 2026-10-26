/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('~/lib/enterprise-api.server', () => ({ apiRequest }));
import { loader } from './api.github-stats';

afterEach(() => vi.restoreAllMocks());

describe('repository picker upstream failures', () => {
  for (const status of [403, 429]) {
    it(`preserves HTTP ${status} without exposing provider details`, async () => {
      apiRequest.mockRejectedValueOnce(
        new Response(JSON.stringify({ error: 'private upstream detail' }), {
          status,
          headers: { 'Retry-After': '60' },
        }),
      );
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const response = await loader({ request: new Request('https://e-code.ai/api/github-stats') } as never);
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain('private upstream detail');

      if (status === 429) {
        expect(response.headers.get('Retry-After')).toBe('60');
      }
    });
  }
});
