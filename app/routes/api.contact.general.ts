import { randomBytes } from 'node:crypto';

import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

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
    return json({ ok: false, error: 'Method not allowed.' }, { status: 405 });
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
    return json({ ok: false, error: 'Enter a valid email and a short message.' }, { status: 400 });
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
        topic: topic.slice(0, 100) || 'General',
        requirements: message,

        // Only accept an in-app path so the stored dimension can't be polluted.
        pagePath: pagePath.startsWith('/') ? pagePath.slice(0, 300) : undefined,
      }),
    });

    return json({ ok: true, reference: result.reference });
  } catch (error) {
    if (error instanceof Response && error.status === 429) {
      return json({ ok: false, error: 'Too many attempts — try again in a minute.' }, { status: 429 });
    }

    return json({ ok: false, error: "We couldn't send your message. Please try again." }, { status: 502 });
  }
}
