import { describe, expect, it } from 'vitest';

import { loader } from './projects.$projectId.import.$source';

function runLoader(projectId: string | undefined, source: string | undefined) {
  return loader({
    params: { projectId, source },
    request: new Request('https://e-code.ai/projects/abc/import/figma'),
    context: {},
  } as unknown as Parameters<typeof loader>[0]);
}

describe('projects.$projectId.import.$source loader', () => {
  it('returns validated params for a supported source', () => {
    const result = runLoader('abc', 'figma');

    expect(result).toEqual({ projectId: 'abc', source: 'figma' });
  });

  it('accepts every supported import source without throwing', () => {
    for (const source of ['figma', 'bolt', 'lovable']) {
      expect(() => runLoader('abc', source)).not.toThrow();
    }
  });

  it('throws a 404 Response for an unsupported source (e.g. guessed/typo)', () => {
    let thrown: unknown;

    try {
      runLoader('abc', 'github');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
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

  it('uses a language-neutral missing-value marker when projectId is absent but source is valid', () => {
    const result = runLoader(undefined, 'lovable');

    expect(result).toEqual({ projectId: '—', source: 'lovable' });
  });
});
