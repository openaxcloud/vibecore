import { describe, expect, it } from 'vitest';
import { mergeJsonContent, repairTruncatedJson } from './merge-json-content';

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

  it('recovers a truncated package.json even when there is NO valid current (the 18-errors case)', () => {
    // Model emission cut off mid-dependencies — the real "Unterminated string" case.
    const truncated = '{\n  "name": "my-app",\n  "version": "0.0.0",\n  "dependencies": {\n    "react": "^18.';
    const merged = mergeJsonContent('', truncated);
    const parsed = JSON.parse(merged!); // must be valid JSON, not a thrown error

    // The complete pairs emitted before the cut are preserved.
    expect(parsed.name).toBe('my-app');
    expect(parsed.version).toBe('0.0.0');
  });

  it('merges a repaired truncation onto a valid current file', () => {
    const current = JSON.stringify({ name: 'app', private: true, dependencies: { react: '18.0.0' } });
    const truncated = '{ "scripts": { "dev": "vite" }, "dependencies": { "zustand": "^4.';
    const parsed = JSON.parse(mergeJsonContent(current, truncated)!);

    // Current keys preserved; the recovered scripts block applied.
    expect(parsed.name).toBe('app');
    expect(parsed.scripts).toEqual({ dev: 'vite' });
  });

  it('still returns undefined for genuine garbage (not a truncation)', () => {
    expect(mergeJsonContent('{ broken', '{ also broken')).toBeUndefined();
  });
});

describe('repairTruncatedJson', () => {
  it('closes an object truncated mid-string and keeps the complete pairs', () => {
    const repaired = repairTruncatedJson('{"name":"app","version":"1.0.0","deps":{"react":"^18.');
    expect(JSON.parse(repaired!)).toEqual({ name: 'app', version: '1.0.0' });
  });

  it('closes a truncated nested object at the last complete pair', () => {
    const repaired = repairTruncatedJson('{"a":1,"b":{"c":2,"d":');
    expect(JSON.parse(repaired!)).toEqual({ a: 1, b: { c: 2 } });
  });

  it('returns already-valid JSON unchanged (round-trips)', () => {
    const valid = '{"name":"app"}';
    expect(JSON.parse(repairTruncatedJson(valid)!)).toEqual({ name: 'app' });
  });

  it('refuses to reduce genuine garbage to an empty object', () => {
    expect(repairTruncatedJson('{ not json at all')).toBeUndefined();
    expect(repairTruncatedJson('')).toBeUndefined();
  });
});
