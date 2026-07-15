import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ECODE_MARKETING_BRAND,
  publicCompareLinks,
  publicFooterActionLinks,
  publicFooterColumns,
  publicFooterUtilityLinks,
  publicMarketingMenus,
  publicNav,
  shouldShowUserAreaNavigationSkeleton,
} from './SaaSLayout';
import {
  type CommandPaletteItem,
  clampSelectionIndex,
  filterCommandPaletteItems,
  fuzzyMatches,
  resolveCommandPaletteKey,
} from './command-palette-search';
import { comparePages, marketingCampaignPages, solutionPages } from '~/components/marketing/EcodeMarketingPages';
import { ecodeCompatibilityRoutePatterns } from '~/components/marketing/EcodeSurfacePages';

describe('public marketing brand', () => {
  it('uses the E-Code identity for the shared marketing shell', () => {
    expect(ECODE_MARKETING_BRAND.name).toBe('E-Code');
    expect(ECODE_MARKETING_BRAND.logoSrc).toBe('/assets/logo.svg');
    expect(ECODE_MARKETING_BRAND.aiAvatarSrc).toBe('/assets/ai-avatar.svg');
    expect(ECODE_MARKETING_BRAND.faviconSrc).toBe('/favicon.svg');
    expect(publicNav.map((item) => item.label)).toEqual([
      'Product',
      'Solutions',
      'Resources',
      'Company',
      'Pricing',
      'Teams',
    ]);
  });

  it('keeps authenticated sidebars viewport-bound with a persistent account menu', () => {
    const layoutSource = readFileSync(join(process.cwd(), 'app/components/dashboard/SaaSLayout.tsx'), 'utf8');
    const stylesSource = readFileSync(join(process.cwd(), 'app/styles/index.scss'), 'utf8');
    const sidebarRule = extractCssRule(stylesSource, '.vc-sidebar');
    const drawerRule = extractCssRule(stylesSource, '.vc-sidebar-drawer-panel');
    const drawerScrollRule = extractCssRule(stylesSource, '.vc-sidebar-scroll-region');

    expect(layoutSource).toContain('min-h-0 flex-1 overflow-y-auto overflow-x-visible');
    expect(layoutSource).toContain('className="flex min-h-0 flex-1 overflow-hidden"');
    expect(layoutSource).toContain('<SidebarBody collapsed={false} mobile />');
    expect(layoutSource).toContain("data-testid={mobile ? 'mobile-navigation-scroll-region' : undefined}");
    expect(layoutSource).toContain(
      'vc-sidebar vc-sidebar--desktop relative overflow-visible border-r border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
    );
    expect(layoutSource).not.toContain(
      'vc-sidebar relative hidden overflow-visible border-r border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 lg:block',
    );
    expect(layoutSource).not.toContain('vc-sidebar relative hidden overflow-visible');
    expect(layoutSource).toContain("!embedded && 'shrink-0 border-t border-bolt-elements-borderColor");
    expect(layoutSource).not.toContain('absolute inset-x-0 bottom-0');

    expect(sidebarRule).toContain('position: sticky');
    expect(sidebarRule).not.toContain('display: flex');
    expect(sidebarRule).toContain('height: 100dvh');
    expect(sidebarRule).toContain('max-height: 100dvh');
    expect(stylesSource).toContain('.vc-sidebar--desktop {\n  display: none;');
    expect(stylesSource).toContain('@media (min-width: 1024px) {\n  .vc-sidebar--desktop {\n    display: flex;');

    expect(drawerRule).toContain('height: 100dvh');
    expect(drawerRule).toContain('max-height: 100dvh');
    expect(drawerRule).toContain('overflow: hidden');
    expect(drawerScrollRule).toContain('overscroll-behavior-y: contain');
    expect(drawerScrollRule).toContain('touch-action: pan-y');
    expect(drawerScrollRule).toContain('-webkit-overflow-scrolling: touch');
  });

  it('keeps user-area navigation labelled, tablet-aware and touch accessible', () => {
    const layoutSource = readFileSync(join(process.cwd(), 'app/components/dashboard/SaaSLayout.tsx'), 'utf8');

    const projectMenuSource = readFileSync(join(process.cwd(), 'app/components/dashboard/ProjectCardMenu.tsx'), 'utf8');

    const stylesSource = readFileSync(join(process.cwd(), 'app/styles/index.scss'), 'utf8');

    expect(layoutSource).toContain('<span className="text-xs font-medium sm:sr-only">Menu</span>');
    expect(layoutSource).toContain('min-w-0 flex-1 truncate text-base font-semibold xl:hidden');
    expect(layoutSource).toContain('inline-flex h-[44px] min-w-[44px]');
    expect(layoutSource).toContain('vc-sidebar-header group relative flex h-[56px]');
    expect(layoutSource).toContain('relative inline-flex h-[44px] w-[44px]');
    expect(layoutSource).toContain("collapsed ? 'h-[44px] w-[44px] justify-center px-0'");
    expect(layoutSource).toContain('overflow-y-auto overflow-x-visible px-3 py-2');
    expect(layoutSource).toContain("classNames('grid w-full gap-0'");
    expect(layoutSource).toContain("{ label: 'Account', to: '/account-settings', icon: Settings, end: true }");
    expect(layoutSource).toContain('end={item.end}');
    expect(layoutSource).toContain('px-3 pb-0.5 text-[10px]');
    expect(layoutSource).not.toContain("classNames('grid w-full gap-1', collapsed");
    expect(layoutSource).toContain('vc-user-area-shell min-h-[100dvh]');
    expect(layoutSource).toContain('vc-app-shell-title text-[28px] font-semibold leading-[36px]');
    expect(layoutSource).toContain('repeat(auto-fit, minmax(min(100%, 19rem), 1fr))');
    expect(layoutSource).toContain('max-w-[26rem]');
    expect(layoutSource).toContain('line-clamp-2 min-h-12 text-base leading-6');
    expect(layoutSource).toContain('inline-flex min-h-[44px] w-full items-center justify-between');
    expect(layoutSource).toContain(
      '<span className="block text-[11px] text-bolt-elements-textTertiary">Activity</span>',
    );
    expect(stylesSource).toContain('.vc-user-area-shell .vc-app-shell-title');
    expect(stylesSource).toContain('font-size: 28px !important');
    expect(stylesSource).toContain('.vc-user-area-shell {\n  --vc-ide-bg-app: #111315;');
    expect(stylesSource).toContain('--vc-action-primary: #f97316;');
    expect(stylesSource).toContain(":root[data-theme='light'] .vc-user-area-shell");
    expect(stylesSource).toContain('--vc-action-primary: #c2410c;');
    expect(stylesSource).toContain('--bolt-elements-button-primary-background: var(--vc-action-primary);');
    expect(layoutSource).toContain('hover:bg-bolt-elements-button-primary-backgroundHover');
    expect(layoutSource).toContain('vc-keyboard-shortcut vc-sidebar-shortcut');
    expect(stylesSource).toContain('@media (hover: hover) and (pointer: fine)');
    expect(extractCssRule(stylesSource, '.vc-keyboard-shortcut')).toContain('display: none');
    expect(projectMenuSource).toContain('className="flex h-[44px] w-[44px]');
    expect(projectMenuSource).toContain('className="min-h-[44px]"');
  });

  it('shows a local skeleton only while navigating between non-IDE user-area routes', () => {
    expect(
      shouldShowUserAreaNavigationSkeleton({
        currentPathname: '/dashboard',
        targetPathname: '/api-keys',
        navigationState: 'loading',
      }),
    ).toBe(true);
    expect(
      shouldShowUserAreaNavigationSkeleton({
        currentPathname: '/dashboard',
        targetPathname: '/projects/project-1/ide',
        navigationState: 'loading',
      }),
    ).toBe(false);
    expect(
      shouldShowUserAreaNavigationSkeleton({
        currentPathname: '/billing',
        targetPathname: '/billing',
        navigationState: 'submitting',
      }),
    ).toBe(false);
    expect(
      shouldShowUserAreaNavigationSkeleton({
        currentPathname: '/dashboard',
        targetPathname: '/pricing',
        navigationState: 'loading',
      }),
    ).toBe(false);
  });

  it('keeps the guided tour non-modal, resumable from help, and responsive', () => {
    const layoutSource = readFileSync(join(process.cwd(), 'app/components/dashboard/SaaSLayout.tsx'), 'utf8');
    const stylesSource = readFileSync(join(process.cwd(), 'app/styles/index.scss'), 'utf8');

    expect(layoutSource).toContain('<ProductTour restartToken={tourRestartToken} />');
    expect(layoutSource).toContain('onStartTour={() => setTourRestartToken((current) => current + 1)}');
    expect(layoutSource).toContain('Open guided tour');
    expect(layoutSource).toContain('data-vc-tour-target="navigation"');
    expect(layoutSource).toContain('data-vc-tour-target="create-project"');
    expect(layoutSource).toContain('data-vc-tour-target="help"');
    expect(stylesSource).not.toContain("[data-vc-tour-active='true'] {\n  position: relative;");
    expect(stylesSource).toContain(
      ".vc-user-area-shell .vc-product-tour button[data-vc-button='true'] {\n  min-height: 44px;",
    );
  });

  it('keeps marketing navigation mapped to real application routes and anchors', () => {
    const menuTargets = Object.values(publicMarketingMenus)
      .flat()
      .map(([, to]) => to);

    const footerTargets = publicFooterColumns.flatMap((column) => column.links.map(([, to]) => to));

    expect(Object.keys(publicMarketingMenus)).toEqual(['product', 'solutions', 'resources', 'company']);
    expect(publicMarketingMenus.product.map(([label]) => label)).toEqual([
      'AI Agent',
      'Browser IDE',
      'Multiplayer',
      'Mobile App',
      'Desktop App',
      'AI Platform',
      'Deployments',
      'Bounties',
      'Teams',
    ]);
    expect(menuTargets).toContain('/ai-agent');
    expect(menuTargets).toContain('/ai');
    expect(menuTargets).toContain('/features');
    expect(menuTargets).toContain('/features#multiplayer');
    expect(menuTargets).toContain('/mobile');
    expect(menuTargets).toContain('/desktop');
    expect(menuTargets).toContain('/solutions/app-builder');
    expect(menuTargets).toContain('/solutions/website-builder');
    expect(menuTargets).toContain('/solutions/enterprise');
    expect(menuTargets).toContain('/docs');
    expect(menuTargets).toContain('/ai-documentation');
    expect(menuTargets).toContain('/templates');
    expect(menuTargets).toContain('/case-studies');
    expect(menuTargets).toContain('/help-center');
    expect(menuTargets).toContain('/status');
    expect(menuTargets).toContain('/about');
    expect(menuTargets).toContain('/careers');
    expect(menuTargets).toContain('/press');
    expect(menuTargets).toContain('/contact');
    expect(menuTargets).toContain('/accessibility');
    expect(menuTargets).toContain('/marketing/deployments');
    expect(menuTargets).toContain('/marketing/bounties');
    expect(menuTargets).toContain('/marketing/teams');
    expect(menuTargets).toContain('/partners');
    expect(menuTargets).toContain('/community');
    expect(menuTargets).not.toContain('/product');
    expect(menuTargets).not.toContain('/apps');

    expect(publicFooterColumns.map((column) => column.title)).toEqual(['Product', 'Resources', 'Company', 'Legal']);
    expect(footerTargets).toContain('/ai-agent');
    expect(footerTargets).toContain('/ai');
    expect(footerTargets).toContain('/features');
    expect(footerTargets).toContain('/features#multiplayer');
    expect(footerTargets).toContain('/mobile');
    expect(footerTargets).toContain('/marketing/teams');
    expect(footerTargets).toContain('/marketing/deployments');
    expect(footerTargets).toContain('/marketing/bounties');
    expect(footerTargets).toContain('/docs');
    expect(footerTargets).toContain('/blog');
    expect(footerTargets).toContain('/templates/languages');
    expect(footerTargets).toContain('/forum');
    expect(footerTargets).toContain('/about');
    expect(footerTargets).toContain('/careers');
    expect(footerTargets).toContain('/contact-sales');
    expect(footerTargets).toContain('/terms');
    expect(footerTargets).toContain('/privacy');
    expect(footerTargets).toContain('/subprocessors');
    expect(footerTargets).toContain('/dpa');
    expect(footerTargets).toContain('/student-dpa');
    expect(footerTargets).toContain('/security');
    expect(footerTargets).toContain('/report-abuse');
    expect(publicCompareLinks.map(([, to]) => to)).toContain('/compare/github-codespaces');
    expect(publicCompareLinks.map(([, to]) => to)).not.toContain('/#compare-github-codespaces');
  });

  it('keeps E-Code surface routes available after the public menu import', () => {
    const concreteSurfaceTargets = new Set(ecodeCompatibilityRoutePatterns.filter((target) => !target.includes(':')));

    expect(concreteSurfaceTargets).toContain('/apps');
    expect(concreteSurfaceTargets).toContain('/runtime-diagnostics');
    expect(concreteSurfaceTargets).toContain('/database');
    expect(concreteSurfaceTargets).toContain('/advanced/mobile');
  });

  it('keeps every public header, menu, footer, and comparison link routable to a concrete page', () => {
    const routePatterns = collectConcretePublicRoutePatterns();
    const publicTargets = collectPublicNavigationTargets();

    const missingTargets = [...new Set(publicTargets)]
      .map(normalizeInternalTarget)
      .filter((target): target is string => Boolean(target))
      .filter((target) => {
        return !routePatterns.some((pattern) => routeMatches(pattern, target));
      });

    expect(missingTargets).toEqual([]);
  });

  it('serves the copied E-Code favicon, logos, comparison assets, partner assets, mobile links, and manifest icons', () => {
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

    const appleAssociation = JSON.parse(
      readFileSync(join(publicDir, '.well-known/apple-app-site-association'), 'utf8'),
    ) as {
      applinks: { details: Array<{ appIDs: string[]; components: Array<{ '/': string; comment: string }> }> };
    };
    const androidAssetLinks = JSON.parse(
      readFileSync(join(publicDir, '.well-known/assetlinks.json'), 'utf8'),
    ) as Array<{
      relation: string[];
      target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
    }>;

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
    expect(appleAssociation.applinks.details[0]).toEqual(
      expect.objectContaining({
        appIDs: [],
        components: expect.arrayContaining([
          expect.objectContaining({ '/': '/projects/*' }),
          expect.objectContaining({ '/': '/invitations/*' }),
        ]),
      }),
    );
    expect(androidAssetLinks[0]).toEqual(
      expect.objectContaining({
        relation: expect.arrayContaining(['delegate_permission/common.handle_all_urls']),
        target: expect.objectContaining({
          namespace: 'android_app',
          package_name: 'app.vibecore.mobile',
          sha256_cert_fingerprints: [],
        }),
      }),
    );
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

    expectBrokenSourceMediaIsNotShipped(publicDir);
  });
});

