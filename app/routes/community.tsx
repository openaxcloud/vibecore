import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import {
  CommunityMarketingPage,
  type PublicCommunityCategory,
  type PublicCommunityChallenge,
  type PublicCommunityContributor,
  type PublicCommunityEvent,
  type PublicCommunityPost,
} from '~/components/marketing/EcodePublicResourcePages';
import {
  getMarketingCommunityRouteCopy,
  type CommunityRouteCategoryId,
  type CommunityRouteChallengeId,
  type CommunityRouteContributorId,
  type CommunityRouteEventId,
  type CommunityRoutePostId,
  type CommunityRouteTagId,
} from '~/lib/i18n/catalogs/marketing-community-route';
import type { SupportedLanguage } from '~/lib/i18n/language';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { socialMetaTags } from '~/utils/social-meta';

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const seo = getMarketingCommunityRouteCopy(data?.language).communityRoute.seo;

  const social = socialMetaTags(seo).map((tag) => {
    const identifier = 'property' in tag ? tag.property : 'name' in tag ? tag.name : undefined;

    return identifier === 'og:image:alt' || identifier === 'twitter:image:alt'
      ? { ...tag, content: seo.imageAlt }
      : tag;
  });

  return [{ title: seo.title }, { name: 'description', content: seo.description }, ...social];
};

const communityRouteEnCopy = getMarketingCommunityRouteCopy('en').communityRoute;

type CommunitySeedPost = Omit<PublicCommunityPost, 'id' | 'tags' | 'tagLabels'> & {
  id: CommunityRoutePostId;
  tags: CommunityRouteTagId[];
};
type CommunitySeedCategory = Omit<PublicCommunityCategory, 'id'> & { id: CommunityRouteCategoryId };
type CommunitySeedChallenge = Omit<PublicCommunityChallenge, 'id'> & { id: CommunityRouteChallengeId };
type CommunitySeedContributor = Omit<PublicCommunityContributor, 'id'> & { id: CommunityRouteContributorId };
type CommunitySeedEvent = Omit<PublicCommunityEvent, 'id'> & { id: CommunityRouteEventId };

