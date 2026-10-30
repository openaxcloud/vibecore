import { describe, expect, it, vi } from 'vitest';
import { fetchSkillRepoInstructions, MAX_INSTRUCTIONS_BYTES, MAX_INSTRUCTIONS_CHARS } from './skills-github-fetch.js';

function supplied(response: Response) {
  return vi.fn<typeof fetch>(async () => response);
}

describe('complete bounded instruction snapshots', () => {
  it('preserves a trailing required resource reference without truncation', async () => {
    const reference = '\n[Required](references/guide.md)';
    const content = 'a'.repeat(MAX_INSTRUCTIONS_CHARS - reference.length) + reference;
    const fetchImpl = supplied(new Response(content));
    const result = await fetchSkillRepoInstructions('fixture/synthetic', { fetchImpl });
    expect(result).toEqual({ ok: true, instructions: content, source: 'SKILL.md' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('rejects character overflow instead of returning a prefix without its required resource', async () => {
    const fetchImpl = supplied(new Response('a'.repeat(MAX_INSTRUCTIONS_CHARS) + '\n[Required](references/guide.md)'));
    expect(await fetchSkillRepoInstructions('fixture/synthetic', { fetchImpl })).toEqual({
      ok: false,
      reason: 'too_large',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('cancels a streamed body as soon as the byte cap is exceeded', async () => {
    const cancel = vi.fn();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_INSTRUCTIONS_BYTES + 1));
      },
      cancel,
    });

    const fetchImpl = supplied(new Response(stream));
    expect(await fetchSkillRepoInstructions('fixture/synthetic', { fetchImpl })).toEqual({
      ok: false,
      reason: 'too_large',
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('rejects an advertised oversized response before reading its stream', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });

    const fetchImpl = supplied(
      new Response(stream, { headers: { 'content-length': String(MAX_INSTRUCTIONS_BYTES + 1) } }),
    );
    expect(await fetchSkillRepoInstructions('fixture/synthetic', { fetchImpl })).toEqual({
      ok: false,
      reason: 'too_large',
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('decodes valid multibyte UTF-8 split across chunks without dropping a required reference', async () => {
    const content = 'Été 校对 🧪\n[Guide](references/guide.md)';
    const bytes = new TextEncoder().encode(content);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) {
          controller.enqueue(new Uint8Array([byte]));
        }
        controller.close();
      },
    });
    expect(
      await fetchSkillRepoInstructions('fixture/synthetic', { fetchImpl: supplied(new Response(stream)) }),
    ).toEqual({ ok: true, instructions: content, source: 'SKILL.md' });
  });

  it('supports a valid multibyte body close to the character budget', async () => {
    const content = '界'.repeat(MAX_INSTRUCTIONS_CHARS);
    expect(
      await fetchSkillRepoInstructions('fixture/synthetic', { fetchImpl: supplied(new Response(content)) }),
    ).toEqual({ ok: true, instructions: content, source: 'SKILL.md' });
  });

  it.each([
    new Uint8Array([0xff]),
    new Uint8Array([0xe2, 0x82]),
    new Uint8Array([65, 0, 66]),
    new Uint8Array([65, 7, 66]),
  ])('rejects invalid UTF-8 or binary instructions without trying README', async (bytes) => {
    const fetchImpl = supplied(new Response(bytes));
    expect(await fetchSkillRepoInstructions('fixture/synthetic', { fetchImpl })).toEqual({
      ok: false,
      reason: 'invalid_content',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('preserves compatibility with complete text-only fetch adapters', async () => {
    const fetchImpl = supplied({
      ok: true,
      status: 200,
      text: async () => 'Synthetic instructions\n[Guide](references/guide.md)',
    } as Response);
    expect(await fetchSkillRepoInstructions('fixture/synthetic', { fetchImpl })).toMatchObject({
      ok: true,
      instructions: 'Synthetic instructions\n[Guide](references/guide.md)',
    });
  });

  it('rejects oversized text-only adapters without prefix acceptance or candidate fallback', async () => {
    const fetchImpl = supplied({
      ok: true,
      status: 200,
      text: async () => 'a'.repeat(MAX_INSTRUCTIONS_CHARS + 1),
    } as Response);
    expect(await fetchSkillRepoInstructions('fixture/synthetic', { fetchImpl })).toEqual({
      ok: false,
      reason: 'too_large',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('retains fallback for missing or empty candidates, but never after invalid successful content', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(' '))
      .mockResolvedValueOnce(new Response('Synthetic README instructions'));
    expect(await fetchSkillRepoInstructions('fixture/synthetic', { fetchImpl })).toEqual({
      ok: true,
      instructions: 'Synthetic README instructions',
      source: 'README.md',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

it.each([206, 200])('rejects partial instruction responses at status %s without fallback', async (status) => {
  const fetchImpl = supplied(
    new Response('Partial manifest missing its final references', {
      status,
      headers: status === 200 ? { 'content-range': 'bytes 0-49/200' } : {},
    }),
  );
  expect(await fetchSkillRepoInstructions('fixture/synthetic', { fetchImpl })).toEqual({
    ok: false,
    reason: 'invalid_content',
  });
  expect(fetchImpl).toHaveBeenCalledOnce();
});

it('does not fall back after a successful response stream is interrupted', async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('Partial instructions'));
      controller.error(new Error('Synthetic interrupted stream'));
    },
  });

  const fetchImpl = supplied(new Response(stream));
  expect(await fetchSkillRepoInstructions('fixture/synthetic', { fetchImpl })).toEqual({
    ok: false,
    reason: 'invalid_content',
  });
  expect(fetchImpl).toHaveBeenCalledOnce();
});
