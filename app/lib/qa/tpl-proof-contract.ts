const PROD_ACK = 'I_UNDERSTAND_THIS_RUN_CREATES_PUBLISHES_AND_DELETES_QA_PROJECTS';
const RUN_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{6,38}[a-z0-9])$/;
const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export type TplProofTarget = 'local' | 'prod';

export interface TplProofInteractionContract {
  readonly readySelector: string;
  readonly actionSelector: string;
  readonly resultSelector: string;
  readonly initialResultText: string;
  readonly resultText: string;
}

export interface TplProofIbanConfig {
  readonly adminEmail: string;
  readonly adminPassword: string;
  readonly adminMfaCode?: string;
  readonly listingSlug: string;
  readonly sourceProjectId: string;
  readonly sourceProjectName: string;
  readonly fullIban: string;
  readonly trailingFragment: string;
  readonly safeMarker: string;
}

export interface TplProofConfig {
  readonly target: TplProofTarget;
  readonly runId: string;
  readonly projectPrefix: string;
  readonly appBaseUrl: string;
  readonly apiBaseUrl: string;
  readonly outputDir: string;
  readonly userEmail: string;
  readonly userPassword: string;
  readonly userMfaCode?: string;
  readonly organizationId: string;
  readonly remixSlug: string;
  readonly remix: TplProofInteractionContract;
  readonly deployTimeoutMs: number;
  readonly runtimeTimeoutMs: number;
  readonly iban?: TplProofIbanConfig;
}

export interface QaProjectIdentity {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly sourceType?: string | null;
  readonly createdAt?: string | null;
}

type Env = Record<string, string | undefined>;

function required(env: Env, key: string): string {
  const value = env[key]?.trim();

  if (!value) {
    throw new Error(`TPL proof guard: ${key} is required`);
  }

  return value;
}

function optional(env: Env, key: string): string | undefined {
  const value = env[key]?.trim();
  return value || undefined;
}

function parseUrl(env: Env, key: string): URL {
  const raw = required(env, key);

  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new Error(`TPL proof guard: ${key} must be an absolute HTTP(S) URL`);
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`TPL proof guard: ${key} must be a credential-free HTTP(S) origin`);
  }

  return url;
}

function localHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function positiveInteger(env: Env, key: string, fallback: number, minimum: number, maximum: number): number {
  const raw = optional(env, key);
  const value = raw ? Number(raw) : fallback;

  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`TPL proof guard: ${key} must be an integer between ${minimum} and ${maximum}`);
  }

  return value;
}

function interactionContract(env: Env): TplProofInteractionContract {
  return {
    readySelector: required(env, 'TPL_PROOF_REMIX_READY_SELECTOR'),
    actionSelector: required(env, 'TPL_PROOF_REMIX_ACTION_SELECTOR'),
    resultSelector: required(env, 'TPL_PROOF_REMIX_RESULT_SELECTOR'),
    initialResultText: required(env, 'TPL_PROOF_REMIX_INITIAL_RESULT_TEXT'),
    resultText: required(env, 'TPL_PROOF_REMIX_RESULT_TEXT'),
  };
}

function ibanConfig(env: Env, target: TplProofTarget): TplProofIbanConfig | undefined {
  const includeIban = env.TPL_PROOF_INCLUDE_IBAN === '1';

  if (!includeIban) {
    if (target === 'prod' && env.TPL_PROOF_INCLUDE_IBAN !== '0') {
      throw new Error('TPL proof guard: prod requires TPL_PROOF_INCLUDE_IBAN=0 or 1 explicitly');
    }

    return undefined;
  }

  const sourceProjectId = required(env, 'TPL_PROOF_IBAN_SOURCE_PROJECT_ID');

  if (!PROJECT_ID_PATTERN.test(sourceProjectId)) {
    throw new Error('TPL proof guard: TPL_PROOF_IBAN_SOURCE_PROJECT_ID has an invalid shape');
  }

  const trailingFragment = required(env, 'TPL_PROOF_IBAN_TRAILING_FRAGMENT');

  if (trailingFragment.length < 3 || trailingFragment.length > 12) {
    throw new Error('TPL proof guard: TPL_PROOF_IBAN_TRAILING_FRAGMENT must contain 3 to 12 characters');
  }

  return {
    adminEmail: required(env, 'TPL_PROOF_ADMIN_EMAIL'),
    adminPassword: required(env, 'TPL_PROOF_ADMIN_PASSWORD'),
    adminMfaCode: optional(env, 'TPL_PROOF_ADMIN_MFA_CODE'),
    listingSlug: required(env, 'TPL_PROOF_IBAN_SLUG'),
    sourceProjectId,
    sourceProjectName: required(env, 'TPL_PROOF_IBAN_SOURCE_PROJECT_NAME'),
    fullIban: required(env, 'TPL_PROOF_IBAN_FULL_VALUE'),
    trailingFragment,
    safeMarker: required(env, 'TPL_PROOF_IBAN_SAFE_MARKER'),
  };
}

/**
 * Parse the opt-in contract before Playwright discovers a single test.
 * There are deliberately no defaults for credentials, orgs, or Gallery fixtures.
 */
