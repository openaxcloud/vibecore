import { describe, expect, it } from 'vitest';

import { loader as aboutLoader } from './api.about';
import { loader as authUserLoader } from './api.auth.user';
import { loader as communityCategoriesLoader } from './api.community.categories';
import { loader as communityPostsLoader } from './api.community.posts';
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

function loaderArgs(url: string): Parameters<typeof statusServicesLoader>[0] {
  return {
    context: {},
    params: {},
    request: new Request(url),
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
});
