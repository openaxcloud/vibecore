import { redirect, type LoaderFunctionArgs } from 'react-router';
import { apiBaseUrl, cookieSecure, sessionCookie } from '~/lib/enterprise-api.server';

const oauthStateCookie = 'vc_oauth_state';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const provider = providerName(params.provider);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = readCookie(request, oauthStateCookie);

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
    throw redirect(
      `/login?oauth=${provider}&error=${encodeURIComponent(providerError)}` +
        (detail ? `&detail=${encodeURIComponent(detail)}` : ''),
      { headers: { 'Set-Cookie': clearStateCookie() } },
    );
  }

  if (!code || !state || expected !== `${provider}:${state}`) {
    throw redirect(`/login?oauth=${provider}&error=invalid_callback`, {
      headers: { 'Set-Cookie': clearStateCookie() },
    });
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl()}/auth/oauth/${provider}/callback`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },

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
    throw redirect(`/login?oauth=${provider}&error=callback_failed&detail=${encodeURIComponent('api_unreachable')}`, {
      headers: { 'Set-Cookie': clearStateCookie() },
    });
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
    throw redirect(`/login?oauth=${provider}&error=callback_failed&detail=${encodeURIComponent(detail)}`);
  }

  const result = (await response.json()) as { token?: string };

  if (!result.token || typeof result.token !== 'string') {
    console.error('[oauth-callback]', provider, 'missing token in successful response');
    throw redirect(`/login?oauth=${provider}&error=callback_failed&detail=missing_token`);
  }

  return redirect('/dashboard', {
    headers: [
      ['Set-Cookie', sessionCookie(result.token)],
      ['Set-Cookie', clearStateCookie()],
    ],
  });
}

function clearStateCookie() {
  return `${oauthStateCookie}=; Path=/; HttpOnly; SameSite=Lax${cookieSecure()}; Max-Age=0`;
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
