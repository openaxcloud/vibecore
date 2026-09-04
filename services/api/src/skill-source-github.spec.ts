import { describe, expect, it, vi } from 'vitest';
import { fetchGithubSkillBundle, normalizeGithubSkillSource, SkillSourceError } from './skill-source-github.js';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const DEFAULT_SKILL = '---\nname: review\ndescription: Review changes safely.\n---\n\nFollow the checklist.';
const DEFAULT_RESOURCE = 'Check it';

function response(body: unknown, status = 200): Response {
  if (body instanceof Uint8Array) {
    return new Response(body, { status });
  }

  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function bundleFetch(overrides?: { tree?: unknown; skill?: string; resource?: string }) {
  const skill = overrides?.skill ?? DEFAULT_SKILL;
  const resource = overrides?.resource ?? DEFAULT_RESOURCE;

  return vi.fn(async (raw: string | URL | Request) => {
    const url = String(raw);

    if (url.includes('/commits/')) {
      return response({ sha: SHA });
    }

    if (url.includes('/git/trees/')) {
      return response(
        overrides?.tree ?? {
          truncated: false,
          tree: [
            {
              path: 'skills/review/SKILL.md',
              mode: '100644',
              type: 'blob',
              size: Buffer.byteLength(skill),
            },
            {
              path: 'skills/review/references/checklist.md',
              mode: '100644',
              type: 'blob',
              size: Buffer.byteLength(resource),
            },
            { path: 'other/SKILL.md', mode: '100644', type: 'blob', size: 1 },
          ],
        },
      );
    }

    if (url.endsWith('/SKILL.md')) {
      return new Response(skill);
    }

    if (url.endsWith('/references/checklist.md')) {
      return new Response(resource);
    }

    return response({}, 404);
  });
}

describe('normalizeGithubSkillSource', () => {
  it('normalizes a confined folder and defaults the ref', () => {
    expect(normalizeGithubSkillSource({ ownerRepo: 'openai/example.git', skillPath: '/skills/review/' })).toEqual({
      ownerRepo: 'openai/example',
      skillPath: 'skills/review',
      ref: 'HEAD',
    });
  });

  it.each([
    { ownerRepo: 'owner/repo/extra', skillPath: 'skill' },
    { ownerRepo: 'owner/..', skillPath: 'skill' },
    { ownerRepo: 'owner/repo', skillPath: '../skill' },
    { ownerRepo: 'owner/repo', skillPath: '.' },
    { ownerRepo: 'owner/repo', skillPath: 'skill\\escape' },
    { ownerRepo: 'owner/repo', skillPath: 'skill', ref: '..' },
    { ownerRepo: 'owner/repo', skillPath: 'skill', ref: 'refs//heads/main' },
    { ownerRepo: 'owner/repo', skillPath: 'skill', ref: 'refs/heads/bad.lock..next' },
  ])('rejects unsafe input %#', (input) => {
    expect(() => normalizeGithubSkillSource(input)).toThrow(SkillSourceError);
  });
});

describe('fetchGithubSkillBundle', () => {
  it('pins the moving ref, confines the folder, and returns a deterministic digest', async () => {
    const fetchImpl = bundleFetch();

    const first = await fetchGithubSkillBundle(
      { ownerRepo: 'anthropics/skills', skillPath: 'skills/review', ref: 'main' },
      { fetchImpl },
    );
    const second = await fetchGithubSkillBundle(
      { ownerRepo: 'anthropics/skills', skillPath: 'skills/review', ref: 'main' },
      { fetchImpl: bundleFetch() },
    );

    expect(first.commitSha).toBe(SHA);
    expect(first.files.map((file) => file.path)).toEqual(['references/checklist.md', 'SKILL.md']);
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(second.digest).toBe(first.digest);
    expect(fetchImpl.mock.calls.every(([url]) => String(url).startsWith('https://'))).toBe(true);
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes(`/${SHA}/skills/review/SKILL.md`))).toBe(true);
  });

  it('uses an already immutable commit without a commit lookup', async () => {
    const fetchImpl = bundleFetch();
    await fetchGithubSkillBundle(
      { ownerRepo: 'anthropics/skills', skillPath: 'skills/review', ref: SHA },
      { fetchImpl },
    );

    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('/commits/'))).toBe(false);
  });

  it('downloads immutable bundle files with bounded concurrency and stable ordering', async () => {
    const resourcePaths = Array.from({ length: 7 }, (_, index) => `skills/review/references/${index}.md`);
    const tree = [
      {
        path: 'skills/review/SKILL.md',
        mode: '100644',
        type: 'blob',
        size: Buffer.byteLength(DEFAULT_SKILL),
      },
      ...resourcePaths.map((path) => ({ path, mode: '100644', type: 'blob', size: 1 })),
    ];

    let activeDownloads = 0;
    let peakDownloads = 0;

    const fetchImpl = vi.fn(async (raw: string | URL | Request, init?: RequestInit) => {
      const url = String(raw);

      if (url.includes('/git/trees/')) return response({ truncated: false, tree });

      activeDownloads += 1;
      peakDownloads = Math.max(peakDownloads, activeDownloads);

      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 10);
          init?.signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(init.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        });
      } finally {
        activeDownloads -= 1;
      }

      return new Response(url.endsWith('/SKILL.md') ? DEFAULT_SKILL : 'x');
    });

    const bundle = await fetchGithubSkillBundle(
      { ownerRepo: 'anthropics/skills', skillPath: 'skills/review', ref: SHA },
      { fetchImpl, downloadConcurrency: 2 },
    );

    expect(peakDownloads).toBe(2);
    expect(bundle.files.map((file) => file.path)).toEqual([
      ...resourcePaths.map((path) => path.slice('skills/review/'.length)),
      'SKILL.md',
    ]);
  });

  it('aborts all in-flight downloads when the caller cancels the import', async () => {
    const controller = new AbortController();
    const tree = [
      {
        path: 'skills/review/SKILL.md',
        mode: '100644',
        type: 'blob',
        size: Buffer.byteLength(DEFAULT_SKILL),
      },
      { path: 'skills/review/references/a.md', mode: '100644', type: 'blob', size: 1 },
      { path: 'skills/review/references/b.md', mode: '100644', type: 'blob', size: 1 },
    ];

    let signalFirstDownload!: () => void;
    const firstDownload = new Promise<void>((resolve) => {
      signalFirstDownload = resolve;
    });
    let abortedDownloads = 0;

    const fetchImpl = vi.fn(async (raw: string | URL | Request, init?: RequestInit) => {
      const url = String(raw);

      if (url.includes('/git/trees/')) return response({ truncated: false, tree });
      signalFirstDownload();

      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;

        if (!signal) return reject(new Error('Missing import abort signal'));

        const aborted = () => {
          abortedDownloads += 1;
          reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        };

        if (signal.aborted) aborted();
        else signal.addEventListener('abort', aborted, { once: true });
      });
    });

    const pending = fetchGithubSkillBundle(
      { ownerRepo: 'anthropics/skills', skillPath: 'skills/review', ref: SHA },
      { fetchImpl, signal: controller.signal, downloadConcurrency: 3 },
    );

    await firstDownload;
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: 'SKILL_SOURCE_ABORTED', statusCode: 499 });
    expect(abortedDownloads).toBe(3);
  });

  it('enforces one deadline across the complete bundle import', async () => {
    const tree = [
      {
        path: 'skills/review/SKILL.md',
        mode: '100644',
        type: 'blob',
        size: Buffer.byteLength(DEFAULT_SKILL),
      },
    ];
    const fetchImpl = vi.fn(async (raw: string | URL | Request, init?: RequestInit) => {
      const url = String(raw);

      if (url.includes('/git/trees/')) return response({ truncated: false, tree });

      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;

        if (!signal) return reject(new Error('Missing deadline signal'));
        signal.addEventListener('abort', () => reject(signal.reason ?? new DOMException('Timed out', 'TimeoutError')), {
          once: true,
        });
      });
    });

    await expect(
      fetchGithubSkillBundle(
        { ownerRepo: 'anthropics/skills', skillPath: 'skills/review', ref: SHA },
        { fetchImpl, timeoutMs: 20 },
      ),
    ).rejects.toMatchObject({ code: 'SKILL_SOURCE_TIMEOUT', statusCode: 504 });
  });

  it('requires an exact SKILL.md and never falls back to README or AGENTS', async () => {
    const fetchImpl = bundleFetch({
      tree: {
        truncated: false,
        tree: [
          { path: 'skills/review/README.md', mode: '100644', type: 'blob', size: 20 },
          { path: 'skills/review/AGENTS.md', mode: '100644', type: 'blob', size: 20 },
        ],
      },
    });

    await expect(
      fetchGithubSkillBundle({ ownerRepo: 'anthropics/skills', skillPath: 'skills/review' }, { fetchImpl }),
    ).rejects.toMatchObject({ code: 'SKILL_SOURCE_NOT_FOUND', statusCode: 404 });
  });

  it('rejects duplicate paths, malformed size metadata, and byte mismatches', async () => {
    const duplicate = bundleFetch({
      tree: {
        truncated: false,
        tree: [
          {
            path: 'skills/review/SKILL.md',
            mode: '100644',
            type: 'blob',
            size: Buffer.byteLength(DEFAULT_SKILL),
          },
          {
            path: 'skills/review/SKILL.md',
            mode: '100644',
            type: 'blob',
            size: Buffer.byteLength(DEFAULT_SKILL),
          },
        ],
      },
    });
    await expect(
      fetchGithubSkillBundle({ ownerRepo: 'anthropics/skills', skillPath: 'skills/review' }, { fetchImpl: duplicate }),
    ).rejects.toMatchObject({ code: 'SKILL_SOURCE_UNSAFE' });

    const missingSize = bundleFetch({
      tree: {
        truncated: false,
        tree: [{ path: 'skills/review/SKILL.md', mode: '100644', type: 'blob' }],
      },
    });
    await expect(
      fetchGithubSkillBundle(
        { ownerRepo: 'anthropics/skills', skillPath: 'skills/review' },
        { fetchImpl: missingSize },
      ),
    ).rejects.toMatchObject({ code: 'SKILL_SOURCE_UNSAFE' });

    const wrongSize = bundleFetch({
      tree: {
        truncated: false,
        tree: [{ path: 'skills/review/SKILL.md', mode: '100644', type: 'blob', size: 1 }],
      },
    });
    await expect(
      fetchGithubSkillBundle({ ownerRepo: 'anthropics/skills', skillPath: 'skills/review' }, { fetchImpl: wrongSize }),
    ).rejects.toMatchObject({ code: 'SKILL_SOURCE_TOO_LARGE' });
  });

  it.each([
    { path: 'skills/review/link', mode: '120000', type: 'blob', size: 5 },
    { path: 'skills/review/module', mode: '160000', type: 'commit', size: 0 },
  ])('rejects symlink/submodule entries %#', async (unsafeEntry) => {
    const fetchImpl = bundleFetch({
      tree: {
        truncated: false,
        tree: [{ path: 'skills/review/SKILL.md', mode: '100644', type: 'blob', size: 20 }, unsafeEntry],
      },
    });

    await expect(
      fetchGithubSkillBundle({ ownerRepo: 'anthropics/skills', skillPath: 'skills/review' }, { fetchImpl }),
    ).rejects.toMatchObject({ code: 'SKILL_SOURCE_UNSAFE' });
  });

  it('rejects a truncated tree and rate limits with stable errors', async () => {
    await expect(
      fetchGithubSkillBundle(
        { ownerRepo: 'anthropics/skills', skillPath: 'skills/review' },
        { fetchImpl: bundleFetch({ tree: { truncated: true, tree: [] } }) },
      ),
    ).rejects.toMatchObject({ code: 'SKILL_SOURCE_TOO_LARGE', statusCode: 413 });

    const rateLimited = vi.fn(async (_url: string | URL | Request) => response({}, 429));
    await expect(
      fetchGithubSkillBundle(
        { ownerRepo: 'anthropics/skills', skillPath: 'skills/review' },
        { fetchImpl: rateLimited },
      ),
    ).rejects.toMatchObject({ code: 'SKILL_SOURCE_RATE_LIMITED', statusCode: 429 });
  });

  it('distinguishes source authorization failures from rate limiting', async () => {
    const forbidden = vi.fn(async (_url: string | URL | Request) => response({}, 403));

    await expect(
      fetchGithubSkillBundle({ ownerRepo: 'private/skills', skillPath: 'skills/review' }, { fetchImpl: forbidden }),
    ).rejects.toMatchObject({ code: 'SKILL_SOURCE_FORBIDDEN', statusCode: 403 });
  });

  it('rejects oversized GitHub metadata before buffering or parsing it', async () => {
    const oversized = vi.fn(
      async (_url: string | URL | Request) =>
        new Response('{}', {
          headers: { 'content-length': String(12 * 1024 * 1024 + 1) },
        }),
    );

    await expect(
      fetchGithubSkillBundle(
        { ownerRepo: 'anthropics/skills', skillPath: 'skills/review', ref: SHA },
        { fetchImpl: oversized },
      ),
    ).rejects.toMatchObject({ code: 'SKILL_SOURCE_TOO_LARGE', statusCode: 413 });
  });
});
