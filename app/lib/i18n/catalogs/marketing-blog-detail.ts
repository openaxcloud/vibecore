import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const marketingBlogDetailEn = {
  'marketingBlog.ui.blog': 'Blog',
  'marketingBlog.ui.overview': 'Overview',
  'marketingBlog.ui.readDocs': 'Read the docs',
  'marketingBlog.ui.backToBlog': 'Back to blog',
  'marketingBlog.ui.by': 'By {author}, {role}',
  'marketingBlog.ui.readTime_one': '{count} min read',
  'marketingBlog.ui.readTime_other': '{count} min read',
  'marketingBlog.post.introducing.title': 'Introducing E-Code AI Agent 2.0',
  'marketingBlog.post.introducing.excerpt':
    'Our most powerful AI coding assistant yet, now with multi-file editing and autonomous debugging capabilities.',
  'marketingBlog.post.introducing.content': `# Introducing E-Code AI Agent 2.0

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
  'marketingBlog.post.introducing.author': 'E-Code Team',
  'marketingBlog.post.introducing.role': 'Product',
  'marketingBlog.post.introducing.category': 'Product',
  'marketingBlog.post.introducing.tags': 'AI|agent|product',
  'marketingBlog.post.scale.title': 'Building at Scale: How We Handle 10M+ Requests',
  'marketingBlog.post.scale.excerpt':
    'A deep dive into our distributed architecture and the lessons we learned scaling E-Code.',
  'marketingBlog.post.scale.content': `# Building at Scale: How We Handle 10M+ Requests

Scaling E-Code means keeping code editing, AI generation, previews, deployments, and collaboration responsive at the same time.

## Architecture

The platform separates real-time workspace traffic, AI job orchestration, static asset delivery, and billing-critical APIs. Each surface has explicit health checks, telemetry, and backpressure.

## Lessons

- Keep interactive paths short
- Cache immutable assets aggressively
- Use queues for long-running work
- Measure latency from the user's point of view`,
  'marketingBlog.post.scale.author': 'Engineering Team',
  'marketingBlog.post.scale.role': 'Platform Engineering',
  'marketingBlog.post.scale.category': 'Engineering',
  'marketingBlog.post.scale.tags': 'architecture|scaling|performance',
  'marketingBlog.post.started.title': 'Getting Started with E-Code in 5 Minutes',
  'marketingBlog.post.started.excerpt': 'A quick tutorial to help you build and deploy your first app using E-Code.',
  'marketingBlog.post.started.content': `# Getting Started with E-Code in 5 Minutes

This guide walks through creating a first project, opening the IDE, asking the AI Agent for a working application, and deploying the result.

## Steps

1. Create a workspace.
2. Describe the app you want to build.
3. Review the generated files and preview.
4. Deploy when the build is ready.

E-Code keeps the editor, terminal, preview, logs, and deployment state in one place so the first project stays easy to reason about.`,
  'marketingBlog.post.started.author': 'Developer Relations',
  'marketingBlog.post.started.role': 'Developer relations',
  'marketingBlog.post.started.category': 'Tutorial',
  'marketingBlog.post.started.tags': 'tutorial|getting-started',
} as const;

export type MarketingBlogDetailKey = keyof typeof marketingBlogDetailEn;
export type MarketingBlogDetailCopy = Readonly<Record<MarketingBlogDetailKey, string>>;

