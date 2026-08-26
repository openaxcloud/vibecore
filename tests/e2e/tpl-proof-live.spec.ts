import { mkdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type FrameLocator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import JSZip from 'jszip';
import {
  assertIbanWasMasked,
  assertQaProjectIdentity,
  loadTplProofConfig,
  type QaProjectIdentity,
  type TplProofInteractionContract,
} from '../../scripts/qa/tpl-proof-contract.js';

const proof = loadTplProofConfig();
const evidenceRoot = resolve(proof.outputDir);
const reportPath = resolve(evidenceRoot, 'report.json');

type FlowName = 'prompt' | 'import' | 'remix';
type FlowOutcome = 'running' | 'passed' | 'failed';

interface ProjectRecord extends QaProjectIdentity {
  readonly slug?: string;
}

interface AuthSession {
  readonly token: string;
  readonly user: { readonly id: string; readonly platformAdmin: boolean };
  readonly organization?: { readonly id: string; readonly name?: string; readonly slug?: string };
}

interface DeploymentRecord {
  readonly id: string;
  readonly status: string;
  readonly environment: string;
  readonly url?: string | null;
  readonly previewUrl?: string | null;
  readonly productionUrl?: string | null;
}

interface FlowEvidence {
  readonly flow: FlowName;
  outcome: FlowOutcome;
  startedAt: string;
  finishedAt?: string;
  project?: { id: string; name: string; sourceType?: string | null };
  ide?: { url: string; bodyTextLength: number; screenshot: string };
  deployment?: {
    previewDeploymentId: string;
    publishedDeploymentId: string;
    status: 'READY';
    url: string;
    httpStatus: 200;
    screenshot: string;
  };
  cleanup: { status: 'pending' | 'deleted' | 'not-created' | 'failed'; detail?: string };
  error?: string;
}

interface IbanEvidence {
  outcome: FlowOutcome | 'not-requested';
  startedAt?: string;
  finishedAt?: string;
  sourceProjectId?: string;
  cloneProjectId?: string;
  sourceContainedFullIban?: boolean;
  cloneContainedMaskMarker?: boolean;
  terminalFragmentAbsent?: boolean;
  screenshot?: string;
  cleanup: { status: 'pending' | 'deleted' | 'not-created' | 'not-requested' | 'failed'; detail?: string };
  error?: string;
}

interface EvidenceReport {
  readonly schemaVersion: 1;
  readonly proof: 'TPL-02.PROOF+TPL-02.6';
  readonly target: 'local' | 'prod';
  readonly runId: string;
  readonly startedAt: string;
  finishedAt?: string;
  conclusion: 'running' | 'passed' | 'failed';
  readonly appOrigin: string;
  readonly apiOrigin: string;
  readonly organizationId: string;
  readonly safeguards: {
    readonly explicitOptIn: true;
    readonly existingAccountsOnly: true;
    readonly mocks: false;
    readonly cleanupScope: 'new-project-id+identity+preflight-snapshot';
  };
  userSessionCleanup: 'pending' | 'revoked' | 'failed';
  authenticationError?: string;
  readonly flows: Partial<Record<FlowName, FlowEvidence>>;
  iban: IbanEvidence;
}

const report: EvidenceReport = {
  schemaVersion: 1,
  proof: 'TPL-02.PROOF+TPL-02.6',
  target: proof.target,
  runId: proof.runId,
  startedAt: new Date().toISOString(),
  conclusion: 'running',
  appOrigin: proof.appBaseUrl,
  apiOrigin: proof.apiBaseUrl,
  organizationId: proof.organizationId,
  safeguards: {
    explicitOptIn: true,
    existingAccountsOnly: true,
    mocks: false,
    cleanupScope: 'new-project-id+identity+preflight-snapshot',
  },
  userSessionCleanup: 'pending',
  flows: {},
  iban: {
    outcome: proof.iban ? 'running' : 'not-requested',
    cleanup: { status: proof.iban ? 'pending' : 'not-requested' },
  },
};

let reportWrite = Promise.resolve();
let userSession: AuthSession | undefined;

function safeError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);

  for (const secret of [
    proof.userPassword,
    proof.iban?.adminPassword,
    proof.userMfaCode,
    proof.iban?.adminMfaCode,
    proof.iban?.fullIban,
    proof.iban?.trailingFragment,
  ]) {
    if (secret) {
      message = message.split(secret).join('[REDACTED]');
    }
  }

  return message.slice(0, 2_000);
}

