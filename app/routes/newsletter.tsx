import { makeMarketingMeta, MarketingStaticPage, newsletterPages } from '~/components/marketing/EcodeMarketingPages';
import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

export const meta = makeMarketingMeta(newsletterPages.index);

/*
 * Subscription action shared by the footer mini-form (fetcher.Form posting to
 * /newsletter) and this page. Proxies to the public API endpoint so the API
 * base URL stays server-only. The `company` field is a honeypot: humans never
 * see it, so a filled value gets a silent fake success instead of a write.
 */
export async function action({ request }: EnterpriseActionArgs) {
  const form = await request.formData();

  if (String(form.get('company') ?? '').trim()) {
    return json({ ok: true });
  }

  const email = String(form.get('email') ?? '').trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return remainingApiErrorResponse(request, 'NEWSLETTER_EMAIL_INVALID', 400, { extra: { ok: false } });
  }

  // Whitelisted so the stored analytics dimension can't be polluted by crafted posts.
  const source = String(form.get('source') ?? '').trim() === 'status' ? 'status' : 'footer';

  try {
    await apiRequest(request, '/newsletter/subscribe', {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify({ email, source }),
    });

    return json({ ok: true });
  } catch (error) {
    if (error instanceof Response && error.status === 429) {
      return remainingApiErrorResponse(request, 'CONTACT_RATE_LIMIT', 429, { extra: { ok: false } });
    }

    return remainingApiErrorResponse(request, 'NEWSLETTER_SUBSCRIBE_FAILED', 502, { extra: { ok: false } });
  }
}

export default function NewsletterRoute() {
  return <MarketingStaticPage page={newsletterPages.index} />;
}
