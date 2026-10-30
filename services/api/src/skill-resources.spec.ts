import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  fetchSkillResourceSnapshots,
  referencedSkillResourcePaths,
  MAX_SKILL_RESOURCE_BYTES,
} from './skill-resources.js';

function fetchFixture(files: Record<string, string | Response>) {
  return vi.fn<typeof fetch>(async (input) => {
    const value = files[String(input).replace('https://raw.githubusercontent.com/fixture/skill/HEAD/', '')];
    return value instanceof Response
      ? value
      : value === undefined
        ? new Response(null, { status: 404 })
        : new Response(value);
  });
}

const instructions = '[Guide](references/guide.md)';

describe('explicit skill resource discovery', () => {
  it('deduplicates inline paths, markdown links and definitions, ignoring external links', () => {
    expect(
      referencedSkillResourcePaths(
        'Use `references/guide.md`. [Guide](./references/guide.md#part)\n[Rules][rules]\n[rules]: <assets/rules.json>\n[external](https://example.test/ref) [heading](#start)',
      ),
    ).toEqual({ ok: true, paths: ['references/guide.md', 'assets/rules.json'] });
  });
  it('resolves resource-local links relative to the resource directory', () => {
    expect(referencedSkillResourcePaths('[next](next.md)', 'references/guide.md')).toEqual({
      ok: true,
      paths: ['references/next.md'],
    });
  });
  it.each([
    '../secret.md',
    'references/../secret.md',
    '/references/a.md',
    'references/%2e%2e/a.md',
    'references/a.md?x=1',
    'references\\a.md',
    'references//a.md',
    'docs/a.md',
    'references/a%23b.md',
  ])('refuses unsafe/out-of-scope path %s', (path) => {
    expect(referencedSkillResourcePaths(`[x](${path})`)).toMatchObject({ ok: false, reason: 'invalid_path' });
  });
  it.each([
    'scripts/run.sh',
    'scripts/guide.md',
    'references/run.py',
    'assets/image.png',
    'assets/page.html',
    'assets/drawing.svg',
  ])('refuses executable/non-text resource %s', (path) => {
    expect(referencedSkillResourcePaths(`[x](${path})`)).toMatchObject({ ok: false, reason: 'unsupported_type' });
  });
});

