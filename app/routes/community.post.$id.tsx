import { MessageSquare } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { useParams } from 'react-router';
import { MarketingStaticPage, type MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';

function formatPostTitle(id: string | undefined) {
  if (!id) {
    return 'Community discussion';
  }

  return id
    .replace(/^community-/, '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export const meta: MetaFunction = ({ params }) => {
  const title = formatPostTitle(params.id);

  return [
    { title: `${title} - E-Code Community` },
    {
      name: 'description',
      content:
        'Public E-Code community discussion page rendered with the marketing header, footer and theme instead of authenticated workspace chrome.',
    },
  ];
};

function createCommunityPostPage(id: string | undefined): MarketingPageDefinition {
  const title = formatPostTitle(id);

  return {
    slug: `community/post/${id ?? 'discussion'}`,
    title,
    eyebrow: 'Community',
    description:
      'A public E-Code community discussion surface for implementation notes, template feedback and production delivery patterns.',
    kind: 'resource',
    icon: MessageSquare,
    primaryAction: ['Open community', '/community'],
    secondaryAction: ['Browse templates', '/templates'],
    highlights: ['Public discussion', 'Template context', 'Implementation notes', 'Safe sharing'],
    sections: [
      {
        title: 'Discussion context',
        body: 'Community post routes stay public and readable while project files, private repositories and account controls remain behind the authenticated product flow.',
        items: ['Public page chrome', 'No user dashboard menu', 'No private data', 'Marketing navigation'],
      },
      {
        title: 'Continue building',
        body: 'Use the discussion as a starting point, then choose a template or documentation path that maps to real project creation.',
        items: ['Template gallery', 'Documentation', 'Forum follow-up', 'Support escalation'],
      },
    ],
  };
}

export default function CommunityPostRoute() {
  const params = useParams();

  return <MarketingStaticPage page={createCommunityPostPage(params.id)} />;
}
