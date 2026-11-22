import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import JSZip from 'jszip';

import {
  diagnoseSeed,
  emptySeedEvidence,
  pageErrorKind,
  recipeCorsReady,
  recordSeedStatus,
  seedBoundary,
  startupMarks,
} from './browser-evidence.js';
import { recipeApi, recipeApp, startRecipeBrowserHttp } from './browser-http.js';

type Identity = { podUid: string; pvcUid: string };
type Phase =
  | 'web-ready'
  | 'canonical-archive'
  | 'runtime-preflight'
  | 'first-browser-launch'
  | 'first-ide-navigation'
  | 'first-workspace-start'
  | 'first-archive-marker'
  | 'first-owned-identity'
  | 'owned-fixtures'
  | 'reopen-navigation'
  | 'reopen-seed'
  | 'verify';

export type BrowserFailureReport = {
  phase: Phase;
  boundary: Phase | ReturnType<typeof diagnoseSeed>;
  evidence?: ReturnType<typeof emptySeedEvidence>;
};

function need(ok: unknown, message: string): asserts ok {
  if (!ok) {
    throw new Error(message);
  }
}

async function eventually<T>(label: string, timeoutMs: number, check: () => Promise<T | undefined>): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  do {
    const result = await check();

    if (result !== undefined) {
      return result;
    }

    await sleep(250);
  } while (Date.now() < deadline);

  throw new Error(`Timed out: ${label}`);
}

async function assertUnusedWebPort() {
  const socket = createServer();
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.listen({ host: '127.0.0.1', port: 5173, exclusive: true }, () => {
      socket.close((error) => (error ? reject(error) : resolve()));
    });
  });
}

async function webReady(child: ChildProcess, started: () => boolean, launchFailed: () => boolean) {
  await eventually('owned web server', 45_000, async () => {
    need(!launchFailed() && child.exitCode === null && child.signalCode === null, 'Local web child exited');

    if (!started()) {
      return undefined;
    }

    const res = await fetch('http://127.0.0.1:5173/login', {
      headers: { host: 'localhost:5173' },
      redirect: 'manual',
      signal: AbortSignal.timeout(1_500),
    }).catch(() => undefined);

    return res?.status === 200 && res.headers.get('content-type')?.includes('text/html') ? true : undefined;
  });
}

async function closeWeb(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.kill('SIGTERM');
  await Promise.race([exited, sleep(3_000)]);

  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await Promise.race([exited, sleep(2_000)]);
  }
}

