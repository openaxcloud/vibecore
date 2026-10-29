import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('allows Secrets header actions to reflow below the title at native browser zoom', () => {
  const stylesheet = readFileSync(join(__dirname, 'index.scss'), 'utf8');
  const header = stylesheet.match(/\.bolt-secrets-header\s*\{([^}]+)\}/)?.[1];

  /*
   * Browser witness: 390 physical pixels at 200% => 195 CSS pixels,
   * panel 163px wide while the single header row overflowed to 249px.
   */
  expect(header).toBeDefined();
  expect(header).toMatch(/flex-wrap:\s*wrap\s*;/);
  expect(header).toMatch(/min-width:\s*0\s*;/);
  expect(header).not.toMatch(/overflow(?:-x)?:\s*(hidden|clip)\s*;/);
});
