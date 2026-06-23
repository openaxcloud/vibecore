import { describe, expect, it } from 'vitest';

import { friendlyLabel, looksLikeOpaqueId, pickFriendlyLabel } from './friendly-id';

describe('looksLikeOpaqueId', () => {
  it('treats classic cuids as opaque', () => {
    expect(looksLikeOpaqueId('cmp4fukoa00pgkulnttovus0t')).toBe(true);
    expect(looksLikeOpaqueId('ckxabcdefghijklmnopqrstuv')).toBe(true);
  });

  it('treats uuids as opaque', () => {
    expect(looksLikeOpaqueId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(looksLikeOpaqueId('A2C3D8E1-1111-4F5A-9999-00112233AABB')).toBe(true);
  });

  it('treats long single-word slugs as opaque', () => {
    expect(looksLikeOpaqueId('aZ9bC3dE5fG7hI9jK1lM3')).toBe(true);
  });

  it('keeps human-friendly names', () => {
    expect(looksLikeOpaqueId('my-cool-portfolio')).toBe(false);
    expect(looksLikeOpaqueId('Acme Inc')).toBe(false);
    expect(looksLikeOpaqueId('Portfolio')).toBe(false);
    expect(looksLikeOpaqueId('Snatch Bot')).toBe(false);
    expect(looksLikeOpaqueId('main')).toBe(false);
    expect(looksLikeOpaqueId('en-US')).toBe(false);
    expect(looksLikeOpaqueId('staging-eu-west-3')).toBe(false);
  });

  it('keeps long all-lowercase word-like branch names (no separator, no digits)', () => {
    // 26 chars, all lowercase letters: a real branch name, not a nanoid.
    expect(looksLikeOpaqueId('featurelandingpageredesign')).toBe(false);
    expect(looksLikeOpaqueId('refactortheentireworkbenchstore')).toBe(false);
  });

  it('keeps long lowercase project names with a trailing year/version suffix', () => {
    // 22 chars: word + trailing year cluster is a name, not a random token.
    expect(looksLikeOpaqueId('myportfoliowebsite2026')).toBe(false);
    expect(looksLikeOpaqueId('teamdashboardredesign2026')).toBe(false);
  });

  it('still treats real nanoid-style tokens with interleaved digits as opaque', () => {
    expect(looksLikeOpaqueId('a1b2c3d4e5f6g7h8i9j0k1')).toBe(true);
    expect(looksLikeOpaqueId('abc123def456ghi789jkl0')).toBe(true);
  });

  it('still treats long all-digit/all-separator strings as opaque', () => {
    expect(looksLikeOpaqueId('12345678901234567890')).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(looksLikeOpaqueId('')).toBe(false);
    expect(looksLikeOpaqueId('   ')).toBe(false);
  });
});

describe('friendlyLabel', () => {
  it('returns a fallback when the value is missing', () => {
    expect(friendlyLabel(undefined, 'Workspace')).toEqual({
      display: 'Workspace',
      full: 'Workspace',
      isFallback: true,
    });
    expect(friendlyLabel(null, 'Workspace')).toEqual({
      display: 'Workspace',
      full: 'Workspace',
      isFallback: true,
    });
    expect(friendlyLabel('', 'Workspace')).toEqual({
      display: 'Workspace',
      full: 'Workspace',
      isFallback: true,
    });
  });

  it('hides opaque ids but keeps them in the full field', () => {
    const result = friendlyLabel('cmp4fukoa00pgkulnttovus0t', 'Untitled project');
    expect(result.display).toBe('Untitled project');
    expect(result.full).toBe('cmp4fukoa00pgkulnttovus0t');
    expect(result.isFallback).toBe(true);
  });

  it('keeps real names', () => {
    const result = friendlyLabel('Portfolio site', 'Untitled project');
    expect(result).toEqual({ display: 'Portfolio site', full: 'Portfolio site', isFallback: false });
  });
});

describe('pickFriendlyLabel', () => {
  it('returns the first human candidate', () => {
    const result = pickFriendlyLabel([undefined, '', 'Acme Org', 'cmp4fukoa00pgkulnttovus0t'], 'Workspace');
    expect(result.display).toBe('Acme Org');
    expect(result.isFallback).toBe(false);
  });

  it('falls back to the literal fallback when every candidate is opaque or empty', () => {
    const result = pickFriendlyLabel(['cmp4fukoa00pgkulnttovus0t', undefined, ''], 'Workspace');
    expect(result.display).toBe('Workspace');
    expect(result.full).toBe('cmp4fukoa00pgkulnttovus0t');
    expect(result.isFallback).toBe(true);
  });

  it('returns the bare fallback when nothing is supplied', () => {
    const result = pickFriendlyLabel([undefined, null, ''], 'Workspace');
    expect(result).toEqual({ display: 'Workspace', full: 'Workspace', isFallback: true });
  });
});
