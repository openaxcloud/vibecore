import { describe, expect, it, vi } from 'vitest';

import { loader as categoriesLoader } from './api.marketplace.categories';
import { loader as tagsLoader } from './api.marketplace.tags';
import { loader as templatesLoader } from './api.marketplace.templates';
import { loader as meLoader } from './api.me';
import { action as performanceAction } from './api.monitoring.performance';
import { loader as notificationsLoader } from './api.notifications';
import { loader as notificationPreferencesLoader } from './api.notifications.preferences';
import { loader as suggestionsLoader } from './api.templates.suggestions';
import {
  getEcodeTemplateCategories,
  getEcodeTemplateSuggestions,
  getEcodeTemplateTags,
  listEcodeTemplates,
  paginateTemplates,
} from '~/lib/marketing/ecode-template-catalog.server';
import { toResponse } from '~/lib/test/rr7-data';

const PUBLISHED_DEMO_APP_IDS = [
  'react-saas',
  'next-dashboard',
  'fastify-api',
  'ai-agent',
  'landing-page',
  'mobile-starter',
] as const;

function loaderArgs(url: string, init?: RequestInit): Parameters<typeof templatesLoader>[0] {
  return {
    context: {},
    params: {},
    request: new Request(url, init),
  };
}

function actionArgs(url: string, init: RequestInit): Parameters<typeof performanceAction>[0] {
  return {
    context: {},
    params: {},
    request: new Request(url, init),
  };
}

describe('E-Code public Gallery catalog adapter', () => {
  it('projects exactly the six working published demo applications', () => {
    const templates = listEcodeTemplates();

    expect(templates).toHaveLength(PUBLISHED_DEMO_APP_IDS.length);
    expect(new Set(templates.map((template) => template.id))).toEqual(new Set(PUBLISHED_DEMO_APP_IDS));
    expect(templates.every((template) => template.slug !== template.id)).toBe(true);
    expect(templates.every((template) => template.author.name === 'E-Code Studio')).toBe(true);
    expect(templates.every((template) => template.author.verified)).toBe(true);
    expect(templates.every((template) => template.isOfficial)).toBe(true);
    expect(templates.every((template) => Array.isArray(template.technologies))).toBe(true);
    expect(templates.every((template) => template.stats.forks === template.remixCount)).toBe(true);
    expect(templates.every((template) => template.remixAllowed)).toBe(true);
    expect(templates.every((template) => template.thumbnailUrl.endsWith('/thumbnail.png'))).toBe(true);
    expect(templates.every((template) => template.previewUrl.endsWith('/preview/'))).toBe(true);
    expect(templates.every((template) => ['javascript', 'typescript'].includes(template.language))).toBe(true);

    const serializedCatalog = JSON.stringify(templates).toLowerCase();
    expect(serializedCatalog).not.toMatch(/python|golang|\brust\b/u);
    expect(serializedCatalog).not.toContain('framework');
  });

  it('filters published applications by business category and use case', () => {
    const salesApps = listEcodeTemplates({ category: 'sales', query: 'crm' });
    const obsoleteFrameworkCategory = listEcodeTemplates({ category: 'frontend' });

    expect(salesApps.map((template) => template.id)).toEqual(['react-saas']);
    expect(salesApps.every((template) => template.category === 'sales')).toBe(true);
    expect(obsoleteFrameworkCategory).toEqual([]);
  });

  it('returns marketplace pagination metadata when requested', () => {
    const templates = listEcodeTemplates({ sortBy: 'remixes' });
    const page = paginateTemplates(templates, 1, 3);

    expect(page.templates).toHaveLength(3);
    expect(page.total).toBe(templates.length);
    expect(page.hasMore).toBe(true);
    expect(page.templates[0].remixCount).toBeGreaterThanOrEqual(page.templates[1].remixCount);
  });

  it('derives categories, tags and suggestions from the same source catalog', () => {
    expect(getEcodeTemplateCategories().map((category) => category.slug)).toEqual([
      'booking',
      'developer-tools',
      'field-service',
      'operations',
      'productivity',
      'sales',
    ]);
    expect(getEcodeTemplateTags()).toContain('business-app');
    expect(getEcodeTemplateSuggestions('react')).toEqual(expect.arrayContaining([expect.stringMatching(/react/i)]));
  });
});

