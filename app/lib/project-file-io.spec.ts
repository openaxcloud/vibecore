import { describe, expect, it } from 'vitest';
import { decodeRuntimeFileContent, ProjectFileIoError } from './project-file-io';

describe('decodeRuntimeFileContent', () => {
  it('decodes a valid base64 payload back to its original bytes', () => {
    const bytes = new Uint8Array([0x00, 0xff, 0x10, 0x7f, 0x80]);
    const base64 = Buffer.from(bytes).toString('base64');

    const decoded = decodeRuntimeFileContent({ content: base64, encoding: 'base64' });

    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });

  it('treats utf8/omitted encoding as text', () => {
    const decoded = decodeRuntimeFileContent({ content: 'hello', encoding: 'utf8' });
    expect(new TextDecoder().decode(decoded)).toBe('hello');

    const decodedNoEncoding = decodeRuntimeFileContent({ content: 'hi' });
    expect(new TextDecoder().decode(decodedNoEncoding)).toBe('hi');
  });

  it('handles an empty body without throwing', () => {
    expect(decodeRuntimeFileContent({ encoding: 'base64' }).byteLength).toBe(0);
    expect(decodeRuntimeFileContent({}).byteLength).toBe(0);
  });

  it('throws a language-neutral structured error when the base64 body is corrupted', () => {
    let thrown: unknown;

    try {
      // A lone '=' / non-base64 garbage makes atob throw a DOMException.
      decodeRuntimeFileContent({ content: 'not%%%valid%%%base64=', encoding: 'base64' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ProjectFileIoError);
    expect(thrown).toMatchObject({ code: 'PROJECT_FILE_READ_FAILED', status: 502 });
  });
});
