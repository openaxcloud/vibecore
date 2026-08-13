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

export const meta: MetaFunction = () => [
  { title: 'Community - E-Code' },
  {
    name: 'description',
    content: 'Public E-Code builder community with discussions, challenges, contributors and marketing navigation.',
  },
];

const communityPosts: PublicCommunityPost[] = [
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

const baseCategories: Array<Omit<PublicCommunityCategory, 'postCount'>> = [
  { id: 'all', name: 'All' },
  { id: 'showcase', name: 'Showcase' },
  { id: 'help', name: 'Help' },
  { id: 'tutorials', name: 'Tutorials' },
  { id: 'discussion', name: 'Discussion' },
];

const communityCategories: PublicCommunityCategory[] = baseCategories.map((category) => ({
  ...category,
  postCount:
    category.id === 'all'
      ? communityPosts.length
      : communityPosts.filter((post) => post.category === category.id).length,
}));

const communityChallenges: PublicCommunityChallenge[] = [
  {
    id: 'agent-with-tools',
    title: 'Ship an agent with tool orchestration',
    description: 'Build an agent flow with streaming progress, tool calls, audit logs and a production fallback path.',
    difficulty: 'medium',
    participants: 218,
    submissions: 47,
    deadline: '2026-07-12T23:59:59.000Z',
  },
  {
    id: 'mobile-first-builder',
    title: 'Mobile-first builder workflow',
    description: 'Design a responsive app flow that works cleanly across phone, tablet and desktop previews.',
    difficulty: 'easy',
    participants: 173,
    submissions: 39,
    deadline: '2026-07-20T23:59:59.000Z',
  },
  {
    id: 'secure-deployment-runbook',
    title: 'Secure deployment runbook',
    description: 'Publish a deployment checklist with rollback, secrets, monitoring and post-release validation.',
    difficulty: 'hard',
    participants: 96,
    submissions: 18,
    deadline: '2026-08-02T23:59:59.000Z',
  },
];

const communityContributors: PublicCommunityContributor[] = [
  { id: 'maya-ops', name: 'Maya Chen', handle: 'maya-ops', rank: 1, score: 18420, badge: 'Mentor' },
  { id: 'nadia-release', name: 'Nadia Laurent', handle: 'nadia-release', rank: 2, score: 17290, badge: 'Release' },
  { id: 'ari-builds', name: 'Ari Kaplan', handle: 'ari-builds', rank: 3, score: 16110, badge: 'Builder' },
  { id: 'sam-teams', name: 'Sam Rivera', handle: 'sam-teams', rank: 4, score: 14980, badge: 'Teams' },
];

const communityEvents: PublicCommunityEvent[] = [
  {
    id: 'agent-systems-roundtable',
    title: 'Agent systems roundtable',
    description: 'A public conversation on memory, tools, routing, evaluation and production incident handling.',
    date: 'Jun 27',
  },
  {
    id: 'mobile-qa-workshop',
    title: 'Mobile QA workshop',
    description: 'A hands-on session for responsive layouts, preview validation and real device release checks.',
    date: 'Jul 08',
  },
  {
    id: 'deployment-review-clinic',
    title: 'Deployment review clinic',
    description: 'Bring a deployment flow and get community feedback on rollout safety and observability.',
    date: 'Jul 16',
  },
  {
    id: 'template-hardening-day',
    title: 'Template hardening day',
    description: 'Convert starters into production-ready foundations with types, tests and recovery states.',
    date: 'Jul 30',
  },
];

export function loader(_args: LoaderFunctionArgs) {
  return json({
    posts: communityPosts,
    categories: communityCategories,
    challenges: communityChallenges,
    contributors: communityContributors,
    events: communityEvents,
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
