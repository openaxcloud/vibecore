import { makeMarketingMeta, MarketingStaticPage, newsletterPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(newsletterPages.index);

export default function NewsletterRoute() {
  return <MarketingStaticPage page={newsletterPages.index} />;
}
