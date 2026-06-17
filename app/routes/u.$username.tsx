import { UserCircle } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { useParams } from 'react-router';
import { MarketingStaticPage, type MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';

export const meta: MetaFunction = ({ params }) => [
  { title: `${params.username ?? 'Builder'} - E-Code` },
  {
    name: 'description',
    content: 'Public E-Code builder profile compatibility route in E-Code.',
  },
];

export default function PublicUserPage() {
  const params = useParams();
  const username = params.username ?? 'builder';

  const page = {
    slug: `u/${username}`,
    title: `${username} on E-Code`,
    eyebrow: 'Builder profile',
    description:
      'Public E-Code profile route for builder pages, project showcases and portfolio-style discovery in E-Code.',
    kind: 'resource',
    icon: UserCircle,
    primaryAction: ['Explore templates', '/templates'],
    secondaryAction: ['Open community', '/community'],
    highlights: ['Public profile', 'Project showcases', 'Templates', 'Community'],
    sections: [
      {
        title: 'Profile route',
        body: 'E-Code preserves the /u/:username URL format from E-Code so public builder links keep resolving.',
        items: ['Readable profile URL', 'Project discovery', 'Community context', 'Template links'],
      },
      {
        title: 'Signed-in work',
        body: 'Private projects and IDE access remain protected behind the authenticated workspace routes.',
        items: ['Project permissions', 'Team access', 'Private files', 'Runtime isolation'],
      },
    ],
  } satisfies MarketingPageDefinition;

  return <MarketingStaticPage page={page} />;
}
