import { comparePages, MarketingIndexPage } from '~/components/marketing/EcodeMarketingPages';

export const meta = () => [
  { title: 'Compare E-Code' },
  { name: 'description', content: 'Compare E-Code with other cloud development platforms.' },
];

export default function CompareIndexRoute() {
  return (
    <MarketingIndexPage
      title="Compare E-Code"
      description="See how E-Code compares with other cloud IDE, hosting and prototyping platforms."
      pages={comparePages}
    />
  );
}
