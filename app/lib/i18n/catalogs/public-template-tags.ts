/**
 * Display labels for the system-owned template taxonomy.
 *
 * The catalog and URLs keep the stable lowercase IDs. Only presentation and
 * localized search use these labels. Unknown IDs are returned unchanged so a
 * newly added framework never becomes an untranslated i18n key in the UI.
 */
export const publicTemplateTagLabelsEn = {
  'publicTemplateTag.agents': 'Agents',
  'publicTemplateTag.ai': 'AI',
  'publicTemplateTag.android': 'Android',
  'publicTemplateTag.angular': 'Angular',
  'publicTemplateTag.api': 'API',
  'publicTemplateTag.app': 'Application',
  'publicTemplateTag.astro': 'Astro',
  'publicTemplateTag.backend': 'Application backend',
  'publicTemplateTag.blog': 'Blog',
  'publicTemplateTag.dashboard': 'Dashboard',
  'publicTemplateTag.deployments': 'Deployments',
  'publicTemplateTag.expo': 'Expo',
  'publicTemplateTag.fastify': 'Fastify',
  'publicTemplateTag.frontend': 'Frontend',
  'publicTemplateTag.fullstack': 'Full-stack',
  'publicTemplateTag.iphone': 'iPhone',
  'publicTemplateTag.landing-page': 'Landing page',
  'publicTemplateTag.markdown': 'Markdown',
  'publicTemplateTag.marketing': 'Marketing',
  'publicTemplateTag.minimal': 'Minimal',
  'publicTemplateTag.mobile': 'Mobile',
  'publicTemplateTag.mobile-app': 'Mobile application',
  'publicTemplateTag.nextjs': 'Next.js',
  'publicTemplateTag.node': 'Node.js',
  'publicTemplateTag.performance': 'Performance',
  'publicTemplateTag.postgresql': 'PostgreSQL',
  'publicTemplateTag.presentation': 'Presentation',
  'publicTemplateTag.prisma': 'Prisma',
  'publicTemplateTag.qwik': 'Qwik',
  'publicTemplateTag.react': 'React',
  'publicTemplateTag.remix': 'Remix',
  'publicTemplateTag.resumable': 'Resumable',
  'publicTemplateTag.saas': 'SaaS',
  'publicTemplateTag.shadcn': 'shadcn/ui',
  'publicTemplateTag.slidev': 'Slidev',
  'publicTemplateTag.solidjs': 'SolidJS',
  'publicTemplateTag.spa': 'Single-page application',
  'publicTemplateTag.streaming': 'Streaming',
  'publicTemplateTag.svelte': 'Svelte',
  'publicTemplateTag.sveltekit': 'SvelteKit',
  'publicTemplateTag.tailwind': 'Tailwind CSS',
  'publicTemplateTag.tools': 'Tools',
  'publicTemplateTag.typescript': 'TypeScript',
  'publicTemplateTag.vanilla-js': 'Vanilla JavaScript',
  'publicTemplateTag.vite': 'Vite',
  'publicTemplateTag.vue': 'Vue',
  'publicTemplateTag.website': 'Website',
} as const;

export type PublicTemplateTagId = keyof typeof publicTemplateTagLabelsEn extends `publicTemplateTag.${infer TagId}`
  ? TagId
  : never;

export const publicTemplateTagLabelsFr = {
  'publicTemplateTag.agents': 'Agents',
  'publicTemplateTag.ai': 'IA',
  'publicTemplateTag.android': 'Android',
  'publicTemplateTag.angular': 'Angular',
  'publicTemplateTag.api': 'API',
  'publicTemplateTag.app': 'Application',
  'publicTemplateTag.astro': 'Astro',
  'publicTemplateTag.backend': 'Service applicatif',
  'publicTemplateTag.blog': 'Blog',
  'publicTemplateTag.dashboard': 'Tableau de bord',
  'publicTemplateTag.deployments': 'Déploiements',
  'publicTemplateTag.expo': 'Expo',
  'publicTemplateTag.fastify': 'Fastify',
  'publicTemplateTag.frontend': 'Interface utilisateur',
  'publicTemplateTag.fullstack': 'Application complète',
  'publicTemplateTag.iphone': 'iPhone',
  'publicTemplateTag.landing-page': 'Page d’atterrissage',
  'publicTemplateTag.markdown': 'Markdown',
  'publicTemplateTag.marketing': 'Marketing',
  'publicTemplateTag.minimal': 'Minimaliste',
  'publicTemplateTag.mobile': 'Mobile',
  'publicTemplateTag.mobile-app': 'Application mobile',
  'publicTemplateTag.nextjs': 'Next.js',
  'publicTemplateTag.node': 'Node.js',
  'publicTemplateTag.performance': 'Performances',
  'publicTemplateTag.postgresql': 'PostgreSQL',
  'publicTemplateTag.presentation': 'Présentation',
  'publicTemplateTag.prisma': 'Prisma',
  'publicTemplateTag.qwik': 'Qwik',
  'publicTemplateTag.react': 'React',
  'publicTemplateTag.remix': 'Remix',
  'publicTemplateTag.resumable': 'Reprise instantanée',
  'publicTemplateTag.saas': 'SaaS',
  'publicTemplateTag.shadcn': 'shadcn/ui',
  'publicTemplateTag.slidev': 'Slidev',
  'publicTemplateTag.solidjs': 'SolidJS',
  'publicTemplateTag.spa': 'Application monopage',
  'publicTemplateTag.streaming': 'Diffusion en continu',
  'publicTemplateTag.svelte': 'Svelte',
  'publicTemplateTag.sveltekit': 'SvelteKit',
  'publicTemplateTag.tailwind': 'Tailwind CSS',
  'publicTemplateTag.tools': 'Outils',
  'publicTemplateTag.typescript': 'TypeScript',
  'publicTemplateTag.vanilla-js': 'JavaScript natif',
  'publicTemplateTag.vite': 'Vite',
  'publicTemplateTag.vue': 'Vue',
  'publicTemplateTag.website': 'Site web',
} as const satisfies Record<keyof typeof publicTemplateTagLabelsEn, string>;

function isFrench(language?: string | null): boolean {
  return language?.trim().toLowerCase().startsWith('fr') ?? false;
}

function isKnownTagKey(key: string): key is keyof typeof publicTemplateTagLabelsEn {
  return Object.prototype.hasOwnProperty.call(publicTemplateTagLabelsEn, key);
}

export function getPublicTemplateTagLabel(tag: string, language?: string | null): string {
  const normalizedTag = tag.trim().toLowerCase();
  const key = `publicTemplateTag.${normalizedTag}`;

  if (!isKnownTagKey(key)) {
    return tag;
  }

  return isFrench(language) ? publicTemplateTagLabelsFr[key] : publicTemplateTagLabelsEn[key];
}
