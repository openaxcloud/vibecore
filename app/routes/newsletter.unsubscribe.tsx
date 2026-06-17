import { makeMarketingMeta, MarketingStaticPage, newsletterPages } from '~/components/marketing/EcodeMarketingPages';

/**
 * In-repo SSR newsletter unsubscribe page. The unsubscribe link carries a
 * `?token=`; this renders the e-code "manage / unsubscribe" page. Required
 * transactional security notices are unaffected. Replaces the external proxy.
 */
export const meta = makeMarketingMeta(newsletterPages.unsubscribe);

export default function NewsletterUnsubscribeRoute() {
  return <MarketingStaticPage page={newsletterPages.unsubscribe} />;
}
