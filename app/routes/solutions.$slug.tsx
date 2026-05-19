import { MarketingDynamicPage, solutionPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = () => [
  { title: 'E-Code solutions' },
  { name: 'description', content: 'E-Code solution pages for builders, teams and enterprises.' },
];

export default function SolutionSlugRoute() {
  return <MarketingDynamicPage pages={solutionPages} fallbackTitle="Solution" />;
}
