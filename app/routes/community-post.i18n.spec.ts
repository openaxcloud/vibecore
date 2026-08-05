import { describe, expect, it } from 'vitest';

import { loader } from './community.post.$id';
import { toResponse } from '~/lib/test/rr7-data';

function args(url: string, id: string) {
  return {
    request: new Request(url),
    params: { id },
    context: {},
  } as never;
}

describe('community post locale loader', () => {
  it('serves French content and locale headers from browser detection', async () => {
    const request = new Request('https://e-code.ai/community/post/mobile-preview-checklist', {
      headers: { 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' },
    });

    const response = toResponse(
      await loader({ request, params: { id: 'mobile-preview-checklist' }, context: {} } as never),
    );

    expect(response.headers.get('Content-Language')).toBe('fr');

    const data = (await response.json()) as { language: string; post: { title: string; authorHandle: string } };
    expect(data.language).toBe('fr');
    expect(data.post.title).toContain('aperçu mobile');
    expect(data.post.authorHandle).toBe('jon-mobile');
  });

  it('redirects unknown ids to the public community without fabricating copy', async () => {
    try {
      await loader(args('https://e-code.ai/community/post/missing', 'missing'));
      throw new Error('Expected the loader to redirect');
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(302);
      expect((error as Response).headers.get('Location')).toBe('/community');
    }
  });
});
