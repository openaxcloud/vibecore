import { data as json, type LoaderFunctionArgs } from 'react-router';

import { listEcodeTemplates } from './ecode-template-catalog.server';

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

const noStoreHeaders = {
  'Cache-Control': 'no-store',
};

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

function publicStatusServices(): PublicServiceStatus[] {
  return [
    withLastChecked({
      id: 'editor',
      name: 'E-Code Editor',
      category: 'core',
      status: 'operational',
      uptime: 99.99,
      responseTime: 120,
      description: 'Core IDE and code editing services',
      affectedRegions: [],
    }),
    withLastChecked({
      id: 'ai-agent',
      name: 'AI Agent',
      category: 'features',
      status: 'operational',
      uptime: 99.95,
      responseTime: 450,
      description: 'Autonomous builder and assistant',
      affectedRegions: [],
    }),
    withLastChecked({
      id: 'deployments',
      name: 'Hosting & Deployments',
      category: 'infrastructure',
      status: 'operational',
      uptime: 99.99,
      responseTime: 80,
      description: 'Application hosting and deployment pipeline',
      affectedRegions: [],
    }),
    withLastChecked({
      id: 'database',
      name: 'Database Services',
      category: 'infrastructure',
      status: 'operational',
      uptime: 99.99,
      responseTime: 45,
      description: 'Managed persistence, metadata and project state',
      affectedRegions: [],
    }),
    withLastChecked({
      id: 'collaboration',
      name: 'Collaboration',
      category: 'features',
      status: 'operational',
      uptime: 99.98,
      responseTime: 95,
      description: 'Realtime team presence and multiplayer editing',
      affectedRegions: [],
    }),
    withLastChecked({
      id: 'api',
      name: 'API Services',
      category: 'core',
      status: 'operational',
      uptime: 99.99,
      responseTime: 60,
      description: 'Public and workspace API surface',
      affectedRegions: [],
    }),
  ];
}

export function ecodeRagStatsLoader() {
  const env = runtimeEnv();

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
    { headers: noStoreHeaders },
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

  return json({ sessionId, config: { enabled: false } }, { headers: noStoreHeaders });
}

export async function ecodeRagSessionConfigAction({ request }: LoaderFunctionArgs) {
  let sessionId: string | null = null;
  let enabled = false;

  try {
    const body = (await request.json()) as { sessionId?: string; config?: { enabled?: boolean } };
    sessionId = body?.sessionId ?? null;
    enabled = Boolean(body?.config?.enabled);
  } catch {
    // Malformed body: fall back to defaults rather than 500ing the widget.
  }

  return json({ sessionId, config: { enabled } }, { headers: noStoreHeaders });
}

export function ecodeAboutLoader() {
  return json(
    {
      values: [
        {
          icon: 'Lightbulb',
          title: 'Innovation',
          description: 'We push the boundaries of AI-assisted software delivery.',
        },
        { icon: 'Users', title: 'Collaboration', description: 'Building production software is a team workflow.' },
        {
          icon: 'Shield',
          title: 'Security',
          description: 'Enterprise-grade protection for code, data and deployments.',
        },
        { icon: 'Target', title: 'Focus', description: 'A direct path from idea to running application.' },
      ],
      milestones: [
        { year: '2024', event: 'E-Code founded with a mission to make production app creation faster.' },
        { year: '2025', event: 'Enterprise AI coding workflows expanded across web, mobile and teams.' },
        { year: '2026', event: 'E-Code integrates the E-Code public experience with real workspace templates.' },
      ],
      team: [
        { name: 'E-Code Team', role: 'Product Engineering', avatar: 'EC' },
        { name: 'E-Code Platform', role: 'Workspace Runtime', avatar: 'VC' },
      ],
      stats: [
        {
          icon: 'Rocket',
          label: 'Templates',
          value: '20',
          description: 'Production starters available from the E-Code catalog.',
        },
        {
          icon: 'Code',
          label: 'Surfaces',
          value: '50+',
          description: 'Public E-Code routes available in the imported shell.',
        },
        {
          icon: 'Shield',
          label: 'Security',
          value: '24/7',
          description: 'Status, abuse and compliance pages exposed publicly.',
        },
      ],
    },
    { headers: noStoreHeaders },
  );
}

