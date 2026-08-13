import { MarketingIndexPage, solutionPages } from '~/components/marketing/EcodeMarketingPages';

export const meta = () => [
  { title: 'Solutions - E-Code' },
  {
    name: 'description',
    content: 'Explore E-Code solutions for app builders, websites, games, dashboards, AI agents and enterprise teams.',
  },
];

export default function SolutionsIndexRoute() {
  return (
    <MarketingIndexPage
      title="E-Code Solutions"
      description="Choose the E-Code workflow that matches the app, team and deployment path you need to build."
      pages={solutionPages}
    />
  );
}
