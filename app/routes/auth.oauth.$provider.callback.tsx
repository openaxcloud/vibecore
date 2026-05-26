import { redirect, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { apiBaseUrl, sessionCookie } from '~/lib/enterprise-api.server';

const oauthStateCookie = 'vc_oauth_state';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const provider = providerName(params.provider);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = readCookie(request, oauthStateCookie);

  if (!code || !state || expected !== `${provider}:${state}`) {
    throw redirect(`/login?oauth=${provider}&error=invalid_callback`);
  }

  const response = await fetch(`${apiBaseUrl()}/auth/oauth/${provider}/callback`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });

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

  const result = (await response.json()) as { token: string };

  return redirect('/dashboard', {
    headers: [
      ['Set-Cookie', sessionCookie(result.token)],
      ['Set-Cookie', `${oauthStateCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`],
    ],
  });
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

  return value ? decodeURIComponent(value) : undefined;
}
