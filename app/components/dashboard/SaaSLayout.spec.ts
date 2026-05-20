import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ECODE_MARKETING_BRAND,
  publicCompareLinks,
  publicFooterColumns,
  publicMarketingMenus,
  publicNav,
} from './SaaSLayout';
import { ecodeCompatibilityRoutePatterns } from '~/components/marketing/EcodeSurfacePages';

describe('public marketing brand', () => {
  it('uses the E-Code identity for the shared marketing shell', () => {
    expect(ECODE_MARKETING_BRAND.name).toBe('E-Code');
    expect(ECODE_MARKETING_BRAND.logoSrc).toBe('/assets/logo.svg');
    expect(ECODE_MARKETING_BRAND.aiAvatarSrc).toBe('/assets/ai-avatar.svg');
    expect(ECODE_MARKETING_BRAND.faviconSrc).toBe('/favicon.svg');
    expect(publicNav.map((item) => item.label)).toEqual([
      'Product',
      'Platform',
      'Solutions',
      'Resources',
      'Company',
      'Pricing',
      'Teams',
    ]);
  });

  it('keeps marketing navigation mapped to real application routes and anchors', () => {
    const menuTargets = Object.values(publicMarketingMenus)
      .flat()
      .map(([, to]) => to);

    const footerTargets = publicFooterColumns.flatMap((column) => column.links.map(([, to]) => to));

    expect(menuTargets).toContain('/features');
    expect(menuTargets).toContain('/apps');
    expect(menuTargets).toContain('/ai-agent/studio');
    expect(menuTargets).toContain('/github-import');
    expect(menuTargets).toContain('/runtime-diagnostics');
    expect(menuTargets).toContain('/database');
    expect(menuTargets).toContain('/advanced/mobile');
    expect(menuTargets).toContain('/solutions/app-builder');
    expect(menuTargets).toContain('/marketing/teams');
    expect(menuTargets).toContain('/ai');
    expect(menuTargets).toContain('/partners');
    expect(menuTargets).toContain('/marketplace');
    expect(menuTargets).toContain('/community');
    expect(menuTargets).toContain('/explore');
    expect(menuTargets).toContain('/search');
    expect(menuTargets).not.toContain('/ai-agent');

    expect(footerTargets).toContain('/acceptable-use');
    expect(footerTargets).toContain('/apps');
    expect(footerTargets).toContain('/github-import');
    expect(footerTargets).toContain('/runtime-diagnostics');
    expect(footerTargets).toContain('/database');
    expect(footerTargets).toContain('/api-sdk');
    expect(footerTargets).toContain('/performance');
    expect(footerTargets).toContain('/ai-documentation');
    expect(footerTargets).toContain('/subprocessors');
    expect(footerTargets).toContain('/features');
    expect(footerTargets).toContain('/marketplace');
    expect(footerTargets).toContain('/community');
    expect(footerTargets).toContain('/explore');
    expect(publicCompareLinks.map(([, to]) => to)).toContain('/compare/github-codespaces');
    expect(publicCompareLinks.map(([, to]) => to)).not.toContain('/#compare-github-codespaces');
  });

  it('keeps every Platform menu target backed by the imported E-Code surface registry', () => {
    const concreteSurfaceTargets = new Set(ecodeCompatibilityRoutePatterns.filter((target) => !target.includes(':')));

    for (const [, to] of publicMarketingMenus.platform) {
      expect(concreteSurfaceTargets.has(to)).toBe(true);
    }
  });

  it('serves the copied E-Code favicon, logos, comparison assets, partner assets, and manifest icons', () => {
    const publicDir = join(process.cwd(), 'public');
    const favicon = readFileSync(join(publicDir, 'favicon.svg'), 'utf8');
    const faviconIco = readFileSync(join(publicDir, 'favicon.ico'));
    const logo = readFileSync(join(publicDir, 'assets/logo.svg'), 'utf8');
    const aiAvatar = readFileSync(join(publicDir, 'assets/ai-avatar.svg'), 'utf8');
    const compareLogo = readFileSync(join(publicDir, 'assets/compare/github-codespaces.svg'), 'utf8');
    const partnerLogo = readFileSync(join(publicDir, 'partners/openai.svg'), 'utf8');
    const agentWorkingIcon = readFileSync(join(publicDir, 'icons/agent/working.svg'), 'utf8');
    const offlinePage = readFileSync(join(publicDir, 'offline.html'), 'utf8');
    const robots = readFileSync(join(publicDir, 'robots.txt'), 'utf8');

    const manifest = JSON.parse(readFileSync(join(publicDir, 'manifest.webmanifest'), 'utf8')) as {
      name: string;
      icons: Array<{ src: string; sizes: string; type: string }>;
    };
    const jsonManifest = JSON.parse(readFileSync(join(publicDir, 'manifest.json'), 'utf8')) as {
      name: string;
      icons: Array<{ src: string; sizes: string; type: string }>;
    };

    expect(favicon).toContain('#F26207');
    expect(faviconIco.readUInt16LE(2)).toBe(1);
    expect(faviconIco.readUInt16LE(4)).toBeGreaterThanOrEqual(6);
    expect(logo).toContain('E-Code Logo SVG');
    expect(aiAvatar).toContain('E-Code AI Avatar');
    expect(compareLogo).toContain('<svg');
    expect(partnerLogo).toContain('<svg');
    expect(agentWorkingIcon).toContain('<svg');
    expect(offlinePage).toContain('E-Code');
    expect(robots).toContain('Sitemap');
    expect(manifest.name).toBe('E-Code.ai');
    expect(jsonManifest.name).toBe('E-Code.ai');

    expect(manifest.icons).toContainEqual(
      expect.objectContaining({ src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' }),
    );
    expect(manifest.icons).toContainEqual(
      expect.objectContaining({ src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' }),
    );
    expect(jsonManifest.icons).toContainEqual(
      expect.objectContaining({ src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' }),
    );
  });
});