async function api<T>(path: string, token?: string, body?: unknown): Promise<T> {
  need(path.startsWith('/') && !path.startsWith('//'), 'Expected a same-origin recipe API path');

  const res = await fetch(`${recipeApi}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      accept: 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
    signal: AbortSignal.timeout(35_000),
  });
  need(res.ok, `Recipe API returned HTTP ${res.status}`);

  return (res.status === 204 ? undefined : await res.json()) as T;
}

async function assertRuntimePreflight() {
  for (const path of ['/api/runtime/runtime/boot', '/api/runtime/workspaces']) {
    const response = await fetch(recipeApi + path, {
      method: 'OPTIONS',
      headers: {
        origin: recipeApp,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(5_000),
    });
    need(recipeCorsReady(response.status, response.headers), 'Local API rejected the browser CORS prerequisites');
  }
}

async function newContext(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.addInitScript((allowed) => {
    const scope = globalThis as typeof globalThis & {
      __vibecoreStartupMark?: (mark: string) => void;
      __reseedRecipePublicMarks?: string[];
    };

    const marks: string[] = [];
    scope.__reseedRecipePublicMarks = marks;

    scope.__vibecoreStartupMark = (mark) => {
      if ((allowed as readonly string[]).includes(mark) && !marks.includes(mark)) {
        marks.push(mark);
      }
    };
  }, startupMarks);
  await context.addCookies([{ name: 'vc_session', value: token, url: recipeApp, httpOnly: true, sameSite: 'Lax' }]);

  return context;
}

function observe(page: Page, project: string, expectedProjectName: string) {
  const evidence = emptySeedEvidence();
  const started = new Set<string>();
  const deleted: { id: string; path: string | null }[] = [];
  const imported: string[] = [];
  const archived: number[] = [];
  const decisions: { decision?: string; reused?: boolean; seededThisSession?: boolean }[] = [];

  let clears = 0;

  function runtimePath(value: string) {
    const url = new URL(value);

    if (url.origin !== recipeApi) {
      return undefined;
    }

    const rem = url.pathname.match(/^\/api\/runtime\/workspaces\/([a-z0-9_-]+)\/(files|import)$/);

    return rem ? { id: rem[1], action: rem[2], path: url.searchParams.get('path') } : undefined;
  }

  page.on('console', (message) => {
    const text = message.text();

    if (text.startsWith('[workspace] reattach decision')) {
      void message
        .args()[1]
        ?.jsonValue()
        .then(
          (value) => decisions.push(value),
          () => undefined,
        );
    }

    if (text.startsWith('[workspace] reseed clear')) {
      evidence.reseedClear = true;
      clears += 1;
    }
  });

  page.on('request', (request) => {
    const target = runtimePath(request.url());

    if (request.method() === 'DELETE' && target?.action === 'files') {
      deleted.push({ id: target.id, path: target.path });
    }
  });

  page.on('pageerror', (error) => {
    const kind = pageErrorKind(error.name);

    if (!evidence.pageErrors.includes(kind)) {
      evidence.pageErrors.push(kind);
    }
  });

  page.on('requestfailed', (request) => {
    const name = seedBoundary(request.url(), request.method(), project);

    if (name && !evidence.requestFailures.includes(name)) {
      evidence.requestFailures.push(name);
    }
  });

  page.on('response', (response) => {
    const url = new URL(response.url());
    const method = response.request().method();
    const name = seedBoundary(response.url(), method, project);

    if (name) {
      recordSeedStatus(evidence, name, response.status());
    }

    if (
      url.origin === recipeApp &&
      url.pathname === `/api/projects/${project}/project-action` &&
      url.searchParams.get('intent') === 'export' &&
      method === 'GET'
    ) {
      archived.push(response.status());
    }

    if (url.origin === recipeApi && url.pathname === '/api/runtime/workspaces' && method === 'POST' && response.ok()) {
      let input: { projectId?: string; metadata?: { projectId?: string } } | undefined;

      try {
        input = response.request().postDataJSON();
      } catch {
        // Keep only the HTTP status for a response with an unreadable request.
      }

      if ((input?.projectId ?? input?.metadata?.projectId) !== project) {
        return;
      }

      void response.json().then(
        (session: { id?: string }) => {
          if (session.id && /^ws-[a-z0-9-]+$/.test(session.id)) {
            evidence.observedWorkspace = true;
            started.add(session.id);
          }
        },
        () => undefined,
      );
    }

    const target = runtimePath(response.url());

    if (method === 'POST' && target?.action === 'import' && response.ok()) {
      imported.push(target.id);
    }
  });

  const snapshotEvidence = async () => {
    const marks = await Promise.race([
      page
        .evaluate((name) => {
          const scope = globalThis as typeof globalThis & { __reseedRecipePublicMarks?: string[] };

          return {
            marks: scope.__reseedRecipePublicMarks,
            projectNameRendered: Boolean(
              document.querySelector('.bolt-project-ide-shell')?.textContent?.includes(name),
            ),
          };
        }, expectedProjectName)
        .catch(() => undefined),
      sleep(1_000).then(() => undefined),
    ]);
    evidence.startup = startupMarks.filter((mark) => marks?.marks?.includes(mark));
    evidence.projectNameRendered = marks?.projectNameRendered === true;

    return evidence;
  };

  return { started, deleted, imported, archived, decisions, evidence, snapshotEvidence, clears: () => clears };
}

async function readMarker(page: Page, markerIds: string[]) {
  const found = await page.evaluate(
    (ids) => ids.map((id) => [id, localStorage.getItem(`vc:ws-seed:${id}`)] as const).find(([, raw]) => raw !== null),
    markerIds,
  );

  if (!found?.[1]) {
    return undefined;
  }

  const result = JSON.parse(found[1]) as { seededAt?: number; revision?: string };

  if (
    typeof result.seededAt === 'number' &&
    result.seededAt > 0 &&
    typeof result.revision === 'string' &&
    result.revision
  ) {
    return { id: found[0], seededAt: result.seededAt, revision: result.revision };
  }

  return undefined;
}

const accessFixture = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const [mode, nonce] = process.argv.slice(1);
if (!/^[a-f0-9]{20}$/.test(nonce)) process.exit(2);
const base = 'obsolete-' + nonce;
const leaf = base + '/stale.txt';
const keep = 'canonical-' + nonce + '.txt';
const protectedPaths = [base + '/nested/pnpm-lock.yaml', base + '/node_modules/probe.bin', base + '/.git/probe.bin'];
if (mode === 'plant') {
  fs.writeFileSync(keep, 'runtime-stale-' + nonce);
  for (const [i, file] of [leaf, ...protectedPaths].entries()) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.concat([Buffer.from([0, 255, i]), Buffer.from(nonce)]));
  }
} else if (mode !== 'read') process.exit(2);
const read = (file) => fs.existsSync(file) ? fs.readFileSync(file).toString('base64') : null;
console.log(JSON.stringify({ keep: read(keep), leaf: read(leaf), protected: protectedPaths.map(read) }));
`;

type Files = { keep: string | null; leaf: string | null; protected: (string | null)[] };

async function fixture(token: string, id: string, nonce: string, mode: 'plant' | 'read'): Promise<Files> {
  const result = await api<{ exitCode: number; output: string }>(`/api/runtime/workspaces/${id}/commands`, token, {
    command: 'node',
    args: ['-e', accessFixture, mode, nonce],
  });
  need(result.exitCode === 0, 'Fixture command did not succeed');

  return JSON.parse(result.output.trim()) as Files;
}

function identicalIdentity(before: Identity, after: Identity): boolean {
  return Boolean(before.podUid && before.pvcUid && before.podUid === after.podUid && before.pvcUid === after.pvcUid);
}

/*
 * Called only inside run.ts, after the exact generated local cluster has been
 * revalidated and its API port-forward is active. No alternate target or tokens.
 */
export async function verifyBrowserReseed(
  identity: (workspaceId: string) => Promise<Identity>,
  recordFailure: (failure: BrowserFailureReport) => void,
) {
  const nonce = randomBytes(10).toString('hex');
  const leaf = `obsolete-${nonce}/stale.txt`;
  const keep = `canonical-${nonce}.txt`;
  const canonical = `persisted-${nonce}`;
  const projectName = `Private reseed fixture ${nonce}`;
  const keepBytes = Buffer.from(canonical).toString('base64');

  let phase: Phase = 'web-ready';
  let browser: Browser | undefined;
  let observed: ReturnType<typeof observe> | undefined;
  let relay: Awaited<ReturnType<typeof startRecipeBrowserHttp>> | undefined;
  let token: string | undefined;
  let workspaceId: string | undefined;
  let workspaceOwned = false;

  /*
   * The supported production build/serve route, on one fixed local listener.
   * Deliberately do not inherit any credentials, proxy or target variables.
   */
  const localEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    HOST: '127.0.0.1',
    PORT: '5173',
    NODE_ENV: 'production',
    NODE_OPTIONS: '--import=./scripts/private-runtime-recipe/web-fetch-fence.mjs',
    SAAS_API_URL: recipeApi,
    API_BASE_URL: recipeApi,
  };
  await assertUnusedWebPort();

  const web = spawn('node_modules/.bin/react-router-serve', ['./build/server/index.js'], {
    env: localEnv,
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  let spawnFailed = false;
  let webListening = false;

  const stdout = createInterface({ input: web.stdout });
  stdout.on('line', (line) => {
    /*
     * This exact line comes from the owned child's listen callback, not a
     * competing HTTP responder. Other stdout is consumed but never copied.
     */
    if (line === '[react-router-serve] http://localhost:5173 (http://127.0.0.1:5173)') {
      webListening = true;
    }
  });
  web.once('error', () => {
    spawnFailed = true;
  });

  try {
    await webReady(
      web,
      () => webListening,
      () => spawnFailed,
    );
    relay = await startRecipeBrowserHttp();

    phase = 'canonical-archive';

    const auth = await api<{ token: string; organization: { id: string } }>('/auth/register', undefined, {
      email: `reseed-${nonce}@vibecore.local`,
      password: `R3seed-${randomBytes(16).toString('hex')}!`,
      name: 'Private reseed fixture',
      organizationName: `Private reseed fixture ${nonce}`,
    });
    token = auth.token;
    need(typeof token === 'string' && token.length > 10, 'No disposable session');
    need(/^[a-z0-9_-]+$/.test(auth.organization.id), 'Unexpected disposable organization ID');

    const { project } = await api<{ project: { id: string } }>(`/orgs/${auth.organization.id}/projects`, token, {
      name: projectName,
    });
    need(/^[a-z0-9_-]+$/.test(project.id), 'Unexpected disposable project ID');

    const archive = new JSZip();
    archive.file(keep, canonical);

    /*
     * A truly network-free fixture: the blank-project endpoint initially
     * scaffolds Vite/package.json. Replace that scaffold, don't merge it.
     */
    archive.file('index.html', '<!doctype html><meta charset="utf-8"><title>Reseed fixture</title>');

    await api(`/projects/${project.id}/files/import/zip`, token, {
      zipBase64: await archive.generateAsync({ type: 'base64' }),
      replaceExisting: true,
    });

    phase = 'runtime-preflight';
    await assertRuntimePreflight();

    phase = 'first-browser-launch';
    browser = await chromium.launch({
      headless: true,
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
      args: [
        `--proxy-server=${relay.proxy}`,
        '--proxy-bypass-list=<-loopback>',
        '--host-resolver-rules=MAP localhost 127.0.0.1, MAP * ~NOTFOUND',
      ],
    });

    const first = await newContext(browser, token);
    const firstPage = await first.newPage();
    const initial = observe(firstPage, project.id, projectName);
    observed = initial;
    phase = 'first-ide-navigation';

    const ideUrl = `${recipeApp}/projects/${project.id}/ide`;
    need((await firstPage.goto(ideUrl, { waitUntil: 'domcontentloaded' }))?.ok(), 'IDE could not open');

    phase = 'first-workspace-start';

    const id = await eventually('first real workspace start', 130_000, async () => [...initial.started][0]);
    workspaceId = id;

    /*
     * Readiness needs real import, console evidence and the app's durable
     * marker, not merely a rendered shell or arbitrary delay.
     */
    phase = 'first-archive-marker';

    const seeded = await eventually('first real seed and marker', 80_000, async () => {
      if (initial.imported.includes(id) && initial.archived.includes(200) && initial.clears() > 0) {
        return readMarker(firstPage, [...new Set([id, project.id])]);
      }

      return undefined;
    });

    initial.evidence.markerRead = true;
    phase = 'first-owned-identity';

    const before = await identity(id);
    workspaceOwned = true;
    assert.equal((await fixture(token, id, nonce, 'read')).keep, keepBytes, 'Initial runtime canonical bytes');
    await first.close();

    phase = 'owned-fixtures';
    observed = undefined;

    const planted = await fixture(token, id, nonce, 'plant');
    assert.equal(planted.keep, Buffer.from(`runtime-stale-${nonce}`).toString('base64'));
    need(planted.leaf && planted.protected.length === 3 && planted.protected.every(Boolean), 'Fixture writes missing');

    const durableBefore = await api<{ archive: { base64: string } }>(`/projects/${project.id}/export/zip`, token);
    const canonicalBefore = await JSZip.loadAsync(durableBefore.archive.base64, { base64: true });
    assert.equal(await canonicalBefore.file(keep)?.async('string'), canonical, 'Durable archive not canonical');
    assert.deepEqual(
      Object.keys(canonicalBefore.files).sort(),
      [keep, 'index.html'].sort(),
      'Unsafe scaffold remained',
    );

    need(
      !Object.keys(canonicalBefore.files).some((name) => name.startsWith(`obsolete-${nonce}/`)),
      'Fixture accidentally entered durable storage',
    );

    phase = 'reopen-navigation';

    const second = await newContext(browser, token);
    need((await second.storageState()).origins.length === 0, 'Reopen context unexpectedly shares origin storage');

    const secondPage = await second.newPage();
    const reopened = observe(secondPage, project.id, projectName);
    observed = reopened;
    relay.reset();
    need((await secondPage.goto(ideUrl, { waitUntil: 'domcontentloaded' }))?.ok(), 'IDE could not reopen');

    phase = 'reopen-seed';

    const secondMarker = await eventually('same workspace real reseed from fresh browser', 130_000, async () => {
      if (
        reopened.started.has(id) &&
        reopened.imported.includes(id) &&
        reopened.archived.includes(200) &&
        reopened.clears() > 0 &&
        reopened.decisions.some(
          (item) => item.reused === true && item.seededThisSession === false && item.decision === 'reseed',
        )
      ) {
        // First route may key the marker by project until the workspace exists.
        return readMarker(secondPage, [...new Set([id, project.id])]);
      }

      return undefined;
    });
    reopened.evidence.markerRead = true;
    need(secondMarker.seededAt >= seeded.seededAt, 'Second marker predates first browser seed');
    assert.deepEqual([...initial.started], [id], 'First browser started an unexpected workspace');
    assert.deepEqual([...reopened.started], [id], 'Browser did not use exactly the original workspace');
    assert.deepEqual(reopened.deleted, [{ id, path: leaf }], 'Only the synthetic stale leaf may be deleted');
    assert.deepEqual(reopened.imported, [id], 'Expected one acknowledged browser import');
    need(relay.saw(`GET ${ideUrl}`), 'IDE HTML did not cross the browser guard');
    need(relay.saw(`DELETE ${recipeApi}/api/runtime/workspaces/${id}/files`), 'Reseed DELETE bypassed browser guard');
    need(relay.saw(`POST ${recipeApi}/api/runtime/workspaces/${id}/import`), 'Reseed import bypassed browser guard');
    await second.close();

    phase = 'verify';
    observed = undefined;
    need(identicalIdentity(before, await identity(id)), 'Pod/PVC changed across browser reopen');

    const restored = await fixture(token, id, nonce, 'read');
    assert.equal(restored.keep, keepBytes, 'Browser import did not restore canonical bytes');
    assert.equal(restored.leaf, null, 'Visible stale leaf survived');
    assert.deepEqual(restored.protected, planted.protected, 'Nested lockfile, dependency and VCS bytes changed');

    const durableAfter = await api<{ archive: { base64: string } }>(`/projects/${project.id}/export/zip`, token);
    const canonicalAfter = await JSZip.loadAsync(durableAfter.archive.base64, { base64: true });
    assert.deepEqual(Object.keys(canonicalAfter.files).sort(), Object.keys(canonicalBefore.files).sort());

    for (const [name, entry] of Object.entries(canonicalBefore.files)) {
      if (!entry.dir) {
        assert.deepEqual(await canonicalAfter.file(name)?.async('nodebuffer'), await entry.async('nodebuffer'));
      }
    }

    return {
      ok: true,
      case: 'clean-context-reseed',
      samePodAndPvc: true,
      onlyStaleLeafDeleted: true,
      protectedBytes: 3,
      durableArchiveUnchanged: true,
    };
  } catch {
    /*
     * Keep failure artifacts bounded to stage and probe names; no session,
     * returned bodies, browser logs, raw routes, kubeconfig or ZIP payloads.
     */
    const evidence = await observed?.snapshotEvidence();
    const boundary = evidence ? diagnoseSeed(evidence) : phase;
    recordFailure({ phase, boundary, evidence });
    throw new Error(`Private browser reseed failed at ${phase} / ${boundary}`);
  } finally {
    try {
      await browser?.close();
    } finally {
      try {
        if (workspaceOwned && token && workspaceId) {
          await api(`/api/runtime/workspaces/${workspaceId}/stop`, token, {}).catch(() => undefined);
        }
      } finally {
        /*
         * Parent run.ts always deletes the owned namespace/cluster, including a
         * half-started workspace. No other process is killed.
         */
        try {
          await relay?.close();
        } finally {
          stdout.close();
          await closeWeb(web);
        }
      }
    }
  }
}
