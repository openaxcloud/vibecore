import { describe, expect, it } from 'vitest';
import { encodeUpstreamPathDelimiters } from './app.js';

describe('encodeUpstreamPathDelimiters', () => {
  it('returns an empty string for undefined/empty input', () => {
    expect(encodeUpstreamPathDelimiters(undefined)).toBe('');
    expect(encodeUpstreamPathDelimiters('')).toBe('');
  });

  it('leaves ordinary provider paths untouched', () => {
    expect(encodeUpstreamPathDelimiters('repos/o/r/contents/src/index.ts')).toBe('repos/o/r/contents/src/index.ts');
  });

  it("re-encodes a literal '#' so it is not parsed as a URL fragment delimiter", () => {
    const safe = encodeUpstreamPathDelimiters('repos/o/r/contents/a#b.txt');
    expect(safe).toBe('repos/o/r/contents/a%23b.txt');

    // The whole path survives URL parsing instead of being truncated at '#'.
    const resolved = new URL(`https://api.github.com/${safe}`);
    expect(resolved.pathname).toBe('/repos/o/r/contents/a%23b.txt');
    expect(resolved.hash).toBe('');
  });

  it("re-encodes a literal '?' so it is not parsed as a query delimiter", () => {
    const safe = encodeUpstreamPathDelimiters('repos/o/r/contents/a?b.txt');
    expect(safe).toBe('repos/o/r/contents/a%3Fb.txt');

    const resolved = new URL(`https://api.github.com/${safe}`);
    expect(resolved.pathname).toBe('/repos/o/r/contents/a%3Fb.txt');
    expect(resolved.search).toBe('');
  });

  it('re-encodes multiple delimiters in a single path', () => {
    expect(encodeUpstreamPathDelimiters('a#b?c#d')).toBe('a%23b%3Fc%23d');
  });
});
