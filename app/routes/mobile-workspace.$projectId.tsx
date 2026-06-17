import { MonitorSmartphone } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { useParams } from 'react-router';
import { MarketingStaticPage, type MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';

export const meta: MetaFunction = ({ params }) => [
  { title: `Mobile workspace ${params.projectId ?? ''} - E-Code` },
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
    title: `Mobile workspace ${projectId}`,
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
        title: 'Compatibility path',
        body: 'The original E-Code mobile workspace URL is preserved while E-Code keeps the canonical project IDE route under /projects.',
        items: ['Project-aware link', 'Mobile shell', 'Agent workflow', 'Preview route'],
      },
      {
        title: 'Canonical route',
        body: 'Signed-in users should continue in the project IDE where permissions, runtime state and collaboration are enforced.',
        items: [`/projects/${projectId}/ide`, 'Authenticated access', 'Runtime controls', 'Team governance'],
      },
    ],
  } satisfies MarketingPageDefinition;

  return <MarketingStaticPage page={page} />;
}
