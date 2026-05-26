import { makeMarketingMeta, MarketingStaticPage, newsletterPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = makeMarketingMeta(newsletterPages.confirm);

export default function NewsletterConfirmRoute() {
  return <MarketingStaticPage page={newsletterPages.confirm} />;
}
