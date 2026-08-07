import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { LoaderFunctionArgs } from 'react-router';
import { data as json } from 'react-router';
import { readSessionToken } from '~/lib/enterprise-api.server';
import { getWebApiRoutesCopy, webApiErrorResponse, webApiLocaleHeaders } from '~/lib/i18n/catalogs/web-api-routes';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';

export async function loader({ request }: LoaderFunctionArgs) {
  const copy = getWebApiRoutesCopy(resolveRequestLocale(request).language);
  const localeHeaders = webApiLocaleHeaders(request);

  /*
   * Require an authenticated session. When VIBECORE_EXPOSE_PLATFORM_GIT_INFO is
   * enabled this loader returns the platform deployment's branch/commit/remote —
   * a deployment-fingerprinting oracle. Gate it behind a signed-in session so an
   * anonymous caller cannot probe it. (The disabled branch below already returns
   * only inert placeholders, but we still require auth so the endpoint never
   * leaks even its enabled/disabled state to unauthenticated clients.)
   */
  if (!readSessionToken(request)) {
    return json(
      {
        branch: 'workspace',
        commit: 'hidden',
        isDirty: false,
        lastCommit: undefined,
      },
      { status: 401, headers: localeHeaders },
    );
  }

  if (process.env.VIBECORE_EXPOSE_PLATFORM_GIT_INFO !== 'true') {
    return json(
      {
        branch: 'workspace',
        commit: 'hidden',
        isDirty: false,
        lastCommit: undefined,
      },
      { headers: localeHeaders },
    );
  }

  try {
    // Check if we're in a git repository
    if (!existsSync('.git')) {
      return json(
        {
          branch: copy.gitInfoUnknown,
          commit: copy.gitInfoUnknown,
          isDirty: false,
        },
        { headers: localeHeaders },
      );
    }

    // Get current branch
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();

    // Get current commit hash
    const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

    // Check if working directory is dirty
    const statusOutput = execSync('git status --porcelain', { encoding: 'utf8' });
    const isDirty = statusOutput.trim().length > 0;

    // Get remote URL
    let remoteUrl: string | undefined;

    try {
      remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
    } catch {
      // No remote origin, leave as undefined
    }

    // Get last commit info
    let lastCommit: { message: string; date: string; author: string } | undefined;

    try {
      const commitInfo = execSync('git log -1 --pretty=format:"%s|%ci|%an"', { encoding: 'utf8' }).trim();
      const [message, date, author] = commitInfo.split('|');
      lastCommit = {
        message: message || copy.gitInfoUnknown,
        date: date || copy.gitInfoUnknown,
        author: author || copy.gitInfoUnknown,
      };
    } catch {
      // Could not get commit info
    }

    return json(
      {
        branch,
        commit,
        isDirty,
        remoteUrl,
        lastCommit,
      },
      { headers: localeHeaders },
    );
  } catch (error) {
    console.error('Error fetching git info:', error);
    return webApiErrorResponse(request, 'GIT_INFO_FAILED', 500, {
      extra: {
        branch: 'error',
        commit: 'error',
        isDirty: false,
      },
    });
  }
}
