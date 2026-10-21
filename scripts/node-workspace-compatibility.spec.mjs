import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const root = require('../package.json');
const semver = createRequire(require.resolve('eslint/package.json'))('semver');
const mobile = createRequire(new URL('../apps/mobile/package.json', import.meta.url));
const vitest = createRequire(require.resolve('vitest/package.json'));

describe('declared workspace Node support', () => {
  it('excludes unsupported Node 18, 20 and early 22 releases', () => {
    for (const version of ['18.18.0', '18.20.8', '20.19.0', '22.0.0']) {
      expect(semver.satisfies(version, root.engines.node)).toBe(false);
    }
  });
  it('accepts supported releases that satisfy installed workspace tools', () => {
    const engines = [
      vitest('tinypool/package.json').engines.node,
      mobile('@capacitor/cli/package.json').engines.node,
      mobile('vite/package.json').engines.node,
    ];

    for (const version of ['22.12.0', '24.0.0', process.versions.node]) {
      expect(semver.satisfies(version, root.engines.node)).toBe(true);

      for (const engine of engines) {
        expect(semver.satisfies(version, engine)).toBe(true);
      }
    }
  });
});
