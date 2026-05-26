import { makeMarketingMeta, MarketingStaticPage, newsletterPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(newsletterPages.unsubscribe);

export default function NewsletterUnsubscribeRoute() {
  return <MarketingStaticPage page={newsletterPages.unsubscribe} />;
}
