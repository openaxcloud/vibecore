import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ECODE_MARKETING_BRAND, publicFooterColumns, publicMarketingMenus, publicNav } from './SaaSLayout';

describe('public marketing brand', () => {
  it('uses the E-Code identity for the shared marketing shell', () => {
    expect(ECODE_MARKETING_BRAND.name).toBe('E-Code');
    expect(ECODE_MARKETING_BRAND.logoSrc).toBe('/assets/logo.svg');
    expect(ECODE_MARKETING_BRAND.faviconSrc).toBe('/favicon.svg');
    expect(publicNav.map((item) => item.label)).toEqual(['Product', 'Solutions', 'Templates', 'Security', 'Pricing']);
  });

  it('keeps marketing navigation mapped to real application routes and anchors', () => {
    const menuTargets = Object.values(publicMarketingMenus)
      .flat()
      .map(([, to]) => to);

    const footerTargets = publicFooterColumns.flatMap((column) => column.links.map(([, to]) => to));

    expect(menuTargets).toContain('/#builder');
    expect(menuTargets).toContain('/contact-sales');
    expect(menuTargets).not.toContain('/ai-agent');

    expect(footerTargets).toContain('/acceptable-use');
    expect(footerTargets).not.toContain('/compare/github-codespaces');
  });

  it('serves the copied E-Code favicon, logo, and manifest icon', () => {
    const publicDir = join(process.cwd(), 'public');
    const favicon = readFileSync(join(publicDir, 'favicon.svg'), 'utf8');
    const faviconIco = readFileSync(join(publicDir, 'favicon.ico'));
    const logo = readFileSync(join(publicDir, 'assets/logo.svg'), 'utf8');

    const manifest = JSON.parse(readFileSync(join(publicDir, 'manifest.webmanifest'), 'utf8')) as {
      name: string;
      icons: Array<{ src: string; sizes: string; type: string }>;
    };

    expect(favicon).toContain('#F26207');
    expect(faviconIco.readUInt16LE(2)).toBe(1);
    expect(faviconIco[6]).toBe(32);
    expect(logo).toContain('E-Code Logo SVG');
    expect(manifest.name).toBe('E-Code.ai');

    expect(manifest.icons).toContainEqual(
      expect.objectContaining({ src: '/icons/ecode-512x512.png', sizes: '512x512', type: 'image/png' }),
    );
  });
});
