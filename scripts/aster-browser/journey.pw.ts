import { failBrowserCheckpoint, writeBrowserCheckpoint as checkpoint } from './browser-diagnostics.mjs';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { samePvcController } from './same-pvc-controller.js';
import { browserDestinationAllowed } from './baseline-policy.js';
import { openHost, sha, validateProviderAbsent, type Identity } from './contracts.js';
import { localOrigin } from './gateway.js';

async function confine(context: BrowserContext, origin: string, violations: string[], previewOrigin?: string) {
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());

    if (!browserDestinationAllowed(url.href, origin, previewOrigin)) {
      violations.push(`${url.origin}${url.pathname}`);
      await route.abort('blockedbyclient');

      return;
    }

    await route.continue();
  });
  await context.routeWebSocket('**/*', (socket) => {
    const url = new URL(socket.url());

    if (!browserDestinationAllowed(url.href, origin, previewOrigin)) {
      violations.push(`${url.origin}${url.pathname}`);
      socket.close();

      return;
    }

    socket.connectToServer();
  });
}

async function login(page: Page, origin: string, email: string, password: string) {
  checkpoint('browser-login');
  await page.goto(`${origin}/login?lang=en`);
  checkpoint('browser-login-page');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  checkpoint('browser-login-form');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
}

function observe(page: Page, evidence: Record<string, unknown>[], phase: () => string) {
  const pending: Promise<void>[] = [];
  page.on('console', (message) => {
    if (!message.text().startsWith('[workspace] reattach decision')) {
      return;
    }

    const observedPhase = phase();
    pending.push(
      (async () => {
        const value = await message.args()[1]?.jsonValue();
        assert.ok(value && ['reseed', 'reattach'].includes(value.decision));

        const fields = [
          'reused',
          'seededThisSession',
          'hasLivePort',
          'portProbeSucceeded',
          'portsFromStore',
          'portsFromServer',
          'storeSnapshot',
          'seededRevision',
          'currentRevision',
          'decision',
        ];
        evidence.push({ phase: observedPhase, decision: Object.fromEntries(fields.map((key) => [key, value[key]])) });
      })(),
    );
  });

  return () => Promise.all(pending);
}

async function marker(page: Page, workspaceId: string) {
  return page.evaluate((key) => localStorage.getItem(key), `vc:ws-seed:${workspaceId}`);
}

async function preview(page: Page, expected: string) {
  checkpoint('browser-preview');
  await page.getByRole('button', { name: 'Webview', exact: true }).click();
  await expect(page.locator('iframe[title="preview"]').first()).toBeVisible({ timeout: 180_000 });
  await expect(page.frameLocator('iframe[title="preview"]').locator('#proof')).toHaveText(expected, {
    timeout: 180_000,
  });
}

