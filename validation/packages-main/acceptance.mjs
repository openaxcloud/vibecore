import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { checkAgentCapability } from './diagnostics.mjs';
import { launchRuntimeChromium } from './upstream/runtime-browser-client.mjs';

const require = createRequire(`${process.env.PRODUCT_DIR}/package.json`);
const { chromium } = require('@playwright/test');

const { verifyInstalledAuditPackage } = await import(
  pathToFileURL(`${process.env.PRODUCT_DIR}/scripts/ci/package-install-import.mjs`)
);
const api = 'http://127.0.0.1:3001',
  app = 'http://127.0.0.1:5173';

const output = process.env.EVIDENCE_DIR;
await mkdir(output, { recursive: true });

const proof = {
  scope: 'Packages-only',
  product: 'cd494729e00273d02e2c5a7e79eea1697824f1ca',
  tree: '06d294858b1dc77c5ff72130093bf43fdcf1878c',
  passed: false,
  phase: 'register',
};

let browser;

async function json(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(20000),
  });
  proof.lastHttpStatus = response.status;
  assert(response.ok, `HTTP ${response.status} during ${proof.phase}`);

  return response.json();
}

try {
  const suffix = randomBytes(10).toString('hex');

  const auth = await json(`${api}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `packages-${suffix}@local.test`,
      password: `A1!${randomBytes(24).toString('hex')}`,
      name: 'Packages Test',
      organizationName: `Packages ${suffix}`,
    }),
  });
  proof.phase = 'create-project';

  const created = await json(`${api}/orgs/${auth.organization.id}/projects/from-template`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${auth.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Packages Test',
      templateName: 'react-basic-starter',
    }),
  });

  const projectId = created.project.id;
  const panelPath = `/api/projects/${projectId}/ide-panel/packages`;
  proof.phase = 'load-ui';
  browser = await launchRuntimeChromium(chromium, { headless: true });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });

  const requests = [];

  let requestOverflow = false;
  page.on('response', (r) => {
    if (new URL(r.url()).pathname === panelPath) {
      if (requests.length < 256) {
        requests.push({ method: r.request().method(), status: r.status() });
      } else {
        requestOverflow = true;
      }
    }
  });
  await page.context().addCookies([
    {
      name: 'vc_session',
      value: auth.token,
      url: app,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.goto(`${app}/projects/${projectId}/ide?panel=packages`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  const panel = page.locator('[data-testid="ide-service-panel"][data-panel="packages"]');
  await panel.waitFor({ state: 'visible', timeout: 60000 });

  /*
   * The visible panel precedes asynchronous workspace creation. Read-only polling
   * waits for that real UI startup; it never starts or retries an installation.
   */
  proof.phase = 'workspace-readiness';

  const workspaceDeadline = performance.now() + 180000;

  let workspaceId;

  do {
    const initial = await json(`${app}${panelPath}`, {
      headers: { cookie: `vc_session=${auth.token}` },
    });
    workspaceId = initial?.data?.workspace?.id;

    if (workspaceId) {
      break;
    }

    await delay(5000);
  } while (performance.now() < workspaceDeadline);
  assert.match(workspaceId ?? '', /^[a-zA-Z0-9_-]{1,128}$/);
  proof.phase = 'agent-capability';

  proof.capabilityStep = 'manager-token';

  const tokenResponse = await json(`http://127.0.0.1:3010/workspaces/${workspaceId}/agent-token`, {
    headers: {
      authorization: `Bearer ${process.env.WORKSPACE_MANAGER_SHARED_SECRET}`,
    },
  });

  proof.capabilityStep = 'agent-probe';

  const agent = `http://127.0.0.1:18081/${workspaceId}`;

  const headers = {
    authorization: `Bearer ${tokenResponse.token}`,
    'content-type': 'application/json',
  };
  proof.capabilityDiagnostics = {};

  const cap = await checkAgentCapability(agent, headers, proof.capabilityDiagnostics);
  proof.capability = {
    version: cap.version,
    maxBudgetMs: cap.maxBudgetMs,
    validatedSpecs: cap.validatedSpecs,
  };
  proof.unauthenticatedRefused = true;

  proof.capabilityStep = 'runtime-attestation';

  const pods = JSON.parse(
    execFileSync('kubectl', ['-n', 'workspaces', 'get', 'pods', '-o', 'json'], {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
    }),
  );
  const service = JSON.parse(
    execFileSync('kubectl', ['-n', 'workspaces', 'get', 'service', `workspace-${workspaceId}`, '-o', 'json'], {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 65536,
    }),
  );

  const selector = service.spec.selector;
  assert(selector && Object.keys(selector).length);

  const selectedPods = pods.items.filter((p) =>
    Object.entries(selector).every(([k, v]) => p.metadata.labels?.[k] === v),
  );
  assert.equal(selectedPods.length, 1);

  const pod = selectedPods[0];
  assert(pod, 'Actual workspace pod must be found');
  assert.equal(pod.spec.runtimeClassName, 'gvisor');
  assert(pod.spec.containers.some((c) => c.image === process.env.WORKSPACE_AGENT_IMAGE));

  const imageIDs = (pod.status.containerStatuses ?? []).map((c) => c.imageID);
  assert(imageIDs.length && imageIDs.every(Boolean));

  const dmesg = execFileSync('kubectl', ['-n', 'workspaces', 'exec', pod.metadata.name, '--', 'dmesg'], {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 65536,
  });
  assert.match(dmesg, /gvisor/i);
  proof.runtime = {
    runtimeClass: 'gvisor',
    image: process.env.WORKSPACE_AGENT_IMAGE,
    imageIDs,
    gvisorVerified: true,
  };
  proof.phase = 'install-ui';
  await page.getByPlaceholder('@scope/name, react-query, vite@latest').fill('is-odd');

  const started = performance.now();

  const responsePromise = page.waitForResponse(
    (r) => new URL(r.url()).pathname === panelPath && r.request().method() === 'POST',
    { timeout: 360000 },
  );
  await page.getByRole('button', { name: 'Install package', exact: true }).click();

  const installed = await responsePromise;
  assert(installed.ok(), 'Install failed; no retry is permitted');
  proof.installElapsedMs = Math.round(performance.now() - started);
  proof.phase = 'reload';

  const reloadedPromise = page.waitForResponse(
    (r) => new URL(r.url()).pathname === panelPath && r.request().method() === 'GET',
    { timeout: 60000 },
  );
  await page.reload({ waitUntil: 'domcontentloaded' });

  const reloaded = await reloadedPromise;
  assert(reloaded.ok());

  const state = await reloaded.json();
  assert.equal(state?.data?.workspace?.id, workspaceId);
  await page
    .locator('.bolt-project-package-list')
    .getByText('is-odd', { exact: true })
    .waitFor({ state: 'visible', timeout: 20000 });

  // Crop to the Packages panel: no profile, email, token or project/workspace identifier.
  await page.locator('.bolt-project-package-list').screenshot({ path: `${output}/packages-visible-after-reload.png` });
  proof.phase = 'import';
  Object.assign(
    proof,
    await verifyInstalledAuditPackage({
      apiBaseUrl: api,
      token: auth.token,
      projectId,
      panel: state,
    }),
  );

  const run = state.data.packagesState.runs[0];
  proof.persisted = {
    status: run.status,
    exitCode: run.exitCode,
    termination: run.termination ?? null,
    package: 'is-odd',
  };

  const transport = JSON.parse(await readFile(`${output}/transport.json`, 'utf8'));
  assert.equal(transport.installRequests, 1, 'Exactly one dedicated install, with no replay');
  assert.deepEqual(transport.installStatuses, [200]);
  assert.equal(requestOverflow, false, 'Request evidence limit exceeded');
  assert.equal(requests.filter((r) => r.method === 'POST').length, 1);
  proof.requests = requests;
  proof.passed = true;
  proof.phase = 'complete';
} catch (error) {
  // Only fixed phases and bounded HTTP/assertion status are retained; no arbitrary error text.
  proof.failure = error?.code === 'ERR_ASSERTION' ? 'assertion_failed' : 'operation_failed';
  process.exitCode = 1;
} finally {
  try {
    await browser?.close();
  } catch {
    proof.passed = false;
    proof.failure = 'browser_close_failed';
    process.exitCode = 1;
  }
  await writeFile(`${output}/acceptance.json`, JSON.stringify(proof, null, 2));
}
