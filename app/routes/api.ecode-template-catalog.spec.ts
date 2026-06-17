import { describe, expect, it } from 'vitest';

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

function loaderArgs(url: string): Parameters<typeof templatesLoader>[0] {
  return {
    context: {},
    params: {},
    request: new Request(url),
  };
}

function actionArgs(url: string, init: RequestInit): Parameters<typeof performanceAction>[0] {
  return {
    context: {},
    params: {},
    request: new Request(url, init),
  };
}

describe('E-Code public template catalog adapter', () => {
  it('maps E-Code starter templates into E-Code template cards', () => {
    const templates = listEcodeTemplates();

    expect(templates.length).toBeGreaterThan(10);
    expect(templates.some((template) => template.name.includes('React'))).toBe(true);
    expect(templates.every((template) => template.author.name === 'E-Code')).toBe(true);
    expect(templates.every((template) => Array.isArray(template.technologies))).toBe(true);
    expect(templates.every((template) => template.stats && typeof template.stats.downloads === 'number')).toBe(true);
  });

  it('filters templates by E-Code simple category aliases and query text', () => {
    const mobileTemplates = listEcodeTemplates({ category: 'mobile' });
    const webAppTemplates = listEcodeTemplates({ category: 'webapp', query: 'vite' });

    expect(mobileTemplates.some((template) => template.tags.includes('expo'))).toBe(true);
    expect(webAppTemplates.length).toBeGreaterThan(0);
    expect(webAppTemplates.every((template) => template.category === 'web')).toBe(true);
  });

  it('returns marketplace pagination metadata when requested', () => {
    const templates = listEcodeTemplates({ sortBy: 'popularity' });
    const page = paginateTemplates(templates, 1, 6);

    expect(page.templates).toHaveLength(6);
    expect(page.total).toBe(templates.length);
    expect(page.hasMore).toBe(true);
  });

  it('derives categories, tags and suggestions from the same source catalog', () => {
    expect(getEcodeTemplateCategories().map((category) => category.slug)).toContain('web');
    expect(getEcodeTemplateTags()).toContain('typescript');
    expect(getEcodeTemplateSuggestions('react')).toEqual(expect.arrayContaining([expect.stringMatching(/react/i)]));
  });
});

describe('E-Code public template API routes', () => {
  it('serves an array for the simple /templates page', async () => {
    const response = await templatesLoader(loaderArgs('http://app.e-code.ai/api/marketplace/templates?q=react'));
    const payload = (await response.json()) as unknown[];

    expect(Array.isArray(payload)).toBe(true);
    expect(payload.length).toBeGreaterThan(0);
  });

  it('serves paginated marketplace data for the marketplace page', async () => {
    const response = await templatesLoader(
      loaderArgs('http://app.e-code.ai/api/marketplace/templates?page=1&sortBy=popularity&maxPrice=100'),
    );

    const payload = (await response.json()) as { page: number; templates: unknown[]; total: number };

    expect(payload.page).toBe(1);
    expect(payload.total).toBeGreaterThan(0);
    expect(payload.templates.length).toBeGreaterThan(0);
  });

  it('serves categories, tags and suggestions endpoints consumed by E-Code components', async () => {
    const categories = (await (
      await categoriesLoader(loaderArgs('http://app.e-code.ai/api/marketplace/categories'))
    ).json()) as unknown[];
    const tags = (await (
      await tagsLoader(loaderArgs('http://app.e-code.ai/api/marketplace/tags?limit=5'))
    ).json()) as unknown[];
    const suggestions = (await (
      await suggestionsLoader(loaderArgs('http://app.e-code.ai/api/templates/suggestions?q=vite&limit=5'))
    ).json()) as { suggestions: string[] };

    expect(categories.length).toBeGreaterThan(0);
    expect(tags.length).toBe(5);
    expect(suggestions.suggestions.length).toBeGreaterThan(0);
  });

  it('serves anonymous shell endpoints without breaking the E-Code header', async () => {
    const me = await (await meLoader(loaderArgs('http://app.e-code.ai/api/me'))).json();

    const notifications = (await (
      await notificationsLoader(loaderArgs('http://app.e-code.ai/api/notifications'))
    ).json()) as unknown[];
    const preferences = (await (
      await notificationPreferencesLoader(loaderArgs('http://app.e-code.ai/api/notifications/preferences'))
    ).json()) as { email: Record<string, boolean>; push: Record<string, boolean>; frequency: string };

    expect(me).toBeNull();
    expect(notifications).toEqual([]);
    expect(preferences.email.deployments).toBe(true);
    expect(preferences.push.security).toBe(true);
    expect(preferences.frequency).toBe('instant');
  });

  it('accepts E-Code performance telemetry posted by the public shell', async () => {
    const response = await performanceAction(
      actionArgs('http://app.e-code.ai/api/monitoring/performance', {
        method: 'POST',
        body: JSON.stringify({ reports: [], sessionId: 'test-session', timestamp: Date.now() }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ accepted: true });
  });
});
