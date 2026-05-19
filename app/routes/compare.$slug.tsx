import { comparePages, MarketingDynamicPage } from '~/components/marketing/EcodeMarketingPages';

export const meta = () => [
  { title: 'E-Code comparisons' },
  { name: 'description', content: 'Platform comparison pages for E-Code.' },
];

export default function CompareSlugRoute() {
  return <MarketingDynamicPage pages={comparePages} fallbackTitle="Compare" />;
}
