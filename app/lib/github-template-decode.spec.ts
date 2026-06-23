import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64, decodeTemplateBytes, isBinaryContent } from './github-template-decode';

describe('github-template-decode', () => {
  describe('isBinaryContent', () => {
    it('treats UTF-8 text (incl. tab/LF/CR) as non-binary', () => {
      const text = new TextEncoder().encode('hello\tworld\r\n{"a":1}\n');
      expect(isBinaryContent(text)).toBe(false);
    });

    it('treats content with a NUL byte as binary', () => {
      expect(isBinaryContent(new Uint8Array([0x68, 0x00, 0x69]))).toBe(true);
    });

    it('treats control bytes outside tab/LF/CR as binary (e.g. PNG header)', () => {
      // PNG signature: 0x89 'P' 'N' 'G' \r \n 0x1A \n
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(isBinaryContent(png)).toBe(true);
    });
  });

  describe('base64 round-trip', () => {
    it('round-trips arbitrary bytes losslessly through base64', () => {
      const bytes = new Uint8Array(256);

      for (let i = 0; i < 256; i++) {
        bytes[i] = i;
      }

      const restored = base64ToBytes(bytesToBase64(bytes));
      expect(Array.from(restored)).toEqual(Array.from(bytes));
    });

    it('decodes GitHub-style whitespace-wrapped base64', () => {
      const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff]);
      const wrapped = bytesToBase64(bytes).replace(/(.{2})/g, '$1\n'); // inject newlines like the GitHub API
      expect(Array.from(base64ToBytes(wrapped))).toEqual(Array.from(bytes));
    });
  });

  describe('decodeTemplateBytes', () => {
    it('returns text files as a utf8 string unchanged', () => {
      const source = 'export const App = () => <div>héllo 你好</div>;\n';
      const bytes = new TextEncoder().encode(source);
      const decoded = decodeTemplateBytes(bytes);

      expect(decoded.encoding).toBe('utf8');
      expect(decoded.content).toBe(source);
    });

    it('returns binary files as base64 with no byte loss', () => {
      // A tiny fake favicon.ico: ICO header bytes that are NOT valid UTF-8 text.
      const ico = new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10, 0x80, 0xff, 0xfe, 0x7f]);
      const decoded = decodeTemplateBytes(ico);

      expect(decoded.encoding).toBe('base64');

      // The crucial property: the bytes survive a full round-trip.
      const restored = base64ToBytes(decoded.content);
      expect(Array.from(restored)).toEqual(Array.from(ico));
    });

    it('does NOT mangle high bytes the way UTF-8 string decoding would', () => {
      const ico = new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x80, 0xff]);

      /*
       * Legacy behaviour: TextDecoder on these bytes yields U+FFFD replacements,
       * which can never be turned back into the original bytes.
       */
      const lossy = new TextDecoder('utf-8').decode(ico);
      expect(lossy).toContain('�');

      // New behaviour preserves every byte.
      const decoded = decodeTemplateBytes(ico);
      expect(Array.from(base64ToBytes(decoded.content))).toEqual(Array.from(ico));
    });
  });
});
