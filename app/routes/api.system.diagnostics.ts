import type { LoaderFunctionArgs } from 'react-router';
import { requireWebSession } from '~/lib/.server/require-session';
import { json } from '~/lib/json-response';
import { withSecurity } from '~/lib/security';

/**
 * Diagnostic API for troubleshooting connection issues
 */

/**
 * This loader makes outbound network calls (api.github.com/zen, api.netlify.com)
 * on every hit, each with a 15s timeout, and echoes caller request headers back.
 * Left anonymous it is a cheap DoS/amplification vector — an unauthenticated
 * caller can force the server to fan out outbound requests and hold connections
 * open. Gate it exactly like its hardening-batch siblings (api.system.disk-info,
 * api.update): require a valid web session BEFORE any outbound probe, and wrap
 * the loader in withSecurity for rate limiting + method allowlisting.
 *
 * requireWebSession fails closed (throws a 401/503 Response). withSecurity's
 * catch would otherwise rewrite that into a generic 500, so surface the auth
 * Response as-is before reaching the external connectivity probes.
 */
async function diagnosticsHandler({ request }: LoaderFunctionArgs): Promise<Response> {
  try {
    await requireWebSession(request);
  } catch (authResponse) {
    if (authResponse instanceof Response) {
      return authResponse;
    }

    throw authResponse;
  }

  /*
   * Do NOT expose whether the SERVER holds GitHub/Netlify tokens: this loader is
   * unauthenticated, and leaking hasGithubToken/hasNetlifyToken to anyone is an
   * exploit oracle (it confirms the platform credential exists — the precondition
   * for the unauth git-info token-leak class). Only the caller's OWN cookie state
   * (below) and nodeEnv are reported.
   */
  const envVars = {
    nodeEnv: process.env.NODE_ENV,
  };

  // Check cookies
  const cookieHeader = request.headers.get('Cookie') || '';

  const cookies = cookieHeader.split(';').reduce(
    (acc, cookie) => {
      const [key, value] = cookie.trim().split('=');

      if (key) {
        acc[key] = value;
      }

      return acc;
    },
    {} as Record<string, string>,
  );

  const hasGithubTokenCookie = Boolean(cookies.githubToken);
  const hasGithubUsernameCookie = Boolean(cookies.githubUsername);
  const hasNetlifyCookie = Boolean(cookies.netlifyToken);

  // Get local storage status (this can only be checked client-side)
  const localStorageStatus = {
    explanation: 'Local storage can only be checked on the client side. Use browser devtools to check.',
    githubKeysToCheck: ['github_connection'],
    netlifyKeysToCheck: ['netlify_connection'],
  };

  // Check if CORS might be an issue
  const corsStatus = {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  };

  // Check if API endpoints are reachable
  const apiEndpoints = {
    githubUser: '/api/system/git-info?action=getUser',
    githubRepos: '/api/system/git-info?action=getRepos',
    githubOrgs: '/api/system/git-info?action=getOrgs',
    githubActivity: '/api/system/git-info?action=getActivity',
    gitInfo: '/api/system/git-info',
  };

  // Test GitHub API connectivity
  let githubApiStatus;

  try {
    const githubResponse = await fetch('https://api.github.com/zen', {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
      signal: AbortSignal.timeout(15000),
    });

    githubApiStatus = {
      isReachable: githubResponse.ok,
      status: githubResponse.status,
      statusText: githubResponse.statusText,
    };
  } catch (error) {
    githubApiStatus = {
      isReachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // Test Netlify API connectivity
  let netlifyApiStatus;

  try {
    const netlifyResponse = await fetch('https://api.netlify.com/api/v1/', {
      method: 'GET',
      signal: AbortSignal.timeout(15000),
    });

    netlifyApiStatus = {
      isReachable: netlifyResponse.ok,
      status: netlifyResponse.status,
      statusText: netlifyResponse.statusText,
    };
  } catch (error) {
    netlifyApiStatus = {
      isReachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // Provide technical details about the environment
  const technicalDetails = {
    serverTimestamp: new Date().toISOString(),
    userAgent: request.headers.get('User-Agent'),
    referrer: request.headers.get('Referer'),
    host: request.headers.get('Host'),
    method: request.method,
    url: request.url,
  };

  // Return diagnostics
  return json(
    {
      status: 'success',
      environment: envVars,
      cookies: {
        hasGithubTokenCookie,
        hasGithubUsernameCookie,
        hasNetlifyCookie,
      },
      localStorage: localStorageStatus,
      apiEndpoints,
      externalApis: {
        github: githubApiStatus,
        netlify: netlifyApiStatus,
      },
      corsStatus,
      technicalDetails,
    },
    {
      headers: corsStatus.headers,
    },
  );
}

export const loader = withSecurity(diagnosticsHandler, {
  rateLimit: true,
  allowedMethods: ['GET'],
});
