import { getMarketingBlogPostCopy } from '~/lib/i18n/catalogs/marketing-blog-detail';

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

type EcodeBlogPostMetadata = Omit<
  EcodeBlogPost,
  'title' | 'excerpt' | 'content' | 'author' | 'authorRole' | 'category' | 'tags'
>;

const ecodeBlogPostMetadata: EcodeBlogPostMetadata[] = [
  {
    id: '1',
    slug: 'introducing-e-code',
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
    slug: 'building-at-scale-how-we-handle-10m-requests',
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
    slug: 'getting-started-with-e-code-in-5-minutes',
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

export function getEcodeBlogPosts(language?: string | null): EcodeBlogPost[] {
  return ecodeBlogPostMetadata.flatMap((metadata) => {
    const copy = getMarketingBlogPostCopy(metadata.slug, language);

    return copy ? [{ ...metadata, ...copy }] : [];
  });
}

export const ecodeBlogPosts: EcodeBlogPost[] = getEcodeBlogPosts('en');

export function findEcodeBlogPost(slug: string | undefined, language?: string | null) {
  return getEcodeBlogPosts(language).find((post) => post.slug === slug && post.published);
}

export function findEcodeBlogPostsByCategory(category: string | undefined, language?: string | null) {
  if (!category) {
    return [];
  }

  const normalized = category.toLowerCase();

  const matchingSlugs = new Set(
    getEcodeBlogPosts('en')
      .filter((post) => post.category.toLowerCase() === normalized)
      .map((post) => post.slug),
  );

  const localizedPosts = getEcodeBlogPosts(language);

  return localizedPosts.filter(
    (post) => post.published && (matchingSlugs.has(post.slug) || post.category.toLowerCase() === normalized),
  );
}
