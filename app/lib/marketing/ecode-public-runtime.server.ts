import { data as json, type LoaderFunctionArgs } from 'react-router';

import rawPublicRuntimeCatalog from './ecode-public-runtime.catalog.json' with { type: 'json' };
import { listEcodeTemplates } from './ecode-template-catalog.server';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

type RuntimeProcess = {
  env?: Record<string, string | undefined>;
  memoryUsage?: () => { rss: number; heapTotal: number; heapUsed: number; external: number; arrayBuffers: number };
  uptime?: () => number;
};

type PublicServiceStatus = {
  id: string;
  name: string;
  category: 'core' | 'features' | 'infrastructure';
  status: 'operational' | 'degraded' | 'partial' | 'down';
  uptime: number;
  responseTime: number;
  lastChecked: string;
  description: string;
  affectedRegions: string[];
};

type PublicRuntimeLocale = 'en' | 'fr';
type PublicRuntimeLoaderArgs = Pick<LoaderFunctionArgs, 'request'>;
type PublicRuntimeTemplate = ReturnType<typeof listEcodeTemplates>[number];

function withEnglishFallback<T>(english: T, localized: unknown): T {
  if (typeof english === 'string') {
    return (typeof localized === 'string' && localized.trim().length > 0 ? localized : english) as T;
  }

  if (Array.isArray(english)) {
    const localizedItems = Array.isArray(localized) ? localized : [];

    return english.map((item, index) => withEnglishFallback(item, localizedItems[index])) as T;
  }

  if (english && typeof english === 'object') {
    const localizedRecord =
      localized && typeof localized === 'object' && !Array.isArray(localized)
        ? (localized as Record<string, unknown>)
        : {};

    return Object.fromEntries(
      Object.entries(english).map(([key, value]) => [key, withEnglishFallback(value, localizedRecord[key])]),
    ) as T;
  }

  return (typeof localized === typeof english ? localized : english) as T;
}

const publicRuntimeCatalog = {
  en: rawPublicRuntimeCatalog.en,
  fr: withEnglishFallback(rawPublicRuntimeCatalog.en, rawPublicRuntimeCatalog.fr),
} as const;

function publicRuntimeContext(args?: PublicRuntimeLoaderArgs) {
  if (!args?.request) {
    return {
      locale: 'en' as const,
      copy: publicRuntimeCatalog.en,
      headers: new Headers({
        'Cache-Control': 'no-store',
        'Content-Language': 'en',
        Vary: 'Cookie, Accept-Language',
      }),
    };
  }

  const resolution = resolveRequestLocale(args.request);
  const locale: PublicRuntimeLocale = resolution.language === 'fr' ? 'fr' : 'en';
  const headers = localeResponseHeaders(args.request, resolution);
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Language', locale);

  return { locale, copy: publicRuntimeCatalog[locale], headers };
}

function formatPublicRuntimeCopy(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => values[key] ?? match);
}

function localizedTemplate(template: PublicRuntimeTemplate, locale: PublicRuntimeLocale): PublicRuntimeTemplate {
  const localizedTemplates = publicRuntimeCatalog[locale].templates as Record<
    string,
    { name: string; description: string }
  >;

  const englishTemplates = publicRuntimeCatalog.en.templates as Record<string, { name: string; description: string }>;
  const english = englishTemplates[template.slug];
  const localized = localizedTemplates[template.slug];

  return {
    ...template,
    name: localized?.name || english?.name || template.name,
    description: localized?.description || english?.description || template.description,
  };
}

function runtimeProcess() {
  return (globalThis as typeof globalThis & { process?: RuntimeProcess }).process;
}

function runtimeEnv() {
  return runtimeProcess()?.env ?? {};
}

function runtimeUptime() {
  return Math.floor(runtimeProcess()?.uptime?.() ?? 0);
}

function memoryPercentage() {
  const memory = runtimeProcess()?.memoryUsage?.();

  if (!memory || memory.heapTotal <= 0) {
    return 0;
  }

  return Math.round((memory.heapUsed / memory.heapTotal) * 1000) / 10;
}

function withLastChecked(service: Omit<PublicServiceStatus, 'lastChecked'>): PublicServiceStatus {
  return {
    ...service,
    lastChecked: new Date().toISOString(),
  };
}

