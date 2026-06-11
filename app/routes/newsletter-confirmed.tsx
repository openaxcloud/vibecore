import { makeMarketingMeta, MarketingStaticPage, newsletterPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(newsletterPages.confirmed);

export default function NewsletterConfirmedRoute() {
  return <MarketingStaticPage page={newsletterPages.confirmed} />;
}
