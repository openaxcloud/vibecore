import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line no-restricted-imports -- the asset gate reuses the standalone capture provenance matcher.
import { matchCompleteSubmittedPrompt, SERVER_PROJECT_WEB_CONTRACT } from '../../../../scripts/solution-capture-state';
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

const CAPTURE_FILENAMES = SOLUTION_PROOF_VISUAL_SLOTS.map((slot) => `${FILENAMES[slot]}.png`);

const PROMOTED_OUTPUT_FIELDS = {
  prompt: 'promptOutput',
  preview: 'previewOutput',
  webviewOverview: 'webviewOverviewOutput',
  iteration: 'iterationOutput',
  webviewIteration: 'webviewIterationOutput',
} as const;

type JsonRecord = Record<string, unknown>;

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

function asRecord(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a JSON object`);
  }

  return value as JsonRecord;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }

  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }

  return value;
}

function captureResultPath(slug: SolutionProofVisualSlug, language: (typeof LANGUAGES)[number]) {
  return resolve(process.cwd(), 'outputs/solutions', slug, 'ide-proof', language, 'capture-result.json');
}

function publicAssetPaths(slug: SolutionProofVisualSlug, language: (typeof LANGUAGES)[number]) {
  return SOLUTION_PROOF_VISUAL_THEMES.flatMap((theme) =>
    SOLUTION_PROOF_VISUAL_SLOTS.flatMap((slot) =>
      getSolutionProofVisuals(slug, language, theme)[slot].sources.map((source) =>
        resolve(process.cwd(), `public${source.src}`),
      ),
    ),
  );
}

function readCaptureResult(slug: SolutionProofVisualSlug, language: (typeof LANGUAGES)[number]) {
  const path = captureResultPath(slug, language);

  if (!existsSync(path)) {
    throw new Error(`Missing successful capture manifest: ${path}`);
  }

  try {
    return asRecord(JSON.parse(readFileSync(path, 'utf8')) as unknown, path);
  } catch (error) {
    throw new Error(`Invalid successful capture manifest: ${path}`, { cause: error });
  }
}

function expectCleanRuntimeProvenance(value: unknown, label: string) {
  const provenance = asRecord(value, label);
  const gates = asRecord(provenance.gates, `${label}.gates`);

  expect(provenance.capturePolicy, label).toBe('native-preferred-official-runtime-direct-fallback');
  expect(provenance.port, label).toBe(5173);
  expect(provenance.runtimeStatus, label).toBe('running');
  expect(asString(provenance.workspaceId, `${label}.workspaceId`)).toBeTruthy();

  for (const gate of [
    'generatedSourcesUnwrapped',
    'persistedRuntimeParity',
    'renderedIdentity',
    'renderedNonBlank',
    'runtimeRunning',
    'visualSubstance',
  ]) {
    expect(gates[gate], `${label}.gates.${gate}`).toBe(true);
  }

  if (provenance.mode === 'official-runtime-direct') {
    const origin = new URL(asString(provenance.officialRuntimeOrigin, `${label}.officialRuntimeOrigin`));
    const fallbackReason = asString(provenance.nativeFallbackReason, `${label}.nativeFallbackReason`);

    expect(origin.protocol, label).toBe('https:');
    expect(origin.hostname, label).toMatch(/\.preview\.e-code\.ai$/);
    expect(origin.origin, label).toBe(provenance.officialRuntimeOrigin);
    expect(provenance.officialRuntimeUrlSha256, label).toMatch(/^[a-f0-9]{64}$/);
    expect(fallbackReason, label).toMatch(/(?:native|webview|iframe)/i);
    expect(fallbackReason, label).toMatch(/(?:empty|blank|attach|substantial|render)/i);
    expect(fallbackReason, label).not.toMatch(
      /internal server error|failed to resolve import|cannot find module|vite error|unexpected token|uncaught typeerror|plugin:vite/i,
    );
    expect(gates.officialDocumentOk, label).toBe(true);
    expect(gates.officialUrlAllowlisted, label).toBe(true);
  } else {
    expect(provenance.mode, label).toBe('native-webview');
    expect(gates.officialDocumentOk, label).toBe('not-applicable');
    expect(gates.officialUrlAllowlisted, label).toBe('not-applicable');
    expect(provenance.nativeFallbackReason, label).toBeUndefined();
    expect(provenance.officialRuntimeOrigin, label).toBeUndefined();
    expect(provenance.officialRuntimeUrlSha256, label).toBeUndefined();
  }

  return provenance;
}

function expectCleanShell(value: unknown, label: string) {
  const shell = asRecord(value, label);

  expect(shell.connected, label).toBe(true);
  expect(shell.problemErrors, label).toBe(0);
  expect(shell.problemWarnings, label).toBe(0);
  expect(asArray(shell.alertsVisible, `${label}.alertsVisible`), label).toEqual([]);
  expect(asArray(shell.overlaysVisible, `${label}.overlaysVisible`), label).toEqual([]);
  expect(asString(shell.runtimeSummary, `${label}.runtimeSummary`), label).toMatch(/(?:Running on|Exécuté sur)/i);
  expect(asString(shell.workspaceSummary, `${label}.workspaceSummary`), label).toMatch(
    /(?:Workspace\s*Running|Espace de travail\s*Actif)/i,
  );
}

function expectResponsiveAudit(value: unknown, label: string) {
  const responsive = asRecord(value, label);

  expect(responsive.identityVisible, label).toBe(true);
  expect(responsive.horizontalOverflow, label).toBeLessThanOrEqual(1);
  expect(responsive.textLength, label).toBeGreaterThanOrEqual(80);
  expect(responsive.imageBytes, label).toBeGreaterThanOrEqual(6_000);
  expect(responsive.entropy, label).toBeGreaterThanOrEqual(0.15);
}

function expectPromptSurfaceProvenance(value: unknown, label: string, prompt: string) {
  const provenance = asRecord(value, label);
  const normalizedPrompt = prompt.replace(/\s+/gu, ' ').trim();
  const visiblePrompt = asString(provenance.visiblePrompt, `${label}.visiblePrompt`);
  const promptMatch = matchCompleteSubmittedPrompt(visiblePrompt, normalizedPrompt);

  expect(provenance.slot, label).toBe('prompt');
  expect(provenance.surface, label).toBe('agent-user-bubble');
  expect(provenance.verified, label).toBe(true);
  expect(provenance.exactMatch, label).toBe(true);
  expect(asString(provenance.messageId, `${label}.messageId`), label).toBeTruthy();
  expect(provenance.promptSha256, label).toBe(createHash('sha256').update(normalizedPrompt).digest('hex'));
  expect(promptMatch, label).toBeDefined();
  expect(provenance.matchForm, label).toBe(promptMatch?.matchForm);
  expect(provenance.visiblePromptLength, label).toBe(promptMatch?.candidateLength);
  expect(provenance.visiblePromptSha256, label).toBe(
    createHash('sha256')
      .update(promptMatch?.normalizedCandidate ?? '')
      .digest('hex'),
  );
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

  it('requires explicit Agent prompt provenance in every successful manifest', () => {
    const prompt = 'Build a real project in E-Code';

    const wrappedPrompt = `${SERVER_PROJECT_WEB_CONTRACT}\n\nUser prompt:\n${prompt}`;

    expect(() => expectPromptSurfaceProvenance(undefined, 'missing-provenance', prompt)).toThrow();
    expect(() =>
      expectPromptSurfaceProvenance(
        {
          exactMatch: true,
          matchForm: 'exact',
          messageId: 'message-1',
          slot: 'prompt',
          surface: 'agent-user-bubble',
          verified: true,
          promptSha256: createHash('sha256').update(prompt).digest('hex'),
          visiblePrompt: prompt,
          visiblePromptLength: prompt.length,
          visiblePromptSha256: createHash('sha256').update(prompt).digest('hex'),
        },
        'promptSurfaceProvenance',
        prompt,
      ),
    ).not.toThrow();
    expect(() =>
      expectPromptSurfaceProvenance(
        {
          exactMatch: true,
          matchForm: 'server-project-contract',
          messageId: 'message-2',
          slot: 'prompt',
          surface: 'agent-user-bubble',
          verified: true,
          promptSha256: createHash('sha256').update(prompt).digest('hex'),
          visiblePrompt: wrappedPrompt,
          visiblePromptLength: wrappedPrompt.replace(/\s+/gu, ' ').trim().length,
          visiblePromptSha256: createHash('sha256').update(wrappedPrompt.replace(/\s+/gu, ' ').trim()).digest('hex'),
        },
        'wrappedPromptSurfaceProvenance',
        prompt,
      ),
    ).not.toThrow();
    expect(() =>
      expectPromptSurfaceProvenance(
        {
          exactMatch: true,
          matchForm: 'server-project-contract',
          messageId: 'message-3',
          slot: 'prompt',
          surface: 'agent-user-bubble',
          verified: true,
          promptSha256: createHash('sha256').update(prompt).digest('hex'),
          visiblePrompt: `Untrusted wrapper User prompt: ${prompt}`,
          visiblePromptLength: 0,
          visiblePromptSha256: '',
        },
        'invalidPromptSurfaceProvenance',
        prompt,
      ),
    ).toThrow();
  });
});

describe.runIf(process.env.VERIFY_SOLUTION_PROOF_ASSETS === '1')('solution proof WebP files', () => {
  it('requires all 16 successful capture manifests and binds them to the 384 public assets', () => {
    const manifestPaths = SOLUTION_PROOF_VISUAL_SLUGS.flatMap((slug) =>
      LANGUAGES.map((language) => captureResultPath(slug, language)),
    );

    const missingManifests = manifestPaths.filter((path) => !existsSync(path));

    if (missingManifests.length > 0) {
      throw new Error(
        `Missing ${missingManifests.length}/16 successful capture manifests:\n${missingManifests.join('\n')}`,
      );
    }

    for (const slug of SOLUTION_PROOF_VISUAL_SLUGS) {
      for (const language of LANGUAGES) {
        const label = `${slug}/${language}`;
        const manifest = readCaptureResult(slug, language);
        const promotedAssets = asArray(manifest.promotedAssets, `${label}.promotedAssets`);
        const expectedAssets = publicAssetPaths(slug, language);
        const prompt = asString(manifest.prompt, `${label}.prompt`);

        expect(manifest.locale, label).toBe(language);
        expect(asString(manifest.projectId, `${label}.projectId`), label).toBeTruthy();
        expect(prompt, label).toBeTruthy();
        expect(manifest.generatedFileCount, label).toBeGreaterThan(0);
        expect(manifest.promotedAssetCount, label).toBe(24);
        expect(promotedAssets, label).toHaveLength(24);
        expect(new Set(promotedAssets).size, label).toBe(24);
        expect([...promotedAssets].sort(), label).toEqual([...expectedAssets].sort());

        for (const [slot, field] of Object.entries(PROMOTED_OUTPUT_FIELDS) as Array<
          [keyof typeof PROMOTED_OUTPUT_FIELDS, (typeof PROMOTED_OUTPUT_FIELDS)[keyof typeof PROMOTED_OUTPUT_FIELDS]]
        >) {
          const expected = getSolutionProofVisuals(slug, language, 'dark')[slot].src;

          expect(manifest[field], `${label}.${field}`).toBe(resolve(process.cwd(), `public${expected}`));
        }

        expect(manifest.consoleErrorCount, label).toBe(0);
        expect(asArray(manifest.consoleErrorDetails, `${label}.consoleErrorDetails`), label).toEqual([]);
        expect(manifest.previewConsoleErrorCount, label).toBe(0);
        expect(manifest.unscopedConsoleErrorCount, label).toBe(0);
        expect(manifest.pageErrorCount, label).toBe(0);
        expect(asArray(manifest.previewRuntimeErrors, `${label}.previewRuntimeErrors`), label).toEqual([]);
        expect(manifest.problemDetailCount, label).toBe(0);
        expect(asArray(manifest.problemDetails, `${label}.problemDetails`), label).toEqual([]);

        expectCleanRuntimeProvenance(manifest.previewProvenance, `${label}.previewProvenance`);
        expectPromptSurfaceProvenance(manifest.promptSurfaceProvenance, `${label}.promptSurfaceProvenance`, prompt);

        const runtimePromotionProof = asRecord(manifest.runtimePromotionProof, `${label}.runtimePromotionProof`);

        expect(
          asString(runtimePromotionProof.workspaceId, `${label}.runtimePromotionProof.workspaceId`),
          label,
        ).toMatch(/^ws-[a-z0-9]+$/);
        expect(
          asString(runtimePromotionProof.projectFilesRevision, `${label}.runtimePromotionProof.projectFilesRevision`),
          label,
        ).toMatch(/^[a-f0-9]{64}$/);
        expect(runtimePromotionProof.matchingReads, label).toBeGreaterThanOrEqual(4);
        expect(runtimePromotionProof.stableForMs, label).toBeGreaterThanOrEqual(12_000);

        const audits = asArray(manifest.themedCaptureAudits, `${label}.themedCaptureAudits`);

        expect(audits, label).toHaveLength(6);
        expect(
          audits.map((value, index) => asRecord(value, `${label}.themedCaptureAudits[${index}]`).filename),
          label,
        ).toEqual(CAPTURE_FILENAMES);

        for (const [auditIndex, value] of audits.entries()) {
          const auditLabel = `${label}.themedCaptureAudits[${auditIndex}]`;
          const audit = asRecord(value, auditLabel);
          const filename = asString(audit.filename, `${auditLabel}.filename`);
          const states = asArray(audit.states, `${auditLabel}.states`);
          const difference = asRecord(audit.themeDifference, `${auditLabel}.themeDifference`);

          expect(states, auditLabel).toHaveLength(2);
          expect(
            states.map((state, stateIndex) => asRecord(state, `${auditLabel}.states[${stateIndex}]`).theme),
            auditLabel,
          ).toEqual([...SOLUTION_PROOF_VISUAL_THEMES]);
          expect(difference.changedPixelRatio, auditLabel).toBeGreaterThanOrEqual(0.02);
          expect(difference.meanAbsoluteDifference, auditLabel).toBeGreaterThanOrEqual(2);

          for (const [stateIndex, stateValue] of states.entries()) {
            const stateLabel = `${auditLabel}.states[${stateIndex}]`;
            const state = asRecord(stateValue, stateLabel);
            const applicationTheme = asRecord(state.applicationTheme, `${stateLabel}.applicationTheme`);
            const provenance = expectCleanRuntimeProvenance(state.provenance, `${stateLabel}.provenance`);

            expectCleanShell(state.shell, `${stateLabel}.shell`);
            expectResponsiveAudit(state.responsive, `${stateLabel}.responsive`);
            expect(applicationTheme.activeTheme, stateLabel).toBe(state.theme);
            expect(applicationTheme.strategy, stateLabel).toMatch(
              /^(?:explicit-state-already-applied|visible-runtime-control)$/,
            );
            expect(state.device, stateLabel).toMatch(/^(?:desktop|tablet|mobile)$/);
            expect(state.captureSurface, stateLabel).toMatch(
              /^(?:ide-shell-native-webview|ide-shell-official-runtime-verified|official-runtime-direct)$/,
            );

            if (state.captureSurface === 'official-runtime-direct') {
              expect(
                ['ide-agent-preview.png', 'ide-webview-overview.png', 'ide-webview-iteration.png'],
                stateLabel,
              ).toContain(filename);
              expect(provenance.mode, stateLabel).toBe('official-runtime-direct');
            }

            if (state.captureSurface === 'ide-shell-official-runtime-verified') {
              expect(provenance.mode, stateLabel).toBe('official-runtime-direct');
            }

            if (state.captureSurface === 'ide-shell-native-webview') {
              expect(provenance.mode, stateLabel).toBe('native-webview');
            }

            if (filename === 'ide-agent-prompt.png') {
              expect(state.captureSurface, stateLabel).not.toBe('official-runtime-direct');
            }
          }
        }

        for (const [auditIndex, value] of asArray(
          manifest.responsiveStateAudits,
          `${label}.responsiveStateAudits`,
        ).entries()) {
          expectResponsiveAudit(value, `${label}.responsiveStateAudits[${auditIndex}]`);
        }
      }
    }
  });

  it('requires all 384 sources at their declared dimensions and controlled weights with unique pixels', () => {
    const sources = allSources();

    const missing = sources
      .map((source) => resolve(process.cwd(), `public${source.src}`))
      .filter((path) => !existsSync(path));

    if (missing.length > 0) {
      throw new Error(
        `Missing ${missing.length}/384 solution proof WebP files (first 20):\n${missing.slice(0, 20).join('\n')}`,
      );
    }

    const hashes = new Map<string, string>();

    for (const source of sources) {
      const path = resolve(process.cwd(), `public${source.src}`);
      const file = readFileSync(path);
      const dimensions = readWebPDimensions(file);

      const maximumBytes = source.width === 720 ? 250_000 : 500_000;

      expect(file.length, `${path} is unexpectedly small`).toBeGreaterThan(5_000);
      expect(file.length, `${path} is too heavy for its ${source.width}px responsive source`).toBeLessThanOrEqual(
        maximumBytes,
      );
      expect(dimensions.width, `${path} has the wrong width`).toBe(source.width);
      expect(dimensions.height, `${path} has the wrong height`).toBe(source.height);

      const digest = createHash('sha256').update(file).digest('hex');
      const duplicate = hashes.get(digest);

      expect(duplicate, `${path} duplicates pixels from ${duplicate ?? 'another capture'}`).toBeUndefined();
      hashes.set(digest, path);
    }

    expect(hashes.size).toBe(sources.length);

    for (const slug of SOLUTION_PROOF_VISUAL_SLUGS) {
      for (const language of LANGUAGES) {
        for (const slot of SOLUTION_PROOF_VISUAL_SLOTS) {
          for (const width of [720, 1440] as const) {
            const lightSource = getSolutionProofVisuals(slug, language, 'light')[slot].sources.find(
              (source) => source.width === width,
            );
            const darkSource = getSolutionProofVisuals(slug, language, 'dark')[slot].sources.find(
              (source) => source.width === width,
            );

            expect(lightSource).toBeDefined();
            expect(darkSource).toBeDefined();

            const lightHash = createHash('sha256')
              .update(readFileSync(resolve(process.cwd(), `public${lightSource!.src}`)))
              .digest('hex');
            const darkHash = createHash('sha256')
              .update(readFileSync(resolve(process.cwd(), `public${darkSource!.src}`)))
              .digest('hex');

            expect(darkHash, `${slug}/${language}/${slot}/${width} must have a real dark variant`).not.toBe(lightHash);
          }
        }
      }
    }
  });
});
