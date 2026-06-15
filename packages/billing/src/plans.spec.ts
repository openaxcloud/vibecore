import { describe, expect, it } from 'vitest';

import { planByKey } from './index.js';

describe('plan workspace CPU entitlements', () => {
  it('gives the free plan enough CPU to start a Vite dev server', () => {
    /*
     * 500m throttled Vite's startup (esbuild dependency optimization is a
     * multi-second CPU burst): the workspace-agent on the same container got
     * starved, missed its liveness probe and the pod was SIGTERM-restarted
     * (exit 143) mid dev-server boot, so previews never came up. The free plan
     * must entitle enough CPU for Vite to boot comfortably.
     */
    const free = planByKey('free');
    expect(free.limits['workspace.cpuMillicores']).toBeGreaterThanOrEqual(1000);
  });

  it('keeps paid tiers at least as generous as free', () => {
    const free = planByKey('free').limits['workspace.cpuMillicores'];

    for (const key of ['pro', 'team', 'enterprise'] as const) {
      expect(planByKey(key).limits['workspace.cpuMillicores']).toBeGreaterThanOrEqual(free);
    }
  });
});
