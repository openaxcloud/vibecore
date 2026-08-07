import { randomBytes } from 'node:crypto';

import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse, remainingApiRouteMessage } from '~/lib/i18n/catalogs/remaining-api-routes';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/*
 * General-contact intake consumed by the /contact "Send Us a Message" form via
 * fetch(). Proxies to the same public API endpoint as the sales form
 * (/contact-sales → ContactRequest persistence + reference allocation) so the
 * API base URL stays server-only; the `topic` field is what distinguishes a
 * general message from a sales lead there. The `website` field is a honeypot:
 * humans never see it, so a filled value gets a silent fake success instead of
 * a write — mirroring /api/contact/sales. The decoy reference keeps the
 * response shape identical so bots can't fingerprint the rejection.
 */
export async function action({ request }: EnterpriseActionArgs) {
  if (request.method.toUpperCase() !== 'POST') {
    return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405, { extra: { ok: false } });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (String(body?.website ?? '').trim()) {
    return json({ ok: true, reference: randomBytes(4).toString('hex').toUpperCase() });
  }

  const email = String(body?.email ?? '').trim();
  const name = String(body?.name ?? '').trim();
  const topic = String(body?.topic ?? '').trim();
  const message = String(body?.message ?? '').trim();
  const pagePath = String(body?.pagePath ?? '').trim();

  if (!email || !EMAIL_PATTERN.test(email) || !message) {
    return remainingApiErrorResponse(request, 'CONTACT_GENERAL_INVALID', 400, { extra: { ok: false } });
  }

  try {
    const result = await apiRequest<{ ok: boolean; reference?: string }>(request, '/contact-sales', {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify({
        email,
        name: name || undefined,

        /*
         * The topic is what routes a general message to the right inbox; an
         * omitted/blank one still lands somewhere sensible.
         */
        topic: topic.slice(0, 100) || remainingApiRouteMessage(request, 'contactDefaultTopic'),
        requirements: message,

        // Only accept an in-app path so the stored dimension can't be polluted.
        pagePath: pagePath.startsWith('/') ? pagePath.slice(0, 300) : undefined,
      }),
    });

    return json({ ok: true, reference: result.reference });
  } catch (error) {
    if (error instanceof Response && error.status === 429) {
      return remainingApiErrorResponse(request, 'CONTACT_RATE_LIMIT', 429, { extra: { ok: false } });
    }

    return remainingApiErrorResponse(request, 'CONTACT_GENERAL_FAILED', 502, { extra: { ok: false } });
  }
}
