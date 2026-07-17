import { describe, expect, it } from 'vitest';

import { loader as developerFrameworksLoader } from './developer-frameworks';
import { loader as rootLanguagesLoader } from './languages';
import { loader as languagesLoader } from './templates_.languages';

function loaderArgs(url: string): Parameters<typeof languagesLoader>[0] {
  return {
    context: {},
    params: {},
    request: new Request(url),
  };
}

describe('retired framework and language starter routes', () => {
  it('/templates/languages redirects to the application Gallery entrypoint', () => {
    const response = languagesLoader(loaderArgs('http://app.e-code.ai/templates/languages'));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/templates');
  });

  it('/languages redirects instead of advertising unverified language runtimes', () => {
    const response = rootLanguagesLoader(loaderArgs('http://app.e-code.ai/languages'));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/templates');
  });

  it('/developer-frameworks redirects to the same application Gallery entrypoint', () => {
    const response = developerFrameworksLoader(loaderArgs('http://app.e-code.ai/developer-frameworks'));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/templates');
  });
});
