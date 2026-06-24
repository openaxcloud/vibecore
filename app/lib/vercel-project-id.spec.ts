import { describe, expect, it } from 'vitest';
import { isValidVercelProjectId } from './vercel-project-id';

describe('isValidVercelProjectId', () => {
  it('accepts well-formed project ids and names', () => {
    expect(isValidVercelProjectId('prj_abc123')).toBe(true);
    expect(isValidVercelProjectId('my-app-name')).toBe(true);
    expect(isValidVercelProjectId('Project_42')).toBe(true);
    expect(isValidVercelProjectId('a')).toBe(true);
    expect(isValidVercelProjectId('a'.repeat(64))).toBe(true);
  });

  it('rejects query-param injection (extra teamId re-targeting)', () => {
    // The exact vector from the bug: would inject ?teamId=<victim> into the upstream URL.
    expect(isValidVercelProjectId('prj?teamId=OTHER&x=')).toBe(false);
    expect(isValidVercelProjectId('prj&teamId=OTHER')).toBe(false);
    expect(isValidVercelProjectId('prj#frag')).toBe(false);
  });

  it('rejects path-traversal / path-altering characters', () => {
    expect(isValidVercelProjectId('../other')).toBe(false);
    expect(isValidVercelProjectId('prj/extra')).toBe(false);
    expect(isValidVercelProjectId('..')).toBe(false);
    expect(isValidVercelProjectId('a/b/c')).toBe(false);
  });

  it('rejects whitespace, empty, and over-length values', () => {
    expect(isValidVercelProjectId('')).toBe(false);
    expect(isValidVercelProjectId(' prj ')).toBe(false);
    expect(isValidVercelProjectId('a b')).toBe(false);
    expect(isValidVercelProjectId('a'.repeat(65))).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isValidVercelProjectId(undefined)).toBe(false);
    expect(isValidVercelProjectId(null)).toBe(false);
    expect(isValidVercelProjectId(123)).toBe(false);
    expect(isValidVercelProjectId({})).toBe(false);
  });
});
