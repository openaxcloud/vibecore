import { MessageSquare } from 'lucide-react';
import type { MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';
import type { PublicCommunityPost } from '~/components/marketing/EcodePublicResourcePages';

/**
 * Public, seeded community discussions shown both in the /community gallery and
 * on the individual /community/post/:id detail page. The data is intentionally
 * static (no database) so the marketing community surface stays public and
 * cacheable; the detail route looks posts up by id from this same source so a
 * post card always opens the thread it links to.
 */
export const communityPosts: PublicCommunityPost[] = [
  {
    id: 'agent-memory-routing-production',
    title: 'How are teams routing agent memory safely in production?',
    summary:
      'Builders compare consent, retention, deletion and audit patterns for agent memory before rolling it out to customer-facing workspaces.',
    content:
      'The thread covers memory scopes, deletion flows, audit events and the operational checks teams run before enabling long-lived agent context.',
    authorName: 'Maya Chen',
    authorHandle: 'maya-ops',
    authorInitials: 'MC',
    authorReputation: 18420,
    category: 'help',
    categoryName: 'Help',
    tags: ['ai-agent', 'memory', 'security', 'audit'],
    likes: 128,
    comments: 34,
    views: 4260,
    updatedAt: '2026-06-12T10:00:00.000Z',
  },
  {
    id: 'mobile-preview-checklist',
    title: 'Mobile preview checklist before sending a build to QA',
    summary:
      'A practical list for testing safe-area spacing, navigation drawers, touch targets, auth redirects and preview health on real mobile viewports.',
    content:
      'Community members are refining a repeatable mobile QA checklist that catches layout and navigation regressions before release.',
    authorName: 'Jon Bell',
    authorHandle: 'jon-mobile',
    authorInitials: 'JB',
    authorReputation: 12980,
    category: 'showcase',
    categoryName: 'Showcase',
    tags: ['mobile', 'qa', 'preview', 'responsive'],
    likes: 96,
    comments: 21,
    views: 3190,
    updatedAt: '2026-06-11T14:20:00.000Z',
  },
  {
    id: 'deployments-rollback-playbook',
    title: 'Production deployment rollback playbook for small teams',
    summary:
      'A public runbook for pairing automated rollout checks with human review when a web, runtime or workspace-agent image is promoted.',
    content:
      'The discussion focuses on deployment gates, rollout verification, rollback ownership and the signals teams should capture during release.',
    authorName: 'Nadia Laurent',
    authorHandle: 'nadia-release',
    authorInitials: 'NL',
    authorReputation: 22110,
    category: 'tutorials',
    categoryName: 'Tutorials',
    tags: ['deployments', 'rollback', 'cloud-run', 'helm'],
    likes: 144,
    comments: 29,
    views: 5120,
    updatedAt: '2026-06-10T09:45:00.000Z',
  },
  {
    id: 'templates-to-real-products',
    title: 'Turning starters into real products without losing code quality',
    summary:
      'Community guidance on replacing generated defaults with typed APIs, loading states, error recovery and production data contracts.',
    content: 'Builders share the checkpoints they use when a starter becomes a customer-facing product surface.',
    authorName: 'Ari Kaplan',
    authorHandle: 'ari-builds',
    authorInitials: 'AK',
    authorReputation: 16740,
    category: 'discussion',
    categoryName: 'Discussion',
    tags: ['templates', 'typescript', 'api', 'quality'],
    likes: 117,
    comments: 42,
    views: 4630,
    updatedAt: '2026-06-09T18:30:00.000Z',
  },
  {
    id: 'team-workspace-governance',
    title: 'Workspace governance patterns for teams and agencies',
    summary:
      'A discussion about roles, project ownership, shared previews, client handoff and audit-friendly collaboration inside E-Code workspaces.',
    content: 'The thread collects team operating models and permission patterns for production app delivery.',
    authorName: 'Sam Rivera',
    authorHandle: 'sam-teams',
    authorInitials: 'SR',
    authorReputation: 15320,
    category: 'discussion',
    categoryName: 'Discussion',
    tags: ['teams', 'rbac', 'collaboration', 'handoff'],
    likes: 88,
    comments: 18,
    views: 2840,
    updatedAt: '2026-06-08T12:15:00.000Z',
  },
  {
    id: 'community-demo-day-recap',
    title: 'Community demo day recap: AI apps, dashboards and mobile builds',
    summary:
      'Highlights from builders who shipped full-stack apps, internal dashboards and mobile prototypes with public lessons from each launch.',
    content: 'This recap links the public lessons from demo day back to practical workflows builders can repeat.',
    authorName: 'E-Code Community',
    authorHandle: 'ecode-community',
    authorInitials: 'EC',
    authorReputation: 24500,
    category: 'showcase',
    categoryName: 'Showcase',
    tags: ['demo-day', 'ai-apps', 'dashboards', 'mobile'],
    likes: 203,
    comments: 56,
    views: 7840,
    updatedAt: '2026-06-07T16:00:00.000Z',
  },
];

/** Look a seeded community post up by its route id. Returns undefined for unknown ids. */
export function findCommunityPost(id: string | undefined): PublicCommunityPost | undefined {
  if (!id) {
    return undefined;
  }

  return communityPosts.find((post) => post.id === id);
}

function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Map a real community post onto a marketing page definition so the public
 * detail route renders the actual thread (title, summary, content, author,
 * engagement and tags) instead of a generic templated placeholder.
 */
export function buildCommunityPostPage(post: PublicCommunityPost): MarketingPageDefinition {
  return {
    slug: `community/post/${post.id}`,
    title: post.title,
    eyebrow: post.categoryName,
    description: post.summary,
    kind: 'resource',
    icon: MessageSquare,
    primaryAction: ['Back to community', '/community'],
    secondaryAction: ['Browse templates', '/templates'],
    highlights: [
      `${post.authorName}`,
      `${post.likes.toLocaleString('en-US')} likes`,
      `${post.comments.toLocaleString('en-US')} comments`,
      `${post.views.toLocaleString('en-US')} views`,
    ],
    sections: [
      {
        title: 'Discussion',
        body: post.content,
        items: post.tags.map((tag) => `#${tag}`),
      },
      {
        title: `Posted by ${post.authorName}`,
        body: `@${post.authorHandle} · ${post.authorReputation.toLocaleString('en-US')} reputation · Updated ${formatUpdatedAt(
          post.updatedAt,
        )}`,
        items: ['Public discussion', post.categoryName, 'Implementation notes', 'Safe sharing'],
      },
    ],
  };
}
