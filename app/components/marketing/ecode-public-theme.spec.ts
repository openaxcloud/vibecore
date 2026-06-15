import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('E-Code public theme wrappers', () => {
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
    const styles = readFileSync(new URL('../../styles/index.scss', import.meta.url), 'utf8');
    const root = readFileSync(new URL('../../root.tsx', import.meta.url), 'utf8');
    const themeStore = readFileSync(new URL('../../lib/stores/theme.ts', import.meta.url), 'utf8');
    const marketplaceRoute = readFileSync(new URL('../../routes/marketplace.tsx', import.meta.url), 'utf8');
    const exploreRoute = readFileSync(new URL('../../routes/explore.tsx', import.meta.url), 'utf8');
    const searchRoute = readFileSync(new URL('../../routes/search.tsx', import.meta.url), 'utf8');
    const communityPostRoute = readFileSync(new URL('../../routes/community.post.$id.tsx', import.meta.url), 'utf8');

    const staticShell = readFileSync(
      new URL('../../lib/marketing/ecode-static-shell.server.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('data-ecode-static-shell');
    expect(source).toContain("const ECODE_PUBLIC_ROOT_FONT_SIZE = '16px'");
    expect(source).toContain("applyThemeToDocument('light')");
    expect(source).toContain("root.setAttribute('data-ecode-public-chrome', 'homepage')");
    expect(source).toContain("const label = isHomepageDefaultTheme ? 'System' : 'Dark'");
    expect(source).toContain('Mobile Navigation Menu');
    expect(source).toContain('Navigate through E-Code platform sections');
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
    expect(themeStore).toContain("return 'light'");
    expect(marketplaceRoute).toContain('MarketingStaticPage');
    expect(marketplaceRoute).not.toContain('ecodeMarketingShellLoader');
    expect(exploreRoute).toContain('MarketingStaticPage');
    expect(exploreRoute).not.toContain('ecodeMarketingShellLoader');
    expect(searchRoute).toContain('MarketingStaticPage');
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
});
