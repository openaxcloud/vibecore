import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
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
  /*
   * Logout must be a POST (see the action) so it can't be triggered by CSRF —
   * a GET that clears the session lets `<img src="/logout">` or a cross-site link
   * force-sign-out any visitor. A bare GET here just sends the user to /login
   * WITHOUT touching their session.
   */
  return redirect('/login');
}
