import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { apiRequest, clearSessionCookie } from '~/lib/enterprise-api.server';

export async function action({ request }: ActionFunctionArgs) {
  try {
    await apiRequest(request, '/auth/logout', { method: 'POST' });
  } catch {
    // Clear the browser session even if the API is unavailable or the token is already invalid.
  }

  return redirect('/login', { headers: { 'Set-Cookie': clearSessionCookie() } });
}

export async function loader(_args: LoaderFunctionArgs) {
  return redirect('/login', { headers: { 'Set-Cookie': clearSessionCookie() } });
}