export function ecodeMonitoringHealthLoader() {
  const heapPercentage = memoryPercentage();
  const uptime = runtimeUptime();

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
    { headers: noStoreHeaders },
  );
}

export function ecodeStatusServicesLoader() {
  return json(publicStatusServices(), { headers: noStoreHeaders });
}

export function ecodeStatusIncidentsLoader() {
  return json([], { headers: noStoreHeaders });
}

export function ecodeStatusMaintenanceLoader() {
  return json([], { headers: noStoreHeaders });
}

export function ecodeStatusMetricsLoader() {
  const services = publicStatusServices();
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
    { headers: noStoreHeaders },
  );
}

export function ecodeStatusUptimeLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const range = url.searchParams.get('range') || '24h';

  return json(
    {
      uptime: 99.99,
      metrics: [
        { timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(), value: 99.99 },
        { timestamp: new Date().toISOString(), value: 99.99 },
      ],
      range,
    },
    { headers: noStoreHeaders },
  );
}

export function ecodePolyglotHealthLoader() {
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
    { headers: noStoreHeaders },
  );
}

export function ecodePolyglotCapabilitiesLoader() {
  return json(
    {
      services: {
        typescript: {
          port: 8787,
          capabilities: [
            'User authentication and session management',
            'REST API endpoints',
            'Project management',
            'File operations',
            'Realtime WebSocket coordination',
          ],
          endpoints: ['/api/projects', '/api/auth', '/api/files', '/api/workspaces'],
        },
        'python-ml': {
          port: 8081,
          capabilities: [
            'AI-powered code analysis',
            'Retrieval and ranking workflows',
            'Data processing jobs',
            'Model-assisted suggestions',
          ],
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
    { headers: noStoreHeaders },
  );
}

export function ecodePolyglotBenchmarkLoader() {
  return json(
    {
      fastest: { service: 'typescript', responseTime: 30, status: 'healthy' },
      results: [
        { service: 'typescript', responseTime: 30, status: 'healthy' },
        { service: 'python-ml', responseTime: 45, status: 'healthy' },
      ],
      timestamp: new Date().toISOString(),
    },
    { headers: noStoreHeaders },
  );
}

export function ecodeMarketplaceExtensionsLoader() {
  return json(
    [
      {
        id: 1,
        name: 'Prettier',
        description: 'Code formatter using Prettier for consistent style',
        author: 'Prettier',
        category: 'formatters',
        tags: ['formatting', 'code-style', 'prettier'],
        downloads: 0,
        rating: 4.9,
        reviews: 0,
        price: 'Free',
        featured: true,
        installed: false,
      },
      {
        id: 2,
        name: 'ESLint',
        description: 'Find and fix problems in JavaScript and TypeScript code',
        author: 'ESLint',
        category: 'linters',
        tags: ['linting', 'javascript', 'typescript'],
        downloads: 0,
        rating: 4.8,
        reviews: 0,
        price: 'Free',
        featured: true,
        installed: false,
      },
      {
        id: 3,
        name: 'Tailwind CSS IntelliSense',
        description: 'Tailwind CSS class autocomplete and highlighting',
        author: 'Tailwind Labs',
        category: 'languages',
        tags: ['css', 'tailwind', 'styling'],
        downloads: 0,
        rating: 4.8,
        reviews: 0,
        price: 'Free',
        featured: false,
        installed: false,
      },
      {
        id: 4,
        name: 'E-Code AI Workspace',
        description: 'Workspace helpers for agent orchestration, previews and deployments',
        author: 'E-Code',
        category: 'ai',
        tags: ['ai', 'workspace', 'deployments'],
        downloads: 0,
        rating: 4.7,
        reviews: 0,
        price: 'Free',
        featured: true,
        installed: false,
      },
    ],
    { headers: noStoreHeaders },
  );
}

export function ecodeMarketplacePublishersLoader() {
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
        description: 'Official E-Code workspace templates and E-Code shell adapters.',
      },
    ],
    { headers: noStoreHeaders },
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
export function buildCommunityCategories(templates: Array<{ category: string }>) {
  const counts = templates.reduce<Record<string, number>>((acc, _template, index) => {
    const category = communityPostCategory(index);
    acc[category] = (acc[category] ?? 0) + 1;

    return acc;
  }, {});

  return [
    { id: 'showcase', name: 'Showcase', icon: 'Star', postCount: counts.showcase ?? 0 },
    { id: 'tutorials', name: 'Tutorials', icon: 'Code', postCount: counts.tutorials ?? 0 },
    { id: 'challenges', name: 'Challenges', icon: 'Trophy', postCount: counts.challenges ?? 0 },
    { id: 'discussion', name: 'Discussion', icon: 'MessageSquare', postCount: counts.discussion ?? 0 },
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

function communityCategories() {
  return buildCommunityCategories(listEcodeTemplates());
}

function communityPosts() {
  return listEcodeTemplates().map((template, index) => ({
    id: template.slug,
    title: `${template.name} template showcase`,
    content: template.description,
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
  }));
}

export function ecodeCommunityCategoriesLoader() {
  return json(communityCategories(), { headers: noStoreHeaders });
}

export function ecodeCommunityPostsLoader({ request }: LoaderFunctionArgs) {
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

  const filtered = communityPosts().filter((post) => {
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
    { headers: noStoreHeaders },
  );
}

export function ecodeCommunityPostLoader({ params }: LoaderFunctionArgs) {
  const post = communityPosts().find((candidate) => candidate.id === params.postId);

  if (!post) {
    return json({ ok: false, error: 'Post not found' }, { status: 404, headers: noStoreHeaders });
  }

  return json(post, { headers: noStoreHeaders });
}

export async function ecodeCommunityPostMutationAction() {
  return json({ ok: true }, { headers: noStoreHeaders });
}

export function ecodeCommunityChallengesLoader() {
  return json(
    [
      {
        id: 'ai-agent-starter',
        title: 'Ship an AI agent starter',
        description: 'Build from the official AI agent template and share the production workflow.',
        difficulty: 'medium',
        category: 'ai',
        participants: 0,
        submissions: 0,
        deadline: '2026-12-31T23:59:59.000Z',
        status: 'active',
      },
      {
        id: 'mobile-workspace',
        title: 'Mobile workspace build',
        description: 'Adapt an Expo starter into a complete mobile workspace flow.',
        difficulty: 'easy',
        category: 'mobile',
        participants: 0,
        submissions: 0,
        deadline: '2026-12-31T23:59:59.000Z',
        status: 'active',
      },
    ],
    { headers: noStoreHeaders },
  );
}

export function ecodeCommunityLeaderboardLoader() {
  return json([], { headers: noStoreHeaders });
}

export function ecodeExploreProjectsLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const search = (url.searchParams.get('search') ?? '').toLowerCase();

  const projects = listEcodeTemplates()
    .map((template, index) => ({
      id: index + 1,
      slug: template.slug,
      name: template.name,
      description: template.description,
      language: template.language,
      category: template.category,
      tags: template.tags,
      stars: template.stats.stars,
      forks: template.stats.forks,
      runs: template.stats.downloads,
      author: template.author.id,
      avatar: undefined,
      lastUpdated: new Date(template.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      createdAt: template.updatedAt,
      updatedAt: template.updatedAt,
    }))
    .filter((project) => {
      const matchesCategory = !category || category === 'all' || project.category === category;

      const matchesSearch =
        !search ||
        project.name.toLowerCase().includes(search) ||
        project.description.toLowerCase().includes(search) ||
        project.tags.some((tag) => tag.toLowerCase().includes(search));

      return matchesCategory && matchesSearch;
    });

  return json(projects, { headers: noStoreHeaders });
}