describe('bounded skill resource snapshots', () => {
  it('loads and hashes the complete inert bundle with explicit bounded dependencies', async () => {
    const fetchImpl = fetchFixture({
      'references/guide.md': 'Synthetic guide. [Details](details.txt) [settings](assets/rules.json)',
      'references/details.txt': 'Synthetic reference facts.',
      'assets/rules.json': '{"synthetic":true}',
    });

    const result = await fetchSkillResourceSnapshots('fixture/skill', instructions, { fetchImpl });
    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error('Expected synthetic bundle');
    }

    expect(result.resources.map((item) => item.path)).toEqual([
      'references/guide.md',
      'references/details.txt',
      'assets/rules.json',
    ]);
    expect(result.resourceContents['references/details.txt']).toBe('Synthetic reference facts.');
    expect(result.resources[1]).toEqual({
      path: 'references/details.txt',
      kind: 'reference',
      bytes: 26,
      content: 'Synthetic reference facts.',
      contentHash: createHash('sha256').update('Synthetic reference facts.').digest('hex'),
    });

    for (const [url, init] of fetchImpl.mock.calls) {
      expect(String(url)).toMatch(
        /^https:\/\/raw\.githubusercontent\.com\/fixture\/skill\/HEAD\/(references|assets)\//,
      );
      expect(init?.redirect).toBe('error');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });
  it('fetches cycles and duplicates at most once', async () => {
    const fetchImpl = fetchFixture({ 'references/guide.md': '[self](guide.md) [self](references/guide.md)' });
    expect(
      (await fetchSkillResourceSnapshots('fixture/skill', `${instructions} ${instructions}`, { fetchImpl })).ok,
    ).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('does not fetch for invalid repo or initial path', async () => {
    const fetchImpl = fetchFixture({});
    expect(await fetchSkillResourceSnapshots('https://evil.test/repo', instructions, { fetchImpl })).toEqual({
      ok: false,
      reason: 'invalid_repository',
    });
    expect(
      await fetchSkillResourceSnapshots('fixture/skill', '[x](references/../secret.md)', { fetchImpl }),
    ).toMatchObject({ ok: false, reason: 'invalid_path' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('returns an empty bundle without following external or protocol-relative links', async () => {
    const fetchImpl = fetchFixture({});
    expect(
      await fetchSkillResourceSnapshots(
        'fixture/skill',
        '[x](https://example.test/references/a.md) [x](//evil.test/file) [x](javascript:alert)',
        { fetchImpl },
      ),
    ).toEqual({ ok: true, resources: [], resourceContents: {} });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each([404, 403, 500, 302])('fails the whole snapshot on HTTP %s', async (status) => {
    const result = await fetchSkillResourceSnapshots('fixture/skill', instructions, {
      fetchImpl: fetchFixture({ 'references/guide.md': new Response(null, { status }) }),
    });
    expect(result).toEqual({ ok: false, reason: 'unavailable', path: 'references/guide.md' });
    expect('resources' in result).toBe(false);
  });
  it('rejects a response reporting a redirect even if fetch follows it', async () => {
    const response = new Response('synthetic');
    Object.defineProperty(response, 'redirected', { value: true });
    expect(
      await fetchSkillResourceSnapshots('fixture/skill', instructions, {
        fetchImpl: fetchFixture({ 'references/guide.md': response }),
      }),
    ).toMatchObject({ ok: false, reason: 'unavailable' });
  });
  it.each([206, 200])('rejects partial content even when HTTP %s is successful', async (status) => {
    const response = new Response('partial synthetic file', {
      status,
      headers: status === 200 ? { 'content-range': 'bytes 0-21/100' } : {},
    });

    const fetchImpl = fetchFixture({ 'references/guide.md': response });
    expect(await fetchSkillResourceSnapshots('fixture/skill', instructions, { fetchImpl })).toEqual({
      ok: false,
      reason: 'invalid_content',
      path: 'references/guide.md',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(response.body?.locked).toBe(false);
  });
  it('shares a 24 second bundle deadline across individual 6 second requests', async () => {
    const bundle = new AbortController();
    const perFile = new AbortController();

    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      expect([24_000, 6_000]).toContain(ms);
      return ms === 24_000 ? bundle.signal : perFile.signal;
    });
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      if (fetchImpl.mock.calls.length === 1) {
        return new Response('[next](next.md)');
      }

      const signal = init?.signal;
      expect(signal).toBeInstanceOf(AbortSignal);

      return new Promise<Response>((_resolve, reject) => {
        signal!.addEventListener('abort', () => reject(signal!.reason), { once: true });
        bundle.abort(new DOMException('Synthetic deadline', 'TimeoutError'));
      });
    });

    try {
      expect(await fetchSkillResourceSnapshots('fixture/skill', instructions, { fetchImpl })).toEqual({
        ok: false,
        reason: 'unavailable',
        path: 'references/next.md',
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(timeout.mock.calls).toEqual([[24_000], [6_000], [6_000]]);
      expect(perFile.signal.aborted).toBe(false);
    } finally {
      timeout.mockRestore();
    }
  });
  it('handles network failure with no partial bundle', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Synthetic network failure'));
    expect(await fetchSkillResourceSnapshots('fixture/skill', instructions, { fetchImpl })).toMatchObject({
      ok: false,
      reason: 'unavailable',
    });
  });
  it.each([new Uint8Array([0xff, 0xfe]), new Uint8Array([65, 0, 66]), new Uint8Array([65, 7, 66])])(
    'rejects invalid UTF-8/binary bytes',
    async (bytes) => {
      expect(
        await fetchSkillResourceSnapshots('fixture/skill', instructions, {
          fetchImpl: fetchFixture({ 'references/guide.md': new Response(bytes) }),
        }),
      ).toMatchObject({ ok: false, reason: 'invalid_content' });
    },
  );
  it('rejects whitespace-only resources', async () => {
    expect(
      await fetchSkillResourceSnapshots('fixture/skill', instructions, {
        fetchImpl: fetchFixture({ 'references/guide.md': ' \r\n\t' }),
      }),
    ).toMatchObject({ ok: false, reason: 'empty_content' });
  });
  it('measures UTF-8 bytes and hashes exactly the stored text, including BOM', async () => {
    const content = '\ufeffÉté 校对';

    const result = await fetchSkillResourceSnapshots('fixture/skill', instructions, {
      fetchImpl: fetchFixture({ 'references/guide.md': content }),
    });
    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error('Expected synthetic bundle');
    }

    expect(result.resources[0]).toMatchObject({
      content,
      bytes: Buffer.byteLength(content),
      contentHash: createHash('sha256').update(content).digest('hex'),
    });
  });
  it('cancels the response immediately on streamed byte overflow', async () => {
    const cancel = vi.fn();

    let produced = 0;

    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        produced++;
        controller.enqueue(new Uint8Array(MAX_SKILL_RESOURCE_BYTES));
      },
      cancel,
    });
    expect(
      await fetchSkillResourceSnapshots('fixture/skill', instructions, {
        fetchImpl: fetchFixture({ 'references/guide.md': new Response(stream) }),
      }),
    ).toMatchObject({ ok: false, reason: 'resource_size_limit' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(produced).toBeLessThanOrEqual(3);
  });
  it('rejects an advertised oversized body without reading it', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    expect(
      await fetchSkillResourceSnapshots('fixture/skill', instructions, {
        fetchImpl: fetchFixture({
          'references/guide.md': new Response(stream, {
            headers: { 'content-length': String(MAX_SKILL_RESOURCE_BYTES + 1) },
          }),
        }),
      }),
    ).toMatchObject({ ok: false, reason: 'resource_size_limit' });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('enforces cumulative byte cap with no silent truncation', async () => {
    const files = Object.fromEntries(
      Array.from({ length: 5 }, (_, i) => [`references/${i}.txt`, 'a'.repeat(MAX_SKILL_RESOURCE_BYTES)]),
    );
    const source = Object.keys(files)
      .map((path) => `[x](${path})`)
      .join(' ');

    const result = await fetchSkillResourceSnapshots('fixture/skill', source, { fetchImpl: fetchFixture(files) });
    expect(result).toMatchObject({ ok: false, reason: 'bundle_size_limit' });
    expect('resources' in result).toBe(false);
  });
  it('rejects initial count overflow before fetching', async () => {
    const fetchImpl = fetchFixture({});
    expect(
      await fetchSkillResourceSnapshots(
        'fixture/skill',
        Array.from({ length: 9 }, (_, i) => `[x](references/${i}.md)`).join(' '),
        { fetchImpl },
      ),
    ).toMatchObject({ ok: false, reason: 'resource_count_limit' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('bounds depth and never fetches fourth-level resources', async () => {
    const fetchImpl = fetchFixture({
      'references/guide.md': '[x](two.md)',
      'references/two.md': '[x](three.md)',
      'references/three.md': '[x](four.md)',
    });
    expect(await fetchSkillResourceSnapshots('fixture/skill', instructions, { fetchImpl })).toMatchObject({
      ok: false,
      reason: 'resource_depth_limit',
      path: 'references/four.md',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it('fails closed on invalid transitive paths', async () => {
    const result = await fetchSkillResourceSnapshots('fixture/skill', instructions, {
      fetchImpl: fetchFixture({ 'references/guide.md': '[secret](../secret.md)' }),
    });
    expect(result).toMatchObject({ ok: false, reason: 'invalid_path' });
    expect('resources' in result).toBe(false);
  });
});

describe('resource dependency and content-type boundary', () => {
  it('recognizes a standalone relative backticked dependency inside a resource', async () => {
    const fetchImpl = fetchFixture({
      'references/guide.md': 'Read `details.md`.',
      'references/details.md': 'Synthetic details',
    });

    const result = await fetchSkillResourceSnapshots('fixture/skill', instructions, { fetchImpl });
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.resources.map((resource) => resource.path)).toEqual([
        'references/guide.md',
        'references/details.md',
      ]);
    }

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('rejects a script dependency discovered in backticks inside a resource', async () => {
    const fetchImpl = fetchFixture({ 'references/guide.md': 'Requires `setup.py`.' });
    expect(await fetchSkillResourceSnapshots('fixture/skill', instructions, { fetchImpl })).toMatchObject({
      ok: false,
      reason: 'unsupported_type',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('refuses a binary/active MIME type even when its bytes happen to be UTF-8', async () => {
    const response = new Response('<svg>synthetic</svg>', { headers: { 'content-type': 'image/svg+xml' } });
    expect(
      await fetchSkillResourceSnapshots('fixture/skill', instructions, {
        fetchImpl: fetchFixture({ 'references/guide.md': response }),
      }),
    ).toMatchObject({ ok: false, reason: 'invalid_content' });
  });
});
