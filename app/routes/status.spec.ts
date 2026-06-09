/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';

import { loader } from './status';

function buildArgs(): Parameters<typeof loader>[0] {
  const request = new Request('http://app.e-code.ai/status');

  return {
    request,
    params: {},
    context: {} as Parameters<typeof loader>[0]['context'],
  };
}

describe('status public route loader', () => {
  it('serves the imported E-Code public status page shell', async () => {
    const response = await loader(buildArgs());

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get('cache-control')).toBe('no-store');
    expect((response as Response).headers.get('content-type')).toContain('text/html');
    expect((response as Response).headers.get('x-vibecore-marketing-shell')).toBe('ecode-static');

    const html = await (response as Response).text();

    expect(html).toContain('<title>E-Code - Code, Create, and Learn Together</title>');
    expect(html).toContain('/ecode-static/assets/index-');
  });
});
