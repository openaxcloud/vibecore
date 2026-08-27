import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isSamePathnameSearchNavigation, shouldShowGlobalRouteSplash } from './lib/global-route-splash';

const rootSource = readFileSync(join(process.cwd(), 'app/root.tsx'), 'utf8');

function globalRouteLoaderSource() {
  const start = rootSource.indexOf('function GlobalRouteLoader()');
  const end = rootSource.indexOf('\nimport { logStore }', start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return rootSource.slice(start, end);
}

const IDE_PATH = '/projects/proj_123/ide';

describe('global route loader', () => {
  it('is driven only by an actual route navigation', () => {
    const loader = globalRouteLoaderSource();

    expect(rootSource).not.toContain('useFetchers');
    expect(loader).toContain("const loading = navigation.state !== 'idle';");
    expect(loader).not.toContain('fetchers.some');
  });

  it('keeps a stable hidden state for live UI assertions', () => {
    const loader = globalRouteLoaderSource();

    expect(loader).toContain('data-testid="branded-route-loader"');
    expect(loader).toContain('aria-hidden={!fullScreenVisible}');
    expect(loader).toContain("fullScreenVisible ? 'opacity-100' : 'opacity-0'");
  });

  it('lets the local user-area skeleton replace the full-screen splash', () => {
    const loader = globalRouteLoaderSource();

    expect(loader).toContain('shouldShowUserAreaNavigationSkeleton({');
    expect(loader).toContain('const fullScreenVisible = visible && splashAllowed;');
  });

  it('gates the full-screen splash through shouldShowGlobalRouteSplash', () => {
    const loader = globalRouteLoaderSource();

    expect(loader).toContain('const splashAllowed = shouldShowGlobalRouteSplash({');
    expect(loader).toContain('targetPathname: navigation.location?.pathname,');
    expect(loader).toContain('localSkeletonVisible: localUserAreaSkeletonVisible,');
  });
});

describe('isSamePathnameSearchNavigation', () => {
  it('detects an IDE panel switch (same pathname, only ?panel= changes)', () => {
    expect(
      isSamePathnameSearchNavigation({
        currentPathname: IDE_PATH,
        targetPathname: IDE_PATH,
      }),
    ).toBe(true);
  });

  it('ignores a trailing slash difference on the same route', () => {
    expect(
      isSamePathnameSearchNavigation({
        currentPathname: IDE_PATH,
        targetPathname: `${IDE_PATH}/`,
      }),
    ).toBe(true);
  });

  it('is false for a different pathname', () => {
    expect(
      isSamePathnameSearchNavigation({
        currentPathname: IDE_PATH,
        targetPathname: '/projects/proj_123/deployments',
      }),
    ).toBe(false);
  });

  it('is false when no target location is known', () => {
    expect(isSamePathnameSearchNavigation({ currentPathname: IDE_PATH })).toBe(false);
  });
});

describe('shouldShowGlobalRouteSplash', () => {
  it('never shows while navigation is idle', () => {
    expect(
      shouldShowGlobalRouteSplash({
        navigationState: 'idle',
        currentPathname: IDE_PATH,
        targetPathname: undefined,
      }),
    ).toBe(false);
  });

  it('does NOT show for an IDE panel switch (search-param navigation, same pathname)', () => {
    for (const panelPath of [IDE_PATH, `${IDE_PATH}/`]) {
      expect(
        shouldShowGlobalRouteSplash({
          navigationState: 'loading',
          currentPathname: IDE_PATH,
          targetPathname: panelPath,
        }),
      ).toBe(false);
    }
  });

  it('does NOT show for a same-page form submission', () => {
    expect(
      shouldShowGlobalRouteSplash({
        navigationState: 'submitting',
        currentPathname: IDE_PATH,
        targetPathname: IDE_PATH,
      }),
    ).toBe(false);
  });

  it('shows for a real cross-page navigation', () => {
    expect(
      shouldShowGlobalRouteSplash({
        navigationState: 'loading',
        currentPathname: IDE_PATH,
        targetPathname: '/dashboard',
      }),
    ).toBe(true);
  });

  it('shows for a navigation whose target is not yet known', () => {
    expect(
      shouldShowGlobalRouteSplash({
        navigationState: 'loading',
        currentPathname: '/',
        targetPathname: undefined,
      }),
    ).toBe(true);
  });

  it('yields to a local user-area skeleton (BUG-UX-005 / BUG-UX-011)', () => {
    expect(
      shouldShowGlobalRouteSplash({
        navigationState: 'loading',
        currentPathname: '/dashboard',
        targetPathname: '/projects/proj_123/settings',
        localSkeletonVisible: true,
      }),
    ).toBe(false);
  });
});
