import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('bounds only short Secrets scrollports above the dock without double-counting its padding', () => {
  const css = readFileSync(join(__dirname, 'index.scss'), 'utf8');
  const start = css.indexOf('/* Secrets short-height scrollport');
  expect(start).toBeGreaterThan(-1);

  const rules = css.slice(start, css.indexOf('/* End Secrets short-height scrollport */', start));
  expect(rules).toContain('@media (max-height: 450px)');
  expect(rules).toContain("html:not([data-vc-clavier='ouvert'])");
  expect(rules).toContain(".bolt-project-service-panel[data-panel='secrets']");
  expect(rules).toContain('height: calc(100% - var(--mobile-nav-height) - env(safe-area-inset-bottom, 0px))');
  expect(rules).toContain('padding-block: 4px !important');
  expect(rules).toContain('scroll-padding-block: 4px');
  expect(rules).not.toMatch(/z-index|display:\s*none|\.bolt-mobile-replit-nav\s*\{/);
});
