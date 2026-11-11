type AgentHop = (path: string, init: RequestInit, attempts: number, timeoutMs: number) => Promise<unknown>;

/** Read capability first; exactly one mutating hop, and never a fallback after any dispatch. */
export async function dedicatedPackageInstall<T>(
  hop: AgentHop,
  body: {
    packageManager: string;
    packages: string[];
    dev?: boolean;
    timeoutMs: number;
  },
): Promise<T> {
  if (!Number.isSafeInteger(body.timeoutMs) || body.timeoutMs <= 0 || body.timeoutMs > 300_000) {
    throw Object.assign(new Error('Invalid package installation budget'), {
      statusCode: 400,
      code: 'INVALID_PACKAGE_INSTALL_BUDGET',
    });
  }

  const totalBudgetMs = body.timeoutMs + 30_000;
  const deadline = performance.now() + totalBudgetMs;
  const signal = AbortSignal.timeout(totalBudgetMs);

  let capability: unknown;

  try {
    capability = await hop(
      '/packages/v1/capabilities',
      { method: 'GET', signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) },
      1,
      10_000,
    );
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;

    if (status !== 404 && status !== 405) {
      throw error;
    }

    throw Object.assign(new Error('Workspace agent upgrade required for package installation'), {
      statusCode: 409,
      code: 'PACKAGE_INSTALL_CAPABILITY_REQUIRED',
    });
  }

  const value = capability as { version?: unknown; maxBudgetMs?: unknown; validatedSpecs?: unknown } | null;

  if (!value || value.version !== 1 || value.maxBudgetMs !== 300_000 || value.validatedSpecs !== 1) {
    throw Object.assign(new Error('Workspace agent upgrade required for package installation'), {
      statusCode: 409,
      code: 'PACKAGE_INSTALL_CAPABILITY_REQUIRED',
    });
  }

  const remainingMs = Math.ceil(deadline - performance.now());

  if (signal.aborted || remainingMs <= 0) {
    throw Object.assign(new Error('Package installation deadline expired before dispatch'), {
      statusCode: 504,
      code: 'PACKAGE_INSTALL_DEADLINE',
    });
  }

  return (await hop(
    '/packages/v1/install',
    { method: 'POST', body: JSON.stringify(body), signal },
    1,
    remainingMs,
  )) as T;
}
