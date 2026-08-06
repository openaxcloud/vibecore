import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_BUILDER_LEGACY_VISUAL_ASSETS } from './app-builder.visuals';
import { CHATBOT_BUILDER_COPY } from './chatbot-builder.copy';
import { DASHBOARD_BUILDER_COPY } from './dashboard-builder.copy';
import { ENTERPRISE_COPY } from './enterprise.copy';
import { FREELANCERS_COPY } from './freelancers.copy';
import { GAME_BUILDER_COPY } from './game-builder.copy';
import { INTERNAL_AI_BUILDER_COPY } from './internal-ai-builder.copy';
import type { CapturedSolutionCopyByLanguage } from './solution-copy';
import {
  getSolutionProofVisualContent,
  getSolutionProofVisuals,
  isCapturedSolutionProofVisualSlug,
  LEGACY_SOLUTION_VISUAL_SLUG,
  SOLUTION_PROOF_VISUAL_ASSETS,
  SOLUTION_PROOF_VISUAL_SLOTS,
  SOLUTION_PROOF_VISUAL_SLUGS,
  SOLUTION_PROOF_VISUAL_THEMES,
  SOLUTION_SALES_PAGE_SLUGS,
  type CapturedSolutionProofVisualSlug,
  type SolutionProofVisualAsset,
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
  startups: STARTUPS_COPY,
  freelancers: FREELANCERS_COPY,
} as const satisfies Record<CapturedSolutionProofVisualSlug, CapturedSolutionCopyByLanguage>;

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
    return {
      width: file.readUIntLE(24, 3) + 1,
      height: file.readUIntLE(27, 3) + 1,
    };
  }

  if (chunk === 'VP8 ') {
    expect(file.subarray(23, 26).toString('hex')).toBe('9d012a');

    return {
      width: file.readUInt16LE(26) & 0x3fff,
      height: file.readUInt16LE(28) & 0x3fff,
    };
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
  it('scopes new captures to the seven shared pages and isolates Enterprise', () => {
    expect(SOLUTION_PROOF_VISUAL_SLUGS).toEqual([
      'website-builder',
      'game-builder',
      'dashboard-builder',
      'chatbot-builder',
      'internal-ai-builder',
      'startups',
      'freelancers',
    ]);
    expect(SOLUTION_PROOF_VISUAL_SLUGS).not.toContain(LEGACY_SOLUTION_VISUAL_SLUG);
    expect(SOLUTION_SALES_PAGE_SLUGS).toContain(LEGACY_SOLUTION_VISUAL_SLUG);
    expect(isCapturedSolutionProofVisualSlug('enterprise')).toBe(false);
    expect(isCapturedSolutionProofVisualSlug('website-builder')).toBe(true);
    expect(Object.keys(SOLUTION_PROOF_VISUAL_ASSETS)).toEqual([...SOLUTION_PROOF_VISUAL_SLUGS]);
  });

  it('registers six localized, themed WebP srcsets for every captured solution', () => {
    for (const slug of SOLUTION_PROOF_VISUAL_SLUGS) {
      for (const language of LANGUAGES) {
        for (const theme of SOLUTION_PROOF_VISUAL_THEMES) {
          const assets = getSolutionProofVisuals(slug, language, theme);

          expect(Object.keys(assets)).toEqual([...SOLUTION_PROOF_VISUAL_SLOTS]);

          for (const slot of SOLUTION_PROOF_VISUAL_SLOTS) {
            const base = `/assets/solutions/${slug}/${language}/${theme}/${FILENAMES[slot]}`;

            const sources = [
              { src: `${base}-720.webp`, width: 720, height: 450 },
              { src: `${base}-1440.webp`, width: 1440, height: 900 },
            ] as const;

            expect(assets[slot]).toEqual({
              src: `${base}-1440.webp`,
              srcSet: `${base}-720.webp 720w, ${base}-1440.webp 1440w`,
              sources,
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

  it('never reuses a source path across width, theme, language, slot, or solution', () => {
    const sources = allSources().map((source) => source.src);

    expect(allAssets()).toHaveLength(168);
    expect(sources).toHaveLength(336);
    expect(new Set(sources).size).toBe(sources.length);
    expect(sources.every((source) => source.endsWith('.webp'))).toBe(true);
    expect(sources.every((source) => !source.startsWith('/assets/solutions/app-builder/'))).toBe(true);
    expect(sources.every((source) => !source.startsWith('/assets/solutions/enterprise/'))).toBe(true);
  });

  it('uses distinct light and dark source paths for every localized slot', () => {
    for (const slug of SOLUTION_PROOF_VISUAL_SLUGS) {
      for (const language of LANGUAGES) {
        const light = getSolutionProofVisuals(slug, language, 'light');
        const dark = getSolutionProofVisuals(slug, language, 'dark');

        for (const slot of SOLUTION_PROOF_VISUAL_SLOTS) {
          expect(light[slot].theme).toBe('light');
          expect(dark[slot].theme).toBe('dark');
          expect(light[slot].src).not.toBe(dark[slot].src);
          expect(new Set(light[slot].sources.map(({ src }) => src))).not.toEqual(
            new Set(dark[slot].sources.map(({ src }) => src)),
          );
        }
      }
    }
  });

  it('provides localized, page-specific captions for every slot', () => {
    const titles: string[] = [];
    const bodies: string[] = [];

    for (const slug of SOLUTION_PROOF_VISUAL_SLUGS) {
      for (const language of LANGUAGES) {
        const content = getSolutionProofVisualContent(COPY[slug][language]);

        expect(Object.keys(content)).toEqual([...SOLUTION_PROOF_VISUAL_SLOTS]);

        for (const slot of SOLUTION_PROOF_VISUAL_SLOTS) {
          expect(content[slot].title.trim().length).toBeGreaterThan(12);
          expect(content[slot].body.trim().length).toBeGreaterThan(30);
          titles.push(content[slot].title);
          bodies.push(content[slot].body);
        }
      }
    }

    expect(new Set(titles).size, 'every capture needs its own caption title').toBe(titles.length);
    expect(new Set(bodies).size, 'every capture needs its own caption body').toBe(bodies.length);
  });

  it('uses short, externalized, localized alt text without reusing any alternative', () => {
    const alternatives: string[] = [];

    for (const slug of SOLUTION_PROOF_VISUAL_SLUGS) {
      const englishAlts = COPY[slug].en.proofVisualAlts;
      const frenchAlts = COPY[slug].fr.proofVisualAlts;

      expect(Object.keys(englishAlts)).toEqual([...SOLUTION_PROOF_VISUAL_SLOTS]);
      expect(Object.keys(frenchAlts)).toEqual([...SOLUTION_PROOF_VISUAL_SLOTS]);

      for (const language of LANGUAGES) {
        const copy = COPY[slug][language];
        const content = getSolutionProofVisualContent(copy);

        for (const slot of SOLUTION_PROOF_VISUAL_SLOTS) {
          const alt = content[slot].alt;

          expect(alt, `${slug}/${language}/${slot} must use its authored alt`).toBe(copy.proofVisualAlts[slot]);
          expect(alt, `${slug}/${language}/${slot} must not contain surrounding whitespace`).toBe(alt.trim());
          expect(alt.length, `${slug}/${language}/${slot} must be descriptive`).toBeGreaterThan(20);
          expect(alt.length, `${slug}/${language}/${slot} must stay at or below 160 characters`).toBeLessThanOrEqual(
            160,
          );
          alternatives.push(alt);
        }
      }

      for (const slot of SOLUTION_PROOF_VISUAL_SLOTS) {
        expect(englishAlts[slot], `${slug}/${slot} must be localized in French`).not.toBe(frenchAlts[slot]);
      }
    }

    expect(new Set(alternatives).size, 'every capture needs its own alternative text').toBe(alternatives.length);
  });

  it('authors concise localized Open Graph image alternatives for captured pages only', () => {
    const alternatives: string[] = [];

    for (const slug of SOLUTION_PROOF_VISUAL_SLUGS) {
      const englishAlt = COPY[slug].en.seo.ogImageAlt;
      const frenchAlt = COPY[slug].fr.seo.ogImageAlt;

      for (const [language, alt] of [
        ['en', englishAlt],
        ['fr', frenchAlt],
      ] as const) {
        expect(alt, `${slug}/${language} must not contain surrounding whitespace`).toBe(alt.trim());
        expect(alt.length, `${slug}/${language} must be descriptive`).toBeGreaterThan(20);
        expect(alt.length, `${slug}/${language} must stay at or below 160 characters`).toBeLessThanOrEqual(160);
        alternatives.push(alt);
      }

      expect(englishAlt, `${slug} must localize its Open Graph image alternative`).not.toBe(frenchAlt);
    }

    expect(new Set(alternatives).size, 'every localized Open Graph image needs its own alternative').toBe(
      alternatives.length,
    );
    expect('ogImageAlt' in ENTERPRISE_COPY.en.seo).toBe(false);
    expect('ogImageAlt' in ENTERPRISE_COPY.fr.seo).toBe(false);
  });

  it('uses English visuals as the explicit language fallback without changing theme', () => {
    expect(getSolutionProofVisuals('website-builder', 'es', 'dark')).toBe(
      SOLUTION_PROOF_VISUAL_ASSETS['website-builder'].en.dark,
    );
    expect(getSolutionProofVisuals('startups', 'ar', 'light')).toBe(SOLUTION_PROOF_VISUAL_ASSETS.startups.en.light);
  });

  it('keeps Enterprise on its origin/main legacy PNG paths and markup branch', () => {
    const componentSource = readFileSync(
      resolve(process.cwd(), 'app/components/marketing/solutions/SolutionSalesPage.tsx'),
      'utf8',
    );

    expect(APP_BUILDER_LEGACY_VISUAL_ASSETS.en.idePreview.src).toBe(
      '/assets/solutions/app-builder/en/ide-agent-preview.png',
    );
    expect(APP_BUILDER_LEGACY_VISUAL_ASSETS.fr.ideIteration.src).toBe(
      '/assets/solutions/app-builder/fr/ide-agent-iteration.png',
    );
    expect('proofVisualAlts' in ENTERPRISE_COPY.en).toBe(false);
    expect('proofVisualAlts' in ENTERPRISE_COPY.fr).toBe(false);
    expect(componentSource).toContain('solutionSlug === LEGACY_SOLUTION_VISUAL_SLUG');
    expect(componentSource).toContain('EnterpriseLegacySolutionSalesPage');
    expect(componentSource).toContain('<DemoMock copy={copy} />');
    expect(componentSource).toContain('APP_BUILDER_LEGACY_VISUAL_ASSETS[visualLanguage]');
    expect(componentSource).toContain('loading="lazy"');
  });

  it('renders responsive sources and follows the live E-Code theme store', () => {
    const componentSource = readFileSync(
      resolve(process.cwd(), 'app/components/marketing/solutions/SolutionSalesPage.tsx'),
      'utf8',
    );

    expect(componentSource).toContain('useStore(themeStore)');
    expect(componentSource).toContain('getSolutionProofVisuals(solutionSlug, language, visualTheme)');
    expect(componentSource).toContain('srcSet={asset.srcSet}');
    expect(componentSource).toContain('sizes={sizes}');
    expect(componentSource).toContain('data-visual-theme={asset.theme}');
    expect(componentSource).toContain("loading={eager ? 'eager' : 'lazy'}");
    expect(componentSource).toContain("fetchpriority: eager ? 'high' : 'low'");
  });
});

describe.runIf(process.env.VERIFY_SOLUTION_PROOF_ASSETS === '1')('solution proof WebP files', () => {
  it('requires every responsive source to exist at its declared dimensions with unique pixels', () => {
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

      expect(duplicate, `${path} duplicates the pixels from ${duplicate ?? 'another capture'}`).toBeUndefined();
      hashes.set(digest, path);
    }

    expect(hashes.size).toBe(sources.length);
  });
});
