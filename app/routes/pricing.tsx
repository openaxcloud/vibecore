import type { MetaFunction } from '@remix-run/cloudflare';

import { EcodePricingPage, ecodeProductMarketingPages } from '~/components/marketing/EcodeProductMarketingPages';

/*
 * Replit-parity pricing is rendered in-repo via the main Remix app (SSR) rather
 * than the prebuilt external marketing bundle, so the page is live, the
 * monthly/annual toggle is functional, and the plans stay in sync with the
 * backend credit plan catalog. See docs/REPLIT_PARITY_SPEC.md §10/§16.
 */
export const meta: MetaFunction = () => {
  const page = ecodeProductMarketingPages.pricing;
  return [
    { title: 'Pricing — VibeCore' },
    {
      name: 'description',
      content:
        'VibeCore pricing: Starter (free daily Agent credits), Core $25/mo ($20 annual), Pro $100/mo ($95 annual), and Enterprise. Monthly or annual billing with included credits, parallel agents, collaborators and more.',
    },
    { property: 'og:title', content: 'VibeCore Pricing' },
    { property: 'og:description', content: page?.description ?? 'Pricing that scales with your growth.' },
  ];
};

export default function PricingRoute() {
  return <EcodePricingPage />;
}
