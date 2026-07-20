import { listGalleryDemoAppSummaries, type GalleryDemoAppSummary } from '@vibecore/template-catalog';

/**
 * Compatibility projection for the existing public marketplace/search APIs.
 *
 * The source is the published-app Gallery: these records describe working,
 * previewable applications that can be remixed. They are not framework or
 * language starter templates, and this module owns no second registry.
 */
export interface EcodeTemplateAuthor {
  id: string;
  handle: string;
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
  artifactType: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  featured: boolean;
  githubRepo?: string;
  isOfficial: boolean;
  language: 'javascript' | 'typescript';
  moderationStatus: 'approved';
  price: number;
  previewUrl: string;
  publishedAt: string;
  remixAllowed: boolean;
  remixCount: number;
  stats: EcodeTemplateStats;
  stars: number;
  forks: number;
  tags: string[];
  technologies: string[];
  thumbnailUrl: string;
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

const CATEGORY_LABELS: Record<string, string> = {
  booking: 'Booking',
  'developer-tools': 'Developer Tools',
  'field-service': 'Field Service',
  operations: 'Operations',
  productivity: 'Productivity',
  sales: 'Sales',
};

const PUBLISHED_APP_CATALOG = Object.freeze(listGalleryDemoAppSummaries().map(mapPublishedApp));

export function listEcodeTemplates(options: ListTemplatesOptions = {}) {
  const query = normalize(options.query);
  const category = normalize(options.category);
  const tags = (options.tags ?? []).map(normalize).filter(Boolean);
  const languages = (options.languages ?? []).map(normalize).filter(Boolean);
  const difficulties = (options.difficulty ?? []).map(normalize).filter(Boolean);
  const maxPrice = options.maxPrice;

  let apps = getEcodeTemplateCatalog().filter((app) => {
    if (category && app.category !== category) {
      return false;
    }

    if (query && !appSearchText(app).includes(query)) {
      return false;
    }

    if (options.featured === true && !app.featured) {
      return false;
    }

    if (options.official === true && !app.isOfficial) {
      return false;
    }

    if (options.official === false && app.isOfficial) {
      return false;
    }

    if (difficulties.length > 0 && !difficulties.includes(app.difficulty)) {
      return false;
    }

    if (languages.length > 0 && !languages.includes(app.language)) {
      return false;
    }

    if (tags.length > 0 && !tags.every((tag) => app.tags.map(normalize).includes(tag))) {
      return false;
    }

    if (typeof maxPrice === 'number' && app.price > maxPrice) {
      return false;
    }

    return true;
  });

  apps = sortApps(apps, options.sortBy);

  return apps;
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

  for (const app of getEcodeTemplateCatalog()) {
    counts.set(app.category, (counts.get(app.category) ?? 0) + 1);
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

  for (const app of getEcodeTemplateCatalog()) {
    for (const tag of app.tags) {
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

  for (const app of getEcodeTemplateCatalog()) {
    values.add(app.name);
    values.add(app.artifactType);
    app.technologies.forEach((technology) => values.add(technology));
    app.tags.forEach((tag) => values.add(tag));
  }

  return [...values]
    .filter((value) => !normalizedQuery || normalize(value).includes(normalizedQuery))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, limit);
}

export function getEcodeTemplateById(templateId: string) {
  const normalizedId = normalize(templateId);

  return getEcodeTemplateCatalog().find(
    (app) => normalize(app.id) === normalizedId || normalize(app.slug) === normalizedId,
  );
}

export function getEcodeTemplateCatalog(): EcodeTemplate[] {
  return PUBLISHED_APP_CATALOG.map(cloneApp);
}

function mapPublishedApp(app: GalleryDemoAppSummary): EcodeTemplate {
  const stats: EcodeTemplateStats = {
    downloads: app.remixCount,
    forks: app.remixCount,
    rating: 0,
    reviewCount: 0,
    stars: 0,
  };

  const language = app.technologies.includes('JavaScript') ? 'javascript' : 'typescript';
  const tags = [app.artifactType, app.category, ...app.technologies.map((technology) => normalize(technology))];

  return {
    id: app.id,
    name: app.name,
    slug: app.slug,
    description: app.description,
    author: {
      id: app.author.id,
      handle: app.author.handle,
      name: app.author.displayName,
      verified: app.author.verified,
    },
    artifactType: app.artifactType,
    category: app.category,
    difficulty: 'intermediate',
    featured: app.featured,
    githubRepo: undefined,
    isOfficial: app.author.verified,
    language,
    moderationStatus: app.moderationStatus,
    price: 0,
    previewUrl: app.previewUrl,
    publishedAt: app.publishedAt,
    remixAllowed: app.remixAllowed,
    remixCount: app.remixCount,
    stats,
    stars: stats.stars,
    forks: stats.forks,
    tags,
    technologies: [...app.technologies],
    thumbnailUrl: app.thumbnailUrl,
    trending: app.featured,
    updatedAt: app.publishedAt,
    users: app.remixCount,
  };
}

function cloneApp(app: EcodeTemplate): EcodeTemplate {
  return {
    ...app,
    author: { ...app.author },
    stats: { ...app.stats },
    tags: [...app.tags],
    technologies: [...app.technologies],
  };
}

function sortApps(apps: EcodeTemplate[], sortBy?: string | null) {
  const normalizedSort = normalize(sortBy);
  const sorted = [...apps];

  if (normalizedSort === 'recent') {
    return sorted.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.name.localeCompare(b.name));
  }

  if (['trending', 'popularity', 'remixes'].includes(normalizedSort)) {
    return sorted.sort((a, b) => b.remixCount - a.remixCount || b.publishedAt.localeCompare(a.publishedAt));
  }

  if (normalizedSort === 'rating') {
    return sorted.sort((a, b) => b.stats.rating - a.stats.rating || a.name.localeCompare(b.name));
  }

  return sorted.sort(
    (a, b) =>
      Number(b.featured) - Number(a.featured) ||
      b.remixCount - a.remixCount ||
      b.publishedAt.localeCompare(a.publishedAt),
  );
}

function appSearchText(app: EcodeTemplate) {
  return normalize(
    [app.name, app.description, app.artifactType, app.category, ...app.tags, ...app.technologies].join(' '),
  );
}

function normalize(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
