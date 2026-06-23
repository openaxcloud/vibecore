import { MonitorPlay } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { MarketingStaticPage, type MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';

export const meta: MetaFunction = () => [
  { title: 'New IDE project - E-Code' },
  { name: 'description', content: 'Create a new E-Code project from the IDE compatibility route.' },
];

const page = {
  slug: 'ide/new',
  title: 'Create a new IDE project',
  eyebrow: 'IDE',
  description:
    'The original E-Code /ide/new route is preserved and points builders to E-Code project creation with the E-Code IDE intact.',
  kind: 'standard',
  icon: MonitorPlay,
  primaryAction: ['Create project', '/projects/new'],
  secondaryAction: ['Browse templates', '/templates'],
  highlights: ['Project creation', 'E-Code IDE', 'Templates', 'Runtime setup'],
  sections: [
    {
      title: 'Create from prompt or template',
      body: 'Start with a natural-language prompt, import a repository or choose a template, then open the project IDE.',
      items: ['Prompt builder', 'Template gallery', 'Repository import', 'Runtime preview'],
    },
    {
      title: 'Canonical E-Code route',
      body: 'New project creation lives at /projects/new so authentication, quotas and project persistence stay centralized.',
      items: ['/projects/new', 'Authenticated workspace', 'Quota checks', 'Project persistence'],
    },
  ],
} satisfies MarketingPageDefinition;

export default function IdeNewPage() {
  return <MarketingStaticPage page={page} />;
}
