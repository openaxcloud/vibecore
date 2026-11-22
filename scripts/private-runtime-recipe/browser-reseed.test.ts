import { describe, expect, it } from 'vitest';
import {
  diagnoseSeed,
  emptySeedEvidence,
  pageErrorKind,
  recipeCorsReady,
  recordSeedStatus,
  seedBoundary,
} from './browser-evidence.js';
import { recipeBrowserTarget, recipeSafeResponse } from './browser-http.js';

describe('private browser reseed forwarding policy', () => {
  it.each([
    'http://localhost:5173/projects/test-project/ide',
    'http://127.0.0.1:3001/api/runtime/workspaces/ws-fixture/import',
  ])('allows browser HTTP only on the local recipe: %s', (url) => {
    expect(recipeBrowserTarget(url)?.href).toBe(url);
  });

  it.each([
    'https://app.e-code.ai/projects/test-project/ide',
    'http://192.0.2.23:3001/api/runtime/workspaces',
    'http://localhost:5174/projects/test-project/ide',
    'http://localhost:5173.example.invalid/projects/test-project/ide',
    'http://127.0.0.1:3001/projects/test-project',
    'http://127.0.0.1:3001/api/runtime-backup',
    'http://user:password@localhost:5173/projects/test-project/ide',
    'http://localhost:5173/path#fragment',
    'ws://127.0.0.1:3001/api/runtime/workspaces/ws-fixture/logs',
    '/path',
    'not a URL',
  ])('refuses out-of-scope browser HTTP: %s', (url) => {
    expect(recipeBrowserTarget(url)).toBeUndefined();
  });

  it.each([301, 302, 303, 307, 308])('refuses redirect %s before Chromium consumes any headers', (status) => {
    for (const target of ['/login', '//192.0.2.4/blocked', 'http://localhost:5173/first-hop']) {
      expect(recipeSafeResponse(status, ['LoCaTiOn', target, 'Set-Cookie', 'ignored=yes'])).toBe(false);
    }
    expect(recipeSafeResponse(status, [])).toBe(false);
  });

  it('refuses Location or Refresh headers even with a nonredirect status', () => {
    expect(recipeSafeResponse(304, ['Location', '/other'])).toBe(false);
    expect(recipeSafeResponse(200, ['Refresh', '0;url=http://192.0.2.4/'])).toBe(false);
    expect(recipeSafeResponse(200, ['Link', 'Location'])).toBe(true);
  });

  it('keeps ordinary responses and nonredirecting 304', () => {
    expect(recipeSafeResponse(200, ['Set-Cookie', 'a=1', 'Set-Cookie', 'b=2'])).toBe(true);
    expect(recipeSafeResponse(204, [])).toBe(true);
    expect(recipeSafeResponse(304, ['ETag', 'local-fixture'])).toBe(true);
  });
});

describe('private browser seed failure boundaries', () => {
  it('red: SSR HTML 200 alone does not show that hydration or a workspace happened', () => {
    const evidence = emptySeedEvidence();

    recordSeedStatus(evidence, 'ide', 200);
    expect(diagnoseSeed(evidence)).toBe('browser-hydration-not-requested');
    evidence.startup.push('hydrate-requested');
    expect(diagnoseSeed(evidence)).toBe('ide-project-data-not-rendered');
    evidence.projectNameRendered = true;
    expect(diagnoseSeed(evidence)).toBe('runtime-ticket-not-observed');
  });

  it('red: ticket or boot acceptance cannot be confused with workspace success', () => {
    const evidence = emptySeedEvidence();

    evidence.startup.push('hydrate-requested');
    evidence.projectNameRendered = true;
    recordSeedStatus(evidence, 'ide', 200);
    recordSeedStatus(evidence, 'ticket', 401);
    expect(diagnoseSeed(evidence)).toBe('runtime-ticket-failed');
    recordSeedStatus(evidence, 'ticket', 200);
    recordSeedStatus(evidence, 'boot-preflight', 403);
    expect(diagnoseSeed(evidence)).toBe('runtime-boot-failed');
    recordSeedStatus(evidence, 'boot', 200);
    expect(diagnoseSeed(evidence)).toBe('workspace-start-not-observed');
    recordSeedStatus(evidence, 'start', 403);
    expect(diagnoseSeed(evidence)).toBe('workspace-start-failed');
    recordSeedStatus(evidence, 'start', 200);
    expect(diagnoseSeed(evidence)).toBe('workspace-response-not-matched');
  });

  it('green: preserves the existing distinction between accepted start and real seed marker', () => {
    const evidence = emptySeedEvidence();

    evidence.startup.push('hydrate-requested');
    recordSeedStatus(evidence, 'ide', 200);
    recordSeedStatus(evidence, 'ticket', 200);
    recordSeedStatus(evidence, 'boot', 200);
    recordSeedStatus(evidence, 'start', 202);
    evidence.observedWorkspace = true;
    expect(diagnoseSeed(evidence)).toBe('seed-archive-import-incomplete');
    recordSeedStatus(evidence, 'archive', 200);
    recordSeedStatus(evidence, 'import', 204);
    evidence.reseedClear = true;
    expect(diagnoseSeed(evidence)).toBe('seed-marker-not-read');
    evidence.markerRead = true;
    expect(diagnoseSeed(evidence)).toBe('http-seed-and-marker-seen');
  });

  it('matches fixed endpoint/method/project categories, with no raw input in output', () => {
    const id = 'fixture';
    expect(seedBoundary('http://localhost:5173/api/runtime-token?projectId=fixture&ignored=raw', 'GET', id)).toBe(
      'ticket',
    );
    expect(seedBoundary('http://localhost:5173/api/runtime-token?projectId=other', 'GET', id)).toBeUndefined();
    expect(seedBoundary('http://127.0.0.1:3001/api/runtime/runtime/boot', 'OPTIONS', id)).toBe('boot-preflight');
    expect(seedBoundary('http://127.0.0.1:3001/api/runtime/workspaces', 'POST', id)).toBe('start');
    expect(seedBoundary('https://example.invalid/api/runtime/workspaces', 'POST', id)).toBeUndefined();
    expect(pageErrorKind('Any sensitive error text')).toBe('other');
  });

  it('requires exact local CORS origin and headers before Chromium', () => {
    const cors = new Headers({
      'access-control-allow-origin': 'http://localhost:5173',
      'access-control-allow-methods': 'GET, POST',
      'access-control-allow-headers': 'Authorization, Content-Type',
    });
    expect(recipeCorsReady(204, cors)).toBe(true);
    expect(recipeCorsReady(403, cors)).toBe(false);
    cors.set('access-control-allow-origin', '*');
    expect(recipeCorsReady(204, cors)).toBe(false);
    cors.set('access-control-allow-origin', 'http://localhost:5173');
    cors.delete('access-control-allow-headers');
    expect(recipeCorsReady(204, cors)).toBe(false);
  });
});
