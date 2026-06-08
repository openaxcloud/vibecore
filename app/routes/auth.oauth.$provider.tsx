import { redirect, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { apiRequest, cookieSecure } from '~/lib/enterprise-api.server';

const oauthStateCookie = 'vc_oauth_state';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const provider = providerName(params.provider);

  const result = await apiRequest<{ authorizationUrl?: string | null; ready?: boolean }>(
    request,
    `/auth/oauth/${provider}/start`,
  );

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

  return redirect(url.toString(), {
    headers: {
      'Set-Cookie': `${oauthStateCookie}=${encodeURIComponent(`${provider}:${state}`)}; Path=/; HttpOnly; SameSite=Lax${cookieSecure()}; Max-Age=600`,
    },
  });
}

function providerName(value: string | undefined) {
  if (value !== 'github' && value !== 'google') {
    throw redirect('/login?oauth=unknown&error=unsupported_provider');
  }

  return value;
}
