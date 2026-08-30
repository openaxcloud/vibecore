import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string): string => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('Solutions responsive composition', () => {
  const css = readSource('app/components/marketing/solutions/solution-sales.css');
  const page = readSource('app/components/marketing/solutions/SolutionSalesPage.tsx');

  it('uses stable tablet and desktop layout thresholds', () => {
    expect(css).not.toContain('@media (min-width: 900px)');
    expect(css).not.toContain('@media (min-width: 960px)');
    expect(css).toContain('@media (min-width: 1024px)');
    expect(css).toContain('@media (min-width: 1120px)');
    expect(css).toContain('width: min(100%, 34rem)');
  });

  it('scales the hero hierarchy for tablet and desktop without shrinking the mobile title', () => {
    expect(css).toContain('font-size: 28px !important');
    expect(css).toContain('font-size: clamp(2rem, 1.45rem + 1.15vw, 2.25rem) !important');
    expect(css).toContain('font-size: clamp(41px, 35px + 0.55vw, 44px) !important');
    expect(css).toContain('font-size: 1.125rem !important');
    expect(css).toContain('.sol-hero__subtitle.sol-hero__subtitle');
    expect(css).toContain('.sol-app-showcase__chrome em');
    expect(css).toContain('font-size: 0.6875rem');
  });

  it('places real-app proof directly after the hero and keeps one preview action per card', () => {
    expect(page.indexOf('<ProofLinkBand')).toBeGreaterThan(page.indexOf('<Hero'));
    expect(page.indexOf('<ProofLinkBand')).toBeLessThan(page.indexOf('<ProblemSection'));
    expect(page).not.toContain('sol-app-showcase__actions');
    expect(page.match(/className="sol-app-showcase__media"/gu)).toHaveLength(1);
  });
});
