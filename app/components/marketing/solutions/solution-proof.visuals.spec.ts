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
  SOLUTION_PROOF_VISUAL_THEMES,
  type SolutionProofVisualAsset,
  type SolutionProofVisualSlug,
  type SolutionProofVisualSource,
} from './solution-proof.visuals';
import { STARTUPS_COPY } from './startups.copy';
import { WEBSITE_BUILDER_COPY } from './website-builder.copy';

const LANGUAGES = ['en', 'fr'] as const;

const FILENAMES = {
  prompt: 'ide-agent-prompt',
  preview: 'ide-agent-preview',
  webviewOverview: 'ide-webview-overview',
  iteration: 'ide-agent-iteration',
  webviewIteration: 'ide-webview-iteration',
  files: 'ide-agent-files',
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
    LANGUAGES.flatMap((language) =>
      SOLUTION_PROOF_VISUAL_THEMES.flatMap((theme) => {
        const assets = getSolutionProofVisuals(slug, language, theme);

        return SOLUTION_PROOF_VISUAL_SLOTS.map((slot) => assets[slot]);
      }),
    ),
  );
}

function allSources(): SolutionProofVisualSource[] {
  return allAssets().flatMap((asset) => [...asset.sources]);
}

function readWebPDimensions(file: Buffer): { width: number; height: number } {
  expect(file.subarray(0, 4).toString('ascii')).toBe('RIFF');
  expect(file.subarray(8, 12).toString('ascii')).toBe('WEBP');

  const chunk = file.subarray(12, 16).toString('ascii');

  if (chunk === 'VP8X') {
    return { width: file.readUIntLE(24, 3) + 1, height: file.readUIntLE(27, 3) + 1 };
  }

  if (chunk === 'VP8 ') {
    expect(file.subarray(23, 26).toString('hex')).toBe('9d012a');

    return { width: file.readUInt16LE(26) & 0x3fff, height: file.readUInt16LE(28) & 0x3fff };
  }

  if (chunk === 'VP8L') {
    expect(file[20]).toBe(0x2f);

    const byte0 = file[21];
    const byte1 = file[22];
    const byte2 = file[23];
    const byte3 = file[24];

    return {
      width: 1 + byte0 + ((byte1 & 0x3f) << 8),
      height: 1 + (byte1 >> 6) + (byte2 << 2) + ((byte3 & 0x0f) << 10),
    };
  }

  throw new Error(`Unsupported WebP chunk ${chunk}`);
}

