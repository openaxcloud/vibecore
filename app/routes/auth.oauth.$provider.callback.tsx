import { redirect, type LoaderFunctionArgs } from 'react-router';
import { apiBaseUrl, cookieSecure, sessionCookie } from '~/lib/enterprise-api.server';

const oauthStateCookie = 'vc_oauth_state';
const oauthLinkCookie = 'vc_oauth_link';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const provider = providerName(params.provider);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = readCookie(request, oauthStateCookie);

  /*
   * Link mode (set by /auth/oauth/:provider?mode=link): bind the provider to the
   * already-signed-in user via /auth/oauth/:provider/link instead of creating a
   * new login session. On any exit we clear BOTH cookies so a stale link marker
   * can never make a subsequent plain login POST to /link.
   */
  const isLink = readCookie(request, oauthLinkCookie) === '1';
  const failRedirect = (detail: string) =>
    isLink
      ? redirect(`/connected-accounts?linkError=${provider}&detail=${encodeURIComponent(detail)}`, {
          headers: clearAuthCookies(),
        })
      : redirect(`/login?oauth=${provider}&error=callback_failed&detail=${encodeURIComponent(detail)}`, {
          headers: clearAuthCookies(),
        });

  /*
   * When the provider rejects the request after the consent screen — the user
   * declines, the OAuth app is still in "Testing" publishing mode so only
   * allow-listed test users may proceed, or an admin policy blocks the app —
   * it redirects back here with `?error=…` (and often `error_description`) and
   * NO `code`. Surface that real reason instead of collapsing it into the
   * generic `invalid_callback`, which hides why login fails after consent.
   */
  const providerError = url.searchParams.get('error');

  if (providerError) {
    const detail = url.searchParams.get('error_description') ?? undefined;
    console.error('[oauth-callback]', provider, 'provider_error', providerError, detail ?? '');

    if (isLink) {
      throw failRedirect(providerError + (detail ? `: ${detail}` : ''));
    }

    throw redirect(
      `/login?oauth=${provider}&error=${encodeURIComponent(providerError)}` +
        (detail ? `&detail=${encodeURIComponent(detail)}` : ''),
      { headers: clearAuthCookies() },
    );
  }

  if (!code || !state || expected !== `${provider}:${state}`) {
    if (isLink) {
      throw failRedirect('invalid_callback');
    }

    throw redirect(`/login?oauth=${provider}&error=invalid_callback`, {
      headers: clearAuthCookies(),
    });
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl()}/auth/oauth/${provider}/${isLink ? 'link' : 'callback'}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        /*
         * Link mode binds to the CURRENT user, so forward their session cookie so
         * the (authenticated) /link endpoint sees request.currentUser. Login mode
         * forwards nothing — the callback issues a brand-new session.
         */
        ...(isLink ? { cookie: request.headers.get('cookie') ?? '' } : {}),
      },

      /*
       * Forward the signed state so the API can verify its HMAC signature. The
       * cookie check above already proved it round-tripped untampered; the API
       * re-validates the signature + expiry statelessly (login-CSRF protection).
       */
      body: JSON.stringify({ code, state }),
    });
  } catch (error) {
    /*
     * A rejected fetch (api pod unreachable, DNS failure, connection reset)
     * would otherwise bubble up as an unhandled 500 error boundary mid-OAuth.
     * Surface it as a normal login error like every other failure path here.
     */
    const detail = error instanceof Error ? error.message : 'api_unreachable';
    console.error('[oauth-callback]', provider, 'fetch_failed', detail);
    throw failRedirect('api_unreachable');
  }

  if (!response.ok) {
    let detail = 'unknown';

    try {
      const err = (await response.json()) as { code?: string; error?: string };
      detail = err.code ?? err.error ?? JSON.stringify(err);
    } catch {
      try {
        detail = (await response.text()).slice(0, 200) || `http_${response.status}`;
      } catch {
        detail = `http_${response.status}`;
      }
    }
    console.error('[oauth-callback]', provider, response.status, detail);
    throw failRedirect(detail);
  }

  /*
   * Link mode succeeded — the /link endpoint returns no session token (the user
   * is already signed in); just clear the OAuth cookies and return to the account
   * page with the newly-linked provider.
   */
  if (isLink) {
    return redirect(`/connected-accounts?linked=${provider}`, { headers: clearAuthCookies() });
  }

  let result: { token?: string };

  try {
    result = (await response.json()) as { token?: string };
  } catch (error) {
    /*
     * A 200 with an empty body or non-JSON payload (e.g. an upstream proxy/HTML
     * error page that still carries a 200, or a truncated body) makes
     * `response.json()` throw a SyntaxError that would otherwise bubble up as an
     * unhandled 500 error boundary mid-OAuth. Degrade to the login error screen
     * like every other failure path here.
     */
    const detail = error instanceof Error ? error.message : 'bad_response';
    console.error('[oauth-callback]', provider, 'bad_response', detail);
    throw failRedirect('bad_response');
  }

  if (!result.token || typeof result.token !== 'string') {
    console.error('[oauth-callback]', provider, 'missing token in successful response');
    throw failRedirect('missing_token');
  }

  return redirect('/dashboard', {
    headers: [['Set-Cookie', sessionCookie(result.token)], ...clearAuthCookies()],
  });
}

function clearStateCookie() {
  return `${oauthStateCookie}=; Path=/; HttpOnly; SameSite=Lax${cookieSecure()}; Max-Age=0`;
}

function clearLinkCookie() {
  return `${oauthLinkCookie}=; Path=/; HttpOnly; SameSite=Lax${cookieSecure()}; Max-Age=0`;
}

/** Both OAuth cookies cleared, as a Set-Cookie header tuple array. */
function clearAuthCookies(): Array<[string, string]> {
  return [
    ['Set-Cookie', clearStateCookie()],
    ['Set-Cookie', clearLinkCookie()],
  ];
}

function providerName(value: string | undefined) {
  if (value !== 'github' && value !== 'google') {
    throw redirect('/login?oauth=unknown&error=unsupported_provider');
  }

  return value;
}

function readCookie(request: Request, name: string) {
  const value = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);

  if (!value) {
    return undefined;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    /*
     * Malformed percent-encoding in an attacker-supplied cookie must not throw a
     * URIError (uncaught 500) during the OAuth callback — treat it as absent.
     */
    return undefined;
  }
}
