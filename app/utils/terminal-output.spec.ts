import { describe, expect, it } from 'vitest';

import { stripInternalOscMarkers } from './terminal-output';

describe('stripInternalOscMarkers', () => {
  it('removes a complete jsh handshake marker', () => {
    expect(stripInternalOscMarkers('before\x1b]654;interactive\x07after')).toBe('beforeafter');
  });

  it('removes multiple markers in the same buffer', () => {
    const input = '\x1b]654;prompt\x07$ ls\n\x1b]654;exit=0:1234\x07';
    expect(stripInternalOscMarkers(input)).toBe('$ ls\n');
  });

  it('keeps unrelated OSC sequences (title, hyperlinks)', () => {
    const title = '\x1b]0;tab title\x07';
    const link = '\x1b]8;;https://example.com\x07open\x1b]8;;\x07';
    expect(stripInternalOscMarkers(`${title}body${link}`)).toBe(`${title}body${link}`);
  });

  it('preserves ANSI colour and cursor codes', () => {
    const input = '\x1b[31mError\x1b[0m\n\x1b]654;exit=1:99\x07';
    expect(stripInternalOscMarkers(input)).toBe('\x1b[31mError\x1b[0m\n');
  });

  it('returns empty input untouched', () => {
    expect(stripInternalOscMarkers('')).toBe('');
  });

  it('handles a buffer without any internal marker as-is', () => {
    expect(stripInternalOscMarkers('plain output\n')).toBe('plain output\n');
  });
});
