import { describe, expect, it } from 'vitest';
import { mergeJsonContent } from './merge-json-content';

describe('mergeJsonContent', () => {
  it('deep-merges proposed onto current (agent adds deps, template deps preserved)', () => {
    const current = JSON.stringify({ name: 'app', dependencies: { react: '18.0.0' } });
    const proposed = JSON.stringify({ dependencies: { zustand: '4.0.0' }, scripts: { dev: 'vite' } });

    const merged = mergeJsonContent(current, proposed);
    const parsed = JSON.parse(merged!);

    expect(parsed).toEqual({
      name: 'app',
      dependencies: { react: '18.0.0', zustand: '4.0.0' },
      scripts: { dev: 'vite' },
    });
  });

  it('lets proposed scalar/array values win on conflict', () => {
    const merged = mergeJsonContent(
      JSON.stringify({ version: '1.0.0', keywords: ['a'] }),
      JSON.stringify({ version: '2.0.0', keywords: ['b', 'c'] }),
    );
    expect(JSON.parse(merged!)).toEqual({ version: '2.0.0', keywords: ['b', 'c'] });
  });

  it('keeps the current valid file when proposed is truncated/invalid JSON (no regression)', () => {
    const current = JSON.stringify({ name: 'app', dependencies: { react: '18.0.0' } });
    expect(mergeJsonContent(current, '{ "dependencies": { "react": "18.')).toBe(current);
  });

  it('returns undefined only when neither current nor proposed is valid JSON', () => {
    expect(mergeJsonContent('{ broken', '{ also broken')).toBeUndefined();
  });

  it('uses proposed as-is when current is empty/invalid but proposed is valid', () => {
    const merged = mergeJsonContent('', JSON.stringify({ name: 'fresh' }));
    expect(JSON.parse(merged!)).toEqual({ name: 'fresh' });
  });
});