describe('E-Code public Gallery compatibility API routes', () => {
  it('serves published applications with search metadata', async () => {
    const response = toResponse(
      await templatesLoader(loaderArgs('http://app.e-code.ai/api/marketplace/templates?q=booking')),
    );

    const payload = (await response.json()) as Array<{ artifactType: string; previewUrl: string }>;

    expect(Array.isArray(payload)).toBe(true);
    expect(payload.length).toBeGreaterThan(0);
    expect(payload[0].artifactType).toBe('customer-app');
    expect(payload[0].previewUrl).toContain('/gallery-apps/');
  });

  it('serves paginated marketplace data for the marketplace page', async () => {
    const response = toResponse(
      await templatesLoader(
        loaderArgs('http://app.e-code.ai/api/marketplace/templates?page=1&sortBy=popularity&maxPrice=100'),
      ),
    );

    const payload = (await response.json()) as { page: number; templates: unknown[]; total: number };

    expect(payload.page).toBe(1);
    expect(payload.total).toBeGreaterThan(0);
    expect(payload.templates.length).toBeGreaterThan(0);
  });

  it('serves categories, tags and suggestions endpoints consumed by E-Code components', async () => {
    const categories = (await toResponse(
      await categoriesLoader(loaderArgs('http://app.e-code.ai/api/marketplace/categories')),
    ).json()) as unknown[];
    const tags = (await toResponse(
      await tagsLoader(loaderArgs('http://app.e-code.ai/api/marketplace/tags?limit=5')),
    ).json()) as unknown[];
    const suggestions = (await toResponse(
      await suggestionsLoader(loaderArgs('http://app.e-code.ai/api/templates/suggestions?q=vite&limit=5')),
    ).json()) as { suggestions: string[] };

    expect(categories.length).toBeGreaterThan(0);
    expect(tags.length).toBe(5);
    expect(suggestions.suggestions.length).toBeGreaterThan(0);
  });

  it('serves anonymous shell endpoints without breaking the E-Code header', async () => {
    const me = await toResponse(await meLoader(loaderArgs('http://app.e-code.ai/api/me'))).json();

    const notifications = (await toResponse(
      await notificationsLoader(loaderArgs('http://app.e-code.ai/api/notifications')),
    ).json()) as { notifications: unknown[]; unreadCount: number };
    const preferences = (await toResponse(
      await notificationPreferencesLoader(loaderArgs('http://app.e-code.ai/api/notifications/preferences')),
    ).json()) as { email: Record<string, boolean>; push: Record<string, boolean>; frequency: string };

    expect(me).toBeNull();

    /*
     * Anonymous visitors get an empty feed (the loader degrades gracefully rather
     * than crashing the public header) — the feed shape is { notifications, unreadCount }.
     */
    expect(notifications).toEqual({ notifications: [], unreadCount: 0 });
    expect(preferences.email.deployments).toBe(true);
    expect(preferences.push.security).toBe(true);
    expect(preferences.frequency).toBe('instant');
  });

  it('preserves authenticated notification failures for the retryable user-area state', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('API unavailable'));

    try {
      const response = toResponse(
        await notificationsLoader(
          loaderArgs('http://app.e-code.ai/api/notifications', {
            headers: { cookie: 'vc_session=test-session' },
          }),
        ),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        notifications: [],
        unreadCount: 0,
        unavailable: true,
        status: 503,
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('accepts E-Code performance telemetry posted by the public shell', async () => {
    const response = toResponse(
      await performanceAction(
        actionArgs('http://app.e-code.ai/api/monitoring/performance', {
          method: 'POST',
          body: JSON.stringify({ reports: [], sessionId: 'test-session', timestamp: Date.now() }),
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ accepted: true });
  });
});
