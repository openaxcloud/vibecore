import { makeMarketingMeta, MarketingStaticPage, newsletterPages } from '~/components/marketing/EcodeMarketingPages';

/**
 * In-repo SSR newsletter confirmation page. The confirmation link carries a
 * `?token=` (acknowledged client-side); this renders the e-code "confirm
 * subscription" page. Replaces the external-bundle proxy.
 */
export const meta = makeMarketingMeta(newsletterPages.confirm);

export default function NewsletterConfirmRoute() {
  return <MarketingStaticPage page={newsletterPages.confirm} />;
}