describe('theme-aware solution proof visual registry', () => {
  it('covers all eight shared sales pages, including Enterprise', () => {
    expect(SOLUTION_PROOF_VISUAL_SLUGS).toEqual([
      'website-builder',
      'game-builder',
      'dashboard-builder',
      'chatbot-builder',
      'internal-ai-builder',
      'enterprise',
      'startups',
      'freelancers',
    ]);
    expect(Object.keys(SOLUTION_PROOF_VISUAL_ASSETS)).toEqual([...SOLUTION_PROOF_VISUAL_SLUGS]);
  });

  it('registers six localized, themed WebP srcsets for every page', () => {
    for (const slug of SOLUTION_PROOF_VISUAL_SLUGS) {
      for (const language of LANGUAGES) {
        for (const theme of SOLUTION_PROOF_VISUAL_THEMES) {
          const assets = getSolutionProofVisuals(slug, language, theme);

          expect(Object.keys(assets)).toEqual([...SOLUTION_PROOF_VISUAL_SLOTS]);

          for (const slot of SOLUTION_PROOF_VISUAL_SLOTS) {
            const base = `/assets/solutions/${slug}/${language}/${theme}/${FILENAMES[slot]}`;

            expect(assets[slot]).toEqual({
              src: `${base}-1440.webp`,
              srcSet: `${base}-720.webp 720w, ${base}-1440.webp 1440w`,
              sources: [
                { src: `${base}-720.webp`, width: 720, height: 450 },
                { src: `${base}-1440.webp`, width: 1440, height: 900 },
              ],
              width: 1440,
              height: 900,
              language,
              theme,
              slug,
              slot,
            });
          }
        }
      }
    }
  });

  it('never falls back to App Builder or reuses a path across page, language, theme, slot, or width', () => {
    const sources = allSources().map(({ src }) => src);

    expect(allAssets()).toHaveLength(192);
    expect(sources).toHaveLength(384);
    expect(new Set(sources).size).toBe(sources.length);
    expect(sources.every((source) => source.endsWith('.webp'))).toBe(true);
    expect(sources.every((source) => !source.includes('/app-builder/'))).toBe(true);
  });

  it('uses distinct light and dark paths for every localized slot', () => {
    for (const slug of SOLUTION_PROOF_VISUAL_SLUGS) {
      for (const language of LANGUAGES) {
        const light = getSolutionProofVisuals(slug, language, 'light');
        const dark = getSolutionProofVisuals(slug, language, 'dark');

        for (const slot of SOLUTION_PROOF_VISUAL_SLOTS) {
          expect(light[slot].src).not.toBe(dark[slot].src);
          expect(light[slot].theme).toBe('light');
          expect(dark[slot].theme).toBe('dark');
        }
      }
    }
  });

  it('derives complete localized captions and alts until authored alternatives are supplied', () => {
    for (const slug of SOLUTION_PROOF_VISUAL_SLUGS) {
      for (const language of LANGUAGES) {
        const copy = COPY[slug][language];
        const content = getSolutionProofVisualContent(copy);

        expect(Object.keys(content)).toEqual([...SOLUTION_PROOF_VISUAL_SLOTS]);

        for (const slot of SOLUTION_PROOF_VISUAL_SLOTS) {
          expect(content[slot].title.trim().length).toBeGreaterThan(5);
          expect(content[slot].body.trim().length).toBeGreaterThan(20);
          expect(content[slot].alt.trim().length).toBeGreaterThan(10);

          if (copy.proofVisualAlts) {
            expect(content[slot].alt).toBe(copy.proofVisualAlts[slot]);
          }
        }
      }
    }
  });

  it('renders responsive sources from the live theme store for every page, with no App Builder branch', () => {
    const componentSource = readFileSync(
      resolve(process.cwd(), 'app/components/marketing/solutions/SolutionSalesPage.tsx'),
      'utf8',
    );

    expect(componentSource).toContain('useStore(themeStore)');
    expect(componentSource).toContain('getSolutionProofVisuals(solutionSlug, language, visualTheme)');
    expect(componentSource).toContain('srcSet={asset.srcSet}');
    expect(componentSource).toContain('sizes={sizes}');
    expect(componentSource).toContain('data-visual-theme={asset.theme}');
    expect(componentSource).toContain('data-visual-solution={asset.slug}');
    expect(componentSource).toContain("loading={eager ? 'eager' : 'lazy'}");
    expect(componentSource).not.toContain('APP_BUILDER_VISUAL_ASSETS');
    expect(componentSource).not.toContain('/solutions/app-builder?lang=');
  });
});

describe.runIf(process.env.VERIFY_SOLUTION_PROOF_ASSETS === '1')('solution proof WebP files', () => {
  it('requires all 384 sources at their declared dimensions with unique pixels', () => {
    const sources = allSources();

    const missing = sources
      .map((source) => resolve(process.cwd(), `public${source.src}`))
      .filter((path) => !existsSync(path));

    expect(missing, `Missing solution proof WebP files:\n${missing.join('\n')}`).toEqual([]);

    const hashes = new Map<string, string>();

    for (const source of sources) {
      const path = resolve(process.cwd(), `public${source.src}`);
      const file = readFileSync(path);
      const dimensions = readWebPDimensions(file);

      expect(file.length, `${path} is unexpectedly small`).toBeGreaterThan(5_000);
      expect(dimensions.width, `${path} has the wrong width`).toBe(source.width);
      expect(dimensions.height, `${path} has the wrong height`).toBe(source.height);

      const digest = createHash('sha256').update(file).digest('hex');
      const duplicate = hashes.get(digest);

      expect(duplicate, `${path} duplicates pixels from ${duplicate ?? 'another capture'}`).toBeUndefined();
      hashes.set(digest, path);
    }

    expect(hashes.size).toBe(sources.length);
  });
});