export const marketingBlogDetailFr: MarketingBlogDetailCopy = {
  'marketingBlog.ui.blog': 'Blog',
  'marketingBlog.ui.overview': 'Vue d’ensemble',
  'marketingBlog.ui.readDocs': 'Lire la documentation',
  'marketingBlog.ui.backToBlog': 'Retour au blog',
  'marketingBlog.ui.by': 'Par {author}, {role}',
  'marketingBlog.ui.readTime_one': '{count} min de lecture',
  'marketingBlog.ui.readTime_other': '{count} min de lecture',
  'marketingBlog.post.introducing.title': 'Découvrez l’agent IA E-Code 2.0',
  'marketingBlog.post.introducing.excerpt':
    'Notre assistant de programmation avec l’IA le plus puissant à ce jour, désormais capable de modifier plusieurs fichiers et de déboguer de manière autonome.',
  'marketingBlog.post.introducing.content': `# Découvrez l’agent IA E-Code 2.0

L’agent IA E-Code 2.0 est un ingénieur logiciel autonome destiné aux équipes qui veulent passer de l’idée à la production sans perdre la maîtrise de l’architecture, de la sécurité ni de la qualité.

## Ce qui change

- Planification et modification de plusieurs fichiers dans des applications complètes
- Débogage autonome avec le terminal, l’aperçu et les journaux en contexte
- Génération de structures prêtes pour la production : interface utilisateur, service applicatif, données, authentification et déploiement
- Explications claires pour chaque modification importante

## Conçu pour livrer réellement

L’agent crée des structures de projet complètes, écrit du code typé, installe les dépendances, valide l’aperçu et poursuit ses itérations jusqu’à ce que l’application fonctionne. Les équipes peuvent examiner chaque étape, conserver une piste d’audit et livrer avec le même processus sur ordinateur comme sur mobile.

## Commencer à créer

Ouvrez E-Code, décrivez le produit souhaité et laissez l’agent assembler une première version fonctionnelle. Vous pouvez ensuite affiner le design, ajouter des intégrations et déployer depuis le même espace de travail.`,
  'marketingBlog.post.introducing.author': 'Équipe E-Code',
  'marketingBlog.post.introducing.role': 'Produit',
  'marketingBlog.post.introducing.category': 'Produit',
  'marketingBlog.post.introducing.tags': 'IA|agent|produit',
  'marketingBlog.post.scale.title': 'Changer d’échelle : comment nous gérons plus de 10 millions de requêtes',
  'marketingBlog.post.scale.excerpt':
    'Plongée dans notre architecture distribuée et dans les enseignements tirés de la montée en charge d’E-Code.',
  'marketingBlog.post.scale.content': `# Changer d’échelle : comment nous gérons plus de 10 millions de requêtes

Faire évoluer E-Code exige de maintenir simultanément la réactivité de l’édition de code, de la génération avec l’IA, des aperçus, des déploiements et de la collaboration.

## Architecture

La plateforme sépare le trafic en temps réel des espaces de travail, l’orchestration des tâches d’IA, la livraison des ressources statiques et les API critiques pour la facturation. Chaque surface dispose de contrôles d’intégrité, de télémétrie et de mécanismes de régulation explicites.

## Enseignements

- Garder les parcours interactifs courts
- Mettre en cache de manière intensive les ressources immuables
- Utiliser des files d’attente pour les traitements longs
- Mesurer la latence du point de vue de l’utilisateur`,
  'marketingBlog.post.scale.author': 'Équipe d’ingénierie',
  'marketingBlog.post.scale.role': 'Ingénierie de la plateforme',
  'marketingBlog.post.scale.category': 'Ingénierie',
  'marketingBlog.post.scale.tags': 'architecture|montée en charge|performances',
  'marketingBlog.post.started.title': 'Bien démarrer avec E-Code en 5 minutes',
  'marketingBlog.post.started.excerpt':
    'Un tutoriel rapide pour créer et déployer votre première application avec E-Code.',
  'marketingBlog.post.started.content': `# Bien démarrer avec E-Code en 5 minutes

Ce guide vous accompagne dans la création d’un premier projet, l’ouverture de l’IDE, la demande d’une application fonctionnelle à l’agent IA et le déploiement du résultat.

## Étapes

1. Créez un espace de travail.
2. Décrivez l’application que vous souhaitez créer.
3. Examinez les fichiers générés et l’aperçu.
4. Déployez lorsque la compilation est prête.

E-Code réunit l’éditeur, le terminal, l’aperçu, les journaux et l’état du déploiement afin que votre premier projet reste simple à comprendre.`,
  'marketingBlog.post.started.author': 'Relations développeurs',
  'marketingBlog.post.started.role': 'Relations développeurs',
  'marketingBlog.post.started.category': 'Tutoriel',
  'marketingBlog.post.started.tags': 'tutoriel|prise en main',
};

export type MarketingBlogPostCopy = Readonly<{
  title: string;
  excerpt: string;
  content: string;
  author: string;
  authorRole: string;
  category: string;
  tags: string[];
}>;

const POST_PREFIX_BY_SLUG = {
  'introducing-e-code': 'marketingBlog.post.introducing',
  'building-at-scale-how-we-handle-10m-requests': 'marketingBlog.post.scale',
  'getting-started-with-e-code-in-5-minutes': 'marketingBlog.post.started',
} as const;

export type MarketingBlogPostSlug = keyof typeof POST_PREFIX_BY_SLUG;

/**
 * Published, canonical blog slugs used by client-safe route modules such as
 * the sitemap. Keeping this structural metadata beside the localized copy
 * avoids importing server-only blog data into the browser route graph.
 */
export const MARKETING_BLOG_POST_SLUGS = Object.freeze(Object.keys(POST_PREFIX_BY_SLUG) as MarketingBlogPostSlug[]);

export function getMarketingBlogDetailCopy(language?: string | null): MarketingBlogDetailCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? marketingBlogDetailFr : marketingBlogDetailEn;
}

export function getMarketingBlogPostCopy(slug: string, language?: string | null): MarketingBlogPostCopy | undefined {
  const prefix = POST_PREFIX_BY_SLUG[slug as MarketingBlogPostSlug];

  if (!prefix) {
    return undefined;
  }

  const copy = getMarketingBlogDetailCopy(language);

  const read = (field: 'title' | 'excerpt' | 'content' | 'author' | 'role' | 'category' | 'tags') =>
    copy[`${prefix}.${field}` as MarketingBlogDetailKey];

  return {
    title: read('title'),
    excerpt: read('excerpt'),
    content: read('content'),
    author: read('author'),
    authorRole: read('role'),
    category: read('category'),
    tags: read('tags').split('|'),
  };
}

export function formatMarketingBlogCopy(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/gu, (token, key: string) => values[key] ?? token);
}

export function formatMarketingBlogReadTime(count: number, language?: string | null): string {
  const french = normalizeSupportedLanguage(language) === 'fr';
  const copy = getMarketingBlogDetailCopy(language);
  const plural = new Intl.PluralRules(french ? 'fr-FR' : 'en-GB').select(count) === 'one' ? 'one' : 'other';
  const formatted = new Intl.NumberFormat(french ? 'fr-FR' : 'en-GB').format(count);

  return formatMarketingBlogCopy(copy[`marketingBlog.ui.readTime_${plural}`], { count: formatted });
}
