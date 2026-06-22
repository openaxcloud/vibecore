import { describe, expect, it } from 'vitest';
import { encodeGitWriteContent } from './git-fs-encoding';

describe('encodeGitWriteContent', () => {
  it('preserves every one of the 256 byte values 1:1 (no U+FFFD corruption)', () => {
    const allBytes = new Uint8Array(256);

    for (let i = 0; i < 256; i++) {
      allBytes[i] = i;
    }

    const encoded = encodeGitWriteContent(allBytes);

    // No replacement characters were introduced.
    expect(encoded).not.toContain('�');

    // The string round-trips back to the exact original bytes via latin1.
    expect(Array.from(Buffer.from(encoded, 'latin1'))).toEqual(Array.from(allBytes));
  });

  it('round-trips a binary PNG header losslessly', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00, 0x80]);

    const encoded = encodeGitWriteContent(png);

    expect(Array.from(Buffer.from(encoded, 'latin1'))).toEqual(Array.from(png));
  });

  it('does not corrupt where TextDecoder would', () => {
    // 0x80 is a lone continuation byte: invalid utf8, decoded to U+FFFD by TextDecoder.
    const lone = new Uint8Array([0x80]);

    expect(new TextDecoder().decode(lone)).toBe('�');
    expect(encodeGitWriteContent(lone)).not.toBe('�');
    expect(Buffer.from(encodeGitWriteContent(lone), 'latin1')[0]).toBe(0x80);
  });

  it('passes utf8 text strings through unchanged', () => {
    expect(encodeGitWriteContent('export const ok = true;\n')).toBe('export const ok = true;\n');
    expect(encodeGitWriteContent('héllo — wörld')).toBe('héllo — wörld');
  });

  it('coerces non-string, non-Uint8Array input to a string', () => {
    expect(encodeGitWriteContent(42)).toBe('42');
  });
});