export function loadTplProofConfig(env: Env = process.env): TplProofConfig {
  if (env.TPL_PROOF_RUN !== '1') {
    throw new Error('TPL proof guard: set TPL_PROOF_RUN=1 to opt in');
  }

  const target = required(env, 'TPL_PROOF_TARGET');

  if (target !== 'local' && target !== 'prod') {
    throw new Error('TPL proof guard: TPL_PROOF_TARGET must be local or prod');
  }

  const runId = required(env, 'TPL_PROOF_RUN_ID');

  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error('TPL proof guard: TPL_PROOF_RUN_ID must be 8-40 lowercase letters, digits, or hyphens');
  }

  const appUrl = parseUrl(env, 'PLAYWRIGHT_BASE_URL');
  const apiUrl = parseUrl(env, 'PLAYWRIGHT_API_URL');

  if (target === 'local') {
    if (!localHostname(appUrl.hostname) || !localHostname(apiUrl.hostname)) {
      throw new Error('TPL proof guard: local target only accepts localhost/loopback origins');
    }
  } else {
    if (env.TPL_PROOF_PROD_ACK !== PROD_ACK) {
      throw new Error(`TPL proof guard: prod requires TPL_PROOF_PROD_ACK=${PROD_ACK}`);
    }

    if (appUrl.protocol !== 'https:' || apiUrl.protocol !== 'https:') {
      throw new Error('TPL proof guard: prod requires HTTPS app and API origins');
    }

    if (localHostname(appUrl.hostname) || localHostname(apiUrl.hostname)) {
      throw new Error('TPL proof guard: prod cannot target a loopback origin');
    }
  }

  const organizationId = required(env, 'TPL_PROOF_USER_ORG_ID');

  if (!PROJECT_ID_PATTERN.test(organizationId)) {
    throw new Error('TPL proof guard: TPL_PROOF_USER_ORG_ID has an invalid shape');
  }

  const userEmail = required(env, 'TPL_PROOF_USER_EMAIL');
  const iban = ibanConfig(env, target);

  if (iban && iban.adminEmail.toLowerCase() === userEmail.toLowerCase()) {
    throw new Error('TPL proof guard: the IBAN remixer and source-fixture admin must be distinct accounts');
  }

  return {
    target,
    runId,
    projectPrefix: `tpl-proof-${runId}`,
    appBaseUrl: appUrl.origin,
    apiBaseUrl: apiUrl.origin,
    outputDir: `test-results/tpl-proof-${runId}`,
    userEmail,
    userPassword: required(env, 'TPL_PROOF_USER_PASSWORD'),
    userMfaCode: optional(env, 'TPL_PROOF_USER_MFA_CODE'),
    organizationId,
    remixSlug: required(env, 'TPL_PROOF_REMIX_SLUG'),
    remix: interactionContract(env),
    deployTimeoutMs: positiveInteger(env, 'TPL_PROOF_DEPLOY_TIMEOUT_MS', 15 * 60_000, 30_000, 30 * 60_000),
    runtimeTimeoutMs: positiveInteger(env, 'TPL_PROOF_RUNTIME_TIMEOUT_MS', 12 * 60_000, 30_000, 30 * 60_000),
    iban,
  };
}

/**
 * A project is safe to delete only if every observed identity field agrees with
 * the flow that just created it. Callers must additionally prove the id was not
 * present in their pre-flow snapshot.
 */
export function assertQaProjectIdentity(
  project: QaProjectIdentity,
  expected: {
    readonly organizationId: string;
    readonly sourceType: string;
    readonly startedAtMs: number;
    readonly name: { readonly exact: string } | { readonly prefix: string };
  },
): void {
  if (project.organizationId !== expected.organizationId) {
    throw new Error('QA cleanup refused: project organization does not match the dedicated QA organization');
  }

  if (project.sourceType !== expected.sourceType) {
    throw new Error(
      `QA cleanup refused: expected sourceType ${expected.sourceType}, got ${project.sourceType ?? 'none'}`,
    );
  }

  const nameMatches =
    'exact' in expected.name ? project.name === expected.name.exact : project.name.startsWith(expected.name.prefix);

  if (!nameMatches) {
    throw new Error('QA cleanup refused: project name does not match the active proof flow');
  }

  const createdAtMs = Date.parse(project.createdAt ?? '');

  if (!Number.isFinite(createdAtMs) || createdAtMs < expected.startedAtMs - 5_000) {
    throw new Error('QA cleanup refused: project predates the active proof flow');
  }
}

/**
 * TPL-02.6 must prove a real before/after, not merely fail to find a value in an
 * arbitrary clone. The mask marker also proves the pinned snapshot contained an
 * IBAN-shaped value that the remix sanitizer actually replaced.
 */
export function assertIbanWasMasked(input: {
  readonly sourceText: string;
  readonly cloneText: string;
  readonly fullIban: string;
  readonly trailingFragment: string;
  readonly safeMarker: string;
}): void {
  if (!input.sourceText.includes(input.fullIban)) {
    throw new Error('IBAN proof invalid: the authorized source export does not contain the expected IBAN');
  }

  if (!input.sourceText.includes(input.safeMarker)) {
    throw new Error('IBAN proof invalid: the authorized source export is missing the safe fixture marker');
  }

  if (input.cloneText.includes(input.fullIban)) {
    throw new Error('IBAN proof failed: the full IBAN survived the remix');
  }

  if (input.cloneText.includes(input.trailingFragment)) {
    throw new Error('IBAN proof failed: the configured terminal IBAN fragment survived the remix');
  }

  if (!input.cloneText.includes('[PII:iban masked on remix]')) {
    throw new Error('IBAN proof invalid: the clone has no IBAN masking marker');
  }

  if (!input.cloneText.includes(input.safeMarker)) {
    throw new Error('IBAN proof invalid: the clone is not the expected fixture release');
  }
}

export const tplProofProdAck = PROD_ACK;
