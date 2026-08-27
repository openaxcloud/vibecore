import { readSessionToken, json } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

export async function loader({ request }: { request: Request }) {
  const token = readSessionToken(request);

  if (!token) {
    return remainingApiErrorResponse(request, 'UNAUTHORIZED', 401, {
      extra: { ok: false },
      headers: { 'cache-control': 'no-store' },
    });
  }

  return json({ token }, { headers: { 'cache-control': 'no-store' } });
}
