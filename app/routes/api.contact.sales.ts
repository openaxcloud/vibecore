import { randomBytes } from 'node:crypto';

import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/*
 * Contact-sales intake consumed by the /contact-sales lead form via fetch().
 * Proxies to the public API endpoint (which persists the lead and allocates
 * the reference number) so the API base URL stays server-only. The `website`
 * field is a honeypot: humans never see it, so a filled value gets a silent
 * fake success instead of a write — mirroring the /newsletter action. The
 * decoy reference keeps the response shape identical so bots can't
 * fingerprint the rejection.
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
  const company = String(body?.company ?? '').trim();
  const teamSize = String(body?.teamSize ?? '').trim();
  const message = String(body?.message ?? '').trim();
  const pagePath = String(body?.pagePath ?? '').trim();

  if (!email || !EMAIL_PATTERN.test(email) || !company || !message) {
    return json({ ok: false, error: 'Enter a valid email, your company, and a short message.' }, { status: 400 });
  }

  try {
    const result = await apiRequest<{ ok: boolean; reference?: string }>(request, '/contact-sales', {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify({
        email,
        name: name || undefined,
        company,
        teamSize: teamSize || undefined,
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

    return json({ ok: false, error: "We couldn't submit your request. Please try again." }, { status: 502 });
  }
}
