import { LifeBuoy } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { MarketingStaticPage, type MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';

export const meta: MetaFunction = () => [
  { title: 'Support policy - E-Code' },
  {
    name: 'description',
    content: 'How E-Code support works: channels, what we help with, and response targets by plan.',
  },
];

/*
 * Public support policy. Channels + response targets are aligned to E-Code's real
 * support flow (the /support ticket form + docs/community) and plan tiers. Targets
 * are goals, not contractual SLAs — Enterprise agreements can define committed SLAs.
 */
const page = {
  slug: 'support-policy',
  title: 'Support policy',
  eyebrow: 'Support',
  description:
    'How to get help with E-Code, what our support team covers, and the response targets you can expect on each plan.',
  kind: 'legal',
  icon: LifeBuoy,
  primaryAction: ['Contact support', '/support'],
  secondaryAction: ['Browse docs', '/docs'],
  highlights: ['Ticket support', 'Docs & community', 'Faster on higher plans', 'Security fast-track'],
  sections: [
    {
      title: 'How to get help',
      body: 'Start with our documentation and community for the fastest answers. For account-specific issues, open a support ticket from the in-app Support page so we have the context to help.',
      items: [
        'Documentation and guides',
        'Community discussion',
        'In-app support tickets',
        'Status page for incidents',
      ],
    },
    {
      title: 'What support covers',
      body: 'We help with the E-Code platform: accounts and billing, workspace and runtime issues, deployments, and product questions. We can point you in the right direction on your own application code, but writing or debugging your app is what the AI agent and IDE are for.',
      items: [
        'Accounts & billing',
        'Workspace / runtime / deploy',
        'Product how-to',
        'Not a substitute for app development',
      ],
    },
    {
      title: 'Response targets by plan',
      body: 'These are the targets we aim for during business days. Higher plans get faster first-response targets and priority routing. Enterprise customers can agree committed SLAs in their contract.',
      items: [
        'Starter — community and docs first; ticket response within a few business days',
        'Core / Pro — priority tickets with a faster first-response target',
        'Enterprise — priority routing and contractually agreed SLAs',
        'These are goals, not a contractual SLA unless stated in your agreement',
      ],
    },
    {
      title: 'Security and abuse fast-track',
      body: 'Security vulnerability reports and abuse reports are handled outside the normal queue. Use the dedicated channels so they reach the right team quickly.',
      items: ['Report vulnerabilities via the Security page', 'Report abuse via Report Abuse', 'Handled with priority'],
    },
  ],
} satisfies MarketingPageDefinition;

export default function SupportPolicyPage() {
  return <MarketingStaticPage page={page} />;
}
