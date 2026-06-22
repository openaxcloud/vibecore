import { describe, expect, it, vi } from 'vitest';

import {
  base64ToUint8Array,
  copyContentNeedsHydration,
  resolveCopyContent,
  runtimeReadToCopyContent,
} from './file-tree-copy';

describe('copyContentNeedsHydration', () => {
  it('treats an empty content string as needing hydration (stripped-tree placeholder)', () => {
    expect(copyContentNeedsHydration({ content: '' })).toBe(true);
    expect(copyContentNeedsHydration({ content: '', isBinary: true })).toBe(true);
  });

  it('trusts non-empty content as-is', () => {
    expect(copyContentNeedsHydration({ content: 'hello' })).toBe(false);
    expect(copyContentNeedsHydration({ content: 'AAAA', isBinary: true })).toBe(false);
  });
});

describe('runtimeReadToCopyContent', () => {
  it('returns the raw string for utf8 content', () => {
    expect(runtimeReadToCopyContent({ content: 'export const a = 1;', encoding: 'utf8' })).toBe('export const a = 1;');
  });

  it('decodes base64 content back to bytes so createFile re-encodes losslessly', () => {
    const bytes = runtimeReadToCopyContent({ content: btoa('PNG'), encoding: 'base64' });

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes as Uint8Array)).toEqual([80, 78, 71]);
  });
});

describe('resolveCopyContent', () => {
  it('uses the store content directly when it is already hydrated (no runtime read)', async () => {
    const readFile = vi.fn();
    const result = await resolveCopyContent({ content: 'real source' }, readFile);

    expect(result).toBe('real source');
    expect(readFile).not.toHaveBeenCalled();
  });

  it('decodes an already-hydrated binary entry from base64 to bytes', async () => {
    const readFile = vi.fn();
    const result = await resolveCopyContent({ content: btoa('GIF'), isBinary: true }, readFile);

    expect(readFile).not.toHaveBeenCalled();
    expect(Array.from(result as Uint8Array)).toEqual([71, 73, 70]);
  });

  it('hydrates an unopened (empty) text file from the runtime instead of writing empty', async () => {
    const readFile = vi.fn(() => Promise.resolve({ content: 'on-disk source', encoding: 'utf8' as const }));
    const result = await resolveCopyContent({ content: '' }, readFile);

    expect(readFile).toHaveBeenCalledTimes(1);
    expect(result).toBe('on-disk source');
  });

  it('hydrates an unopened binary file as bytes (encoding from the runtime, not the stale flag)', async () => {
    const readFile = vi.fn(() => Promise.resolve({ content: btoa('JPG'), encoding: 'base64' as const }));
    const result = await resolveCopyContent({ content: '', isBinary: false }, readFile);

    expect(readFile).toHaveBeenCalledTimes(1);
    expect(Array.from(result as Uint8Array)).toEqual([74, 80, 71]);
  });

  it('propagates a runtime read failure so the caller can abort (never lose the original)', async () => {
    const readFile = vi.fn(() => Promise.reject(new Error('runtime 502')));

    await expect(resolveCopyContent({ content: '' }, readFile)).rejects.toThrow('runtime 502');
  });
});

describe('base64ToUint8Array', () => {
  it('round-trips bytes without a Buffer dependency', () => {
    expect(Array.from(base64ToUint8Array(btoa('AB')))).toEqual([65, 66]);
  });
});
