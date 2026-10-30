/**
 * Recover one transient fetch failure before React.lazy caches a rejection.
 * Chromium also retains failed module URLs: remounting the same lazy component
 * or importing the original URL again cannot recover that fetch in this page.
 * Unsupported errors remain visible through the existing panel boundary.
 */
export async function loadWorkbenchWithRecovery<T>(
  load: () => Promise<T>,
  options: { origin?: string; retryImport?: (url: string) => Promise<T> } = {},
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    const origin = options.origin ?? (typeof window !== 'undefined' ? window.location.origin : undefined);
    const recoveryUrl = getWorkbenchRecoveryUrl(error, origin);

    if (!recoveryUrl) {
      throw error;
    }

    // One fixed recovery URL, no recursion, cache-busting loop or page reload.
    if (options.retryImport) {
      return options.retryImport(recoveryUrl);
    }

    return import(/* @vite-ignore */ recoveryUrl) as Promise<T>;
  }
}

function getWorkbenchRecoveryUrl(error: unknown, origin: string | undefined): string | undefined {
  if (!(error instanceof TypeError) || !origin) {
    return undefined;
  }

  const match = /^Failed to fetch dynamically imported module: (https?:\/\/[^\s]+)$/u.exec(error.message);

  if (!match || match[0] !== error.message) {
    return undefined;
  }

  try {
    const url = new URL(match[1]);

    if (
      url.origin !== origin ||
      url.href !== match[1] ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/assets\/Workbench\.client-[A-Za-z0-9_-]+\.js$/u.test(url.pathname)
    ) {
      return undefined;
    }

    url.searchParams.set('vibecore-retry', '1');

    return url.href;
  } catch {
    return undefined;
  }
}
