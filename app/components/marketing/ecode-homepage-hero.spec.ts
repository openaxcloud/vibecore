import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getMarketingExactProductControlsCopy } from '~/lib/i18n/catalogs/marketing-exact-product-controls';

describe('E-Code homepage hero', () => {
  it('keeps the mobile hero at E-Code scale with an unselected public model picker', () => {
    const landing = readFileSync(new URL('./ecode-exact/pages/LandingOptimized.tsx', import.meta.url), 'utf8');

    const landingControls = readFileSync(
      new URL('./ecode-exact/EcodeExactLandingControls.tsx', import.meta.url),
      'utf8',
    );

    const styles = readFileSync(new URL('../../styles/index.scss', import.meta.url), 'utf8');

    /*
     * Prettier wraps long SCSS selectors across multiple lines with indentation,
     * so collapse runs of whitespace to a single space before matching selector
     * text. This keeps the selector assertions resilient to formatting while
     * still verifying the exact selector tokens are present and contiguous.
     */
    const normalizedStyles = styles.replace(/\s+/g, ' ');

    expect(landing).toContain('variant="outline"');
    expect(landing).toContain('text-[44px] sm:text-6xl lg:text-7xl xl:text-8xl');
    expect(landing).toContain("background: 'linear-gradient(90deg, rgba(242, 98, 7, 0.06), rgba(247, 127, 0, 0.06))'");

    /*
     * The static-shell title-scale rules were broadened to also match the
     * homepage public chrome (commit f549f48e): :is([data-ecode-static-shell],
     * [data-ecode-public-chrome='homepage']).
     */
    expect(normalizedStyles).toContain(
      ":is([data-ecode-static-shell], [data-ecode-public-chrome='homepage']) :where([class~='text-[44px]'])",
    );
    expect(normalizedStyles).toContain(
      ":is([data-ecode-static-shell], [data-ecode-public-chrome='homepage']) :where(h1, h2, h3, h4, h5, h6) :where(span:not([class*='i-']))",
    );
    expect(landingControls).toContain("fetch('/api/models'");
    expect(landingControls).toContain('copy.modelSelector.selectOption');
    expect(landingControls).toContain('copy.modelSelector.preferenceSaved');
    expect(landingControls).toContain('createStaticModelOptions(language)');
    expect(landingControls).not.toContain('Select AI model...');
    expect(landingControls).not.toContain('Model preference saved');
    expect(landingControls).not.toContain('({modelOptions.length} available)');

    const english = getMarketingExactProductControlsCopy('en').exactLandingControls.modelSelector;
    const french = getMarketingExactProductControlsCopy('fr').exactLandingControls.modelSelector;

    expect(english.selectOption).toBe('Select an AI model…');
    expect(french.selectOption).toBe('Sélectionnez un modèle d’IA…');
  });
});