const communityPosts: CommunitySeedPost[] = [
  {
    id: 'agent-memory-routing-production',
    title: communityRouteEnCopy.posts[0].title,
    summary: communityRouteEnCopy.posts[0].summary,
    content: communityRouteEnCopy.posts[0].content,
    authorName: 'Maya Chen',
    authorHandle: 'maya-ops',
    authorInitials: 'MC',
    authorReputation: 18420,
    category: 'help',
    categoryName: communityRouteEnCopy.posts[0].categoryName,
    tags: ['ai-agent', 'memory', 'security', 'audit'],
    likes: 128,
    comments: 34,
    views: 4260,
    updatedAt: '2026-06-12T10:00:00.000Z',
  },
  {
    id: 'mobile-preview-checklist',
    title: communityRouteEnCopy.posts[1].title,
    summary: communityRouteEnCopy.posts[1].summary,
    content: communityRouteEnCopy.posts[1].content,
    authorName: 'Jon Bell',
    authorHandle: 'jon-mobile',
    authorInitials: 'JB',
    authorReputation: 12980,
    category: 'showcase',
    categoryName: communityRouteEnCopy.posts[1].categoryName,
    tags: ['mobile', 'qa', 'preview', 'responsive'],
    likes: 96,
    comments: 21,
    views: 3190,
    updatedAt: '2026-06-11T14:20:00.000Z',
  },
  {
    id: 'deployments-rollback-playbook',
    title: communityRouteEnCopy.posts[2].title,
    summary: communityRouteEnCopy.posts[2].summary,
    content: communityRouteEnCopy.posts[2].content,
    authorName: 'Nadia Laurent',
    authorHandle: 'nadia-release',
    authorInitials: 'NL',
    authorReputation: 22110,
    category: 'tutorials',
    categoryName: communityRouteEnCopy.posts[2].categoryName,
    tags: ['deployments', 'rollback', 'cloud-run', 'helm'],
    likes: 144,
    comments: 29,
    views: 5120,
    updatedAt: '2026-06-10T09:45:00.000Z',
  },
  {
    id: 'templates-to-real-products',
    title: communityRouteEnCopy.posts[3].title,
    summary: communityRouteEnCopy.posts[3].summary,
    content: communityRouteEnCopy.posts[3].content,
    authorName: 'Ari Kaplan',
    authorHandle: 'ari-builds',
    authorInitials: 'AK',
    authorReputation: 16740,
    category: 'discussion',
    categoryName: communityRouteEnCopy.posts[3].categoryName,
    tags: ['templates', 'typescript', 'api', 'quality'],
    likes: 117,
    comments: 42,
    views: 4630,
    updatedAt: '2026-06-09T18:30:00.000Z',
  },
  {
    id: 'team-workspace-governance',
    title: communityRouteEnCopy.posts[4].title,
    summary: communityRouteEnCopy.posts[4].summary,
    content: communityRouteEnCopy.posts[4].content,
    authorName: 'Sam Rivera',
    authorHandle: 'sam-teams',
    authorInitials: 'SR',
    authorReputation: 15320,
    category: 'discussion',
    categoryName: communityRouteEnCopy.posts[4].categoryName,
    tags: ['teams', 'rbac', 'collaboration', 'handoff'],
    likes: 88,
    comments: 18,
    views: 2840,
    updatedAt: '2026-06-08T12:15:00.000Z',
  },
  {
    id: 'community-demo-day-recap',
    title: communityRouteEnCopy.posts[5].title,
    summary: communityRouteEnCopy.posts[5].summary,
    content: communityRouteEnCopy.posts[5].content,
    authorName: 'E-Code Community',
    authorHandle: 'ecode-community',
    authorInitials: 'EC',
    authorReputation: 24500,
    category: 'showcase',
    categoryName: communityRouteEnCopy.posts[5].categoryName,
    tags: ['demo-day', 'ai-apps', 'dashboards', 'mobile'],
    likes: 203,
    comments: 56,
    views: 7840,
    updatedAt: '2026-06-07T16:00:00.000Z',
  },
];

const baseCategories: Array<Omit<CommunitySeedCategory, 'postCount'>> = [
  { id: 'all', name: communityRouteEnCopy.categories[0].name },
  { id: 'showcase', name: communityRouteEnCopy.categories[1].name },
  { id: 'help', name: communityRouteEnCopy.categories[2].name },
  { id: 'tutorials', name: communityRouteEnCopy.categories[3].name },
  { id: 'discussion', name: communityRouteEnCopy.categories[4].name },
];

const communityCategories: CommunitySeedCategory[] = baseCategories.map((category) => ({
  ...category,
  postCount:
    category.id === 'all'
      ? communityPosts.length
      : communityPosts.filter((post) => post.category === category.id).length,
}));

const communityChallenges: CommunitySeedChallenge[] = [
  {
    id: 'agent-with-tools',
    title: communityRouteEnCopy.challenges[0].title,
    description: communityRouteEnCopy.challenges[0].description,
    difficulty: 'medium',
    participants: 218,
    submissions: 47,
    deadline: '2026-07-12T23:59:59.000Z',
  },
  {
    id: 'mobile-first-builder',
    title: communityRouteEnCopy.challenges[1].title,
    description: communityRouteEnCopy.challenges[1].description,
    difficulty: 'easy',
    participants: 173,
    submissions: 39,
    deadline: '2026-07-20T23:59:59.000Z',
  },
  {
    id: 'secure-deployment-runbook',
    title: communityRouteEnCopy.challenges[2].title,
    description: communityRouteEnCopy.challenges[2].description,
    difficulty: 'hard',
    participants: 96,
    submissions: 18,
    deadline: '2026-08-02T23:59:59.000Z',
  },
];

