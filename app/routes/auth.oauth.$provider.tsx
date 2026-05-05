import { redirect, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { apiRequest } from '~/lib/enterprise-api.server';

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

  const state = createOAuthState();
  const url = new URL(result.authorizationUrl);
  url.searchParams.set('state', state);

  return redirect(url.toString(), {
    headers: {
      'Set-Cookie': `${oauthStateCookie}=${encodeURIComponent(`${provider}:${state}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    },
  });
}

function providerName(value: string | undefined) {
  if (value !== 'github' && value !== 'google') {
    throw redirect('/login?oauth=unknown&error=unsupported_provider');
  }

  return value;
}

function createOAuthState() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}
