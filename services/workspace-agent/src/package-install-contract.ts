import { workspaceAgentError } from './public-i18n.js';

/** Explicit install policy; never used for generic commands or background sessions. */
export const PACKAGE_INSTALL_MAX_MS = 300_000;
export const PACKAGE_INSTALL_CAPABILITY = Object.freeze({
  version: 1,
  maxBudgetMs: PACKAGE_INSTALL_MAX_MS,
  validatedSpecs: 1,
});

export function packageInstallPlan(value: unknown) {
  const invalid = () =>
    workspaceAgentError('invalidPackageInstallRequest', {
      statusCode: 400,
      code: 'INVALID_PACKAGE_INSTALL_REQUEST',
    });

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalid();
  }

  const body = value as Record<string, unknown>;

  if (Object.keys(body).some((key) => !['packageManager', 'packages', 'dev', 'timeoutMs'].includes(key))) {
    throw invalid();
  }

  const manager = body.packageManager;

  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(manager as string)) {
    throw invalid();
  }

  if (body.dev !== undefined && typeof body.dev !== 'boolean') {
    throw invalid();
  }

  const timeoutMs = body.timeoutMs === undefined ? PACKAGE_INSTALL_MAX_MS : body.timeoutMs;

  if (
    typeof timeoutMs !== 'number' ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > PACKAGE_INSTALL_MAX_MS
  ) {
    throw invalid();
  }

  const packages = body.packages === undefined ? [] : body.packages;

  if (!Array.isArray(packages) || packages.length > 50) {
    throw invalid();
  }

  // Match the existing Packages API spec contract. Source selectors and lifecycle scripts are not a sandbox boundary.
  const spec = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(@[^\s]+)?$/i;

  if (
    packages.some(
      (value) =>
        typeof value !== 'string' ||
        value.length === 0 ||
        value.length > 214 ||
        value.startsWith('-') ||
        /[\s;&|`$(){}<>\\'"]/.test(value) ||
        !spec.test(value),
    )
  ) {
    throw invalid();
  }

  const names = packages as string[];
  const flag = manager === 'npm' ? '--save-dev' : manager === 'pnpm' ? '-D' : manager === 'yarn' ? '--dev' : '-d';

  const args = names.length
    ? [manager === 'npm' ? 'install' : 'add', ...(body.dev ? [flag] : []), ...names]
    : ['install'];

  return { command: manager as string, args, timeoutMs };
}
