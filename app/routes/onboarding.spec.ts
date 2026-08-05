import { describe, expect, it } from 'vitest';

import { loader } from './onboarding';

async function redirectLocation(url: string): Promise<string | null> {
  const response = await loader({ request: new Request(url) } as never);

  return response.headers.get('Location');
}

describe('onboarding compatibility redirect', () => {
  it.each([
    ['en', '/dashboard?lang=en'],
    ['fr-FR', '/dashboard?lang=fr'],
    ['es', '/dashboard?lang=es'],
    ['ar', '/dashboard?lang=ar'],
  ])('preserves the explicit %s locale', async (language, expected) => {
    await expect(redirectLocation(`https://e-code.ai/onboarding?lang=${language}`)).resolves.toBe(expected);
  });

  it('drops unsupported and unrelated query state', async () => {
    await expect(redirectLocation('https://e-code.ai/onboarding?lang=de&token=secret')).resolves.toBe('/dashboard');
  });
});
