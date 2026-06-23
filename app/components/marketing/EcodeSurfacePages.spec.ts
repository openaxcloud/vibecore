import { describe, expect, it } from 'vitest';

import {
  createProjectImportSurfacePage,
  ecodeAdvancedSurfacePages,
  ecodeCompatibilityRoutePatterns,
  ecodeStandaloneSurfacePages,
  ecodeSurfacePages,
  getEcodeAdvancedSurfacePage,
  getEcodeStandaloneSurfacePage,
  getEcodeSurfacePage,
} from './EcodeSurfacePages';

describe('E-Code product surface registry', () => {
  it('covers the remaining imported E-Code route patterns with real pages', () => {
    expect(ecodeCompatibilityRoutePatterns).toEqual(
      expect.arrayContaining([
        '/ai-agent/studio',
        '/github-import',
        '/projects/:id/import/figma',
        '/projects/:id/import/bolt',
        '/projects/:id/import/lovable',
        '/new',
        '/editor/new',
        '/agent-activity',
        '/apps',
        '/teams',
        '/teams/new',
        '/teams/:id',
        '/teams/:id/settings',
        '/vnc',
        '/analytics',
        '/scalability',
        '/education',
        '/api-sdk',
        '/mobile-apps',
        '/advanced/mobile',
        '/advanced/sso',
        '/advanced/collaboration',
        '/advanced/storage',
        '/advanced/community',
        '/profile',
        '/profile/:username',
        '/home',
        '/project/:id',
        '/editor/:id',
        '/runtimes',
        '/runtime-diagnostics',
        '/user/:username',
        '/user/settings',
        '/search-advanced',
        '/secrets',
        '/workflows',
        '/ssh',
        '/security-scanner',
        '/dependencies',
        '/object-storage',
        '/projects/:id/database',
        '/usage-alerts',
        '/projects/:id/preview',
        '/mobile-admin',
        '/account',
        '/cycles',
        '/powerups',
        '/badges',
        '/subscribe',
        '/plans',
        '/learn',
        '/themes',
        '/performance',
        '/sso-configuration',
        '/custom-roles',
        '/assistant',
        '/code-search',
        '/problems',
        '/database',
        '/console',
        '/shell',
        '/packages',
        '/kv-store',
        '/preview',
        '/authentication',
        '/extensions',
        '/integrations',
        '/networking',
        '/threads',
        '/referrals',
        '/solartech-ai-chat',
        '/solartech-crm',
        '/salesforcepro-crm',
        '/solartech-fortune500-store',
      ]),
    );
  });

  it('keeps every registered surface page contentful and navigable', () => {
    const pages = [
      ...Object.values(ecodeSurfacePages),
      ...Object.values(ecodeAdvancedSurfacePages),
      ...Object.values(ecodeStandaloneSurfacePages),
    ];

    expect(pages.length).toBeGreaterThan(60);

    for (const page of pages) {
      expect(page.title.length).toBeGreaterThan(3);
      expect(page.description.length).toBeGreaterThan(60);
      expect(page.highlights.length).toBeGreaterThanOrEqual(4);
      expect(page.sections.length).toBeGreaterThanOrEqual(2);
      expect(page.relatedRoutes.length).toBeGreaterThanOrEqual(3);
      expect(page.primaryAction[1]).toMatch(/^\//);
      expect(page.secondaryAction[1]).toMatch(/^\//);
    }
  });

  it('keeps the legacy import surface on its route without leaking the upstream codename', () => {
    const page = createProjectImportSurfacePage('proj-123', 'bolt');

    // Internal route key is preserved for backwards compatibility.
    expect(page.route).toBe('/projects/proj-123/import/bolt');

    // No upstream codename in any user-facing copy.
    const userFacing = [page.title, page.description, ...page.highlights].join(' ');
    expect(userFacing).not.toMatch(/bolt/i);

    expect(page.title).toBe('Legacy export Project Import');
    expect(page.description).toContain('Legacy export');
  });

  it('looks up root, advanced and standalone route entries safely', () => {
    expect(getEcodeSurfacePage('apps')?.route).toBe('/apps');
    expect(getEcodeSurfacePage('runtime-diagnostics')?.title).toBe('Runtime Diagnostics');
    expect(getEcodeAdvancedSurfacePage('sso')?.route).toBe('/advanced/sso');
    expect(getEcodeStandaloneSurfacePage('ai-agent/studio')?.route).toBe('/ai-agent/studio');
    expect(getEcodeSurfacePage('missing-route')).toBeUndefined();
  });
});
