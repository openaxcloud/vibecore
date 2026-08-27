import type { LoaderFunctionArgs } from 'react-router';
import { describe, expect, it } from 'vitest';

import { loader as aboutLoader } from './api.about';
import { loader as authUserLoader } from './api.auth.user';
import { loader as communityCategoriesLoader } from './api.community.categories';
import { loader as communityChallengesLoader } from './api.community.challenges';
import { loader as communityPostsLoader } from './api.community.posts';
import { loader as communityPostLoader } from './api.community.posts.$postId';
import { loader as exploreProjectsLoader } from './api.explore.projects';
import { loader as marketplaceExtensionsLoader } from './api.marketplace.extensions';
import { loader as marketplacePublishersLoader } from './api.marketplace.publishers';
import { loader as monitoringHealthLoader } from './api.monitoring.health';
import { loader as polyglotCapabilitiesLoader } from './api.polyglot.capabilities';
import { loader as polyglotHealthLoader } from './api.polyglot.health';
import { loader as ragStatsLoader } from './api.rag.stats';
import { loader as statusServicesLoader } from './api.status';
import { loader as statusIncidentsLoader } from './api.status.incidents';
import { loader as statusMetricsLoader } from './api.status.metrics';
import { toResponse } from '~/lib/test/rr7-data';

function loaderArgs(
  url: string,
  options: { headers?: HeadersInit; params?: LoaderFunctionArgs['params'] } = {},
): LoaderFunctionArgs {
  return {
    context: {},
    params: options.params ?? {},
    request: new Request(url, { headers: options.headers }),
  };
}

