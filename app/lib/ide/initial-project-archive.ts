export type ProjectArchiveResponse = { archive?: { base64?: string } };

/** Only a successful IDE loader may opt the server document into archive transport. */
export function initialArchiveProject(matches: ReadonlyArray<{ id: string; data: unknown }>) {
  const data = matches.find((match) => match.id === 'routes/projects.$projectId.ide')?.data;

  if (!data || typeof data !== 'object' || !('projectId' in data) || 'projectApiError' in data) {
    return undefined;
  }

  return typeof data.projectId === 'string' && data.projectId ? data.projectId : undefined;
}

let initialArchive: { projectId: string; promise: Promise<ProjectArchiveResponse> } | undefined;

function mark(phase: string) {
  (globalThis as { __vibecoreStartupMark?: (phase: string) => void }).__vibecoreStartupMark?.(phase);
}

export async function requestProjectArchive(projectId: string): Promise<ProjectArchiveResponse> {
  mark('archive-fetch-start');

  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/export/zip`, {
    credentials: 'include',
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    throw Object.assign(new Error(), { code: 'PROJECT_FILE_ARCHIVE_HTTP_ERROR', status: response.status });
  }

  mark('archive-headers-ready');

  const payload = (await response.json()) as ProjectArchiveResponse;
  mark('archive-json-ready');

  return payload;
}

/** Start transport before the IDE's UI graph finishes evaluating. No file state is changed here. */
export function prefetchInitialProjectArchive(projectId: string) {
  if (initialArchive?.projectId === projectId) {
    return initialArchive.promise;
  }

  const promise = requestProjectArchive(projectId);
  initialArchive = { projectId, promise };

  // Preserve a rejection for the consumer without an unhandled speculative rejection.
  void promise.catch(() => undefined);

  return promise;
}

/** Navigation may abandon transport before the store consumes it. Never reuse that snapshot on return. */
export function discardInitialProjectArchiveExcept(projectId: string | undefined) {
  if (initialArchive?.projectId !== projectId) {
    initialArchive = undefined;
  }
}

/** Consume once: subsequent reloads must fetch a fresh archive, even for the same project. */
export function takeInitialProjectArchive(projectId: string) {
  const pending = initialArchive;
  initialArchive = undefined;

  return pending?.projectId === projectId ? pending.promise : undefined;
}

/* The SSR document supplies its authorized project. Other documents do no work. */
if (typeof document !== 'undefined') {
  window.addEventListener('pagehide', () => discardInitialProjectArchiveExcept(undefined), { once: true });

  const projectId = document
    .querySelector('[data-vibecore-project-archive]')
    ?.getAttribute('data-vibecore-project-archive');

  if (projectId) {
    void prefetchInitialProjectArchive(projectId);
  }
}
