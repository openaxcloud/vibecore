import { describe, expect, it } from 'vitest';

import { scoreFileMention, searchFileMentions } from './useFileMentions';
import type { FileMap } from '~/lib/stores/files';

function file(content = ''): FileMap[string] {
  return { type: 'file', content, isBinary: false };
}

const SAMPLE_FILES: FileMap = {
  '/home/project/src/App.tsx': file('export const App = () => null;'),
  '/home/project/src/components/Header.tsx': file(),
  '/home/project/src/components/Footer.tsx': file(),
  '/home/project/src/lib/utils/format.ts': file(),
  '/home/project/package.json': file(),
  '/home/project/README.md': file(),
  '/home/project/src/components/legacy': { type: 'folder' },
};

describe('scoreFileMention', () => {
  it('returns -1 when the needle is not a subsequence of the haystack', () => {
    expect(scoreFileMention('zzz', 'App.tsx')).toBe(-1);
  });

  it('returns 0 for an empty needle (no preference)', () => {
    expect(scoreFileMention('', 'anything')).toBe(0);
  });

  it('scores consecutive prefix matches higher than spread matches', () => {
    const prefix = scoreFileMention('App', 'App.tsx');
    const spread = scoreFileMention('App', 'Aapppl.tsx');
    expect(prefix).toBeGreaterThan(spread);
  });

  it('rewards a match at index 0 of the haystack', () => {
    const atStart = scoreFileMention('a', 'App.tsx');
    const atEnd = scoreFileMention('x', 'App.tsx');
    expect(atStart).toBeGreaterThan(atEnd);
  });
});

describe('searchFileMentions', () => {
  it('returns the top candidates ordered by basename match score', () => {
    const results = searchFileMentions(SAMPLE_FILES, 'App');

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].displayPath).toBe('src/App.tsx');
    expect(results[0].basename).toBe('App.tsx');
  });

  it('finds files by deep path segment too', () => {
    const results = searchFileMentions(SAMPLE_FILES, 'utils');
    expect(results.some((candidate) => candidate.displayPath === 'src/lib/utils/format.ts')).toBe(true);
  });

  it('drops candidates that do not match the query at all', () => {
    const results = searchFileMentions(SAMPLE_FILES, 'zzz');
    expect(results).toEqual([]);
  });

  it('ignores folder entries', () => {
    const results = searchFileMentions(SAMPLE_FILES, 'legacy');
    expect(results.find((candidate) => candidate.displayPath.includes('legacy'))).toBeUndefined();
  });

  it('returns shallow files first when the query is empty', () => {
    const results = searchFileMentions(SAMPLE_FILES, '');
    expect(results[0].displayPath.split('/').length).toBeLessThanOrEqual(2);
  });

  it('honours the limit option', () => {
    const results = searchFileMentions(SAMPLE_FILES, '', { limit: 2 });
    expect(results.length).toBe(2);
  });
});
