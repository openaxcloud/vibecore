import { describe, expect, it } from 'vitest';
import { isBinaryBuffer } from './binary-detection.js';

describe('isBinaryBuffer', () => {
  it('treats a buffer containing a NUL byte as binary', () => {
    expect(isBinaryBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a]))).toBe(true);
  });

  it('treats pure ASCII text as not binary', () => {
    expect(isBinaryBuffer(Buffer.from('export default null;\n', 'utf8'))).toBe(false);
  });

  it('treats multi-byte UTF-8 text as not binary', () => {
    expect(isBinaryBuffer(Buffer.from('héllo — 日本語 😀 café', 'utf8'))).toBe(false);
  });

  it('treats an empty buffer as not binary', () => {
    expect(isBinaryBuffer(Buffer.alloc(0))).toBe(false);
  });

  it('only sniffs the first 8KB (a NUL beyond the window is ignored)', () => {
    const buffer = Buffer.concat([Buffer.alloc(8 * 1024, 0x61), Buffer.from([0x00])]);
    expect(isBinaryBuffer(buffer)).toBe(false);
  });

  it('detects a NUL at the very start of the sniff window', () => {
    const buffer = Buffer.concat([Buffer.from([0x00]), Buffer.alloc(16 * 1024, 0x61)]);
    expect(isBinaryBuffer(buffer)).toBe(true);
  });
});