const publicStatusRuntime = [
  { id: 'editor', category: 'core', status: 'operational', uptime: 99.99, responseTime: 120 },
  { id: 'ai-agent', category: 'features', status: 'operational', uptime: 99.95, responseTime: 450 },
  { id: 'deployments', category: 'infrastructure', status: 'operational', uptime: 99.99, responseTime: 80 },
  { id: 'database', category: 'infrastructure', status: 'operational', uptime: 99.99, responseTime: 45 },
  { id: 'collaboration', category: 'features', status: 'operational', uptime: 99.98, responseTime: 95 },
  { id: 'api', category: 'core', status: 'operational', uptime: 99.99, responseTime: 60 },
] as const;

function publicStatusServices(locale: PublicRuntimeLocale): PublicServiceStatus[] {
  const copy = publicRuntimeCatalog[locale].statusServices;

  return publicStatusRuntime.map((service) =>
    withLastChecked({
      ...service,
      name: copy[service.id].name,
      description: copy[service.id].description,
      affectedRegions: [],
    }),
  );
}

export function ecodeRagStatsLoader(args?: PublicRuntimeLoaderArgs) {
  const env = runtimeEnv();
  const { headers } = publicRuntimeContext(args);

  return json(
    {
      embeddingsCount: 0,
      nodesCount: 0,
      edgesCount: 0,
      conversationsCount: 0,
      lastUpdated: null,
      isAvailable: Boolean(env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY || env.GEMINI_API_KEY),
      providers: {
        openai: Boolean(env.OPENAI_API_KEY),
        anthropic: Boolean(env.ANTHROPIC_API_KEY),
        gemini: Boolean(env.GEMINI_API_KEY),
      },
    },
    { headers },
  );
}

/**
 * Per-session RAG config for the public marketing model-selector widget.
 * The prebuilt SPA GETs this (reading `config.enabled`) and POSTs toggles.
 * The public site has no RAG backend, so this is a stateless contract shim:
 * it returns a stable default and echoes POSTed config. Without it the SPA
 * fetch 404s and logs a console error on every landing visit.
 */
export function ecodeRagSessionConfigLoader({ request }: LoaderFunctionArgs) {
  const sessionId = new URL(request.url).searchParams.get('sessionId') ?? null;
  const { headers } = publicRuntimeContext({ request });

  return json({ sessionId, config: { enabled: false } }, { headers });
}

export async function ecodeRagSessionConfigAction({ request }: LoaderFunctionArgs) {
  const { headers } = publicRuntimeContext({ request });

  let sessionId: string | null = null;
  let enabled = false;

  try {
    const body = (await request.json()) as { sessionId?: string; config?: { enabled?: boolean } };
    sessionId = body?.sessionId ?? null;
    enabled = Boolean(body?.config?.enabled);
  } catch {
    // Malformed body: fall back to defaults rather than 500ing the widget.
  }

  return json({ sessionId, config: { enabled } }, { headers });
}

export function ecodeAboutLoader(args?: PublicRuntimeLoaderArgs) {
  const { copy, headers } = publicRuntimeContext(args);

  return json(
    {
      values: [
        {
          icon: 'Lightbulb',
          ...copy.about.values.innovation,
        },
        { icon: 'Users', ...copy.about.values.collaboration },
        {
          icon: 'Shield',
          ...copy.about.values.security,
        },
        { icon: 'Target', ...copy.about.values.focus },
      ],
      milestones: [
        { year: '2024', event: copy.about.milestones['2024'] },
        { year: '2025', event: copy.about.milestones['2025'] },
        { year: '2026', event: copy.about.milestones['2026'] },
      ],
      team: [
        { ...copy.about.team.team, avatar: 'EC' },
        { ...copy.about.team.platform, avatar: 'VC' },
      ],
      stats: [
        {
          icon: 'Rocket',
          value: '20',
          ...copy.about.stats.templates,
        },
        {
          icon: 'Code',
          value: '50+',
          ...copy.about.stats.surfaces,
        },
        {
          icon: 'Shield',
          value: '24/7',
          ...copy.about.stats.security,
        },
      ],
    },
    { headers },
  );
}

export function ecodeMonitoringHealthLoader(args?: PublicRuntimeLoaderArgs) {
  const heapPercentage = memoryPercentage();
  const uptime = runtimeUptime();
  const { headers } = publicRuntimeContext(args);

  return json(
    {
      status: heapPercentage >= 90 ? 'degraded' : 'healthy',
      metrics: {
        system: {
          cpu: { usage: 0, loadAverage: [] },
          memory: { used: heapPercentage, total: 100, percentage: heapPercentage },
          uptime,
        },
        api: {
          requestCount: 0,
          errorCount: 0,
          averageLatency: 0,
          p95Latency: 0,
          p99Latency: 0,
        },
        websocket: {
          activeConnections: 0,
          totalMessages: 0,
          messageRate: 0,
        },
        timestamp: Date.now(),
      },
      checks: {
        memory: heapPercentage < 90,
        cpu: true,
        errorRate: true,
      },
    },
    { headers },
  );
}