test('real contexts: baseline, warm reopen on new volume, clean reopen on another new volume', async ({
  browser,
}, testInfo) => {
  checkpoint('browser-contexts');
  validateProviderAbsent(process.env);

  const baselineOnly = process.env.ASTER_BROWSER_BASELINE_ONLY === '1';
  const assertions = { registration: false, preview: false };

  const recordAssertion = (name?: keyof typeof assertions) => {
    if (!baselineOnly) {
      return;
    }

    if (name) {
      assertions[name] = true;
    }

    mkdirSync('private-runtime-evidence', { recursive: true });
    writeFileSync('private-runtime-evidence/browser-assertions.json', JSON.stringify(assertions));
  };
  recordAssertion();

  const directory = process.env.ASTER_BROWSER_HOST_DIRECTORY;
  assert.ok(
    baselineOnly || directory,
    'HOST_ORCHESTRATOR_REQUIRED: no kind or simulated receipts are started by this test',
  );

  const host = baselineOnly ? undefined : await openHost(directory!);
  const origin = host?.descriptor.origin ?? process.env.ASTER_BROWSER_ORIGIN!;
  localOrigin(origin);

  const previewOrigin = baselineOnly ? process.env.ASTER_BROWSER_PREVIEW_ORIGIN : undefined;

  if (previewOrigin) {
    localOrigin(previewOrigin);
    assert.notEqual(previewOrigin, origin);
  }

  const suffix = randomBytes(16).toString('hex');
  const email = `aster-${suffix}@local.test`;
  const password = `Aster-${randomBytes(16).toString('hex')}!`;
  const proof = `aster-ui-${suffix}`;

  const files = {
    'package.json':
      JSON.stringify({ private: true, scripts: { dev: 'node server.cjs', start: 'node server.cjs' } }) + '\n',
    'aster-marker.txt': proof,
    'server.cjs': `const fs=require('node:fs');require('node:http').createServer((q,s)=>{s.setHeader('content-type','text/html');s.end('<!doctype html><main id="proof">'+fs.readFileSync('aster-marker.txt','utf8')+'</main>')}).listen(5173,'0.0.0.0');\n`,
  };

  const expectedHashes = Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, sha(bytes)]));
  const violations: string[] = [];
  const evidence: Record<string, unknown>[] = [];

  let phase = 'baseline';

  const warm = await browser.newContext({
    serviceWorkers: 'block',
    locale: 'en-US',
    viewport: { width: 1440, height: 1000 },
  });
  const cold = await browser.newContext({
    serviceWorkers: 'block',
    locale: 'en-US',
    viewport: { width: 1440, height: 1000 },
  });
  await confine(warm, origin, violations, previewOrigin);
  await confine(cold, origin, violations, previewOrigin);

  const page = await warm.newPage();
  const clean = await cold.newPage();
  const flushWarm = observe(page, evidence, () => phase);
  const flushCold = observe(clean, evidence, () => phase);

  try {
    checkpoint('browser-register');
    await page.goto(`${origin}/register?lang=en`);
    checkpoint('browser-register-page');
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('input[name="confirmPassword"]').fill(password);
    checkpoint('browser-register-form');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);

    recordAssertion('registration');

    // The second context authenticates through UI only; it never visits this IDE yet.
    await login(clean, origin, email, password);

    const zip = new JSZip();

    for (const [path, bytes] of Object.entries(files)) {
      zip.file(path, bytes);
    }
    checkpoint('browser-import');
    await page.goto(`${origin}/import-zip?lang=en`);
    await page.locator('input[type="file"]').setInputFiles({
      name: `aster-${suffix}.zip`,
      mimeType: 'application/zip',
      buffer: await zip.generateAsync({ type: 'nodebuffer' }),
    });
    await page.locator('input[name="name"]').fill(`Aster fixture ${suffix}`);

    checkpoint('browser-runtime-start');
    const started = page.waitForResponse(
      (r) =>
        new URL(r.url()).origin === origin &&
        new URL(r.url()).pathname === '/api/runtime/workspaces' &&
        r.request().method() === 'POST' &&
        r.ok(),
      { timeout: 180_000 },
    );
    await page.locator('button[type="submit"]').click();

    const response = await started;
    const body = response.request().postDataJSON();
    const session = await response.json();
    const identity: Identity = { projectId: body.metadata?.projectId, workspaceId: session.id };
    assert.ok(identity.projectId && identity.workspaceId && identity.projectId !== identity.workspaceId);

    await expect(page).not.toHaveURL(/\/import-zip(?:\?|$)/);

    const ideUrl = page.url();
    assert.equal(new URL(ideUrl).origin, origin);
    await preview(page, proof);
    recordAssertion('preview');

    if (process.env.ASTER_SAME_PVC_DESCRIPTOR) {
      assert.ok(baselineOnly, 'Same-PVC never uses replace-empty protocol');
      checkpoint('browser-pvc-restart');
      const controller = await samePvcController(process.env.ASTER_SAME_PVC_DESCRIPTOR);
      await page.goto(`${origin}/dashboard`);
      expect(new URL(clean.url()).pathname).toBe('/dashboard');
      expect(await marker(clean, identity.workspaceId)).toBeNull();
      const before = await controller.inspect(identity.workspaceId, proof);
      // Actual successful same-origin request auth only; never written in evidence.
      const headers = await response.request().allHeaders();
      const authorization = headers.authorization;
      const auth: Record<string, string> = authorization ? { authorization } : {};
      const stop = await warm.request.post(`${origin}/api/runtime/workspaces/${identity.workspaceId}/stop`, { headers: auth });
      expect(stop.ok()).toBe(true);
      await controller.waitDeleted(identity.workspaceId);
      const restart = await warm.request.post(`${origin}/api/runtime/workspaces`, { headers: auth, data: body });
      expect(restart.ok()).toBe(true);
      const restarted = await restart.json();
      expect(restarted.id).toBe(identity.workspaceId);
      expect(restarted.status).toBe('running');
      const after = await controller.inspect(identity.workspaceId, proof);
      controller.assertSameVolume(before, after);
      evidence.push({ phase: 'same-pvc-restart', identity, before, after });
      checkpoint('browser-positive-fence');
      const fence = await controller.positiveFence(identity, proof, after, async () => {
        const tree = await warm.request.get(`${origin}/api/runtime/workspaces/${identity.workspaceId}/files/tree?path=.`, { headers: auth });
        expect(tree.ok()).toBe(true);
      });
      evidence.push({ phase: 'positive-first-tree-fence', identity, fence });
      // Keep canonical content intact. New browser start may reset the first-tree gate.
      checkpoint('browser-witnesses');
      const witnessBefore = await controller.seedWitnesses(identity.workspaceId, proof);
      expect(witnessBefore['aster-marker.txt']).toBe(sha(proof));
      for (const path of ['orphan/package-lock.json', 'orphan/node_modules/sentinel', 'orphan/.git/sentinel', 'orphan/stale.txt']) {
        expect(witnessBefore[path]).toBe(sha(`${proof}:${path}`));
      }
      const deletes: { path: string | null; status: number }[] = [];
      const imports: { status: number }[] = [];
      const starts: string[] = [];
      const mutationOrder: string[] = [];
      const clears: unknown[] = [];
      const requests: Promise<void>[] = [];
      const forbiddenLifecycle: string[] = [];
      clean.on('console', (message) => {
        if (phase === 'same-pvc-reseed' && message.text().startsWith('[workspace] reseed clear')) {
          requests.push((async () => { clears.push(await message.args()[1]?.jsonValue()); })());
        }
      });
      clean.on('response', (r) => {
        const url = new URL(r.url());
        if (url.origin !== origin) return;
        const root = `/api/runtime/workspaces/${identity.workspaceId}`;
        if (r.request().method() === 'DELETE' && url.pathname.startsWith('/api/runtime/')) {
          requests.push((async () => {
            assert.equal(url.pathname, `${root}/files`);
            deletes.push({ path: url.searchParams.get('path'), status: r.status() });
            mutationOrder.push('delete');
          })());
        }
        if (url.pathname === `${root}/import` && r.request().method() === 'POST') {
          imports.push({ status: r.status() });
          mutationOrder.push('import');
        }
        if (url.pathname === '/api/runtime/workspaces' && r.request().method() === 'POST') {
          requests.push((async () => {
            const requestBody = r.request().postDataJSON();
            expect(requestBody.metadata?.projectId ?? requestBody.projectId).toBe(identity.projectId);
            expect((await r.json()).id).toBe(identity.workspaceId);
            starts.push('same-workspace-start');
          })());
        }
        if ([`${root}/stop`, `${root}/restart`].includes(url.pathname)) forbiddenLifecycle.push(url.pathname);
      });
      checkpoint('browser-reopen');
      phase = 'same-pvc-reseed';
      expect(await marker(clean, identity.workspaceId)).toBeNull();
      await clean.goto(ideUrl);
      await preview(clean, proof);
      checkpoint('browser-assertions');
      await flushCold();
      await Promise.all(requests);
      expect(starts).toEqual(['same-workspace-start']);
      expect(forbiddenLifecycle).toEqual([]);
      expect(evidence.filter((entry: any) => entry.phase === phase && entry.decision?.decision === 'reseed')).toHaveLength(1);
      expect(deletes).toHaveLength(1);
      expect(deletes[0].path).toBe('orphan/stale.txt');
      expect(deletes[0].status).toBeGreaterThanOrEqual(200);
      expect(deletes[0].status).toBeLessThan(300);
      expect(clears).toEqual([{ mode: 'selective', deleted: 1 }]);
      expect(mutationOrder).toEqual(['delete', 'import']);
      expect(imports).toHaveLength(1);
      expect(imports[0].status).toBeGreaterThanOrEqual(200);
      expect(imports[0].status).toBeLessThan(300);
      const finalIdentity = await controller.inspect(identity.workspaceId, proof);
      expect(finalIdentity).toEqual(after);
      const witnessAfter = await controller.readWitnesses(identity.workspaceId);
      expect(witnessAfter).toEqual({ ...witnessBefore, 'orphan/stale.txt': null });
      expect(violations).toEqual([]);
      evidence.push({ phase: 'same-pvc-regression-complete', identity, before, after: finalIdentity,
        fence, witnessBefore, witnessAfter, deletes, imports, starts, clears,
        canonicalRestoration: 'not-tested-canonical-kept-intact', durableManifest: 'not-inspected' });
      await page.goto(`${origin}/dashboard`);
      await clean.goto(`${origin}/dashboard`);
      return;
    }

    if (baselineOnly) {
      const seedMarker = await marker(page, identity.workspaceId);
      assert.ok(seedMarker, 'Baseline did not produce a real seed marker');
      await flushWarm();
      expect(violations).toEqual([]);
      evidence.push({
        phase: 'baseline-only',
        identity,
        seedMarker: JSON.parse(seedMarker),
        iframeRendered: true,
        podBytes: 'not-inspected',
        volumeReplacement: 'not-requested',
        reopen: 'not-tested',
      });

      return;
    }

    assert.ok(host);

    let current = (await host.request({ action: 'inspect', ...identity })).pod!;
    expect(current.hashes).toMatchObject(expectedHashes);

    const realMarker = await marker(page, identity.workspaceId);
    assert.ok(realMarker, 'Baseline did not produce a real seed marker');
    expect(await marker(clean, identity.workspaceId)).toBeNull();
    evidence.push({ phase, identity, pod: current, seedMarker: JSON.parse(realMarker) });
    await flushWarm();
    await page.goto(`${origin}/dashboard`);

    for (const [arm, target] of [
      ['warm', page],
      ['clean', clean],
    ] as const) {
      checkpoint('browser-reopen');
      phase = arm;

      const beforeMarker = await marker(target, identity.workspaceId);

      if (arm === 'warm') {
        expect(beforeMarker).toBe(realMarker);
      } else {
        expect(beforeMarker).toBeNull();
      }

      // Both pages are outside IDE, so no active provider may repopulate the volume during replacement.
      expect(new URL(page.url()).pathname).toBe('/dashboard');
      expect(new URL(clean.url()).pathname).toBe('/dashboard');

      const replacement = await host.request({ action: 'replace-empty', ...identity, expected: current });
      evidence.push({
        phase,
        beforeMarker: beforeMarker ? JSON.parse(beforeMarker) : null,
        replacement: replacement.replaced,
      });

      const errors: string[] = [];
      await target.goto(ideUrl);

      try {
        await preview(target, proof);
      } catch {
        errors.push('IFRAME_MARKER_NOT_RENDERED');
      }
      current = (await host.request({ action: 'inspect', ...identity })).pod!;
      evidence.push({ phase, pod: current, errors, afterMarker: await marker(target, identity.workspaceId) });
      expect(current.pvcUid).toBe(replacement.replaced!.newPvcUid);
      expect.soft(current.hashes).toMatchObject(expectedHashes);
      expect.soft(errors).toEqual([]);
      await (arm === 'warm' ? flushWarm() : flushCold());
      expect.soft(evidence.some((entry) => entry.phase === arm && entry.decision)).toBe(true);
      await target.goto(`${origin}/dashboard`);
    }
    expect(violations).toEqual([]);
  } catch (error) {
    failBrowserCheckpoint();
    throw error;
  } finally {
    checkpoint('browser-close');
    await flushWarm();
    await flushCold();
    await testInfo.attach('aster-context-evidence', {
      body: Buffer.from(JSON.stringify({ scope: 'real-browser-only-if-executed', evidence, violations }, null, 2)),
      contentType: 'application/json',
    });
    await warm.close();
    await cold.close();
  }
});
