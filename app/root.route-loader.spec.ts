import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const rootSource = readFileSync(join(process.cwd(), 'app/root.tsx'), 'utf8');

function globalRouteLoaderSource() {
  const start = rootSource.indexOf('function GlobalRouteLoader()');
  const end = rootSource.indexOf('\nimport { logStore }', start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return rootSource.slice(start, end);
}

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
    expect(loader).toContain('const fullScreenVisible = visible && !localUserAreaSkeletonVisible;');
  });
});