export function ecodeStatusServicesLoader(args?: PublicRuntimeLoaderArgs) {
  const { locale, headers } = publicRuntimeContext(args);

  return json(publicStatusServices(locale), { headers });
}

export function ecodeStatusIncidentsLoader(args?: PublicRuntimeLoaderArgs) {
  const { headers } = publicRuntimeContext(args);

  return json([], { headers });
}

export function ecodeStatusMaintenanceLoader(args?: PublicRuntimeLoaderArgs) {
  const { headers } = publicRuntimeContext(args);

  return json([], { headers });
}

export function ecodeStatusMetricsLoader(args?: PublicRuntimeLoaderArgs) {
  const { locale, headers } = publicRuntimeContext(args);
  const services = publicStatusServices(locale);
  const uptime30d = services.reduce((sum, service) => sum + service.uptime, 0) / services.length;

  return json(
    {
      uptime: uptime30d,
      uptime24h: 100,
      uptime7d: 99.99,
      uptime30d,
      response_time: Math.round(services.reduce((sum, service) => sum + service.responseTime, 0) / services.length),
      active_incidents: 0,
      services_operational: services.length,
      total_services: services.length,
    },
    { headers },
  );
}

export function ecodeStatusUptimeLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const range = url.searchParams.get('range') || '24h';
  const { headers } = publicRuntimeContext({ request });

  return json(
    {
      uptime: 99.99,
      metrics: [
        { timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(), value: 99.99 },
        { timestamp: new Date().toISOString(), value: 99.99 },
      ],
      range,
    },
    { headers },
  );
}

export function ecodePolyglotHealthLoader(args?: PublicRuntimeLoaderArgs) {
  const { headers } = publicRuntimeContext(args);

  return json(
    {
      status: 'healthy',
      services: [
        { service: 'typescript', status: 'healthy', lastCheck: new Date().toISOString(), responseTime: 30 },
        { service: 'python-ml', status: 'healthy', lastCheck: new Date().toISOString(), responseTime: 45 },
      ],
      timestamp: new Date().toISOString(),
      architecture: 'polyglot',
      languages: ['TypeScript', 'Python'],
    },
    { headers },
  );
}

export function ecodePolyglotCapabilitiesLoader(args?: PublicRuntimeLoaderArgs) {
  const { copy, headers } = publicRuntimeContext(args);

  return json(
    {
      services: {
        typescript: {
          port: 8787,
          capabilities: copy.polyglotCapabilities.typescript,
          endpoints: ['/api/projects', '/api/auth', '/api/files', '/api/workspaces'],
        },
        'python-ml': {
          port: 8081,
          capabilities: copy.polyglotCapabilities.pythonMl,
          endpoints: ['/api/code/analyze', '/api/text/analyze', '/api/data/process'],
        },
      },
      routing: {
        'file-operations': 'typescript',
        'project-management': 'typescript',
        realtime: 'typescript',
        'ai-ml': 'python-ml',
        'code-analysis': 'python-ml',
        'data-analysis': 'python-ml',
      },
    },
    { headers },
  );
}

export function ecodePolyglotBenchmarkLoader(args?: PublicRuntimeLoaderArgs) {
  const { headers } = publicRuntimeContext(args);

  return json(
    {
      fastest: { service: 'typescript', responseTime: 30, status: 'healthy' },
      results: [
        { service: 'typescript', responseTime: 30, status: 'healthy' },
        { service: 'python-ml', responseTime: 45, status: 'healthy' },
      ],
      timestamp: new Date().toISOString(),
    },
    { headers },
  );
}

