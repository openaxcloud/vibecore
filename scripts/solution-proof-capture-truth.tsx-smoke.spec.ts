import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('prompt viewport proof tsx smoke', () => {
  it('executes the real tsx-compiled helper inside Chromium', () => {
    const output = execFileSync(
      resolve(process.cwd(), 'node_modules/.bin/tsx'),
      [resolve(process.cwd(), 'scripts/solution-proof-capture-truth.tsx-smoke.ts')],
      {
        encoding: 'utf8',
        env: process.env,
        timeout: 30_000,
      },
    );

    expect(output).toContain('tsx prompt viewport smoke passed');
  });
});
