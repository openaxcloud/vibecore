import { redirect, type LoaderFunctionArgs } from 'react-router';
import { apiRequest, cookieSecure } from '~/lib/enterprise-api.server';
import { classifyOAuthStartFailure } from '~/lib/oauth-start-failure';

const oauthStateCookie = 'vc_oauth_state';
const oauthLinkCookie = 'vc_oauth_link';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const provider = providerName(params.provider);

  /*
   * `?mode=link` marks this OAuth round-trip as LINKING a provider to the
   * already-signed-in account (from /connected-accounts) rather than logging in.
   * We reuse the exact same authorize URL + redirect_uri (no new callback URL to
   * register); a first-party vc_oauth_link cookie tells the callback to POST to
   * /auth/oauth/:provider/link instead of /callback.
   */
  const isLink = new URL(request.url).searchParams.get('mode') === 'link';

  let result: { authorizationUrl?: string | null; ready?: boolean };

  try {
    result = await apiRequest<{ authorizationUrl?: string | null; ready?: boolean }>(
      request,
      `/auth/oauth/${provider}/start`,
    );
  } catch (error) {
    const outcome = classifyOAuthStartFailure(provider, error);

    if ('rethrow' in outcome) {
      // A deliberate redirect Response from apiRequest (401 -> login, MFA): pass it through.
      throw outcome.rethrow;
    }

    console.error('[oauth-start]', provider, 'fetch_failed', outcome.detail);
    throw redirect(outcome.redirectTo);
  }

  if (!result.ready || !result.authorizationUrl) {
    throw redirect(`/login?oauth=${provider}&error=not_configured`);
  }

  let url: URL;

  try {
    url = new URL(result.authorizationUrl);
  } catch {
    throw redirect(`/login?oauth=${provider}&error=not_configured`);
  }

  /*
   * The API embeds an HMAC-signed state in the authorization URL — login-CSRF
   * protection that the API callback verifies statelessly (so it holds across
   * all api replicas). Persist that exact value so we can (a) detect a tampered
   * state returned by the provider and (b) forward it to the API callback for
   * signature verification. Overwriting it with a locally generated UUID — as
   * this route used to — meant the API callback always saw a missing/invalid
   * state and rejected every login with OAUTH_STATE_INVALID.
   */
  const state = url.searchParams.get('state');

  if (!state) {
    throw redirect(`/login?oauth=${provider}&error=not_configured`);
  }

  const headers = new Headers();
  headers.append(
    'Set-Cookie',
    `${oauthStateCookie}=${encodeURIComponent(`${provider}:${state}`)}; Path=/; HttpOnly; SameSite=Lax${cookieSecure()}; Max-Age=600`,
  );

  // Mark link intent (or clear any stale marker so a plain login never link-POSTs).
  headers.append(
    'Set-Cookie',
    isLink
      ? `${oauthLinkCookie}=1; Path=/; HttpOnly; SameSite=Lax${cookieSecure()}; Max-Age=600`
      : `${oauthLinkCookie}=; Path=/; HttpOnly; SameSite=Lax${cookieSecure()}; Max-Age=0`,
  );

  return redirect(url.toString(), { headers });
}

function providerName(value: string | undefined) {
  if (value !== 'github' && value !== 'google') {
    throw redirect('/login?oauth=unknown&error=unsupported_provider');
  }

  return value;
}
