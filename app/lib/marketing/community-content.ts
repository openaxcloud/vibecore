import { MessageSquare } from 'lucide-react';

import type { MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';
import type { PublicCommunityPost } from '~/components/marketing/EcodePublicResourcePages';
import {
  getMarketingCommunityRouteCopy,
  type CommunityRoutePostId,
} from '~/lib/i18n/catalogs/marketing-community-route';

type CommunityPostMetadata = Omit<PublicCommunityPost, 'id' | 'title' | 'summary' | 'content' | 'categoryName'> & {
  id: CommunityRoutePostId;
};

/*
 * Stable author, engagement and routing data. User-facing editorial copy lives
 * in marketing-community-route.ts so the gallery and detail route cannot drift.
 */
const COMMUNITY_POST_METADATA: readonly CommunityPostMetadata[] = [
  {
    id: 'agent-memory-routing-production',
    authorName: 'Maya Chen',
    authorHandle: 'maya-ops',
    authorInitials: 'MC',
    authorReputation: 18420,
    category: 'help',
    tags: ['ai-agent', 'memory', 'security', 'audit'],
    likes: 128,
    comments: 34,
    views: 4260,
    updatedAt: '2026-06-12T10:00:00.000Z',
  },
  {
    id: 'mobile-preview-checklist',
    authorName: 'Jon Bell',
    authorHandle: 'jon-mobile',
    authorInitials: 'JB',
    authorReputation: 12980,
    category: 'showcase',
    tags: ['mobile', 'qa', 'preview', 'responsive'],
    likes: 96,
    comments: 21,
    views: 3190,
    updatedAt: '2026-06-11T14:20:00.000Z',
  },
  {
    id: 'deployments-rollback-playbook',
    authorName: 'Nadia Laurent',
    authorHandle: 'nadia-release',
    authorInitials: 'NL',
    authorReputation: 22110,
    category: 'tutorials',
    tags: ['deployments', 'rollback', 'cloud-run', 'helm'],
    likes: 144,
    comments: 29,
    views: 5120,
    updatedAt: '2026-06-10T09:45:00.000Z',
  },
  {
    id: 'templates-to-real-products',
    authorName: 'Ari Kaplan',
    authorHandle: 'ari-builds',
    authorInitials: 'AK',
    authorReputation: 16740,
    category: 'discussion',
    tags: ['templates', 'typescript', 'api', 'quality'],
    likes: 117,
    comments: 42,
    views: 4630,
    updatedAt: '2026-06-09T18:30:00.000Z',
  },
  {
    id: 'team-workspace-governance',
    authorName: 'Sam Rivera',
    authorHandle: 'sam-teams',
    authorInitials: 'SR',
    authorReputation: 15320,
    category: 'discussion',
    tags: ['teams', 'rbac', 'collaboration', 'handoff'],
    likes: 88,
    comments: 18,
    views: 2840,
    updatedAt: '2026-06-08T12:15:00.000Z',
  },
  {
    id: 'community-demo-day-recap',
    authorName: 'E-Code Community',
    authorHandle: 'ecode-community',
    authorInitials: 'EC',
    authorReputation: 24500,
    category: 'showcase',
    tags: ['demo-day', 'ai-apps', 'dashboards', 'mobile'],
    likes: 203,
    comments: 56,
    views: 7840,
    updatedAt: '2026-06-07T16:00:00.000Z',
  },
];

function isFrench(language?: string | null): boolean {
  return language?.toLowerCase().startsWith('fr') ?? false;
}

function interpolate(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

function buildCommunityPosts(language?: string | null): PublicCommunityPost[] {
  const localizedPosts = getMarketingCommunityRouteCopy(language).communityRoute.posts;

  return localizedPosts.flatMap((localized) => {
    const metadata = COMMUNITY_POST_METADATA.find((item) => item.id === localized.id);

    return metadata ? [{ ...metadata, ...localized }] : [];
  });
}

/** English remains the canonical export for legacy callers and stable route ids. */
export const communityPosts: PublicCommunityPost[] = buildCommunityPosts('en');

/** Look up a seeded post by stable id, localized for the active request. */
export function findCommunityPost(id: string | undefined, language?: string | null): PublicCommunityPost | undefined {
  if (!id) {
    return undefined;
  }

  const posts = isFrench(language) ? buildCommunityPosts('fr') : communityPosts;

  return posts.find((post) => post.id === id);
}

function formatUpdatedAt(iso: string, language?: string | null): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat(isFrench(language) ? 'fr-FR' : 'en-US', { dateStyle: 'long' }).format(date);
}

function formatMetric(
  value: number,
  templates: Readonly<{ one: string; other: string }>,
  language?: string | null,
): string {
  const locale = isFrench(language) ? 'fr-FR' : 'en-US';
  const template = new Intl.PluralRules(locale).select(value) === 'one' ? templates.one : templates.other;

  return interpolate(template, { count: new Intl.NumberFormat(locale).format(value) });
}

/** Map a real community post onto the localized public marketing definition. */
export function buildCommunityPostPage(post: PublicCommunityPost, language?: string | null): MarketingPageDefinition {
  const detail = getMarketingCommunityRouteCopy(language).communityRoute.detail;
  const locale = isFrench(language) ? 'fr-FR' : 'en-US';

  return {
    slug: `community/post/${post.id}`,
    title: post.title,
    eyebrow: post.categoryName,
    description: post.summary,
    kind: 'resource',
    icon: MessageSquare,
    primaryAction: [detail.backToCommunity, '/community'],
    secondaryAction: [detail.browseTemplates, '/templates'],
    highlights: [
      post.authorName,
      formatMetric(post.likes, { one: detail.likes_one, other: detail.likes_other }, language),
      formatMetric(post.comments, { one: detail.comments_one, other: detail.comments_other }, language),
      formatMetric(post.views, { one: detail.views_one, other: detail.views_other }, language),
    ],
    sections: [
      {
        title: detail.discussion,
        body: post.content,
        items: post.tags.map((tag) => `#${tag}`),
      },
      {
        title: interpolate(detail.postedBy, { name: post.authorName }),
        body: interpolate(detail.authorSummary, {
          handle: post.authorHandle,
          reputation: new Intl.NumberFormat(locale).format(post.authorReputation),
          date: formatUpdatedAt(post.updatedAt, language),
        }),
        items: [detail.publicDiscussion, post.categoryName, detail.implementationNotes, detail.safeSharing],
      },
    ],
  };
}
