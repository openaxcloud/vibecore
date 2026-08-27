import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('canonical chat provider boundary', () => {
  it('disables unreceipted probes and passes the durable latch to initial and continuation streams', () => {
    const source = readFileSync(new URL('./api.chat.ts', import.meta.url), 'utf8');
    const probeSkips = source.match(/skipProviderProbe: true/g) ?? [];
    const startLatches = source.match(/onProviderStart: ensureCanonicalUserSpendStarted/g) ?? [];

    expect(probeSkips).toHaveLength(2);
    expect(startLatches).toHaveLength(7);
    expect(source).not.toContain('await ensureCanonicalUserSpendStarted();\n        providerCallStartedAt');
  });
});
