import { readSessionToken, json } from '~/lib/enterprise-api.server';

export async function loader({ request }: { request: Request }) {
  const token = readSessionToken(request);

  if (!token) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  }

  return json({ token }, { headers: { 'cache-control': 'no-store' } });
}
