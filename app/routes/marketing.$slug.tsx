import { MarketingDynamicPage, marketingCampaignPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = () => [
  { title: 'E-Code marketing' },
  { name: 'description', content: 'E-Code campaign pages for teams, deployments and bounties.' },
];

export default function MarketingSlugRoute() {
  return <MarketingDynamicPage pages={marketingCampaignPages} fallbackTitle="Marketing" />;
}