async function persistReport(): Promise<void> {
  reportWrite = reportWrite.then(async () => {
    await mkdir(evidenceRoot, { recursive: true });

    const temporary = `${reportPath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, reportPath);
  });

  return reportWrite;
}

async function capture(page: Page, flow: string, stage: string, testInfo: TestInfo): Promise<string> {
  await mkdir(evidenceRoot, { recursive: true });

  const path = resolve(evidenceRoot, `${flow}-${stage}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(`${flow}-${stage}`, { path, contentType: 'image/png' });

  return path;
}

class ProofHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    path: string,
    detail: string,
  ) {
    super(`Real API ${path} returned HTTP ${status}${code ? ` (${code})` : ''}: ${detail.slice(0, 500)}`);
  }
}

async function parseJson<T>(response: APIResponse, path: string): Promise<T> {
  const text = await response.text();

  let payload: unknown;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = undefined;
  }

  if (!response.ok()) {
    const body = payload as { code?: string; error?: string } | undefined;
    throw new ProofHttpError(response.status(), body?.code, path, body?.error ?? (text || 'empty response'));
  }

  return payload as T;
}

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function apiGet<T>(api: APIRequestContext, path: string, token?: string): Promise<T> {
  const response = await api.get(`${proof.apiBaseUrl}${path}`, {
    headers: token ? authHeaders(token) : undefined,
  });
  return parseJson<T>(response, path);
}

async function apiPost<T>(
  api: APIRequestContext,
  path: string,
  token: string | undefined,
  data: Record<string, unknown> = {},
): Promise<T> {
  const response = await api.post(`${proof.apiBaseUrl}${path}`, {
    headers: token ? authHeaders(token) : undefined,
    data,
  });
  return parseJson<T>(response, path);
}

async function login(
  api: APIRequestContext,
  credentials: { email: string; password: string; mfaCode?: string },
  organizationId?: string,
): Promise<AuthSession> {
  const loggedIn = await apiPost<{ token: string; user: { id: string; platformAdmin?: boolean } }>(
    api,
    '/auth/login',
    undefined,
    {
      email: credentials.email,
      password: credentials.password,
      ...(credentials.mfaCode ? { mfaCode: credentials.mfaCode } : {}),
    },
  );

  const me = await apiGet<{ user: { id: string; platformAdmin?: boolean } }>(api, '/auth/me', loggedIn.token);

  if (me.user.id !== loggedIn.user.id) {
    throw new Error('Authentication proof failed: /auth/login and /auth/me identify different users');
  }

  let organization: AuthSession['organization'];

  if (organizationId) {
    const orgs = await apiGet<{ organizations: Array<{ id: string; name?: string; slug?: string }> }>(
      api,
      '/orgs',
      loggedIn.token,
    );
    organization = orgs.organizations.find((candidate) => candidate.id === organizationId);

    if (!organization) {
      throw new Error('Authentication proof failed: the supplied QA account is not a member of TPL_PROOF_USER_ORG_ID');
    }

    /*
     * All three browser creation routes intentionally target firstOrganization().
     * Refuse before any mutation unless that exact destination is the dedicated
     * QA org; membership alone is insufficient for a multi-org account.
     */
    if (orgs.organizations[0]?.id !== organizationId) {
      throw new Error(
        'Authentication proof failed: TPL_PROOF_USER_ORG_ID must be the account first organization used by creation routes',
      );
    }
  }

  return {
    token: loggedIn.token,
    user: { id: me.user.id, platformAdmin: me.user.platformAdmin === true },
    organization,
  };
}

async function installBrowserSession(page: Page, session: AuthSession): Promise<void> {
  await page.context().addCookies([
    {
      name: 'vc_session',
      value: session.token,
      url: proof.appBaseUrl,
      httpOnly: true,
      sameSite: 'Lax',
      secure: proof.appBaseUrl.startsWith('https://'),
    },
  ]);
}

async function logout(api: APIRequestContext, session: AuthSession): Promise<void> {
  await apiPost<{ revoked: boolean }>(api, '/auth/logout', session.token);
}

async function listProjects(api: APIRequestContext, session: AuthSession): Promise<ProjectRecord[]> {
  const payload = await apiGet<{ projects: ProjectRecord[] }>(
    api,
    `/orgs/${encodeURIComponent(proof.organizationId)}/projects`,
    session.token,
  );
  return payload.projects;
}

interface ExpectedProject {
  readonly organizationId: string;
  readonly sourceType: string;
  readonly cleanupSourceTypes?: readonly string[];
  readonly startedAtMs: number;
  readonly name: { readonly exact: string } | { readonly prefix: string };
}