describe('E-Code public runtime API adapters', () => {
  it('serves public RAG, about and auth-user contracts without requiring a session', async () => {
    const ragStats = (await toResponse(
      await ragStatsLoader(loaderArgs('http://app.e-code.ai/api/rag/stats')),
    ).json()) as {
      isAvailable: boolean;
      providers: Record<string, boolean>;
    };
    const about = (await toResponse(await aboutLoader(loaderArgs('http://app.e-code.ai/api/about'))).json()) as {
      values: unknown[];
      milestones: unknown[];
      team: unknown[];
    };

    const authUser = await toResponse(await authUserLoader(loaderArgs('http://app.e-code.ai/api/auth/user'))).json();

    expect(typeof ragStats.isAvailable).toBe('boolean');
    expect(ragStats.providers).toHaveProperty('openai');
    expect(about.values.length).toBeGreaterThan(0);
    expect(about.milestones.length).toBeGreaterThan(0);
    expect(about.team.length).toBeGreaterThan(0);
    expect(authUser).toBeNull();
  });

  it('serves status and monitoring payloads consumed by the imported E-Code pages', async () => {
    const services = (await toResponse(
      await statusServicesLoader(loaderArgs('http://app.e-code.ai/api/status')),
    ).json()) as Array<{
      name: string;
      status: string;
    }>;
    const incidents = (await toResponse(
      await statusIncidentsLoader(loaderArgs('http://app.e-code.ai/api/status/incidents')),
    ).json()) as unknown[];
    const metrics = (await toResponse(
      await statusMetricsLoader(loaderArgs('http://app.e-code.ai/api/status/metrics')),
    ).json()) as { uptime30d: number; services_operational: number };
    const health = (await toResponse(
      await monitoringHealthLoader(loaderArgs('http://app.e-code.ai/api/monitoring/health')),
    ).json()) as { status: string; metrics: Record<string, unknown> };

    expect(services.some((service) => service.name === 'E-Code Editor')).toBe(true);
    expect(services.every((service) => service.status === 'operational')).toBe(true);
    expect(incidents).toEqual([]);
    expect(metrics.services_operational).toBe(services.length);
    expect(metrics.uptime30d).toBeGreaterThan(99);
    expect(health.status).toMatch(/healthy|degraded/);
    expect(health.metrics).toHaveProperty('system');
  });

  it('serves polyglot health and capability contracts', async () => {
    const health = (await toResponse(
      await polyglotHealthLoader(loaderArgs('http://app.e-code.ai/api/polyglot/health')),
    ).json()) as {
      status: string;
      services: unknown[];
    };
    const capabilities = (await toResponse(
      await polyglotCapabilitiesLoader(loaderArgs('http://app.e-code.ai/api/polyglot/capabilities')),
    ).json()) as { services: Record<string, unknown>; routing: Record<string, string> };

    expect(health.status).toBe('healthy');
    expect(health.services.length).toBeGreaterThan(0);
    expect(capabilities.services).toHaveProperty('typescript');
    expect(capabilities.services).toHaveProperty('python-ml');
    expect(capabilities.routing['file-operations']).toBe('typescript');
  });

  it('serves marketplace, community and explore data for exact E-Code shell pages', async () => {
    const extensions = (await toResponse(
      await marketplaceExtensionsLoader(loaderArgs('http://app.e-code.ai/api/marketplace/extensions')),
    ).json()) as unknown[];
    const publishers = (await toResponse(
      await marketplacePublishersLoader(loaderArgs('http://app.e-code.ai/api/marketplace/publishers')),
    ).json()) as unknown[];
    const communityCategories = (await toResponse(
      await communityCategoriesLoader(loaderArgs('http://app.e-code.ai/api/community/categories')),
    ).json()) as unknown[];
    const communityPosts = (await toResponse(
      await communityPostsLoader(loaderArgs('http://app.e-code.ai/api/community/posts?page=1&pageSize=6')),
    ).json()) as { posts: unknown[]; pagination: { total: number } };
    const exploreProjects = (await toResponse(
      await exploreProjectsLoader(loaderArgs('http://app.e-code.ai/api/explore/projects?sort=trending')),
    ).json()) as unknown[];

    expect(extensions.length).toBeGreaterThan(0);
    expect(publishers.length).toBeGreaterThan(0);
    expect(communityCategories.length).toBeGreaterThan(0);
    expect(communityPosts.posts.length).toBeGreaterThan(0);
    expect(communityPosts.pagination.total).toBeGreaterThan(0);
    expect(exploreProjects.length).toBeGreaterThan(0);
  });

  it('serves every public prose family in French with locale-aware response headers', async () => {
    const frenchHeaders = { 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.5' };

    const statusResponse = toResponse(
      await statusServicesLoader(loaderArgs('https://app.e-code.ai/api/status', { headers: frenchHeaders })),
    );

    const services = (await statusResponse.json()) as Array<{ id: string; name: string; description: string }>;

    const about = (await toResponse(
      await aboutLoader(loaderArgs('https://app.e-code.ai/api/about', { headers: frenchHeaders })),
    ).json()) as {
      values: Array<{ icon: string; title: string; description: string }>;
      milestones: Array<{ event: string }>;
      team: Array<{ name: string; role: string }>;
      stats: Array<{ label: string; description: string }>;
    };
    const capabilities = (await toResponse(
      await polyglotCapabilitiesLoader(
        loaderArgs('https://app.e-code.ai/api/polyglot/capabilities', { headers: frenchHeaders }),
      ),
    ).json()) as { services: { typescript: { capabilities: string[] } } };
    const extensions = (await toResponse(
      await marketplaceExtensionsLoader(
        loaderArgs('https://app.e-code.ai/api/marketplace/extensions', { headers: frenchHeaders }),
      ),
    ).json()) as Array<{ description: string; price: string }>;
    const publishers = (await toResponse(
      await marketplacePublishersLoader(
        loaderArgs('https://app.e-code.ai/api/marketplace/publishers', { headers: frenchHeaders }),
      ),
    ).json()) as Array<{ description: string }>;
    const categories = (await toResponse(
      await communityCategoriesLoader(
        loaderArgs('https://app.e-code.ai/api/community/categories', { headers: frenchHeaders }),
      ),
    ).json()) as Array<{ id: string; name: string }>;
    const posts = (await toResponse(
      await communityPostsLoader(
        loaderArgs('https://app.e-code.ai/api/community/posts?page=1&pageSize=20', { headers: frenchHeaders }),
      ),
    ).json()) as { posts: Array<{ title: string; content: string }> };
    const challenges = (await toResponse(
      await communityChallengesLoader(
        loaderArgs('https://app.e-code.ai/api/community/challenges', { headers: frenchHeaders }),
      ),
    ).json()) as Array<{ id: string; title: string; description: string }>;
    const projects = (await toResponse(
      await exploreProjectsLoader(loaderArgs('https://app.e-code.ai/api/explore/projects', { headers: frenchHeaders })),
    ).json()) as Array<{ slug: string; name: string; description: string; lastUpdated: string }>;
    const englishProjects = (await toResponse(
      await exploreProjectsLoader(
        loaderArgs('https://app.e-code.ai/api/explore/projects', {
          headers: { Cookie: 'vibecore-lang=en', 'Accept-Language': 'fr-FR' },
        }),
      ),
    ).json()) as Array<{ slug: string; description: string }>;
    const missingPostResponse = toResponse(
      await communityPostLoader(
        loaderArgs('https://app.e-code.ai/api/community/posts/missing', {
          headers: frenchHeaders,
          params: { postId: 'missing' },
        }),
      ),
    );

    expect(statusResponse.headers.get('Content-Language')).toBe('fr');
    expect(statusResponse.headers.get('Cache-Control')).toBe('no-store');
    expect(statusResponse.headers.get('Vary')).toContain('Accept-Language');
    expect(statusResponse.headers.get('Set-Cookie')).toContain('vibecore-auto-lang=fr');
    expect(services.find((service) => service.id === 'editor')).toMatchObject({
      name: 'Éditeur E-Code',
      description: 'Services principaux de l’IDE et d’édition de code',
    });
    expect(about.values.find((value) => value.icon === 'Shield')).toMatchObject({
      title: 'Sécurité',
      description: 'Une protection de niveau entreprise pour le code, les données et les déploiements.',
    });
    expect(about.milestones[0]?.event).toContain('Création d’E-Code');
    expect(about.team[0]).toMatchObject({ name: 'Équipe E-Code', role: 'Ingénierie produit' });
    expect(about.stats[0]?.label).toBe('Modèles');
    expect(capabilities.services.typescript.capabilities).toContain('Gestion des projets');
    expect(extensions[0]).toMatchObject({
      description: 'Formatage du code avec Prettier pour garantir un style cohérent',
      price: 'Gratuit',
    });
    expect(publishers[0]?.description).toContain('Modèles officiels d’espaces de travail E-Code');
    expect(Object.fromEntries(categories.map((category) => [category.id, category.name]))).toMatchObject({
      showcase: 'Réalisations',
      tutorials: 'Tutoriels',
      challenges: 'Défis',
      discussion: 'Discussions',
    });
    expect(posts.posts[0]?.title).toMatch(/^Présentation du modèle /);
    expect(posts.posts[0]?.content).not.toMatch(/\bstarter template\b/i);
    expect(challenges.find((challenge) => challenge.id === 'ai-agent-starter')).toMatchObject({
      title: 'Livrez un starter d’agent IA',
      description: 'Partez du modèle officiel d’agent IA et partagez le workflow de mise en production.',
    });
    expect(projects.find((project) => project.slug === 'landing-page')).toMatchObject({
      name: 'Page de destination',
      description:
        'Starter marketing responsive pour les pages de conversion, avec des sections de contenu soignées et un routage prêt pour la production.',
    });
    expect(projects[0]?.lastUpdated).toContain('juin');
    expect(projects.map((project) => project.slug)).toEqual(englishProjects.map((project) => project.slug));

    for (const project of projects) {
      const englishProject = englishProjects.find((candidate) => candidate.slug === project.slug);

      expect(project.description, project.slug).not.toBe(englishProject?.description);
    }

    expect(missingPostResponse.status).toBe(404);
    await expect(missingPostResponse.json()).resolves.toEqual({ ok: false, error: 'Publication introuvable' });
  });

  it('keeps manual English authoritative and falls back to English for an unsupported public locale', async () => {
    const manualEnglishResponse = toResponse(
      await statusServicesLoader(
        loaderArgs('https://app.e-code.ai/api/status', {
          headers: {
            Cookie: 'vibecore-lang=en; vibecore-auto-lang=fr',
            'Accept-Language': 'fr-FR',
          },
        }),
      ),
    );

    const manualEnglish = (await manualEnglishResponse.json()) as Array<{ id: string; name: string }>;

    const unsupportedResponse = toResponse(await aboutLoader(loaderArgs('https://app.e-code.ai/api/about?lang=es')));

    const unsupported = (await unsupportedResponse.json()) as {
      values: Array<{ icon: string; title: string; description: string }>;
    };

    expect(manualEnglishResponse.headers.get('Content-Language')).toBe('en');
    expect(manualEnglishResponse.headers.get('Set-Cookie')).toBeNull();
    expect(manualEnglish.find((service) => service.id === 'editor')?.name).toBe('E-Code Editor');
    expect(unsupportedResponse.headers.get('Content-Language')).toBe('en');
    expect(unsupported.values.find((value) => value.icon === 'Shield')).toMatchObject({
      title: 'Security',
      description: 'Enterprise-grade protection for code, data and deployments.',
    });
  });
});
