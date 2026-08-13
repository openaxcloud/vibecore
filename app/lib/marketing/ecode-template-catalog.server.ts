import { STARTER_TEMPLATES } from '~/utils/constants';

type StarterTemplate = (typeof STARTER_TEMPLATES)[number];

export interface EcodeTemplateAuthor {
  id: string;
  name: string;
  verified: boolean;
}

export interface EcodeTemplateStats {
  downloads: number;
  forks: number;
  rating: number;
  reviewCount: number;
  stars: number;
}

export interface EcodeTemplate {
  id: string;
  name: string;
  slug: string;
  description: string;
  author: EcodeTemplateAuthor;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  featured: boolean;
  framework?: string;
  githubRepo?: string;
  isOfficial: boolean;
  language: string;
  price: number;
  stats: EcodeTemplateStats;
  stars: number;
  forks: number;
  tags: string[];
  technologies: string[];
  trending: boolean;
  updatedAt: string;
  users: number;
}

export interface EcodeTemplateCategory {
  id: string;
  slug: string;
  name: string;
  count: number;
}

export interface ListTemplatesOptions {
  category?: string | null;
  community?: boolean | null;
  difficulty?: string[];
  featured?: boolean | null;
  languages?: string[];
  maxPrice?: number | null;
  official?: boolean | null;
  page?: number;
  pageSize?: number;
  query?: string | null;
  sortBy?: string | null;
  tags?: string[];
}

const AUTHOR: EcodeTemplateAuthor = {
  id: 'vibecore',
  name: 'E-Code',
  verified: true,
};

const UPDATED_AT = '2026-06-09T00:00:00.000Z';

const WORKSPACE_TEMPLATES: Array<{
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: EcodeTemplate['difficulty'];
  tags: string[];
  technologies: string[];
}> = [
  {
    id: 'react-saas',
    name: 'React SaaS',
    description:
      'Production SaaS starter with React, Vite, TypeScript, authenticated dashboard surfaces and deploy-ready structure.',
    category: 'web',
    difficulty: 'intermediate',
    tags: ['react', 'vite', 'typescript', 'saas', 'dashboard'],
    technologies: ['React', 'Vite', 'TypeScript'],
  },
  {
    id: 'next-dashboard',
    name: 'Next dashboard',
    description:
      'Full-stack dashboard starter with Next.js, Prisma, Tailwind CSS and database-backed operational screens.',
    category: 'web',
    difficulty: 'intermediate',
    tags: ['nextjs', 'prisma', 'tailwind', 'dashboard', 'fullstack'],
    technologies: ['Next.js', 'Prisma', 'Tailwind CSS'],
  },
  {
    id: 'fastify-api',
    name: 'Fastify API',
    description:
      'Backend service starter with Node.js, Fastify, PostgreSQL-style persistence boundaries and production API conventions.',
    category: 'api',
    difficulty: 'advanced',
    tags: ['node', 'fastify', 'postgresql', 'api', 'backend'],
    technologies: ['Node.js', 'Fastify', 'PostgreSQL'],
  },
  {
    id: 'ai-agent',
    name: 'AI agent',
    description:
      'Agent runtime starter with tool orchestration, streaming events, provider routing and IDE integration points.',
    category: 'ml-ai',
    difficulty: 'advanced',
    tags: ['ai', 'agents', 'tools', 'streaming', 'typescript'],
    technologies: ['OpenAI', 'Anthropic', 'TypeScript'],
  },
  {
    id: 'landing-page',
    name: 'Landing page',
    description:
      'Responsive marketing starter for conversion pages, polished content sections and production-ready routing.',
    category: 'web',
    difficulty: 'beginner',
    tags: ['remix', 'tailwind', 'marketing', 'landing-page'],
    technologies: ['Remix', 'Tailwind CSS', 'Framer Motion'],
  },
  {
    id: 'mobile-starter',
    name: 'Mobile starter',
    description:
      'Mobile app starter with Expo, React and TypeScript for shared frontend packages and device-first flows.',
    category: 'mobile',
    difficulty: 'intermediate',
    tags: ['expo', 'react', 'typescript', 'mobile'],
    technologies: ['Expo', 'React', 'TypeScript'],
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  api: 'APIs & Backend',
  mobile: 'Mobile',
  'ml-ai': 'AI & ML',
  starter: 'Starter Kits',
  web: 'Web Apps',
};

const SIMPLE_CATEGORY_ALIASES: Record<string, string> = {
  ai: 'ml-ai',
  data: 'ml-ai',
  game: 'web',
  webapp: 'web',
};

export function listEcodeTemplates(options: ListTemplatesOptions = {}) {
  const query = normalize(options.query);
  const category = normalizeCategory(options.category);
  const tags = (options.tags ?? []).map(normalize).filter(Boolean);
  const languages = (options.languages ?? []).map(normalize).filter(Boolean);
  const difficulties = (options.difficulty ?? []).map(normalize).filter(Boolean);
  const maxPrice = options.maxPrice;

  let templates = getEcodeTemplateCatalog().filter((template) => {
    if (category && template.category !== category) {
      return false;
    }

    if (query && !templateSearchText(template).includes(query)) {
      return false;
    }

    if (options.featured === true && !template.featured) {
      return false;
    }

    if (options.official === true && !template.isOfficial) {
      return false;
    }

    if (options.community === true) {
      return false;
    }

    if (difficulties.length > 0 && !difficulties.includes(template.difficulty)) {
      return false;
    }

    if (languages.length > 0 && !languages.includes(template.language)) {
      return false;
    }

    if (tags.length > 0 && !tags.every((tag) => template.tags.map(normalize).includes(tag))) {
      return false;
    }

    if (typeof maxPrice === 'number' && template.price > maxPrice) {
      return false;
    }

    return true;
  });

  templates = sortTemplates(templates, options.sortBy);

  return templates;
}

export function paginateTemplates(
  templates: EcodeTemplate[],
  page = 1,
  pageSize = 12,
): { hasMore: boolean; page: number; pageSize: number; templates: EcodeTemplate[]; total: number } {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 48) : 12;
  const offset = (safePage - 1) * safePageSize;
  const pagedTemplates = templates.slice(offset, offset + safePageSize);

  return {
    hasMore: offset + pagedTemplates.length < templates.length,
    page: safePage,
    pageSize: safePageSize,
    templates: pagedTemplates,
    total: templates.length,
  };
}