function assertProjectAttributedForCleanup(project: ProjectRecord, expected: ExpectedProject): void {
  const allowedSourceTypes = [expected.sourceType, ...(expected.cleanupSourceTypes ?? [])];

  let lastError: unknown;

  for (const sourceType of allowedSourceTypes) {
    try {
      assertQaProjectIdentity(project, { ...expected, sourceType });

      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('QA cleanup refused: no allowed source type matched');
}

async function discoverCreatedProject(
  api: APIRequestContext,
  session: AuthSession,
  beforeIds: ReadonlySet<string>,
  expected: ExpectedProject,
  timeoutMs = 90_000,
): Promise<ProjectRecord> {
  const deadline = Date.now() + timeoutMs;

  let lastNewProjects: ProjectRecord[] = [];

  while (Date.now() < deadline) {
    lastNewProjects = (await listProjects(api, session)).filter((project) => !beforeIds.has(project.id));

    const matches = lastNewProjects.filter((project) => {
      try {
        assertProjectAttributedForCleanup(project, expected);
        return true;
      } catch {
        return false;
      }
    });

    if (matches.length === 1) {
      return matches[0];
    }

    if (matches.length > 1) {
      throw new Error('QA creation attribution is ambiguous: multiple new projects match the active proof flow');
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
  }

  throw new Error(
    `No safely attributable QA project appeared after the UI flow (new project count: ${lastNewProjects.length})`,
  );
}

async function cleanupProject(
  api: APIRequestContext,
  session: AuthSession,
  project: ProjectRecord,
  beforeIds: ReadonlySet<string>,
  expected: ExpectedProject,
  publishedUrl?: string,
): Promise<void> {
  if (beforeIds.has(project.id)) {
    throw new Error('QA cleanup refused: project id existed before the proof flow');
  }

  const current = await apiGet<{ project: ProjectRecord }>(
    api,
    `/projects/${encodeURIComponent(project.id)}`,
    session.token,
  );

  if (current.project.id !== project.id) {
    throw new Error('QA cleanup refused: project lookup returned a different id');
  }

  assertProjectAttributedForCleanup(current.project, expected);

  /*
   * Stop every runtime checkout while the project ACL still exists. The list is
   * project-scoped and the project identity was revalidated immediately above,
   * so this cannot touch another project's workspace. Production checkouts
   * created by publish are included too. Any stop failure aborts cleanup before
   * the project row is removed, leaving an actionable/retryable identity.
   */
  const workspaces = await apiGet<{ workspaces: Array<{ id: string }> }>(
    api,
    `/projects/${encodeURIComponent(project.id)}/workspaces`,
    session.token,
  );

  for (const workspace of workspaces.workspaces) {
    await apiPost<Record<string, never>>(
      api,
      `/api/runtime/workspaces/${encodeURIComponent(workspace.id)}/stop`,
      session.token,
    );

    const stopped = await apiGet<{ workspace: { id: string; status: string } }>(
      api,
      `/workspaces/${encodeURIComponent(workspace.id)}`,
      session.token,
    );

    if (stopped.workspace.id !== workspace.id || stopped.workspace.status !== 'STOPPED') {
      throw new Error(`QA cleanup failed closed: workspace ${workspace.id} did not confirm STOPPED`);
    }
  }

  const deletePath = `/projects/${encodeURIComponent(project.id)}/permanent`;

  const deleted = await api.delete(`${proof.apiBaseUrl}${deletePath}`, {
    headers: authHeaders(session.token),
    data: { confirmName: current.project.name },
  });
  await parseJson<{ project: { id: string } }>(deleted, deletePath);

  const verify = await api.get(`${proof.apiBaseUrl}/projects/${encodeURIComponent(project.id)}`, {
    headers: authHeaders(session.token),
  });

  if (verify.status() !== 404) {
    throw new Error(`QA cleanup failed closed: deleted project still resolves with HTTP ${verify.status()}`);
  }

  if (publishedUrl) {
    const anonymous = await playwrightRequest.newContext({ ignoreHTTPSErrors: false });

    try {
      const deadline = Date.now() + 45_000;

      let lastStatus = 200;

      while (Date.now() < deadline) {
        const publicResponse = await anonymous.get(publishedUrl);
        lastStatus = publicResponse.status();

        if (lastStatus !== 200) {
          return;
        }

        await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
      }

      throw new Error(`QA cleanup failed closed: published URL still returns HTTP ${lastStatus}`);
    } finally {
      await anonymous.dispose();
    }
  }
}

function promptInteraction(): TplProofInteractionContract {
  return {
    readySelector: '[data-tpl-proof="prompt-ready"]',
    actionSelector: '[data-tpl-proof-action="prompt"]',
    resultSelector: '[data-tpl-proof-result="prompt"]',
    initialResultText: '0',
    resultText: '1',
  };
}

function importInteraction(): TplProofInteractionContract {
  return {
    readySelector: '[data-tpl-proof="import-ready"]',
    actionSelector: '[data-tpl-proof-action="import"]',
    resultSelector: '[data-tpl-proof-result="import"]',
    initialResultText: '0',
    resultText: '1',
  };
}

type LocatorRoot = Page | FrameLocator;

async function verifyInteraction(root: LocatorRoot, contract: TplProofInteractionContract): Promise<number> {
  const ready = root.locator(contract.readySelector).first();
  await expect(ready).toBeVisible();

  const body = root.locator('body');
  const bodyText = await body.innerText();
  expect(bodyText.trim().length, 'runtime rendered a blank/near-empty body').toBeGreaterThan(20);

  const visiblePixels = await ready.evaluate((element) => {
    const rect = element.getBoundingClientRect();

    const style = (
      globalThis as unknown as {
        getComputedStyle(node: unknown): { display: string; visibility: string };
      }
    ).getComputedStyle(element);

    return rect.width * rect.height > 400 && style.display !== 'none' && style.visibility !== 'hidden';
  });
  expect(visiblePixels, 'runtime marker has no meaningful visible area').toBe(true);

  const result = root.locator(contract.resultSelector).first();
  await expect(result).toContainText(contract.initialResultText);
  expect(contract.initialResultText).not.toBe(contract.resultText);
  await root.locator(contract.actionSelector).first().click();
  await expect(result).toContainText(contract.resultText);

  return bodyText.trim().length;
}

async function verifyIdePreview(
  page: Page,
  project: ProjectRecord,
  contract: TplProofInteractionContract,
  flow: FlowName,
  testInfo: TestInfo,
): Promise<{ url: string; bodyTextLength: number; screenshot: string }> {
  await page.goto(`/projects/${encodeURIComponent(project.id)}/ide`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /Workspace:\s*running/i })).toBeVisible();
  await page.getByRole('button', { name: 'Webview' }).click();

  const iframe = page.locator('iframe[title="preview"]').first();
  await expect(iframe).toBeVisible();

  const bodyTextLength = await verifyInteraction(page.frameLocator('iframe[title="preview"]').first(), contract);
  const screenshot = await capture(page, flow, 'ide-preview-functional', testInfo);

  return { url: page.url(), bodyTextLength, screenshot };
}

async function waitForReadyDeployment(
  api: APIRequestContext,
  session: AuthSession,
  projectId: string,
  deploymentId: string,
): Promise<DeploymentRecord> {
  const deadline = Date.now() + proof.deployTimeoutMs;

  let lastStatus = 'QUEUED';

  while (Date.now() < deadline) {
    const payload = await apiGet<{ deployment: DeploymentRecord }>(
      api,
      `/projects/${encodeURIComponent(projectId)}/deployments/${encodeURIComponent(deploymentId)}`,
      session.token,
    );
    lastStatus = payload.deployment.status;

    if (lastStatus === 'READY') {
      return payload.deployment;
    }

    if (['FAILED', 'CANCELED'].includes(lastStatus)) {
      throw new Error(`Real deployment ${deploymentId} reached terminal status ${lastStatus}`);
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
  }

  throw new Error(`Real deployment ${deploymentId} did not become READY (last status: ${lastStatus})`);
}

function publicDeploymentUrl(deployment: DeploymentRecord): string {
  const raw = deployment.productionUrl ?? deployment.url ?? deployment.previewUrl;

  if (!raw) {
    throw new Error('Published READY deployment has no public URL');
  }

  return new URL(raw, proof.apiBaseUrl).toString();
}

async function verifyPublishedApp(
  browser: Browser,
  url: string,
  contract: TplProofInteractionContract,
  flow: FlowName,
  testInfo: TestInfo,
): Promise<{ status: 200; screenshot: string; finalUrl: string }> {
  const anonymousRequest = await playwrightRequest.newContext({ ignoreHTTPSErrors: false });
  const response = await anonymousRequest.get(url);

  try {
    expect(response.status(), `anonymous published URL did not return HTTP 200: ${response.url()}`).toBe(200);
  } finally {
    await anonymousRequest.dispose();
  }

  const context = await browser.newContext({ ignoreHTTPSErrors: false });
  const publishedPage = await context.newPage();

  try {
    const navigation = await publishedPage.goto(url, { waitUntil: 'domcontentloaded' });
    expect(navigation?.status(), 'published browser navigation did not finish on HTTP 200').toBe(200);
    await verifyInteraction(publishedPage, contract);

    const screenshot = await capture(publishedPage, flow, 'published-functional', testInfo);

    return { status: 200, screenshot, finalUrl: publishedPage.url() };
  } finally {
    await context.close();
  }
}

async function deployAndPublish(
  api: APIRequestContext,
  browser: Browser,
  session: AuthSession,
  project: ProjectRecord,
  contract: TplProofInteractionContract,
  flow: FlowName,
  testInfo: TestInfo,
): Promise<FlowEvidence['deployment']> {
  const deploymentPath = `/projects/${encodeURIComponent(project.id)}/deployments`;

  const created = await apiPost<{ deployment: DeploymentRecord }>(api, deploymentPath, session.token, {
    provider: 'static',
    environment: 'preview',
    buildCommand: 'npm run build',
    outputDirectory: 'dist',
    previewDeployment: true,
    timeoutSeconds: Math.floor(proof.deployTimeoutMs / 1_000),
  });

  const ready = await waitForReadyDeployment(api, session, project.id, created.deployment.id);
  const publishPath = `${deploymentPath}/${encodeURIComponent(ready.id)}/publish`;
  const published = await apiPost<{ deployment: DeploymentRecord }>(api, publishPath, session.token);

  if (published.deployment.status !== 'READY' || published.deployment.environment !== 'production') {
    throw new Error(
      `Publish returned ${published.deployment.status}/${published.deployment.environment}, expected READY/production`,
    );
  }

  const url = publicDeploymentUrl(published.deployment);
  const live = await verifyPublishedApp(browser, url, contract, flow, testInfo);

  return {
    previewDeploymentId: ready.id,
    publishedDeploymentId: published.deployment.id,
    status: 'READY',
    url: live.finalUrl,
    httpStatus: live.status,
    screenshot: live.screenshot,
  };
}

async function importFixtureZip(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    'package.json',
    JSON.stringify(
      {
        private: true,
        type: 'module',
        scripts: { dev: 'vite --host 0.0.0.0', build: 'vite build' },
        devDependencies: { vite: '^5.4.21' },
      },
      null,
      2,
    ),
  );
  zip.file(
    'index.html',
    '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TPL import proof</title></head><body><main data-tpl-proof="import-ready"><h1>Real ZIP import proof</h1><button data-tpl-proof-action="import" type="button">Increment proof counter</button><output data-tpl-proof-result="import">0</output></main><script type="module" src="/src/main.js"></script></body></html>',
  );
  zip.file(
    'src/main.js',
    "const button=document.querySelector('[data-tpl-proof-action=\"import\"]');const output=document.querySelector('[data-tpl-proof-result=\"import\"]');button.addEventListener('click',()=>{output.textContent=String(Number(output.textContent)+1)});",
  );
  zip.file(
    'src/style.css',
    'body{margin:0;background:#09090b;color:#fafafa;font:16px system-ui}main{min-height:70vh;display:grid;place-content:center;gap:24px;text-align:center}button{padding:12px 18px}output{font-size:32px}',
  );
  zip.file('src/main.js', `${await zip.file('src/main.js')!.async('string')}\nimport './style.css';\n`);

  return zip.generateAsync({ type: 'nodebuffer' });
}

function generatedPrompt(prefix: string): string {
  return `${prefix}-prompt Build a real Vite single-page application now. Create the actual files and run the app; do not answer with an explanation. The package.json must have working "dev": "vite --host 0.0.0.0" and "build": "vite build" scripts. Render a visible main element with data-tpl-proof="prompt-ready", a visible button with data-tpl-proof-action="prompt", and an output with data-tpl-proof-result="prompt" initially containing 0. Clicking that button must increment the output to 1. Keep the page polished but dependency-light.`;
}

interface RunProjectFlowInput {
  readonly flow: FlowName;
  readonly page: Page;
  readonly browser: Browser;
  readonly testInfo: TestInfo;
  readonly interaction: TplProofInteractionContract;
  readonly prepare?: () => Promise<void>;
  readonly expected: (startedAtMs: number) => Omit<ExpectedProject, 'startedAtMs'>;
  readonly create: (session: AuthSession) => Promise<void>;
}

async function runProjectFlow(input: RunProjectFlowInput): Promise<void> {
  const evidence: FlowEvidence = {
    flow: input.flow,
    outcome: 'running',
    startedAt: new Date().toISOString(),
    cleanup: { status: 'pending' },
  };
  report.flows[input.flow] = evidence;
  await persistReport();

  const session = userSession;

  let project: ProjectRecord | undefined;
  let beforeIds = new Set<string>();
  let expected: ExpectedProject | undefined;
  let thrown: unknown;
  let attributionFailure: string | undefined;

  try {
    if (!session) {
      throw new Error('Authentication preflight did not establish the dedicated QA user session');
    }

    await installBrowserSession(input.page, session);
    beforeIds = new Set((await listProjects(input.page.request, session)).map((item) => item.id));
    await input.prepare?.();

    const startedAtMs = Date.now();
    expected = { ...input.expected(startedAtMs), startedAtMs };

    await input.create(session);
    project = await discoverCreatedProject(input.page.request, session, beforeIds, expected);
    evidence.project = { id: project.id, name: project.name, sourceType: project.sourceType };

    /* A safely attributable fallback is deleted below, but it cannot pass the proof contract. */
    assertQaProjectIdentity(project, expected);

    evidence.ide = await verifyIdePreview(input.page, project, input.interaction, input.flow, input.testInfo);
    evidence.deployment = await deployAndPublish(
      input.page.request,
      input.browser,
      session,
      project,
      input.interaction,
      input.flow,
      input.testInfo,
    );
    evidence.outcome = 'passed';
  } catch (error) {
    thrown = error;
    evidence.outcome = 'failed';
    evidence.error = safeError(error);

    /*
     * The UI may have committed a project even if its redirect/response failed.
     * Recover it from the before/after snapshot so cleanup still runs. Never
     * guess: the same identity checks and one-match rule apply.
     */
    if (session && expected && !project) {
      try {
        project = await discoverCreatedProject(input.page.request, session, beforeIds, expected, 8_000);
        evidence.project = { id: project.id, name: project.name, sourceType: project.sourceType };
      } catch (recoveryError) {
        attributionFailure = safeError(recoveryError);
      }
    }
  } finally {
    if (session && project && expected) {
      try {
        await cleanupProject(input.page.request, session, project, beforeIds, expected, evidence.deployment?.url);
        evidence.cleanup = { status: 'deleted' };
      } catch (error) {
        evidence.cleanup = { status: 'failed', detail: safeError(error) };
        thrown = thrown ? new AggregateError([thrown, error], 'Proof flow and cleanup both failed') : error;
        evidence.outcome = 'failed';
        evidence.error = safeError(thrown);
      }
    } else {
      evidence.cleanup = {
        status: 'not-created',
        ...(attributionFailure ? { detail: `No safe cleanup attribution: ${attributionFailure}` } : {}),
      };
    }

    evidence.finishedAt = new Date().toISOString();
    await persistReport();
    await input.testInfo.attach(`${input.flow}-report`, { path: reportPath, contentType: 'application/json' });
  }

  if (thrown) {
    throw thrown;
  }
}

async function galleryListing(
  api: APIRequestContext,
  slug: string,
): Promise<{
  id: string;
  title: string;
  remixAllowed: boolean;
  piiHandling: { mode: 'MASKED' | 'AUTHOR_CONSENT' };
}> {
  const result = await apiGet<{
    listing: {
      id: string;
      title: string;
      remixAllowed: boolean;
      piiHandling: { mode: 'MASKED' | 'AUTHOR_CONSENT' };
    };
  }>(api, `/gallery/${encodeURIComponent(slug)}`);

  if (!result.listing.remixAllowed) {
    throw new Error(`Gallery fixture ${slug} is not remixable`);
  }

  return result.listing;
}

async function archiveText(api: APIRequestContext, projectId: string, token: string): Promise<string> {
  const payload = await apiGet<{ archive: { base64: string } }>(
    api,
    `/projects/${encodeURIComponent(projectId)}/export/zip`,
    token,
  );

  const zip = await JSZip.loadAsync(payload.archive.base64, { base64: true });
  const textExtensions = /(?:^|\.)(?:csv|txt|md|json|js|jsx|ts|tsx|html|css|yaml|yml|env)$/i;
  const parts: string[] = [];

  for (const path of Object.keys(zip.files).sort()) {
    const entry = zip.files[path];

    if (!entry.dir && textExtensions.test(path)) {
      parts.push(await entry.async('string'));
    }
  }

  return parts.join('\n');
}

test.describe('TPL-02 real lifecycle proof (explicit opt-in, no mocks)', () => {
  test.beforeAll(async ({ request }) => {
    try {
      userSession = await login(
        request,
        { email: proof.userEmail, password: proof.userPassword, mfaCode: proof.userMfaCode },
        proof.organizationId,
      );
    } catch (error) {
      report.authenticationError = safeError(error);
      report.conclusion = 'failed';
      await persistReport();
      throw error;
    }
  });

  test('prompt -> project -> IDE Preview -> READY publish -> anonymous HTTP 200', async ({
    page,
    browser,
  }, testInfo) => {
    const prompt = generatedPrompt(proof.projectPrefix);
    await runProjectFlow({
      flow: 'prompt',
      page,
      browser,
      testInfo,
      interaction: promptInteraction(),
      expected: () => ({
        organizationId: proof.organizationId,
        sourceType: 'ai',
        cleanupSourceTypes: ['blank'],
        name: { prefix: `${proof.projectPrefix}-prompt` },
      }),
      create: async () => {
        await page.goto('/projects/new', { waitUntil: 'domcontentloaded' });
        await page.getByLabel('Describe your idea').fill(prompt);
        await page.getByRole('button', { name: 'Create project' }).click();
        await page.waitForURL(/(?:\/@[^/]+\/[^/?]+|\/projects\/[^/]+\/ide)(?:\?.*)?$/, {
          timeout: proof.runtimeTimeoutMs,
        });
      },
    });
  });

  test('ZIP import -> project -> IDE Preview -> READY publish -> anonymous HTTP 200', async ({
    page,
    browser,
  }, testInfo) => {
    const projectName = `${proof.projectPrefix}-import`;
    await runProjectFlow({
      flow: 'import',
      page,
      browser,
      testInfo,
      interaction: importInteraction(),
      expected: () => ({
        organizationId: proof.organizationId,
        sourceType: 'zip',
        name: { exact: projectName },
      }),
      create: async () => {
        await page.goto('/import-zip', { waitUntil: 'domcontentloaded' });
        await page.locator('input[name="archive"]').setInputFiles({
          name: `${projectName}.zip`,
          mimeType: 'application/zip',
          buffer: await importFixtureZip(),
        });
        await page.locator('input[name="name"]').fill(projectName);
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(/(?:\/@[^/]+\/[^/?]+|\/projects\/[^/]+\/ide)(?:\?.*)?$/, {
          timeout: proof.runtimeTimeoutMs,
        });
      },
    });
  });

  test('Gallery remix -> project -> IDE Preview -> READY publish -> anonymous HTTP 200', async ({
    page,
    browser,
  }, testInfo) => {
    let listingTitle: string | undefined;
    await runProjectFlow({
      flow: 'remix',
      page,
      browser,
      testInfo,
      interaction: proof.remix,
      prepare: async () => {
        listingTitle = (await galleryListing(page.request, proof.remixSlug)).title;
      },
      expected: () => {
        if (!listingTitle) {
          throw new Error('Gallery fixture preflight did not resolve a listing title');
        }

        return {
          organizationId: proof.organizationId,
          sourceType: 'duplicate',
          name: { exact: listingTitle },
        };
      },
      create: async () => {
        await page.goto(`/gallery/${encodeURIComponent(proof.remixSlug)}`, { waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('gallery-remix')).toBeDisabled();
        await page.getByTestId('gallery-consent').check();
        await expect(page.getByTestId('gallery-remix')).toBeEnabled();
        await capture(page, 'remix', 'license-consent', testInfo);
        await page.getByTestId('gallery-remix').click();
        await page.waitForURL(/(?:\/@[^/]+\/[^/?]+|\/projects\/[^/]+\/ide)(?:\?.*)?$/, {
          timeout: proof.runtimeTimeoutMs,
        });
      },
    });
  });

  test('TPL-02.6 real IBAN source -> Gallery remix -> no full or terminal IBAN fragment', async ({
    page,
  }, testInfo) => {
    const iban = proof.iban;
    test.skip(!iban, 'TPL_PROOF_INCLUDE_IBAN is not 1; TPL-02.6 remains explicitly not requested.');

    if (!iban) {
      return;
    }

    report.iban = {
      outcome: 'running',
      startedAt: new Date().toISOString(),
      sourceProjectId: iban.sourceProjectId,
      cleanup: { status: 'pending' },
    };
    await persistReport();

    const user = userSession;

    let admin: AuthSession | undefined;
    let clone: ProjectRecord | undefined;
    let expected: ExpectedProject | undefined;
    let beforeIds = new Set<string>();
    let thrown: unknown;
    let attributionFailure: string | undefined;

    try {
      if (!user) {
        throw new Error('Authentication preflight did not establish the dedicated QA user session');
      }

      admin = await login(page.request, {
        email: iban.adminEmail,
        password: iban.adminPassword,
        mfaCode: iban.adminMfaCode,
      });

      if (!admin.user.platformAdmin) {
        throw new Error('TPL-02.6 refused: TPL_PROOF_ADMIN_EMAIL is not a platform admin');
      }

      await apiPost<{ reauthenticated: boolean }>(page.request, '/auth/reauth', admin.token, {
        password: iban.adminPassword,
      });

      const source = await apiGet<{ project: ProjectRecord }>(
        page.request,
        `/projects/${encodeURIComponent(iban.sourceProjectId)}`,
        admin.token,
      );

      if (source.project.name !== iban.sourceProjectName) {
        throw new Error('TPL-02.6 refused: the authorized source project name does not match the configured fixture');
      }

      const sourceText = await archiveText(page.request, iban.sourceProjectId, admin.token);
      const listing = await galleryListing(page.request, iban.listingSlug);

      if (listing.piiHandling.mode !== 'MASKED') {
        throw new Error('TPL-02.6 refused: the Gallery fixture is not in MASKED PII mode');
      }

      await installBrowserSession(page, user);
      beforeIds = new Set((await listProjects(page.request, user)).map((item) => item.id));

      const startedAtMs = Date.now();
      expected = {
        organizationId: proof.organizationId,
        sourceType: 'duplicate',
        name: { exact: listing.title },
        startedAtMs,
      };

      await page.goto(`/gallery/${encodeURIComponent(iban.listingSlug)}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('gallery-pii-handling')).toContainText(/mask/i);
      await expect(page.getByTestId('gallery-remix')).toBeDisabled();
      await page.getByTestId('gallery-consent').check();

      const screenshot = await capture(page, 'iban', 'source-license-consent', testInfo);
      await page.getByTestId('gallery-remix').click();
      await page.waitForURL(/(?:\/@[^/]+\/[^/?]+|\/projects\/[^/]+\/ide)(?:\?.*)?$/, {
        timeout: proof.runtimeTimeoutMs,
      });

      clone = await discoverCreatedProject(page.request, user, beforeIds, expected);

      const cloneText = await archiveText(page.request, clone.id, user.token);
      assertIbanWasMasked({
        sourceText,
        cloneText,
        fullIban: iban.fullIban,
        trailingFragment: iban.trailingFragment,
        safeMarker: iban.safeMarker,
      });

      report.iban = {
        ...report.iban,
        outcome: 'passed',
        cloneProjectId: clone.id,
        sourceContainedFullIban: true,
        cloneContainedMaskMarker: true,
        terminalFragmentAbsent: true,
        screenshot,
        cleanup: { status: 'pending' },
      };
    } catch (error) {
      thrown = error;
      report.iban.outcome = 'failed';
      report.iban.error = safeError(error);

      if (user && expected && !clone) {
        try {
          clone = await discoverCreatedProject(page.request, user, beforeIds, expected, 8_000);
          report.iban.cloneProjectId = clone.id;
        } catch (recoveryError) {
          attributionFailure = safeError(recoveryError);
        }
      }
    } finally {
      if (user && clone && expected) {
        try {
          await cleanupProject(page.request, user, clone, beforeIds, expected);
          report.iban.cleanup = { status: 'deleted' };
        } catch (error) {
          report.iban.cleanup = { status: 'failed', detail: safeError(error) };
          thrown = thrown ? new AggregateError([thrown, error], 'IBAN proof and cleanup both failed') : error;
          report.iban.outcome = 'failed';
          report.iban.error = safeError(thrown);
        }
      } else {
        report.iban.cleanup = {
          status: 'not-created',
          ...(attributionFailure ? { detail: `No safe cleanup attribution: ${attributionFailure}` } : {}),
        };
      }

      if (admin) {
        try {
          await logout(page.request, admin);
        } catch (error) {
          thrown = thrown
            ? new AggregateError([thrown, error], 'IBAN proof and admin session cleanup both failed')
            : error;
          report.iban.outcome = 'failed';
          report.iban.error = safeError(thrown);
        }
      }

      report.iban.finishedAt = new Date().toISOString();
      await persistReport();
      await testInfo.attach('iban-report', { path: reportPath, contentType: 'application/json' });
    }

    if (thrown) {
      throw thrown;
    }
  });

  test.afterAll(async ({ request }) => {
    let sessionCleanupError: unknown;

    if (userSession) {
      try {
        await logout(request, userSession);
        report.userSessionCleanup = 'revoked';
      } catch (error) {
        sessionCleanupError = error;
        report.userSessionCleanup = 'failed';
        report.authenticationError = safeError(error);
      }
    } else {
      sessionCleanupError = new Error('Dedicated QA user session was never established');
      report.userSessionCleanup = 'failed';
    }

    const requiredFlows: FlowName[] = ['prompt', 'import', 'remix'];

    const flowsPassed = requiredFlows.every((flow) => {
      const evidence = report.flows[flow];
      return evidence?.outcome === 'passed' && evidence.cleanup.status === 'deleted';
    });

    const ibanPassed = !proof.iban || (report.iban.outcome === 'passed' && report.iban.cleanup.status === 'deleted');
    report.conclusion = flowsPassed && ibanPassed && report.userSessionCleanup === 'revoked' ? 'passed' : 'failed';
    report.finishedAt = new Date().toISOString();
    await persistReport();

    if (sessionCleanupError) {
      throw sessionCleanupError;
    }
  });
});
