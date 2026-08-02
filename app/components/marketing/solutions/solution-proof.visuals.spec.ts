import { describe, expect, it } from 'vitest';

import {
  getSolutionProofVisuals,
  SOLUTION_PROOF_VISUAL_ASSETS,
  SOLUTION_PROOF_VISUAL_SLUGS,
} from './solution-proof.visuals';

const LANGUAGES = ['en', 'fr'] as const;

describe('solution-specific IDE proof visual registry', () => {
  it('registers both localized captures for every declined solution', () => {
    expect(Object.keys(SOLUTION_PROOF_VISUAL_ASSETS)).toEqual([...SOLUTION_PROOF_VISUAL_SLUGS]);

    for (const slug of SOLUTION_PROOF_VISUAL_SLUGS) {
      for (const language of LANGUAGES) {
        const assets = getSolutionProofVisuals(slug, language);

        expect(assets.preview).toEqual({
          src: `/assets/solutions/${slug}/${language}/ide-agent-preview.png`,
          width: 1440,
          height: 900,
          language,
          slug,
        });
        expect(assets.iteration).toEqual({
          src: `/assets/solutions/${slug}/${language}/ide-agent-iteration.png`,
          width: 1440,
          height: 900,
          language,
          slug,
        });
      }
    }
  });

  it('never falls back to the App Builder salon assets', () => {
    const sources = SOLUTION_PROOF_VISUAL_SLUGS.flatMap((slug) =>
      LANGUAGES.flatMap((language) => {
        const assets = getSolutionProofVisuals(slug, language);

        return [assets.preview.src, assets.iteration.src];
      }),
    );

    expect(sources).toHaveLength(32);
    expect(new Set(sources).size).toBe(32);
    expect(sources.every((source) => !source.startsWith('/assets/solutions/app-builder/'))).toBe(true);
  });

  it('uses English visuals as the explicit fallback outside French', () => {
    expect(getSolutionProofVisuals('website-builder', 'es')).toBe(SOLUTION_PROOF_VISUAL_ASSETS['website-builder'].en);
    expect(getSolutionProofVisuals('enterprise', 'ar')).toBe(SOLUTION_PROOF_VISUAL_ASSETS.enterprise.en);
  });
});