describe('dashboard command palette search', () => {
  const items: CommandPaletteItem[] = [
    { label: 'Create project', to: '/projects/new', hint: 'Action' },
    { label: 'View usage', to: '/usage', hint: 'Action' },
    { label: 'Invite teammate', to: '/invitations', hint: 'Action' },
    { label: 'My Storefront', to: '/projects/store-1/ide', hint: 'Project' },
  ];

  it('returns all items for an empty query (the palette is not blank on open)', () => {
    expect(filterCommandPaletteItems(items, '')).toEqual(items);
    expect(filterCommandPaletteItems(items, '   ')).toEqual(items);
  });

  it('filters commands by label so typing actually narrows the list', () => {
    const result = filterCommandPaletteItems(items, 'usage');

    expect(result.map((item) => item.to)).toEqual(['/usage']);
  });

  it('matches against the destination path too (e.g. "/invit")', () => {
    expect(filterCommandPaletteItems(items, '/invit').map((item) => item.to)).toEqual(['/invitations']);
  });

  it('fuzzy-matches subsequences and finds real projects', () => {
    expect(fuzzyMatches('My Storefront', 'strfrnt')).toBe(true);
    expect(fuzzyMatches('My Storefront', 'zzz')).toBe(false);
    expect(filterCommandPaletteItems(items, 'store').map((item) => item.label)).toEqual(['My Storefront']);
  });

  it('returns an empty list when nothing matches (so the UI can show an empty hint)', () => {
    expect(filterCommandPaletteItems(items, 'definitely-no-match')).toEqual([]);
  });

  it('wraps the selection index around both ends', () => {
    expect(clampSelectionIndex(0, 3)).toBe(0);
    expect(clampSelectionIndex(3, 3)).toBe(0);
    expect(clampSelectionIndex(-1, 3)).toBe(2);
    expect(clampSelectionIndex(5, 0)).toBe(0);
  });

  it('moves the highlight on arrow keys and reports the event as handled', () => {
    expect(resolveCommandPaletteKey('ArrowDown', 0, items)).toMatchObject({ nextIndex: 1, handled: true });
    expect(resolveCommandPaletteKey('ArrowUp', 0, items)).toMatchObject({ nextIndex: items.length - 1, handled: true });
  });

  it('navigates to the highlighted item on Enter', () => {
    const result = resolveCommandPaletteKey('Enter', 1, items);

    expect(result.handled).toBe(true);
    expect(result.navigateTo).toEqual(items[1]);
  });

  it('does not navigate on Enter when there are no visible items', () => {
    const result = resolveCommandPaletteKey('Enter', 0, []);

    expect(result.handled).toBe(false);
    expect(result.navigateTo).toBeUndefined();
  });

  it('leaves typing characters unhandled so the input keeps its value', () => {
    expect(resolveCommandPaletteKey('a', 0, items).handled).toBe(false);
  });

  it('reports Escape as a close request', () => {
    expect(resolveCommandPaletteKey('Escape', 2, items)).toMatchObject({ close: true, handled: true });
  });
});

