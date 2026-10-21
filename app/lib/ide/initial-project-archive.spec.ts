// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

it('does no transport work on a document without an IDE project marker', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await import('./initial-project-archive');
  expect(fetch).not.toHaveBeenCalled();
});

it('starts from the SSR marker and hands the same request to the consumer once', async () => {
  document.body.innerHTML = '<main data-vibecore-project-archive="project-a"></main>';

  let release!: (response: Response) => void;

  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetch);

  const archive = await import('./initial-project-archive');
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledWith('/api/projects/project-a/export/zip', {
    credentials: 'include',
    headers: { accept: 'application/json' },
  });

  const pending = archive.takeInitialProjectArchive('project-a');
  expect(pending).toBeDefined();
  expect(archive.takeInitialProjectArchive('project-a')).toBeUndefined();
  release(new Response(JSON.stringify({ archive: { base64: 'archive-data' } })));
  await expect(pending).resolves.toEqual({ archive: { base64: 'archive-data' } });
  expect(fetch).toHaveBeenCalledOnce();
});

it('never hands an earlier project archive to a different project', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ archive: { base64: 'a' } }))),
  );

  const archive = await import('./initial-project-archive');
  await archive.prefetchInitialProjectArchive('project-a');
  expect(archive.takeInitialProjectArchive('project-b')).toBeUndefined();
  expect(archive.takeInitialProjectArchive('project-a')).toBeUndefined();
});

it('preserves a denied response for its consumer without silently retrying', async () => {
  const fetch = vi.fn(async () => new Response('', { status: 403 }));
  vi.stubGlobal('fetch', fetch);

  const archive = await import('./initial-project-archive');
  const pending = archive.prefetchInitialProjectArchive('project-a');
  expect(archive.prefetchInitialProjectArchive('project-a')).toBe(pending);
  await expect(archive.takeInitialProjectArchive('project-a')).rejects.toMatchObject({
    code: 'PROJECT_FILE_ARCHIVE_HTTP_ERROR',
    status: 403,
  });
  expect(fetch).toHaveBeenCalledOnce();
});

it('can be imported during SSR without accessing the DOM or fetching', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('document', undefined);
  await import('./initial-project-archive');
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it('only marks successful IDE loader data, never another route or an error', async () => {
  const { initialArchiveProject } = await import('./initial-project-archive');
  const id = 'routes/projects.$projectId.ide';
  expect(initialArchiveProject([{ id, data: { projectId: 'project-a' } }])).toBe('project-a');
  expect(initialArchiveProject([{ id, data: { projectId: 'project-a', projectApiError: 'denied' } }])).toBeUndefined();
  expect(initialArchiveProject([{ id: 'routes/projects', data: { projectId: 'project-a' } }])).toBeUndefined();
  expect(initialArchiveProject([{ id, data: null }])).toBeUndefined();
});

it('discards an unconsumed snapshot on route departure without starting another request', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ archive: { base64: 'old' } })));
  vi.stubGlobal('fetch', fetch);

  const archive = await import('./initial-project-archive');
  const first = archive.prefetchInitialProjectArchive('project-a');
  archive.discardInitialProjectArchiveExcept('project-a');
  expect(archive.prefetchInitialProjectArchive('project-a')).toBe(first);
  archive.discardInitialProjectArchiveExcept(undefined);
  expect(archive.takeInitialProjectArchive('project-a')).toBeUndefined();
  expect(fetch).toHaveBeenCalledOnce();
  await archive.requestProjectArchive('project-a');
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('discards the snapshot on a different project and on pagehide before BFCache return', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ archive: { base64: 'old' } }))),
  );

  const archive = await import('./initial-project-archive');
  await archive.prefetchInitialProjectArchive('project-a');
  archive.discardInitialProjectArchiveExcept('project-b');
  expect(archive.takeInitialProjectArchive('project-a')).toBeUndefined();
  await archive.prefetchInitialProjectArchive('project-a');
  window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
  expect(archive.takeInitialProjectArchive('project-a')).toBeUndefined();
});
