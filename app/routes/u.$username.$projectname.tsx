import { FolderGit2 } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { useParams } from 'react-router';
import { MarketingStaticPage, type MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';

export const meta: MetaFunction = ({ params }) => [
  { title: `${params.projectname ?? 'Project'} by ${params.username ?? 'builder'} - E-Code` },
  {
    name: 'description',
    content: 'Public E-Code project compatibility route in Vibecore.',
  },
];

export default function PublicUserProjectPage() {
  const params = useParams();
  const username = params.username ?? 'builder';
  const projectName = params.projectname ?? 'project';

  const page = {
    slug: `u/${username}/${projectName}`,
    title: `${projectName} by ${username}`,
    eyebrow: 'Public project',
    description:
      'Public E-Code project route for shared project pages, previews and portfolio links preserved in Vibecore.',
    kind: 'resource',
    icon: FolderGit2,
    primaryAction: ['Browse templates', '/templates'],
    secondaryAction: ['Open profile', `/u/${username}`],
    highlights: ['Project page', 'Public preview', 'Builder profile', 'Template path'],
    sections: [
      {
        title: 'Public project route',
        body: 'The /u/:username/:projectname format remains available for public project references and future project showcase pages.',
        items: ['Stable URL', 'Preview-ready context', 'Builder attribution', 'Template discovery'],
      },
      {
        title: 'Private workspace boundary',
        body: 'Editing, secrets, runtime state and collaboration stay inside authenticated Vibecore project routes.',
        items: ['Protected IDE', 'Scoped secrets', 'Runtime isolation', 'Team permissions'],
      },
    ],
  } satisfies MarketingPageDefinition;

  return <MarketingStaticPage page={page} />;
}