function expectBrokenSourceMediaIsNotShipped(publicDir: string) {
  const demoVideoPath = join(publicDir, 'assets/platform-demo.mp4');

  if (existsSync(demoVideoPath)) {
    const demoVideo = readFileSync(demoVideoPath);

    expect(demoVideo.byteLength).toBeGreaterThan(1024);
    expect(demoVideo.subarray(0, 4).toString('binary')).not.toBe('<!--');
  }

  for (const audioName of ['complete.mp3', 'error.mp3']) {
    const audioPath = join(publicDir, `assets/agent-sfx/${audioName}`);

    if (existsSync(audioPath)) {
      expect(statSync(audioPath).size).toBeGreaterThan(0);
    }
  }
}

function collectPublicNavigationTargets(): string[] {
  return [
    ...publicNav.map(({ to }) => to),
    ...Object.values(publicMarketingMenus)
      .flat()
      .map(([, to]) => to),
    ...publicFooterColumns.flatMap((column) => column.links.map(([, to]) => to)),
    ...publicFooterActionLinks.map(([, to]) => to),
    ...publicFooterUtilityLinks.map(({ to }) => to),
    ...publicCompareLinks.map(([, to]) => to),
  ];
}

function collectConcretePublicRoutePatterns(): string[] {
  const staticRoutePatterns = readdirSync(join(process.cwd(), 'app/routes'))
    .flatMap(routeFileToPatterns)
    .filter((pattern) => !pattern.includes(':') && !pattern.includes('*'));

  return [
    ...new Set([
      ...staticRoutePatterns,
      ...ecodeCompatibilityRoutePatterns,
      ...Object.keys(marketingCampaignPages).map((slug) => `/marketing/${slug}`),
      ...Object.keys(solutionPages).map((slug) => `/solutions/${slug}`),
      ...Object.keys(comparePages).map((slug) => `/compare/${slug}`),
    ]),
  ];
}

