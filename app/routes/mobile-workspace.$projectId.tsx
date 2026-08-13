import { MonitorSmartphone } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { useParams } from 'react-router';
import { MarketingStaticPage, type MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';

export const meta: MetaFunction = () => [
  { title: 'Mobile workspace - E-Code' },
  {
    name: 'description',
    content: 'Mobile workspace compatibility route for E-Code projects in E-Code.',
  },
];

export default function MobileWorkspacePage() {
  const params = useParams();
  const projectId = params.projectId ?? 'project';

  const page = {
    slug: `mobile-workspace/${projectId}`,
    title: 'Mobile workspace',
    eyebrow: 'Mobile IDE',
    description:
      'Open the same E-Code project context from a mobile-ready route with agent, files, preview and runtime status available through the canonical IDE.',
    kind: 'standard',
    icon: MonitorSmartphone,
    primaryAction: ['Open project IDE', `/projects/${projectId}/ide?panel=agent`],
    secondaryAction: ['Mobile overview', '/mobile'],
    highlights: ['Phone workflow', 'Project context', 'Agent panel', 'Preview access'],
    sections: [
      {
        title: 'Continue on mobile',
        body: 'Return to your project with the same files, agent conversation and workspace status available on your other devices.',
        items: ['Project context', 'Mobile navigation', 'Agent workflow', 'Preview access'],
      },
      {
        title: 'Secure project access',
        body: 'Sign-in, project permissions and team policies stay active when you move between desktop, tablet and mobile.',
        items: ['Authenticated access', 'Project permissions', 'Workspace controls', 'Team governance'],
      },
    ],
  } satisfies MarketingPageDefinition;

  return <MarketingStaticPage page={page} />;
}
