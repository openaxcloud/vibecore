/*
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { decodeRuntimeFileContent, parseProjectFileWriteBody } from '~/lib/project-file-io';

describe('decodeRuntimeFileContent', () => {
  it('decodes utf8 text content into bytes', () => {
    const bytes = decodeRuntimeFileContent({ content: 'hello', encoding: 'utf8' });

    expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111]);
  });

  it('treats omitted encoding as utf8', () => {
    const bytes = decodeRuntimeFileContent({ content: 'hi' });

    expect(new TextDecoder().decode(bytes)).toBe('hi');
  });

  it('decodes base64 content losslessly, preserving non-utf8 bytes', () => {
    // A PNG signature contains bytes (0x89, 0xFF) that are invalid as utf8.
    const original = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00]);
    const base64 = Buffer.from(original).toString('base64');

    const bytes = decodeRuntimeFileContent({ content: base64, encoding: 'base64' });

    expect(Array.from(bytes)).toEqual(Array.from(original));
  });
});

describe('parseProjectFileWriteBody', () => {
  it('treats a raw (non-JSON) body as utf8 text', async () => {
    const payload = await parseProjectFileWriteBody('console.log(1)', 'text/plain');

    expect(payload).toEqual({ content: 'console.log(1)', encoding: 'utf8' });
  });

  it('treats a body with no content-type as utf8 text', async () => {
    const payload = await parseProjectFileWriteBody('plain', null);

    expect(payload).toEqual({ content: 'plain', encoding: 'utf8' });
  });

  it('forwards an explicit base64 envelope so binary writes stay lossless', async () => {
    const original = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff]);
    const base64 = Buffer.from(original).toString('base64');
    const body = JSON.stringify({ content: base64, encoding: 'base64' });

    const payload = await parseProjectFileWriteBody(body, 'application/json');

    expect(payload).toEqual({ content: base64, encoding: 'base64' });

    // The encoding round-trips through the runtime read decoder back to bytes.
    const decoded = decodeRuntimeFileContent({ content: payload.content, encoding: payload.encoding });
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it('defaults a JSON envelope without encoding to utf8', async () => {
    const body = JSON.stringify({ content: 'data' });

    const payload = await parseProjectFileWriteBody(body, 'application/json; charset=utf-8');

    expect(payload).toEqual({ content: 'data', encoding: 'utf8' });
  });

  const expectRejects400 = async (promise: Promise<unknown>) => {
    const thrown = await promise.then(
      () => {
        throw new Error('expected the call to reject');
      },
      (error) => error,
    );

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(400);
  };

  it('rejects an invalid JSON body with a 400', async () => {
    await expectRejects400(parseProjectFileWriteBody('{not json', 'application/json'));
  });

  it('rejects a JSON envelope with non-string content', async () => {
    await expectRejects400(parseProjectFileWriteBody(JSON.stringify({ content: 123 }), 'application/json'));
  });

  it('rejects an unsupported encoding value', async () => {
    await expectRejects400(
      parseProjectFileWriteBody(JSON.stringify({ content: 'x', encoding: 'hex' }), 'application/json'),
    );
  });
});
