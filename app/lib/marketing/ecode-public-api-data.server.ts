export type EcodePaymentPlan = {
  id: string;
  name: string;
  tier: 'free' | 'core' | 'teams' | 'enterprise';
  price: number;
  interval: 'month' | 'year';
  creditsMonthly: number;
  features: string[];
  limits: {
    projects: number;
    collaborators: number;
    storage: number;
    cpuHours: number;
    deployments: number;
  };
  allowances: {
    vcpus: number;
    ramGb: number;
    storageGb: number;
    bandwidthGb: number;
    developmentMinutes: number;
    publicApps: number;
    privateApps: number;
    collaborators: number;
  };
};

type PlanDefinition = {
  name: string;
  tier: EcodePaymentPlan['tier'];
  priceMonthly: number;
  priceYearly: number;
  creditsMonthly: number;
  allowances: EcodePaymentPlan['allowances'];
  features: string[];
};

const planDefinitions = {
  starter: {
    name: 'Starter',
    tier: 'free',
    priceMonthly: 0,
    priceYearly: 0,
    creditsMonthly: 3,
    allowances: {
      vcpus: 1,
      ramGb: 2,
      storageGb: 1,
      bandwidthGb: 1,
      developmentMinutes: 1200,
      publicApps: 10,
      privateApps: 0,
      collaborators: 1,
    },
    features: [
      'AI Agent trial included',
      '10 development apps (with temporary links)',
      'Public apps only',
      'Limited build time, without long full autonomy',
    ],
  },
  core: {
    name: 'Core',
    tier: 'core',
    priceMonthly: 25,
    priceYearly: 20,
    creditsMonthly: 25,
    allowances: {
      vcpus: 4,
      ramGb: 8,
      storageGb: 50,
      bandwidthGb: 100,
      developmentMinutes: -1,
      publicApps: -1,
      privateApps: -1,
      collaborators: 3,
    },
    features: [
      'Full AI Agent access',
      '€25 of monthly credits',
      'Private and public apps',
      'Access to latest models',
      'Publish and host live apps',
      'Pay-as-you-go for additional usage',
      'Autonomous long builds',
    ],
  },
  teams: {
    name: 'Teams',
    tier: 'teams',
    priceMonthly: 40,
    priceYearly: 35,
    creditsMonthly: 40,
    allowances: {
      vcpus: 8,
      ramGb: 16,
      storageGb: 256,
      bandwidthGb: 1000,
      developmentMinutes: -1,
      publicApps: -1,
      privateApps: -1,
      collaborators: -1,
    },
    features: [
      'Everything included with E-Code Core',
      '€40/mo in usage credits included',
      'Credits granted upfront on annual plan',
      '50 Viewer seats',
      'Centralized billing',
      'Role-based access control',
      'Private deployments',
      'Pay-as-you-go for additional usage',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    tier: 'enterprise',
    priceMonthly: 200,
    priceYearly: 200,
    creditsMonthly: 100,
    allowances: {
      vcpus: 64,
      ramGb: 128,
      storageGb: 256,
      bandwidthGb: 10000,
      developmentMinutes: -1,
      publicApps: -1,
      privateApps: -1,
      collaborators: -1,
    },
    features: [
      'Everything in Teams',
      'Custom Viewer Seats',
      'SSO/SAML',
      'SCIM',
      'Advanced privacy controls',
      'Custom pricing',
      'Dedicated support',
    ],
  },
} satisfies Record<string, PlanDefinition>;

function toPaymentPlan(
  key: string,
  definition: PlanDefinition,
  interval: EcodePaymentPlan['interval'],
): EcodePaymentPlan {
  const price = interval === 'month' ? definition.priceMonthly : definition.priceYearly;
  const id = definition.tier === 'free' ? 'free' : `price_${key}_${interval === 'month' ? 'monthly' : 'yearly'}`;

  return {
    id,
    name: definition.name,
    tier: definition.tier,
    price,
    interval,
    creditsMonthly: definition.creditsMonthly,
    features: definition.features,
    limits: {
      projects: -1,
      collaborators: definition.allowances.collaborators,
      storage: definition.allowances.storageGb,
      cpuHours: -1,
      deployments: -1,
    },
    allowances: definition.allowances,
  };
}

export const ecodePaymentPlans: EcodePaymentPlan[] = [
  toPaymentPlan('free', planDefinitions.starter, 'month'),
  toPaymentPlan('core', planDefinitions.core, 'month'),
  toPaymentPlan('core', planDefinitions.core, 'year'),
  toPaymentPlan('teams', planDefinitions.teams, 'month'),
  toPaymentPlan('teams', planDefinitions.teams, 'year'),
  toPaymentPlan('enterprise', planDefinitions.enterprise, 'month'),
  toPaymentPlan('enterprise', planDefinitions.enterprise, 'year'),
];

export type EcodeBlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  author: string;
  authorRole: string;
  category: string;
  tags: string[];
  published: boolean;
  featured: boolean;
  coverImage: string;
  readTime: number;
  views: number;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
};

