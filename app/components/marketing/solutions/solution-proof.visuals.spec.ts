import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CHATBOT_BUILDER_COPY } from './chatbot-builder.copy';
import { DASHBOARD_BUILDER_COPY } from './dashboard-builder.copy';
import { ENTERPRISE_COPY } from './enterprise.copy';
import { FREELANCERS_COPY } from './freelancers.copy';
import { GAME_BUILDER_COPY } from './game-builder.copy';
import { INTERNAL_AI_BUILDER_COPY } from './internal-ai-builder.copy';
import type { SolutionCopyByLanguage } from './solution-copy';
import {
  getSolutionProofVisualContent,
  getSolutionProofVisuals,
  SOLUTION_PROOF_VISUAL_ASSETS,
  SOLUTION_PROOF_VISUAL_SLOTS,
  SOLUTION_PROOF_VISUAL_SLUGS,
  type SolutionProofVisualAsset,
  type SolutionProofVisualSlug,
} from './solution-proof.visuals';
import { STARTUPS_COPY } from './startups.copy';
import { WEBSITE_BUILDER_COPY } from './website-builder.copy';

const LANGUAGES = ['en', 'fr'] as const;

const FILENAMES = {
  prompt: 'ide-agent-prompt.png',
  preview: 'ide-agent-preview.png',
  webviewOverview: 'ide-webview-overview.png',
  iteration: 'ide-agent-iteration.png',
  webviewIteration: 'ide-webview-iteration.png',
  files: 'ide-agent-files.png',
} as const;

const COPY = {
  'website-builder': WEBSITE_BUILDER_COPY,
  'game-builder': GAME_BUILDER_COPY,
  'dashboard-builder': DASHBOARD_BUILDER_COPY,
  'chatbot-builder': CHATBOT_BUILDER_COPY,
  'internal-ai-builder': INTERNAL_AI_BUILDER_COPY,
  enterprise: ENTERPRISE_COPY,
  startups: STARTUPS_COPY,
  freelancers: FREELANCERS_COPY,
} as const satisfies Record<SolutionProofVisualSlug, SolutionCopyByLanguage>;

function allAssets(): SolutionProofVisualAsset[] {
  return SOLUTION_PROOF_VISUAL_SLUGS.flatMap((slug) =>
    LANGUAGES.flatMap((language) => {
      const assets = getSolutionProofVisuals(slug, language);

      return SOLUTION_PROOF_VISUAL_SLOTS.map((slot) => assets[slot]);
    }),
  );
}

describe('solution-specific IDE proof visual registry', () => {
  it('registers six localized real-proof captures for every solution', () => {
    expect(Object.keys(SOLUTION_PROOF_VISUAL_ASSETS)).toEqual([...SOLUTION_PROOF_VISUAL_SLUGS]);

    for (const slug of SOLUTION_PROOF_VISUAL_SLUGS) {
      for (const language of LANGUAGES) {
        const assets = getSolutionProofVisuals(slug, language);

        expect(Object.keys(assets)).toEqual([...SOLUTION_PROOF_VISUAL_SLOTS]);

        for (const slot of SOLUTION_PROOF_VISUAL_SLOTS) {
          expect(assets[slot]).toEqual({
            src: `/assets/solutions/${slug}/${language}/${FILENAMES[slot]}`,
            width: 1440,
            height: 900,
            language,
            slug,
            slot,
          });
        }
      }
    }
  });

  it('never reuses an asset path across a slot, language, or solution', () => {
    const sources = allAssets().map((asset) => asset.src);

    expect(sources).toHaveLength(96);
    expect(new Set(sources).size).toBe(96);
    expect(sources.every((source) => !source.startsWith('/assets/solutions/app-builder/'))).toBe(true);
  });

  it('provides non-empty, page-specific captions and alt text for all 96 captures', () => {
    const titles: string[] = [];
    const bodies: string[] = [];
    const alternatives: string[] = [];

    for (const slug of SOLUTION_PROOF_VISUAL_SLUGS) {
      for (const language of LANGUAGES) {
        const content = getSolutionProofVisualContent(COPY[slug][language]);

        expect(Object.keys(content)).toEqual([...SOLUTION_PROOF_VISUAL_SLOTS]);

        for (const slot of SOLUTION_PROOF_VISUAL_SLOTS) {
          expect(content[slot].title.trim().length).toBeGreaterThan(12);
          expect(content[slot].body.trim().length).toBeGreaterThan(30);
          expect(content[slot].alt.trim().length).toBeGreaterThan(20);
          titles.push(content[slot].title);
          bodies.push(content[slot].body);
          alternatives.push(content[slot].alt);
        }
      }
    }

    expect(new Set(titles).size, 'every capture needs its own caption title').toBe(titles.length);
    expect(new Set(bodies).size, 'every capture needs its own caption body').toBe(bodies.length);
    expect(new Set(alternatives).size, 'every capture needs its own alternative text').toBe(alternatives.length);
  });

  it('uses English visuals as the explicit fallback outside French', () => {
    expect(getSolutionProofVisuals('website-builder', 'es')).toBe(SOLUTION_PROOF_VISUAL_ASSETS['website-builder'].en);
    expect(getSolutionProofVisuals('enterprise', 'ar')).toBe(SOLUTION_PROOF_VISUAL_ASSETS.enterprise.en);
  });
});

describe.runIf(process.env.VERIFY_SOLUTION_PROOF_ASSETS === '1')('solution proof PNG files', () => {
  it('requires every declared file to be a distinct 1440×900 PNG', () => {
    const assets = allAssets();

    const missing = assets
      .map((asset) => resolve(process.cwd(), `public${asset.src}`))
      .filter((path) => !existsSync(path));

    expect(missing, `Missing solution proof PNG files:\n${missing.join('\n')}`).toEqual([]);

    const hashes = new Map<string, string>();

    for (const asset of assets) {
      const path = resolve(process.cwd(), `public${asset.src}`);
      const file = readFileSync(path);
      const signature = file.subarray(0, 8);

      expect([...signature], `${path} is not a valid PNG`).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(file.length, `${path} does not contain a complete PNG header`).toBeGreaterThanOrEqual(24);
      expect(file.readUInt32BE(16), `${path} has the wrong width`).toBe(asset.width);
      expect(file.readUInt32BE(20), `${path} has the wrong height`).toBe(asset.height);

      const digest = createHash('sha256').update(file).digest('hex');
      const duplicate = hashes.get(digest);

      expect(duplicate, `${path} duplicates the pixels from ${duplicate ?? 'another capture'}`).toBeUndefined();
      hashes.set(digest, path);
    }

    expect(hashes.size).toBe(assets.length);
  });
});