export function ecodeMarketplaceExtensionsLoader(args?: PublicRuntimeLoaderArgs) {
  const { copy, headers } = publicRuntimeContext(args);

  return json(
    [
      {
        id: 1,
        name: 'Prettier',
        description: copy.marketplace.extensions['1'].description,
        author: 'Prettier',
        category: 'formatters',
        tags: ['formatting', 'code-style', 'prettier'],
        downloads: 0,
        rating: 4.9,
        reviews: 0,
        price: copy.marketplace.extensions['1'].price,
        featured: true,
        installed: false,
      },
      {
        id: 2,
        name: 'ESLint',
        description: copy.marketplace.extensions['2'].description,
        author: 'ESLint',
        category: 'linters',
        tags: ['linting', 'javascript', 'typescript'],
        downloads: 0,
        rating: 4.8,
        reviews: 0,
        price: copy.marketplace.extensions['2'].price,
        featured: true,
        installed: false,
      },
      {
        id: 3,
        name: 'Tailwind CSS IntelliSense',
        description: copy.marketplace.extensions['3'].description,
        author: 'Tailwind Labs',
        category: 'languages',
        tags: ['css', 'tailwind', 'styling'],
        downloads: 0,
        rating: 4.8,
        reviews: 0,
        price: copy.marketplace.extensions['3'].price,
        featured: false,
        installed: false,
      },
      {
        id: 4,
        name: 'E-Code AI Workspace',
        description: copy.marketplace.extensions['4'].description,
        author: 'E-Code',
        category: 'ai',
        tags: ['ai', 'workspace', 'deployments'],
        downloads: 0,
        rating: 4.7,
        reviews: 0,
        price: copy.marketplace.extensions['4'].price,
        featured: true,
        installed: false,
      },
    ],
    { headers },
  );
}

export function ecodeMarketplacePublishersLoader(args?: PublicRuntimeLoaderArgs) {
  const { copy, headers } = publicRuntimeContext(args);
  const officialTemplates = listEcodeTemplates().filter((template) => template.isOfficial);

  return json(
    [
      {
        id: 'vibecore',
        name: 'E-Code',
        avatar: 'VC',
        verified: true,
        extensions: 1,
        templates: officialTemplates.length,
        downloads: officialTemplates.reduce((sum, template) => sum + template.stats.downloads, 0),
        description: copy.marketplace.publisherDescription,
      },
    ],
    { headers },
  );
}

/**
 * Build the community category summaries with post counts derived from the
 * actual post→category assignment (see communityPostCategory). Earlier code
 * keyed counts off catalog category values ('web'/'ml-ai'/'api'), but
 * communityPosts() only ever assigns 'showcase'/'tutorials'/'discussion' by
 * cycling index % 3. That mismatch advertised a nonzero 'Challenges' badge
 * (and arbitrary Tutorials/Discussion counts) for a tab that filtered to zero
 * posts. Counting the real assignments keeps every badge truthful: 'challenges'
 * shows 0 and is honestly empty, while showcase/tutorials/discussion report the
 * exact number of posts a ?category= request will return.
 */
export function buildCommunityCategories(templates: Array<{ category: string }>, locale: PublicRuntimeLocale = 'en') {
  const counts = templates.reduce<Record<string, number>>((acc, _template, index) => {
    const category = communityPostCategory(index);
    acc[category] = (acc[category] ?? 0) + 1;

    return acc;
  }, {});

  const names = publicRuntimeCatalog[locale].community.categories;

  return [
    { id: 'showcase', name: names.showcase, icon: 'Star', postCount: counts.showcase ?? 0 },
    { id: 'tutorials', name: names.tutorials, icon: 'Code', postCount: counts.tutorials ?? 0 },
    { id: 'challenges', name: names.challenges, icon: 'Trophy', postCount: counts.challenges ?? 0 },
    { id: 'discussion', name: names.discussion, icon: 'MessageSquare', postCount: counts.discussion ?? 0 },
  ];
}

/*
 * Single source of truth for the post→category mapping. buildCommunityCategories
 * (badge counts) and communityPosts (the list each ?category= request filters)
 * must agree, otherwise a tab advertises a count it can never satisfy.
 */
export function communityPostCategory(index: number): 'showcase' | 'tutorials' | 'discussion' {
  return index % 3 === 0 ? 'showcase' : index % 3 === 1 ? 'tutorials' : 'discussion';
}

function communityCategories(locale: PublicRuntimeLocale) {
  return buildCommunityCategories(listEcodeTemplates(), locale);
}

function communityPosts(locale: PublicRuntimeLocale) {
  const titleTemplate = publicRuntimeCatalog[locale].community.postTitle;

  return listEcodeTemplates().map((template, index) => {
    const localized = localizedTemplate(template, locale);

    return {
      id: template.slug,
      title: formatPublicRuntimeCopy(titleTemplate, { name: localized.name }),
      content: localized.description,
      author: {
        id: template.author.id,
        username: template.author.id,
        displayName: template.author.name,
        avatarUrl: undefined,
        reputation: 0,
      },
      category: communityPostCategory(index),
      tags: template.tags.slice(0, 5),
      likes: template.stats.stars,
      comments: 0,
      views: template.stats.downloads,
      isLiked: false,
      isBookmarked: false,
      createdAt: template.updatedAt,
      projectUrl: template.githubRepo ? `https://github.com/${template.githubRepo}` : undefined,
      imageUrl: undefined,
      commentsData: [],
    };
  });
}

