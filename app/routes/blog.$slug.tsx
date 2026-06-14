import { Newspaper } from 'lucide-react';

import {
  makeMarketingMeta,
  MarketingStaticPage,
  type MarketingPageDefinition,
} from '~/components/marketing/EcodeMarketingPages';

const blogDetailPage = {
  slug: 'blog-detail',
  title: 'Introducing E-Code AI Agent 2.0',
  eyebrow: 'Blog',
  description:
    'A public E-Code product update covering the agent workflow, review controls, deployment handoff, and production readiness improvements.',
  kind: 'resource',
  icon: Newspaper,
  primaryAction: ['Read the docs', '/docs'],
  secondaryAction: ['Back to blog', '/blog'],
  highlights: ['Agent planning', 'Patch review', 'Runtime validation', 'Deployment handoff'],
  sections: [
    {
      title: 'Agent planning that stays visible',
      body: 'E-Code AI Agent 2.0 keeps the plan, tool activity, code edits and validation state visible so teams can review what changed before shipping.',
      items: ['Visible plan', 'Tool timeline', 'Patch review', 'Human approval'],
    },
    {
      title: 'Built for real app delivery',
      body: 'The update connects generation with previews, tests, logs and deployment readiness instead of stopping at a static code suggestion.',
      items: ['Preview checks', 'Test feedback', 'Runtime logs', 'Release notes'],
    },
    {
      title: 'Enterprise controls included',
      body: 'Teams get the same public E-Code controls across identity, auditability, data boundaries and policy-driven delivery workflows.',
      items: ['Audit trail', 'Team governance', 'Secure defaults', 'Policy-aware agents'],
    },
  ],
} as const satisfies MarketingPageDefinition;

export const meta = makeMarketingMeta(blogDetailPage);

export default function BlogDetailRoute() {
  return <MarketingStaticPage page={blogDetailPage} />;
}
