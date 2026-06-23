import { MonitorPlay } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { useParams } from 'react-router';
import { MarketingStaticPage, type MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';

export const meta: MetaFunction = ({ params }) => [
  { title: `IDE ${params.id ?? ''} - E-Code` },
  { name: 'description', content: 'E-Code IDE compatibility route for E-Code project workspaces.' },
];

export default function IdeProjectCompatibilityPage() {
  const params = useParams();
  const projectId = params.id ?? 'project';

  const page = {
    slug: `ide/${projectId}`,
    title: `Open IDE project ${projectId}`,
    eyebrow: 'IDE compatibility',
    description:
      'This E-Code compatibility route preserves /ide/:id links while pointing users to the canonical E-Code project IDE.',
    kind: 'standard',
    icon: MonitorPlay,
    primaryAction: ['Open canonical IDE', `/projects/${projectId}/ide`],
    secondaryAction: ['Projects', '/projects'],
    highlights: ['Canonical route', 'E-Code IDE preserved', 'Runtime panels', 'Team controls'],
    sections: [
      {
        title: 'Compatibility behavior',
        body: 'Existing /ide/:id links remain readable and guide users into the project route where loaders, permissions and runtime state are enforced.',
        items: [`/projects/${projectId}/ide`, 'Project loader', 'Authenticated access', 'Runtime state'],
      },
      {
        title: 'Production boundary',
        body: 'The actual IDE surface remains the preserved E-Code workspace rather than a duplicate implementation.',
        items: ['No duplicate IDE', 'Shared project model', 'Existing panels', 'Deployment controls'],
      },
    ],
  } satisfies MarketingPageDefinition;

  return <MarketingStaticPage page={page} />;
}