export function ecodeCommunityCategoriesLoader(args?: PublicRuntimeLoaderArgs) {
  const { locale, headers } = publicRuntimeContext(args);

  return json(communityCategories(locale), { headers });
}

export function ecodeCommunityPostsLoader({ request }: LoaderFunctionArgs) {
  const { locale, headers } = publicRuntimeContext({ request });
  const url = new URL(request.url);

  /*
   * Number.isFinite guard before clamping — Math.max(NaN, 1) === NaN, so a
   * non-numeric ?page=abc would otherwise yield NaN pagination (page/totalPages
   * serialize to null + empty list). Mirrors paginateTemplates' established guard.
   */
  const pageRaw = Number(url.searchParams.get('page') ?? '1');
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const pageSizeRaw = Number(url.searchParams.get('pageSize') ?? '20');
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.min(Math.floor(pageSizeRaw), 50) : 20;
  const category = url.searchParams.get('category');
  const search = (url.searchParams.get('search') ?? '').toLowerCase();

  const filtered = communityPosts(locale).filter((post) => {
    const matchesCategory = !category || category === 'all' || post.category === category;

    const matchesSearch =
      !search ||
      post.title.toLowerCase().includes(search) ||
      post.content.toLowerCase().includes(search) ||
      post.tags.some((tag) => tag.toLowerCase().includes(search));

    return matchesCategory && matchesSearch;
  });

  const start = (page - 1) * pageSize;
  const posts = filtered.slice(start, start + pageSize);

  return json(
    {
      posts,
      pagination: {
        page,
        pageSize,
        total: filtered.length,
        totalPages: Math.ceil(filtered.length / pageSize),
        hasMore: start + pageSize < filtered.length,
      },
    },
    { headers },
  );
}

export function ecodeCommunityPostLoader({ params, request }: LoaderFunctionArgs) {
  const { locale, copy, headers } = publicRuntimeContext({ request });
  const post = communityPosts(locale).find((candidate) => candidate.id === params.postId);

  if (!post) {
    return json({ ok: false, error: copy.community.postNotFound }, { status: 404, headers });
  }

  return json(post, { headers });
}

export async function ecodeCommunityPostMutationAction(args?: PublicRuntimeLoaderArgs) {
  const { headers } = publicRuntimeContext(args);

  return json({ ok: true }, { headers });
}

export function ecodeCommunityChallengesLoader(args?: PublicRuntimeLoaderArgs) {
  const { copy, headers } = publicRuntimeContext(args);

  return json(
    [
      {
        id: 'ai-agent-starter',
        ...copy.community.challenges['ai-agent-starter'],
        difficulty: 'medium',
        category: 'ai',
        participants: 0,
        submissions: 0,
        deadline: '2026-12-31T23:59:59.000Z',
        status: 'active',
      },
      {
        id: 'mobile-workspace',
        ...copy.community.challenges['mobile-workspace'],
        difficulty: 'easy',
        category: 'mobile',
        participants: 0,
        submissions: 0,
        deadline: '2026-12-31T23:59:59.000Z',
        status: 'active',
      },
    ],
    { headers },
  );
}

export function ecodeCommunityLeaderboardLoader(args?: PublicRuntimeLoaderArgs) {
  const { headers } = publicRuntimeContext(args);

  return json([], { headers });
}

export function ecodeExploreProjectsLoader({ request }: LoaderFunctionArgs) {
  const { locale, headers } = publicRuntimeContext({ request });
  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const search = (url.searchParams.get('search') ?? '').toLowerCase();

  const projects = listEcodeTemplates()
    .map((template, index) => {
      const localized = localizedTemplate(template, locale);

      return {
        id: index + 1,
        slug: template.slug,
        name: localized.name,
        description: localized.description,
        language: template.language,
        category: template.category,
        tags: template.tags,
        stars: template.stats.stars,
        forks: template.stats.forks,
        runs: template.stats.downloads,
        author: template.author.id,
        avatar: undefined,
        lastUpdated: new Date(template.updatedAt).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
          month: 'short',
          day: 'numeric',
        }),
        createdAt: template.updatedAt,
        updatedAt: template.updatedAt,
      };
    })
    .filter((project) => {
      const matchesCategory = !category || category === 'all' || project.category === category;

      const matchesSearch =
        !search ||
        project.name.toLowerCase().includes(search) ||
        project.description.toLowerCase().includes(search) ||
        project.tags.some((tag) => tag.toLowerCase().includes(search));

      return matchesCategory && matchesSearch;
    });

  return json(projects, { headers });
}
