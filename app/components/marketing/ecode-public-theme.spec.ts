import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('E-Code public theme wrappers', () => {
  it('uses neutral surfaces, orange actions, and one IBM Plex interface stack outside the IDE', () => {
    const styles = readFileSync(new URL('../../styles/index.scss', import.meta.url), 'utf8');
    const landing = readFileSync(new URL('./ecode-exact/pages/LandingOptimized.tsx', import.meta.url), 'utf8');

    const oauthCallback = readFileSync(
      new URL('../../routes/integrations.oauth.$provider.callback.tsx', import.meta.url),
      'utf8',
    );

    expect(styles).toContain('--ecode-background: #111315;');
    expect(styles).toContain('--ecode-surface: #191c1f;');
    expect(styles).toContain('--marketing-gradient: var(--ecode-background);');
    expect(styles).toContain('.vc-public-shell {\n  --vc-public-bg: #101214;');
    expect(styles).toContain('background: var(--vc-public-accent);');
    expect(styles).toContain('[data-ecode-static-shell] {');
    expect(landing).not.toContain('--ecode-font-sans');
    expect(oauthCallback).not.toContain('system-ui, sans-serif');
    expect(oauthCallback).toContain("fontFamily: 'var(--vc-font-interface)'");
  });

  it('renders shared marketing pages with the exact E-Code theme tokens instead of legacy vc wrappers', () => {
    const source = readFileSync(new URL('./EcodeMarketingPages.tsx', import.meta.url), 'utf8');

    expect(source).toContain('data-ecode-marketing-page');
    expect(source).toContain('bg-[var(--ecode-background)]');
    expect(source).toContain('marketing-gradient');
    expect(source).toContain('container-responsive');
    expect(source).not.toContain('vc-marketing-page');
    expect(source).not.toContain('vc-marketing-page-hero');
  });

  it('renders compatibility surface pages with the same E-Code public shell tokens', () => {
    const source = readFileSync(new URL('./EcodeSurfacePages.tsx', import.meta.url), 'utf8');

    expect(source).toContain('data-ecode-surface-page');
    expect(source).toContain('bg-[var(--ecode-background)]');
    expect(source).toContain('marketing-gradient');
    expect(source).toContain('container-responsive');
    expect(source).not.toContain('vc-surface-page');
    expect(source).not.toContain('vc-surface-hero');
  });

  it('pins public marketing chrome to the homepage header theme and Tailwind scale', () => {
    const source = readFileSync(new URL('./ecode-exact/EcodeExactShell.tsx', import.meta.url), 'utf8');
    const shellCopy = readFileSync(new URL('./ecode-exact/marketing-shell.copy.ts', import.meta.url), 'utf8');
    const styles = readFileSync(new URL('../../styles/index.scss', import.meta.url), 'utf8');
    const root = readFileSync(new URL('../../root.tsx', import.meta.url), 'utf8');
    const themeStore = readFileSync(new URL('../../lib/stores/theme.ts', import.meta.url), 'utf8');
    const marketplaceRoute = readFileSync(new URL('../../routes/marketplace._index.tsx', import.meta.url), 'utf8');
    const exploreRoute = readFileSync(new URL('../../routes/explore.tsx', import.meta.url), 'utf8');
    const searchRoute = readFileSync(new URL('../../routes/search.tsx', import.meta.url), 'utf8');
    const communityPostRoute = readFileSync(new URL('../../routes/community.post.$id.tsx', import.meta.url), 'utf8');

    const staticShell = readFileSync(
      new URL('../../lib/marketing/ecode-static-shell.server.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('data-ecode-static-shell');
    expect(source).toContain("const ECODE_PUBLIC_ROOT_FONT_SIZE = '16px'");

    /*
     * Public chrome applies the RESOLVED theme (homepage default is light, but a
     * visitor's persisted dark choice is respected across SPA navigation) rather
     * than force-resetting to light on every route.
     */
    expect(source).toContain('applyThemeToDocument(chromeTheme)');
    expect(source).toContain("root.setAttribute('data-ecode-public-chrome', 'homepage')");

    /*
     * The toggle's icon+label now derive from the tested getThemeSwitcherPresentation
     * helper (reflects the real active theme: Sun/Light, Moon/Dark) instead of the
     * old inline 'System'/'Dark' string.
     */
    expect(source).toContain('getThemeSwitcherPresentation(theme, copy.theme)');
    expect(source).toContain('{copy.a11y.mobileMenuTitle}');
    expect(source).toContain('{copy.a11y.mobileMenuDescription}');
    expect(shellCopy).toContain("mobileMenuTitle: 'Mobile navigation menu'");
    expect(shellCopy).toContain("mobileMenuDescription: 'Navigate through E-Code platform sections'");
    expect(source).toContain('h-dvh max-h-dvh flex-col overflow-hidden');
    expect(source).toContain('min-h-0 flex-1');
    expect(source).toContain('pb-[calc(1rem+env(safe-area-inset-bottom,0px))]');
    expect(source).toContain('@radix-ui/react-dialog');
    expect(source).not.toContain('<aside');
    expect(styles).toContain("html[data-ecode-public-chrome='homepage']");
    expect(styles).toContain('html:has([data-ecode-static-shell])');
    expect(styles).toContain("'Helvetica Neue'");
    expect(styles).toContain('font-size: 16px');
    expect(root).toContain('function isEcodePublicMarketingPath(pathname)');
    expect(root).toContain("'/acceptable-use'");
    expect(root).toContain("'/customers'");
    expect(root).toContain("'/marketplace/templates'");
    expect(root).toContain("'/community/'");
    expect(root).toContain("'/u/'");
    expect(root).toContain("root?.setAttribute('data-ecode-public-chrome', 'homepage')");
    expect(root).toContain('clearMarketingPageServiceWorkerState()');
    expect(root).toContain('.getRegistrations()');
    expect(root).toContain('registration.unregister()');
    expect(root).toContain('window.caches.delete(key)');
    expect(themeStore).toContain('export function isPublicMarketingPath(pathname: string)');
    expect(themeStore).toContain("'/acceptable-use'");
    expect(themeStore).toContain("'/customers'");
    expect(themeStore).toContain("'/marketplace/templates'");
    expect(themeStore).toContain("'/community/'");
    expect(themeStore).toContain("'/u/'");

    /*
     * Marketing routes no longer force light: the shared cross-domain cookie
     * (read via resolveInitialTheme) is the single source of truth, so a dark
     * choice carries across e-code.ai, app.e-code.ai and the IDE.
     */
    expect(themeStore).toContain('export function resolveInitialTheme(');
    expect(themeStore).toContain('readThemeCookie()');
    expect(marketplaceRoute).toContain('MarketingStaticPage');
    expect(marketplaceRoute).not.toContain('ecodeMarketingShellLoader');

    // /explore is a real gallery (ExploreMarketingPage → PublicShell), not a static page.
    expect(exploreRoute).toContain('ExploreMarketingPage');
    expect(exploreRoute).not.toContain('ecodeMarketingShellLoader');

    /*
     * /search is a real loader-backed search page (G24), not a static
     * marketing page anymore — but it must still render inside the SPA
     * PublicShell chrome rather than the legacy static-shell loader.
     */
    expect(searchRoute).toContain('PublicShell');
    expect(searchRoute).toContain('data-ecode-marketing-page="search"');
    expect(searchRoute).not.toContain('ecodeMarketingShellLoader');
    expect(communityPostRoute).toContain('MarketingStaticPage');
    expect(communityPostRoute).not.toContain('ecodeMarketingShellLoader');
    expect(staticShell).toContain('vibecore-ecode-mobile-menu-scroll-fix');
    expect(staticShell).toContain('height: 100dvh !important');
    expect(staticShell).toContain('flex: 1 1 0% !important');
    expect(staticShell).toContain('[data-ecode-static-shell] .flex.gap-4.justify-center');
    expect(staticShell).toContain('white-space: normal !important');
    expect(staticShell).toContain('[data-ecode-static-shell] .grid > *');
    expect(staticShell).toContain('overflow-wrap: anywhere !important');
  });

  it('keeps community and templates as public marketing pages with login-gated product actions', () => {
    const resourcePages = readFileSync(new URL('./EcodePublicResourcePages.tsx', import.meta.url), 'utf8');

    const resourceCopy = readFileSync(
      new URL('../../lib/i18n/catalogs/marketing-public-resource.ts', import.meta.url),
      'utf8',
    );

    const communityRoute = readFileSync(new URL('../../routes/community.tsx', import.meta.url), 'utf8');
    const loginRoute = readFileSync(new URL('../../routes/login.tsx', import.meta.url), 'utf8');

    expect(resourcePages).toContain('data-public-resource-page="community"');
    expect(resourcePages).toContain('getMarketingPublicResourceCopy(language).community');
    expect(resourceCopy).toContain('Connect with builders shipping real E-Code projects');
    expect(resourceCopy).toContain('Community feed');
    expect(resourceCopy).toContain('Active challenges');
    expect(resourceCopy).toContain('Top contributors');
    expect(resourcePages).toContain("loginReturnTo('/community')");
    expect(resourcePages).toContain('templateProjectReturnTo(template.slug)');
    expect(resourcePages).not.toContain('Open related template');
    expect(resourcePages).not.toContain('My Apps');
    expect(resourcePages).not.toContain('View Profile');
    expect(resourcePages).not.toContain('Log out');
    expect(communityRoute).toContain('communityPosts');
    expect(communityRoute).toContain('communityChallenges');
    expect(communityRoute).not.toContain('templateSlug');
    expect(loginRoute).toContain("loginUrl.searchParams.set('returnTo', returnTo)");
    expect(loginRoute).toContain("safeReturnTo(requestUrl.searchParams.get('returnTo'))");
  });
});
