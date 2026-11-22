import { recipeApi, recipeApp } from './browser-http.js';

export const startupMarks = [
  'ide-route-evaluated',
  'entry-module-evaluated',
  'catalogues-ready',
  'hydrate-requested',
  'chat-module-resolved',
  'archive-decode-ready',
] as const;

export type StartupMark = (typeof startupMarks)[number];

type Boundary =
  | 'ide'
  | 'ticket'
  | 'boot-preflight'
  | 'boot'
  | 'start-preflight'
  | 'start'
  | 'status'
  | 'archive'
  | 'revision'
  | 'import';

type PageErrorKind = 'ReferenceError' | 'SyntaxError' | 'TypeError' | 'Error' | 'other';

export interface SeedEvidence {
  startup: StartupMark[];
  statuses: Partial<Record<Boundary, number[]>>;
  requestFailures: Boundary[];
  pageErrors: PageErrorKind[];
  projectNameRendered: boolean;
  observedWorkspace: boolean;
  reseedClear: boolean;
  markerRead: boolean;
}

export function emptySeedEvidence(): SeedEvidence {
  return {
    startup: [],
    statuses: {},
    requestFailures: [],
    pageErrors: [],
    projectNameRendered: false,
    observedWorkspace: false,
    reseedClear: false,
    markerRead: false,
  };
}

export function pageErrorKind(name: string): PageErrorKind {
  return name === 'ReferenceError' || name === 'SyntaxError' || name === 'TypeError' || name === 'Error'
    ? name
    : 'other';
}

export function seedBoundary(value: string, method: string, project: string): Boundary | undefined {
  const { origin, pathname, searchParams } = new URL(value);

  if (origin === recipeApp) {
    if (method !== 'GET') {
      return undefined;
    }

    if (pathname === `/projects/${project}/ide`) {
      return 'ide';
    }

    if (pathname === '/api/runtime-token' && searchParams.get('projectId') === project) {
      return 'ticket';
    }

    if (pathname === `/api/projects/${project}/project-action` && searchParams.get('intent') === 'export') {
      return 'archive';
    }

    if (pathname === `/api/projects/${project}/files-revision`) {
      return 'revision';
    }
  }

  if (origin !== recipeApi) {
    return undefined;
  }

  if (pathname === '/api/runtime/runtime/boot') {
    return method === 'OPTIONS' ? 'boot-preflight' : method === 'POST' ? 'boot' : undefined;
  }

  if (pathname === '/api/runtime/workspaces') {
    return method === 'OPTIONS' ? 'start-preflight' : method === 'POST' ? 'start' : undefined;
  }

  if (/^\/api\/runtime\/workspaces\/ws-[a-z0-9-]+\/status$/.test(pathname) && method === 'GET') {
    return 'status';
  }

  if (/^\/api\/runtime\/workspaces\/ws-[a-z0-9-]+\/import$/.test(pathname) && method === 'POST') {
    return 'import';
  }

  return undefined;
}

export function recordSeedStatus(evidence: SeedEvidence, key: Boundary, status: number) {
  const states = (evidence.statuses[key] ??= []);

  if (Number.isInteger(status) && status >= 100 && status <= 599 && !states.includes(status) && states.length < 5) {
    states.push(status);
  }
}

export function diagnoseSeed(evidence: SeedEvidence) {
  const successful = (key: Boundary) => evidence.statuses[key]?.some((status) => status >= 200 && status < 300);
  const observed = (key: Boundary) => evidence.statuses[key]?.length || evidence.requestFailures.includes(key);

  if (!successful('ide')) {
    return 'ide-http';
  }

  if (!evidence.startup.includes('hydrate-requested')) {
    return 'browser-hydration-not-requested';
  }

  if (!successful('ticket')) {
    if (!evidence.projectNameRendered && !observed('ticket')) {
      return 'ide-project-data-not-rendered';
    }

    return observed('ticket') ? 'runtime-ticket-failed' : 'runtime-ticket-not-observed';
  }

  if (!successful('boot')) {
    return observed('boot') || observed('boot-preflight') ? 'runtime-boot-failed' : 'runtime-boot-not-observed';
  }

  if (!successful('start')) {
    return observed('start') || observed('start-preflight') ? 'workspace-start-failed' : 'workspace-start-not-observed';
  }

  if (!evidence.observedWorkspace) {
    return 'workspace-response-not-matched';
  }

  if (!successful('archive') || !successful('import') || !evidence.reseedClear) {
    return 'seed-archive-import-incomplete';
  }

  return evidence.markerRead ? 'http-seed-and-marker-seen' : 'seed-marker-not-read';
}

export function recipeCorsReady(status: number, headers: Headers): boolean {
  const fields = (name: string) =>
    (headers.get(name) ?? '')
      .toLowerCase()
      .split(',')
      .map((value) => value.trim());

  const accepted = fields('access-control-allow-headers');

  return (
    status >= 200 &&
    status < 300 &&
    headers.get('access-control-allow-origin') === recipeApp &&
    fields('access-control-allow-methods').includes('post') &&
    accepted.includes('authorization') &&
    accepted.includes('content-type')
  );
}