export function getEcodeTemplateCategories(): EcodeTemplateCategory[] {
  const counts = new Map<string, number>();

  for (const template of getEcodeTemplateCatalog()) {
    counts.set(template.category, (counts.get(template.category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, count]) => ({
      id: slug,
      slug,
      name: CATEGORY_LABELS[slug] ?? titleCase(slug),
      count,
    }));
}

export function getEcodeTemplateTags(limit = 30): string[] {
  const counts = new Map<string, number>();

  for (const template of getEcodeTemplateCatalog()) {
    for (const tag of template.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}

export function getEcodeTemplateSuggestions(query: string | null, limit = 5): string[] {
  const normalizedQuery = normalize(query);
  const values = new Set<string>();

  for (const template of getEcodeTemplateCatalog()) {
    values.add(template.name);
    template.technologies.forEach((technology) => values.add(technology));
    template.tags.forEach((tag) => values.add(tag));
  }

  return [...values]
    .filter((value) => !normalizedQuery || normalize(value).includes(normalizedQuery))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, limit);
}

export function getEcodeTemplateById(templateId: string) {
  const normalizedId = normalize(templateId);

  return getEcodeTemplateCatalog().find(
    (template) => normalize(template.id) === normalizedId || normalize(template.slug) === normalizedId,
  );
}

export function getEcodeTemplateCatalog(): EcodeTemplate[] {
  const starterTemplates = STARTER_TEMPLATES.map(mapStarterTemplate);
  const workspaceTemplates = WORKSPACE_TEMPLATES.map(mapWorkspaceTemplate);

  return [...workspaceTemplates, ...starterTemplates];
}

function mapWorkspaceTemplate(template: (typeof WORKSPACE_TEMPLATES)[number], index: number): EcodeTemplate {
  return buildTemplate({
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    difficulty: template.difficulty,
    featured: index < 4,
    githubRepo: undefined,
    tags: template.tags,
    technologies: template.technologies,
    trending: index < 2,
  });
}

function mapStarterTemplate(template: StarterTemplate, index: number): EcodeTemplate {
  const tags = [...(template.tags ?? [])].map((tag) => tag.toLowerCase());
  const category = inferCategory(tags);

  return buildTemplate({
    id: slugify(template.name),
    name: template.label || template.name,
    description: template.description,
    category,
    difficulty: inferDifficulty(tags),
    featured: index < 6,
    githubRepo: template.githubRepo,
    tags,
    technologies: inferTechnologies(template),
    trending: ['react', 'nextjs', 'vite', 'expo'].some((tag) => tags.includes(tag)),
  });
}

function buildTemplate(input: {
  category: string;
  description: string;
  difficulty: EcodeTemplate['difficulty'];
  featured: boolean;
  githubRepo?: string;
  id: string;
  name: string;
  tags: string[];
  technologies: string[];
  trending: boolean;
}): EcodeTemplate {
  const slug = slugify(input.id || input.name);
  const normalizedTags = unique(input.tags.map((tag) => tag.toLowerCase()));
  const technologies = unique(input.technologies);
  const stats = emptyStats();

  return {
    id: slug,
    name: input.name,
    slug,
    description: input.description,
    author: AUTHOR,
    category: input.category,
    difficulty: input.difficulty,
    featured: input.featured,
    framework: inferFramework(normalizedTags),
    githubRepo: input.githubRepo,
    isOfficial: true,
    language: inferLanguage(normalizedTags),
    price: 0,
    stats,
    stars: stats.stars,
    forks: stats.forks,
    tags: normalizedTags,
    technologies,
    trending: input.trending,
    updatedAt: UPDATED_AT,
    users: 0,
  };
}

function emptyStats(): EcodeTemplateStats {
  return {
    downloads: 0,
    forks: 0,
    rating: 0,
    reviewCount: 0,
    stars: 0,
  };
}

function inferCategory(tags: string[]) {
  if (tags.some((tag) => ['android', 'expo', 'iphone', 'mobile', 'mobile-app'].includes(tag))) {
    return 'mobile';
  }

  if (tags.some((tag) => ['api', 'backend', 'fastify', 'node'].includes(tag))) {
    return 'api';
  }

  if (tags.some((tag) => ['ai', 'ml'].includes(tag))) {
    return 'ml-ai';
  }

  return 'web';
}

function inferDifficulty(tags: string[]): EcodeTemplate['difficulty'] {
  if (tags.some((tag) => ['fullstack', 'nextjs', 'remix', 'qwik'].includes(tag))) {
    return 'intermediate';
  }

  return 'beginner';
}

function inferFramework(tags: string[]) {
  return tags.find((tag) =>
    [
      'angular',
      'astro',
      'expo',
      'nextjs',
      'qwik',
      'react',
      'remix',
      'solidjs',
      'svelte',
      'sveltekit',
      'vite',
      'vue',
    ].includes(tag),
  );
}

function inferLanguage(tags: string[]) {
  if (tags.includes('python')) {
    return 'python';
  }

  if (tags.includes('java')) {
    return 'java';
  }

  if (tags.includes('typescript') || tags.includes('ts')) {
    return 'typescript';
  }

  return 'javascript';
}

function inferTechnologies(template: StarterTemplate) {
  const technologies = new Set<string>();
  const text = `${template.name} ${template.label} ${(template.tags ?? []).join(' ')}`.toLowerCase();

  const knownTechnologies: Array<[string, string]> = [
    ['angular', 'Angular'],
    ['astro', 'Astro'],
    ['expo', 'Expo'],
    ['nextjs', 'Next.js'],
    ['qwik', 'Qwik'],
    ['react', 'React'],
    ['remix', 'Remix'],
    ['shadcn', 'shadcn/ui'],
    ['solidjs', 'SolidJS'],
    ['svelte', 'SvelteKit'],
    ['tailwind', 'Tailwind CSS'],
    ['typescript', 'TypeScript'],
    ['vite', 'Vite'],
    ['vue', 'Vue.js'],
  ];

  for (const [needle, label] of knownTechnologies) {
    if (text.includes(needle)) {
      technologies.add(label);
    }
  }

  return technologies.size > 0 ? [...technologies] : ['JavaScript'];
}

function sortTemplates(templates: EcodeTemplate[], sortBy?: string | null) {
  const normalizedSort = normalize(sortBy);
  const sorted = [...templates];

  if (normalizedSort === 'recent') {
    return sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
  }

  if (normalizedSort === 'trending') {
    return sorted.sort((a, b) => Number(b.trending) - Number(a.trending) || a.name.localeCompare(b.name));
  }

  if (normalizedSort === 'rating') {
    return sorted.sort((a, b) => b.stats.rating - a.stats.rating || a.name.localeCompare(b.name));
  }

  return sorted.sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name));
}

function templateSearchText(template: EcodeTemplate) {
  return normalize(
    [
      template.name,
      template.description,
      template.category,
      template.language,
      ...template.tags,
      ...template.technologies,
    ].join(' '),
  );
}

function normalizeCategory(category?: string | null) {
  const normalized = normalize(category);

  return SIMPLE_CATEGORY_ALIASES[normalized] ?? normalized;
}

function normalize(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
