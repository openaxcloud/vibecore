import type { MetaFunction } from '@remix-run/cloudflare';
import { useParams } from '@remix-run/react';
import { MessageSquare } from 'lucide-react';
import { MarketingStaticPage, type MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';

export const meta: MetaFunction = ({ params }) => [
  { title: `Community post ${params.id ?? ''} - E-Code` },
  {
    name: 'description',
    content: 'Public E-Code community post compatibility page with safe routing to forum and templates.',
  },
];

export default function CommunityPostPage() {
  const params = useParams();
  const postId = params.id ?? 'community-post';

  const page = {
    slug: `community/post/${postId}`,
    title: `Community post ${postId}`,
    eyebrow: 'Community',
    description:
      'This public E-Code community route is available in Vibecore and routes builders toward forum discussions, templates and support.',
    kind: 'resource',
    icon: MessageSquare,
    primaryAction: ['Open forum', '/forum'],
    secondaryAction: ['Browse templates', '/templates'],
    highlights: ['Discussion', 'Template ideas', 'Workflow notes', 'Support escalation'],
    sections: [
      {
        title: 'Public post context',
        body: 'Community posts should share implementation context without exposing secrets, private repositories or customer data.',
        items: ['Sanitized examples', 'Public preview links', 'Focused debugging notes', 'Template feedback'],
      },
      {
        title: 'Continue the workflow',
        body: 'Use the forum or marketplace to continue from a public post into a reusable E-Code project pattern.',
        items: ['Forum discussion', 'Marketplace starter', 'Documentation guide', 'Support request'],
      },
    ],
  } satisfies MarketingPageDefinition;

  return <MarketingStaticPage page={page} />;
}