export const ecodeBlogPosts: EcodeBlogPost[] = [
  {
    id: '1',
    title: 'Introducing E-Code AI Agent 2.0',
    slug: 'introducing-e-code',
    excerpt:
      'Our most powerful AI coding assistant yet, now with multi-file editing and autonomous debugging capabilities.',
    content: `# Introducing E-Code AI Agent 2.0

E-Code AI Agent 2.0 is an autonomous software engineer for teams that need to move from idea to production without losing control of architecture, security, or quality.

## What changed

- Multi-file planning and editing across full applications
- Autonomous debugging with terminal, preview, and logs in context
- Production-aware scaffolding for frontend, backend, data, auth, and deployment
- Clear explanations for every material change

## Built for real delivery

The agent creates complete project structures, writes typed code, installs dependencies, validates the preview, and keeps iterating until the application works. Teams can review each step, keep auditability, and ship with the same workflow on desktop and mobile.

## Start building

Open E-Code, describe the product you want, and let the agent assemble the first working version. You can refine design, add integrations, and deploy from the same workspace.`,
    author: 'E-Code Team',
    authorRole: 'Product',
    category: 'Product',
    tags: ['AI', 'agent', 'product'],
    published: true,
    featured: true,
    coverImage: '/ecode-static/assets/product/ide.png',
    readTime: 5,
    views: 48750,
    publishedAt: '2026-01-15T00:00:00.000Z',
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
  },
  {
    id: '2',
    title: 'Building at Scale: How We Handle 10M+ Requests',
    slug: 'building-at-scale-how-we-handle-10m-requests',
    excerpt: 'A deep dive into our distributed architecture and the lessons we learned scaling E-Code.',
    content: `# Building at Scale: How We Handle 10M+ Requests

Scaling E-Code means keeping code editing, AI generation, previews, deployments, and collaboration responsive at the same time.

## Architecture

The platform separates real-time workspace traffic, AI job orchestration, static asset delivery, and billing-critical APIs. Each surface has explicit health checks, telemetry, and backpressure.

## Lessons

- Keep interactive paths short
- Cache immutable assets aggressively
- Use queues for long-running work
- Measure latency from the user's point of view`,
    author: 'Engineering Team',
    authorRole: 'Platform Engineering',
    category: 'Engineering',
    tags: ['architecture', 'scaling', 'performance'],
    published: true,
    featured: false,
    coverImage: '/ecode-static/assets/product/dashboard.png',
    readTime: 8,
    views: 8932,
    publishedAt: '2026-01-10T00:00:00.000Z',
    createdAt: '2026-01-10T00:00:00.000Z',
    updatedAt: '2026-01-10T00:00:00.000Z',
  },
  {
    id: '3',
    title: 'Getting Started with E-Code in 5 Minutes',
    slug: 'getting-started-with-e-code-in-5-minutes',
    excerpt: 'A quick tutorial to help you build and deploy your first app using E-Code.',
    content: `# Getting Started with E-Code in 5 Minutes

This guide walks through creating a first project, opening the IDE, asking the AI Agent for a working application, and deploying the result.

## Steps

1. Create a workspace.
2. Describe the app you want to build.
3. Review the generated files and preview.
4. Deploy when the build is ready.

E-Code keeps the editor, terminal, preview, logs, and deployment state in one place so the first project stays easy to reason about.`,
    author: 'Developer Relations',
    authorRole: 'DevRel',
    category: 'Tutorial',
    tags: ['tutorial', 'getting-started'],
    published: true,
    featured: false,
    coverImage: '/ecode-static/assets/product/mobile.png',
    readTime: 4,
    views: 6420,
    publishedAt: '2026-01-05T00:00:00.000Z',
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
  },
];

export function findEcodeBlogPost(slug: string | undefined) {
  return ecodeBlogPosts.find((post) => post.slug === slug && post.published);
}

export function findEcodeBlogPostsByCategory(category: string | undefined) {
  if (!category) {
    return [];
  }

  const normalized = category.toLowerCase();

  return ecodeBlogPosts.filter((post) => post.published && post.category.toLowerCase() === normalized);
}
