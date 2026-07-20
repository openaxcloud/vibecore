import { describe, expect, it } from 'vitest';

import { loader } from './projects.$projectId.import.$source';
import { IMPORT_HUB_SOURCE_IDS } from '~/components/dashboard/ImportHub';

function runLoader(projectId: string | undefined, source: string | undefined) {
  return loader({
    params: { projectId, source },
    request: new Request('https://e-code.ai/projects/abc/import/figma'),
    context: {},
  } as unknown as Parameters<typeof loader>[0]);
}

describe('projects.$projectId.import.$source loader', () => {
  it('redirects every supported source to the canonical Import Hub selection', () => {
    expect(IMPORT_HUB_SOURCE_IDS).toHaveLength(12);

    for (const source of IMPORT_HUB_SOURCE_IDS) {
      const response = runLoader('abc', source);

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(`/dashboard/templates?section=import&source=${source}`);
    }
  });

  it.each(['gitlab', 'screenshot', 'python', 'github-typo'])('404s unsupported source %s', (source) => {
    expect(() => runLoader('abc', source)).toThrowError(Response);

    try {
      runLoader('abc', source);
    } catch (error) {
      expect((error as Response).status).toBe(404);
    }
  });

  it('throws a 404 Response for a missing source', () => {
    let thrown: unknown;

    try {
      runLoader('abc', undefined);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
  });

  it('does not retain a legacy project id in the new-project import URL', () => {
    const response = runLoader(undefined, 'lovable');

    expect(response.headers.get('location')).toBe('/dashboard/templates?section=import&source=lovable');
    expect(response.headers.get('location')).not.toContain('unknown');
  });
});