function extractCssRule(source: string, selector: string) {
  const ruleStart = source.indexOf(`${selector} {`);

  if (ruleStart === -1) {
    throw new Error(`Missing CSS rule for ${selector}`);
  }

  const bodyStart = source.indexOf('{', ruleStart);

  let depth = 0;

  for (let index = bodyStart; index < source.length; index++) {
    if (source[index] === '{') {
      depth++;
    }

    if (source[index] === '}') {
      depth--;

      if (depth === 0) {
        return source.slice(bodyStart + 1, index);
      }
    }
  }

  throw new Error(`Unterminated CSS rule for ${selector}`);
}

function routeFileToPatterns(file: string): string[] {
  if (!/\.(tsx|ts)$/.test(file) || file.startsWith('api.') || file.includes('.spec.')) {
    return [];
  }

  const base = file.replace(/\.(tsx|ts)$/, '');

  if (base === '_index') {
    return ['/'];
  }

  const routeSegments = base
    .split('.')
    .filter((segment) => segment !== '_index')
    .map((segment) => {
      if (segment === '$') {
        return '*';
      }

      if (segment.startsWith('$')) {
        return `:${segment.slice(1)}`;
      }

      /*
       * A TRAILING underscore is the Remix flat-route "opt out of parent layout"
       * marker (e.g. `templates_.languages` → /templates/languages); it is not a
       * literal hyphen, so strip it before mapping the rest.
       */
      return segment.replace(/_$/, '').replace(/_/g, '-');
    });

  return [`/${routeSegments.join('/')}`];
}

function normalizeInternalTarget(to: string): string | undefined {
  if (!to.startsWith('/') || to.startsWith('//')) {
    return undefined;
  }

  return to.split(/[?#]/)[0] || '/';
}

function routeMatches(pattern: string, route: string): boolean {
  if (pattern === route) {
    return true;
  }

  const patternSegments = splitRoute(pattern);
  const routeSegments = splitRoute(route);

  if (patternSegments.length !== routeSegments.length) {
    return false;
  }

  return patternSegments.every((segment, index) => {
    return segment === '*' || segment.startsWith(':') || segment === routeSegments[index];
  });
}

function splitRoute(route: string): string[] {
  return route.replace(/^\//, '').split('/').filter(Boolean);
}
