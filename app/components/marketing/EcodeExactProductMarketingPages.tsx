import type { MetaFunction } from 'react-router';
import AI from './ecode-exact/pages/AI';
import AIAgent from './ecode-exact/pages/AIAgent';
import Bounties from './ecode-exact/pages/Bounties';
import Features from './ecode-exact/pages/Features';
import Mobile from './ecode-exact/pages/Mobile';
import Pricing from './ecode-exact/pages/Pricing';
import Deployments from './ecode-exact/pages/PublicDeploymentsPage';
import Teams from './ecode-exact/pages/PublicTeamPage';
import { socialMetaTags } from '~/utils/social-meta';

type ProductPageKey =
  | 'ai-agent'
  | 'ide'
  | 'multiplayer'
  | 'mobile-app'
  | 'teams'
  | 'deployments'
  | 'pricing'
  | 'bounties'
  | 'ai-platform';

type CampaignPageKey = 'bounties' | 'deployments' | 'teams';

type PageRouteDefinition = {
  label: string;
  route: string;
  title: string;
  description: string;
};

export const ecodeProductMarketingPages = {
  'ai-agent': {
    label: 'AI Agent',
    route: '/ai-agent',
    title: 'AI Agent v2',
    description: 'Describe your idea, watch E-Code build it, and deploy instantly from the public AI Agent page.',
  },
  ide: {
    label: 'IDE',
    route: '/features',
    title: 'Browser IDE',
    description: 'The E-Code browser IDE page with editor, terminal, files, previews and project workflows.',
  },
  multiplayer: {
    label: 'Multiplayer',
    route: '/features#multiplayer',
    title: 'Multiplayer',
    description: 'Live collaboration, pair programming, shared presence and review workflows inside the IDE page.',
  },
  'mobile-app': {
    label: 'Mobile App',
    route: '/mobile',
    title: 'Mobile IDE',
    description: 'The E-Code mobile app marketing page for editor, terminal, AI, preview, collaboration and Git.',
  },
  teams: {
    label: 'Teams',
    route: '/marketing/teams',
    title: 'Teams',
    description: 'Real-time collaboration, enterprise controls and governed project access for modern teams.',
  },
  deployments: {
    label: 'Deployments',
    route: '/marketing/deployments',
    title: 'Deployments',
    description: 'Production deployments with global routing, observability, rollbacks and enterprise controls.',
  },
  pricing: {
    label: 'Pricing',
    route: '/pricing',
    title: 'Pricing',
    description: 'E-Code pricing cards, comparison table, enterprise section and FAQ.',
  },
  bounties: {
    label: 'Bounties',
    route: '/marketing/bounties',
    title: 'Bounties',
    description: 'Outcome-based developer bounties with secure review sandboxes and managed payouts.',
  },
  'ai-platform': {
    label: 'AI Platform',
    route: '/ai',
    title: 'AI Platform',
    description: 'Enterprise AI that builds applications with natural-language prompts, tools and governance.',
  },
} as const satisfies Record<ProductPageKey, PageRouteDefinition>;

export const ecodeCampaignMarketingPages = {
  bounties: ecodeProductMarketingPages.bounties,
  deployments: ecodeProductMarketingPages.deployments,
  teams: ecodeProductMarketingPages.teams,
} as const satisfies Record<CampaignPageKey, PageRouteDefinition>;

export function makeEcodeProductMeta(key: ProductPageKey): MetaFunction {
  const page = ecodeProductMarketingPages[key];

  return () => [
    { title: `${page.title} - E-Code` },
    { name: 'description', content: page.description },
    ...socialMetaTags({ title: `${page.title} - E-Code`, description: page.description }),
  ];
}

export function makeEcodeCampaignMeta(key: CampaignPageKey): MetaFunction {
  const page = ecodeCampaignMarketingPages[key];

  return () => [
    { title: `${page.title} - E-Code` },
    { name: 'description', content: page.description },
    ...socialMetaTags({ title: `${page.title} - E-Code`, description: page.description }),
  ];
}

export function EcodeAiAgentPage() {
  return <AIAgent />;
}

export function EcodeAiPlatformPage() {
  return <AI />;
}

export function EcodeFeaturesPage() {
  return <Features />;
}

export function EcodeMobilePage() {
  return <Mobile />;
}

export function EcodePricingPage() {
  return <Pricing />;
}

export function EcodeDeploymentsPage() {
  return <Deployments />;
}

export function EcodeBountiesPage() {
  return <Bounties />;
}

export function EcodeTeamsPage() {
  return <Teams />;
}

export function EcodeCampaignPage({ slug }: { slug: CampaignPageKey }) {
  if (slug === 'deployments') {
    return <EcodeDeploymentsPage />;
  }

  if (slug === 'teams') {
    return <EcodeTeamsPage />;
  }

  return <EcodeBountiesPage />;
}