const communityContributors: CommunitySeedContributor[] = [
  {
    id: 'maya-ops',
    name: 'Maya Chen',
    handle: 'maya-ops',
    rank: 1,
    score: 18420,
    badge: communityRouteEnCopy.contributorBadges[0].badge,
  },
  {
    id: 'nadia-release',
    name: 'Nadia Laurent',
    handle: 'nadia-release',
    rank: 2,
    score: 17290,
    badge: communityRouteEnCopy.contributorBadges[1].badge,
  },
  {
    id: 'ari-builds',
    name: 'Ari Kaplan',
    handle: 'ari-builds',
    rank: 3,
    score: 16110,
    badge: communityRouteEnCopy.contributorBadges[2].badge,
  },
  {
    id: 'sam-teams',
    name: 'Sam Rivera',
    handle: 'sam-teams',
    rank: 4,
    score: 14980,
    badge: communityRouteEnCopy.contributorBadges[3].badge,
  },
];

const communityEvents: CommunitySeedEvent[] = [
  {
    id: 'agent-systems-roundtable',
    title: communityRouteEnCopy.events[0].title,
    description: communityRouteEnCopy.events[0].description,
    date: '2026-06-27T17:00:00.000Z',
  },
  {
    id: 'mobile-qa-workshop',
    title: communityRouteEnCopy.events[1].title,
    description: communityRouteEnCopy.events[1].description,
    date: '2026-07-08T17:00:00.000Z',
  },
  {
    id: 'deployment-review-clinic',
    title: communityRouteEnCopy.events[2].title,
    description: communityRouteEnCopy.events[2].description,
    date: '2026-07-16T17:00:00.000Z',
  },
  {
    id: 'template-hardening-day',
    title: communityRouteEnCopy.events[3].title,
    description: communityRouteEnCopy.events[3].description,
    date: '2026-07-30T17:00:00.000Z',
  },
];

export function buildCommunityRouteData(language: SupportedLanguage) {
  const copy = getMarketingCommunityRouteCopy(language).communityRoute;

  const posts: PublicCommunityPost[] = communityPosts.map((post) => {
    const localized = copy.posts.find((item) => item.id === post.id);
    const localizedTagLabels = language === 'fr' ? { tagLabels: post.tags.map((tag) => copy.tagLabels[tag]) } : {};

    return localized ? { ...post, ...localized, ...localizedTagLabels } : { ...post, ...localizedTagLabels };
  });

  const categories: PublicCommunityCategory[] = communityCategories.map((category) => ({
    ...category,
    name: copy.categories.find((item) => item.id === category.id)?.name ?? category.name,
  }));

  const challenges: PublicCommunityChallenge[] = communityChallenges.map((challenge) => {
    const localized = copy.challenges.find((item) => item.id === challenge.id);

    return localized ? { ...challenge, ...localized } : challenge;
  });

  const contributors: PublicCommunityContributor[] = communityContributors.map((contributor) => ({
    ...contributor,
    badge: copy.contributorBadges.find((item) => item.id === contributor.id)?.badge ?? contributor.badge,
  }));

  const events: PublicCommunityEvent[] = communityEvents.map((event) => {
    const localized = copy.events.find((item) => item.id === event.id);

    return localized ? { ...event, ...localized } : event;
  });

  return { language, posts, categories, challenges, contributors, events };
}

export function loader({ request }: LoaderFunctionArgs) {
  const localeResolution = resolveRequestLocale(request);

  return json(buildCommunityRouteData(localeResolution.language), {
    headers: localeResponseHeaders(request, localeResolution),
  });
}

export default function CommunityRoute() {
  const data = useLoaderData<typeof loader>();

  return (
    <CommunityMarketingPage
      posts={data.posts}
      categories={data.categories}
      challenges={data.challenges}
      contributors={data.contributors}
      events={data.events}
    />
  );
}
