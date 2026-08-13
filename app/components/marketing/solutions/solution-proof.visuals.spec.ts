import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line no-restricted-imports -- capture and manifest gates share one exact interaction contract.
import { matchCompleteSubmittedPrompt, SERVER_PROJECT_WEB_CONTRACT } from '../../../../scripts/solution-capture-state';
// eslint-disable-next-line no-restricted-imports -- capture and manifest gates independently recompute one exact FR surface contract.
import {
  GENERATED_FR_SCENARIO_CONTRACTS,
  inspectGeneratedFrenchSurface,
  type GeneratedFrSolutionSlug,
  type GeneratedFrSurfaceAudit,
  type GeneratedFrSurfaceCollection,
  type GeneratedFrSurfacePhase,
  type GeneratedFrSurfaceSource,
} from '../../../../scripts/solution-generated-fr-surface-audit';
// eslint-disable-next-line no-restricted-imports -- capture and manifest gates share one exact interaction contract.
import {
  SOLUTION_PROOF_INTERACTION_CONTRACTS,
  SOLUTION_PROOF_INTER_SLOT_THRESHOLDS,
  serializedInteractionExpectedResult,
  solutionProofInterSlotPairs,
  type SolutionProofInteractionContract,
} from '../../../../scripts/solution-proof-capture-truth';
// eslint-disable-next-line no-restricted-imports -- capture and manifest gates share one strict runtime recovery schema.
import {
  SOLUTION_RUNTIME_RECOVERY_PROOF_SCHEMA_VERSION,
  validateSolutionRuntimeRecoveryProofManifest,
} from '../../../../scripts/solution-runtime-recovery-proof';

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

const OBSERVED_TERMINAL_RECOVERY_COMMANDS = [
  'npm install --include=dev --prefer-offline --no-audit --no-fund',
  'node_modules/.bin/vite --version',
  'npm run dev -- --host 0.0.0.0',
] as const;

const GENERATED_FRENCH_CAPTURE_PHASES = {
  'ide-agent-files.png': 'interaction',
  'ide-agent-iteration.png': 'interaction',
  'ide-agent-preview.png': 'base',
  'ide-agent-prompt.png': 'base',
  'ide-webview-iteration.png': 'interaction',
  'ide-webview-overview.png': 'overview',
} as const satisfies Record<(typeof CAPTURE_FILENAMES)[number], GeneratedFrSurfacePhase>;

function generatedFrenchCapturePhase(filename: string): GeneratedFrSurfacePhase | undefined {
  return Object.prototype.hasOwnProperty.call(GENERATED_FRENCH_CAPTURE_PHASES, filename)
    ? GENERATED_FRENCH_CAPTURE_PHASES[filename as keyof typeof GENERATED_FRENCH_CAPTURE_PHASES]
    : undefined;
}

const GENERATED_FRENCH_STAGE_EXPECTATIONS = [
  { device: 'desktop', phase: 'base', stage: 'initial' },
  { device: 'desktop', phase: 'overview', stage: 'overview' },
  { device: 'desktop', phase: 'interaction', stage: 'interaction' },
] as const;

const GENERATED_FRENCH_SURFACE_SOURCES = [
  'alt',
  'aria-description',
  'aria-describedby',
  'aria-label',
  'aria-labelledby',
  'aria-valuetext',
  'document-title',
  'input-value',
  'placeholder',
  'text',
  'title',
] as const satisfies readonly GeneratedFrSurfaceSource[];

type SolutionProofLanguage = (typeof LANGUAGES)[number];
type PreviewDevice = 'desktop' | 'tablet' | 'mobile';
type ResponsiveAuditExpectation = {
  stage: string;
  device: PreviewDevice;
};

/*
 * capture-app-builder-ide-proof.ts emits these top-level audits in this exact
 * order. French gets one additional tablet pass before the preview capture;
 * its overview capture then exercises mobile while English exercises tablet.
 */
const RESPONSIVE_STATE_AUDIT_EXPECTATIONS = {
  en: [
    { stage: 'initial', device: 'desktop' },
    { stage: 'overview', device: 'tablet' },
    { stage: 'interaction', device: 'desktop' },
    { stage: 'interaction', device: 'mobile' },
    { stage: 'files', device: 'desktop' },
  ],
  fr: [
    { stage: 'initial', device: 'desktop' },
    { stage: 'preview', device: 'tablet' },
    { stage: 'overview', device: 'mobile' },
    { stage: 'interaction', device: 'desktop' },
    { stage: 'interaction', device: 'mobile' },
    { stage: 'files', device: 'desktop' },
  ],
} as const satisfies Record<SolutionProofLanguage, readonly ResponsiveAuditExpectation[]>;

/*
 * Each filename is captured in light and dark at the selected real Preview
 * device. The order matches CAPTURE_FILENAMES/SOLUTION_PROOF_VISUAL_SLOTS.
 */
const THEMED_CAPTURE_DEVICE_EXPECTATIONS = {
  en: ['desktop', 'desktop', 'tablet', 'desktop', 'mobile', 'desktop'],
  fr: ['desktop', 'tablet', 'mobile', 'desktop', 'mobile', 'desktop'],
} as const satisfies Record<SolutionProofLanguage, readonly PreviewDevice[]>;

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

function expectRuntimeRecoveryProof(value: unknown, label: string, expectedProjectFilesRevision: string) {
  expect(validateSolutionRuntimeRecoveryProofManifest(value), label).toEqual({ valid: true });

  const proof = asRecord(value, label);
  const packagePolicy = asRecord(proof.packagePolicy, `${label}.packagePolicy`);
  const runtimeRecovery = asRecord(proof.runtimeRecovery, `${label}.runtimeRecovery`);

  expect(proof.schemaVersion, `${label}.schemaVersion`).toBe(SOLUTION_RUNTIME_RECOVERY_PROOF_SCHEMA_VERSION);
  expect(packagePolicy.scope, `${label}.packagePolicy.scope`).toBe('final-persisted-manifest');
  expect(packagePolicy.verified, `${label}.packagePolicy.verified`).toBe(true);
  expect(packagePolicy.packagePath, `${label}.packagePolicy.packagePath`).toBe('package.json');
  expect(packagePolicy.packageJsonBytes, `${label}.packagePolicy.packageJsonBytes`).toBeGreaterThan(0);
  expect(packagePolicy.packageJsonSha256, `${label}.packagePolicy.packageJsonSha256`).toMatch(/^[a-f0-9]{64}$/u);
  expect(
    asString(packagePolicy.projectFilesRevision, `${label}.packagePolicy.projectFilesRevision`),
    `${label}.packagePolicy.projectFilesRevision`,
  ).toBe(expectedProjectFilesRevision);

  for (const [eventIndex, eventValue] of asArray(runtimeRecovery.events, `${label}.runtimeRecovery.events`).entries()) {
    const eventLabel = `${label}.runtimeRecovery.events[${eventIndex}]`;
    const event = asRecord(eventValue, eventLabel);
    const source = asString(event.source, `${eventLabel}.source`);
    const commands = asArray(event.commands, `${eventLabel}.commands`);

    if (source === 'terminal') {
      expect(commands.length, `${eventLabel}.commands`).toBeGreaterThan(0);
      expect(commands.length, `${eventLabel}.commands`).toBeLessThanOrEqual(OBSERVED_TERMINAL_RECOVERY_COMMANDS.length);
      expect(commands, `${eventLabel}.commands`).toEqual(OBSERVED_TERMINAL_RECOVERY_COMMANDS.slice(0, commands.length));
    } else {
      expect(['auto', 'reinstall-ui'], `${eventLabel}.source`).toContain(source);
      expect(commands, `${eventLabel}.commands`).toEqual([]);
    }
  }

  return proof;
}

type GeneratedFrenchCaptureStateExpectation = Readonly<{
  captureSurface: string;
  device: string;
  filename: string;
  theme: string;
}>;

function asGeneratedFrenchSurfaceCollection(value: unknown, label: string): GeneratedFrSurfaceCollection {
  const collection = asRecord(value, label);

  expect(Object.keys(collection).sort(), `${label} exact fields`).toEqual(
    ['documentLanguage', 'entries', 'rootSelector'].sort(),
  );

  const entries = asArray(collection.entries, `${label}.entries`).map((entryValue, index) => {
    const entryLabel = `${label}.entries[${index}]`;
    const entry = asRecord(entryValue, entryLabel);
    const source = asString(entry.source, `${entryLabel}.source`);

    expect(Object.keys(entry).sort(), `${entryLabel} exact fields`).toEqual(['selector', 'source', 'value'].sort());

    if (!(GENERATED_FRENCH_SURFACE_SOURCES as readonly string[]).includes(source)) {
      throw new TypeError(`${entryLabel}.source has unsupported value ${JSON.stringify(source)}`);
    }

    return {
      selector: asString(entry.selector, `${entryLabel}.selector`),
      source: source as GeneratedFrSurfaceSource,
      value: asString(entry.value, `${entryLabel}.value`),
    };
  });

  return {
    documentLanguage: asString(collection.documentLanguage, `${label}.documentLanguage`),
    entries,
    rootSelector: asString(collection.rootSelector, `${label}.rootSelector`),
  };
}

function expectRecomputedGeneratedFrenchSurfaceAudit(
  value: unknown,
  label: string,
  slug: GeneratedFrSolutionSlug,
  phase: GeneratedFrSurfacePhase,
) {
  const storedAudit = asRecord(value, label);
  const collection = asGeneratedFrenchSurfaceCollection(storedAudit.collection, `${label}.collection`);
  const recomputed = inspectGeneratedFrenchSurface(collection, { phase, slug });

  expect(storedAudit, `${label} must equal its independently recomputed audit`).toEqual(recomputed);
  expect(recomputed.passed, `${label}.passed`).toBe(true);
  expect(recomputed.documentLanguageMatched, `${label}.documentLanguageMatched`).toBe(true);
  expect(recomputed.missingRequired, `${label}.missingRequired`).toEqual([]);
  expect(recomputed.residuals, `${label}.residuals`).toEqual([]);
  expect(recomputed.phase, `${label}.phase`).toBe(phase);
  expect(recomputed.slug, `${label}.slug`).toBe(slug);

  return recomputed;
}

function expectGeneratedFrenchSurfaceProof(
  value: unknown,
  label: string,
  slug: SolutionProofVisualSlug,
  language: SolutionProofLanguage,
  capturedStates: readonly GeneratedFrenchCaptureStateExpectation[],
) {
  if (language === 'en') {
    expect(value, `${label} must be absent from English capture manifests`).toBeUndefined();

    return;
  }

  const proof = asRecord(value, label);

  expect(Object.keys(proof).sort(), `${label} exact fields`).toEqual(
    ['captureAudits', 'locale', 'proofSchemaVersion', 'slug', 'stageAudits'].sort(),
  );
  expect(proof.proofSchemaVersion, `${label}.proofSchemaVersion`).toBe(1);
  expect(proof.locale, `${label}.locale`).toBe('fr');
  expect(proof.slug, `${label}.slug`).toBe(slug);

  const stageAudits = asArray(proof.stageAudits, `${label}.stageAudits`);

  expect(stageAudits, `${label}.stageAudits`).toHaveLength(GENERATED_FRENCH_STAGE_EXPECTATIONS.length);

  for (const [index, expected] of GENERATED_FRENCH_STAGE_EXPECTATIONS.entries()) {
    const stageLabel = `${label}.stageAudits[${index}]`;
    const stageAudit = asRecord(stageAudits[index], stageLabel);

    expect(Object.keys(stageAudit).sort(), `${stageLabel} exact fields`).toEqual(
      ['audit', 'auditedSurface', 'device', 'stage'].sort(),
    );
    expect(stageAudit.stage, `${stageLabel}.stage`).toBe(expected.stage);
    expect(stageAudit.device, `${stageLabel}.device`).toBe(expected.device);
    expect(stageAudit.auditedSurface, `${stageLabel}.auditedSurface`).toMatch(
      /^(?:native-preview-frame|official-runtime-direct-page)$/u,
    );
    expectRecomputedGeneratedFrenchSurfaceAudit(stageAudit.audit, `${stageLabel}.audit`, slug, expected.phase);
  }

  const captureAudits = asArray(proof.captureAudits, `${label}.captureAudits`);

  expect(capturedStates, `${label} captured state fixture`).toHaveLength(12);
  expect(captureAudits, `${label}.captureAudits`).toHaveLength(12);

  for (const [index, expectedState] of capturedStates.entries()) {
    const captureLabel = `${label}.captureAudits[${index}]`;
    const captureAudit = asRecord(captureAudits[index], captureLabel);
    const expectedPhase = generatedFrenchCapturePhase(expectedState.filename);

    if (!expectedPhase) {
      throw new Error(`${captureLabel} has no declared generated French phase`);
    }

    expect(Object.keys(captureAudit).sort(), `${captureLabel} exact fields`).toEqual(
      ['audit', 'auditedSurface', 'captureSurface', 'device', 'filename', 'phase', 'theme'].sort(),
    );
    expect(
      {
        captureSurface: captureAudit.captureSurface,
        device: captureAudit.device,
        filename: captureAudit.filename,
        theme: captureAudit.theme,
      },
      `${captureLabel} exact photographed state`,
    ).toEqual(expectedState);
    expect(captureAudit.phase, `${captureLabel}.phase`).toBe(expectedPhase);

    const expectedAuditedSurface =
      captureAudit.captureSurface === 'official-runtime-direct'
        ? 'official-runtime-direct-page'
        : 'native-preview-frame';

    expect(captureAudit.auditedSurface, `${captureLabel}.auditedSurface`).toBe(expectedAuditedSurface);

    if (captureAudit.captureSurface === 'official-runtime-direct') {
      expect(['ide-webview-overview.png', 'ide-webview-iteration.png'], captureLabel).toContain(captureAudit.filename);
    }

    expectRecomputedGeneratedFrenchSurfaceAudit(captureAudit.audit, `${captureLabel}.audit`, slug, expectedPhase);
  }
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

function expectNativeWebviewAudit(value: unknown, label: string, expectedIdentity: string) {
  const audit = asRecord(value, label);
  const imageSize = asRecord(audit.imageSize, `${label}.imageSize`);

  expect(audit.attached, label).toBe(true);
  expect(audit.visible, label).toBe(true);
  expect(audit.identityVisible, label).toBe(true);
  expect(audit.nonBlank, label).toBe(true);
  expect(audit.textLength, label).toBeGreaterThanOrEqual(80);
  expect(audit.imageBytes, label).toBeGreaterThanOrEqual(6_000);
  expect(audit.entropy, label).toBeGreaterThanOrEqual(0.15);
  expect(audit.imageSha256, label).toMatch(/^[a-f0-9]{64}$/);
  expect(audit.horizontalOverflow, label).toBeLessThanOrEqual(1);
  expect(imageSize.width, label).toBeGreaterThan(0);
  expect(imageSize.height, label).toBeGreaterThan(0);
  expect(asString(audit.expectedIdentity, `${label}.expectedIdentity`), label).toBe(expectedIdentity);
  expect(asArray(audit.visibleErrors, `${label}.visibleErrors`), label).toEqual([]);
}

function expectDirectCaptureComposition(
  value: unknown,
  label: string,
  device: PreviewDevice,
  theme: (typeof SOLUTION_PROOF_VISUAL_THEMES)[number],
) {
  const audit = asRecord(value, label);
  const canvas = asRecord(audit.canvas, `${label}.canvas`);
  const capturedViewport = asRecord(audit.capturedViewport, `${label}.capturedViewport`);
  const sourceImage = asRecord(audit.sourceImage, `${label}.sourceImage`);
  const renderedRect = asRecord(audit.renderedRect, `${label}.renderedRect`);

  const expectedViewport = {
    desktop: { height: 900, width: 1440 },
    tablet: { height: 1024, width: 768 },
    mobile: { height: 844, width: 390 },
  }[device];
  const expectedRenderedRect = {
    desktop: { height: 900, width: 1440, x: 0, y: 0 },
    tablet: { height: 900, width: 675, x: 382, y: 0 },
    mobile: { height: 844, width: 390, x: 525, y: 28 },
  }[device];

  expect(canvas, label).toEqual({ height: 900, width: 1440 });
  expect(capturedViewport, label).toEqual(expectedViewport);
  expect(sourceImage, label).toEqual(expectedViewport);
  expect(renderedRect, label).toEqual(expectedRenderedRect);
  expect(audit.withoutEnlargement, label).toBe(true);
  expect(audit.position, label).toBe('centre');
  expect(audit.composed, label).toBe(device !== 'desktop');
  expect(audit.fit, label).toBe(device === 'desktop' ? 'native' : 'contain');
  expect(audit.background, label).toEqual(
    device === 'desktop'
      ? 'not-applicable'
      : theme === 'dark'
        ? { alpha: 1, b: 18, g: 15, r: 12 }
        : { alpha: 1, b: 250, g: 248, r: 246 },
  );
}

function expectVisualDifference(value: unknown, label: string) {
  const difference = asRecord(value, label);

  expect(difference.changedPixelRatio, label).toBeGreaterThanOrEqual(
    SOLUTION_PROOF_INTER_SLOT_THRESHOLDS.changedPixelRatio,
  );
  expect(difference.meanAbsoluteDifference, label).toBeGreaterThanOrEqual(
    SOLUTION_PROOF_INTER_SLOT_THRESHOLDS.meanAbsoluteDifference,
  );
}

function expectAccentAudit(value: unknown, label: string, requireOrangeAction = false) {
  const audit = asRecord(value, label);

  expect(audit.purpleCount, `${label}.purpleCount`).toBe(0);
  expect(audit.orangeCount, `${label}.orangeCount`).toBeGreaterThanOrEqual(audit.orangeActionCount as number);

  if (requireOrangeAction) {
    expect(audit.orangeActionCount, `${label}.orangeActionCount`).toBeGreaterThanOrEqual(1);
    expect(audit.orangeCount, `${label}.orangeCount`).toBeGreaterThanOrEqual(1);
  }

  return audit;
}

function expectResponsiveAccentCoverage(
  value: unknown,
  label: string,
  language: SolutionProofLanguage,
  initialAccentAudit: JsonRecord,
  interactionAccentAudit: JsonRecord,
) {
  const audits = asArray(value, label);
  const expected = RESPONSIVE_STATE_AUDIT_EXPECTATIONS[language];

  expect(audits, label).toHaveLength(expected.length);

  for (const [index, auditValue] of audits.entries()) {
    const auditLabel = `${label}[${index}]`;
    const entry = asRecord(auditValue, auditLabel);
    const expectedState = expected[index];

    expect({ stage: entry.stage, device: entry.device }, auditLabel).toEqual(expectedState);
    expectAccentAudit(entry.audit, `${auditLabel}.audit`, index === 0);
  }

  expect(asRecord(asRecord(audits[0], `${label}[0]`).audit, `${label}[0].audit`), label).toEqual(initialAccentAudit);

  const desktopInteraction = audits.find((auditValue, index) => {
    const entry = asRecord(auditValue, `${label}[${index}]`);

    return entry.stage === 'interaction' && entry.device === 'desktop';
  });

  expect(desktopInteraction, `${label} desktop interaction`).toBeDefined();
  expect(
    asRecord(asRecord(desktopInteraction, `${label}.desktopInteraction`).audit, `${label}.desktopInteraction.audit`),
    label,
  ).toEqual(interactionAccentAudit);
}

const TARGET_ORANGE_COLOR_PROPERTIES = [
  'backgroundColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderRightColor',
  'borderTopColor',
  'color',
] as const;

const TARGET_ORANGE_BORDER_PROPERTIES = [
  'borderBottomColor',
  'borderLeftColor',
  'borderRightColor',
  'borderTopColor',
] as const;

function asFiniteNumber(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }

  return value;
}

function cssRgbIsOrange(value: unknown, label: string) {
  const color = asString(value, label);

  const match = color.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)(?:\s*\/\s*([\d.]+)|[,\s]+([\d.]+))?\s*\)$/i,
  );

  if (!match || Number(match[4] ?? match[5] ?? 1) === 0) {
    return false;
  }

  const red = Number(match[1]) / 255;
  const green = Number(match[2]) / 255;
  const blue = Number(match[3]) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;

  if (delta === 0) {
    return false;
  }

  let hue = 0;

  if (maximum === red) {
    hue = ((green - blue) / delta) % 6;
  } else if (maximum === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  hue = Math.round(hue * 60);

  if (hue < 0) {
    hue += 360;
  }

  const lightness = (maximum + minimum) / 2;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));

  return saturation >= 0.38 && lightness >= 0.2 && lightness <= 0.82 && hue >= 10 && hue <= 42;
}

function expectTargetOrangeAudit(value: unknown, label: string) {
  const audit = asRecord(value, label);
  const ownColors = asRecord(audit.ownColors, `${label}.ownColors`);
  const rect = asRecord(audit.rect, `${label}.rect`);
  const viewport = asRecord(audit.viewport, `${label}.viewport`);

  const ownOrangeProperties = asArray(audit.ownOrangeProperties, `${label}.ownOrangeProperties`).map(
    (property, index) => asString(property, `${label}.ownOrangeProperties[${index}]`),
  );
  const renderedOwnBorderProperties = asArray(
    audit.renderedOwnBorderProperties,
    `${label}.renderedOwnBorderProperties`,
  ).map((property, index) => asString(property, `${label}.renderedOwnBorderProperties[${index}]`));

  expect(Object.keys(audit).sort(), `${label} exact fields`).toEqual(
    [
      'colorMatchesParent',
      'disabled',
      'effectivelyVisible',
      'elementTag',
      'enabled',
      'focused',
      'intersectionRatio',
      'inViewport',
      'orange',
      'ownColors',
      'ownOrangeProperties',
      'rect',
      'renderedOwnBorderProperties',
      'unoccluded',
      'viewport',
      'visible',
    ].sort(),
  );
  expect(Object.keys(ownColors).sort(), `${label}.ownColors exact fields`).toEqual(
    [...TARGET_ORANGE_COLOR_PROPERTIES].sort(),
  );
  expect(Object.keys(rect).sort(), `${label}.rect exact fields`).toEqual([
    'bottom',
    'height',
    'left',
    'right',
    'top',
    'width',
  ]);
  expect(Object.keys(viewport).sort(), `${label}.viewport exact fields`).toEqual(['height', 'width']);
  expect(audit.visible, label).toBe(true);
  expect(audit.effectivelyVisible, label).toBe(true);
  expect(audit.inViewport, label).toBe(true);
  expect(audit.unoccluded, label).toBe(true);
  expect(audit.enabled, label).toBe(true);
  expect(audit.disabled, label).toBe(false);
  expect(audit.focused, label).toBe(false);
  expect(audit.orange, label).toBe(true);
  expect(typeof audit.colorMatchesParent, `${label}.colorMatchesParent`).toBe('boolean');
  expect(asString(audit.elementTag, `${label}.elementTag`), label).toMatch(/^[a-z][a-z0-9-]*$/u);

  const intersectionRatio = asFiniteNumber(audit.intersectionRatio, `${label}.intersectionRatio`);
  const viewportWidth = asFiniteNumber(viewport.width, `${label}.viewport.width`);
  const viewportHeight = asFiniteNumber(viewport.height, `${label}.viewport.height`);
  const rectLeft = asFiniteNumber(rect.left, `${label}.rect.left`);
  const rectTop = asFiniteNumber(rect.top, `${label}.rect.top`);
  const rectRight = asFiniteNumber(rect.right, `${label}.rect.right`);
  const rectBottom = asFiniteNumber(rect.bottom, `${label}.rect.bottom`);
  const rectWidth = asFiniteNumber(rect.width, `${label}.rect.width`);
  const rectHeight = asFiniteNumber(rect.height, `${label}.rect.height`);

  expect(intersectionRatio, label).toBeGreaterThanOrEqual(0.98);
  expect(intersectionRatio, label).toBeLessThanOrEqual(1);
  expect(viewportWidth, label).toBeGreaterThan(0);
  expect(viewportHeight, label).toBeGreaterThan(0);
  expect(rectWidth, label).toBeGreaterThan(0);
  expect(rectHeight, label).toBeGreaterThan(0);
  expect(rectLeft, label).toBeGreaterThanOrEqual(0);
  expect(rectTop, label).toBeGreaterThanOrEqual(0);
  expect(rectRight, label).toBeLessThanOrEqual(viewportWidth);
  expect(rectBottom, label).toBeLessThanOrEqual(viewportHeight);
  expect(rectRight - rectLeft, label).toBeCloseTo(rectWidth, 3);
  expect(rectBottom - rectTop, label).toBeCloseTo(rectHeight, 3);
  expect(ownOrangeProperties.length, label).toBeGreaterThanOrEqual(1);
  expect(new Set(ownOrangeProperties).size, label).toBe(ownOrangeProperties.length);
  expect(new Set(renderedOwnBorderProperties).size, label).toBe(renderedOwnBorderProperties.length);

  for (const property of renderedOwnBorderProperties) {
    expect(TARGET_ORANGE_BORDER_PROPERTIES, `${label}.${property} rendered border`).toContain(property);
  }

  for (const property of ownOrangeProperties) {
    expect(TARGET_ORANGE_COLOR_PROPERTIES, `${label}.${property} own property`).toContain(property);
    expect(cssRgbIsOrange(ownColors[property], `${label}.ownColors.${property}`), label).toBe(true);

    if ((TARGET_ORANGE_BORDER_PROPERTIES as readonly string[]).includes(property)) {
      expect(renderedOwnBorderProperties, `${label}.${property} rendered border`).toContain(property);
    }

    if (property === 'color') {
      expect(audit.colorMatchesParent, `${label}.color must be owned by the target`).toBe(false);
    }
  }
}

function expectScenarioAudit(value: unknown, label: string, contract: SolutionProofInteractionContract) {
  const audit = asRecord(value, label);

  expect(audit.role, `${label}.role`).toBe(contract.role);
  expect(audit.name, `${label}.name`).toBe(contract.name);
  expect(audit.expectedResult, `${label}.expectedResult`).toBe(serializedInteractionExpectedResult(contract));
  expect(audit.exactTargetCount, `${label}.exactTargetCount`).toBe(1);
  expect(audit.resultMatchCount, `${label}.resultMatchCount`).toBeGreaterThanOrEqual(1);
  expect(audit.interactiveCount, `${label}.interactiveCount`).toBeGreaterThanOrEqual(3);
  expect(audit.stateChanged, `${label}.stateChanged`).toBe(true);
  expectTargetOrangeAudit(audit.targetOrangeAudit, `${label}.targetOrangeAudit`);
}

function expectPromptViewportAudit(value: unknown, label: string, expectedIdentity: string, expectedMessageId: string) {
  const audit = asRecord(value, label);
  const viewport = asRecord(audit.viewport, `${label}.viewport`);
  const identityVisibleRect = asRecord(audit.identityVisibleRect, `${label}.identityVisibleRect`);

  expect(audit.exactBubbleCount, label).toBe(1);
  expect(audit.bubbleMessageId, label).toBe(expectedMessageId);
  expect(audit.expectedMessageId, label).toBe(expectedMessageId);
  expect(audit.messageIdMatchesProvenance, label).toBe(true);
  expect(audit.expectedIdentity, label).toBe(expectedIdentity);
  expect(audit.identityExactText, label).toBe(expectedIdentity);
  expect(audit.identityVisible, label).toBe(true);
  expect(audit.identityVisibleRatio, label).toBeGreaterThanOrEqual(0.8);
  expect(identityVisibleRect.width, label).toBeGreaterThan(0);
  expect(identityVisibleRect.height, label).toBeGreaterThan(0);
  expect(audit.substantialBubbleIntersection, label).toBe(true);
  expect(audit.bubbleIntersectionArea, label).toBeGreaterThanOrEqual(8_000);
  expect(viewport, label).toEqual({ height: 900, width: 1440 });
}

function expectInterSlotDifferenceCoverage(value: unknown, label: string) {
  const audits = asArray(value, label);

  const expectedPairs = SOLUTION_PROOF_VISUAL_THEMES.flatMap((theme) =>
    solutionProofInterSlotPairs(CAPTURE_FILENAMES).map((pair) => ({ ...pair, theme })),
  );

  expect(audits, label).toHaveLength(30);
  expect(
    audits.map((auditValue, index) => {
      const audit = asRecord(auditValue, `${label}[${index}]`);

      expectVisualDifference(audit, `${label}[${index}]`);

      return {
        firstFilename: audit.firstFilename,
        secondFilename: audit.secondFilename,
        theme: audit.theme,
      };
    }),
    `${label} exact pairs`,
  ).toEqual(expectedPairs);
}

function expectResponsiveAudit(value: unknown, label: string, expected?: ResponsiveAuditExpectation) {
  const responsive = asRecord(value, label);

  const identity = {
    stage: asString(responsive.stage, `${label}.stage`),
    device: asString(responsive.device, `${label}.device`),
  };

  expect(identity.device, `${label}.device`).toMatch(/^(?:desktop|tablet|mobile)$/);

  if (expected) {
    expect(identity, `${label} stage/device`).toEqual(expected);
  }

  expect(responsive.identityVisible, label).toBe(true);
  expect(responsive.horizontalOverflow, label).toBeLessThanOrEqual(1);
  expect(responsive.textLength, label).toBeGreaterThanOrEqual(80);
  expect(responsive.imageBytes, label).toBeGreaterThanOrEqual(6_000);
  expect(responsive.entropy, label).toBeGreaterThanOrEqual(0.15);

  return responsive;
}

function expectResponsiveStateAuditCoverage(value: unknown, label: string, language: SolutionProofLanguage) {
  const audits = asArray(value, label);
  const expected = RESPONSIVE_STATE_AUDIT_EXPECTATIONS[language];

  expect(audits, label).toHaveLength(expected.length);

  for (const [auditIndex, auditValue] of audits.entries()) {
    const auditExpectation = expected[auditIndex];

    if (!auditExpectation) {
      throw new Error(`${label}[${auditIndex}] has no declared ${language.toUpperCase()} responsive state`);
    }

    expectResponsiveAudit(auditValue, `${label}[${auditIndex}]`, auditExpectation);
  }

  const coveredDevices = new Set(
    audits.map((auditValue, auditIndex) =>
      asString(asRecord(auditValue, `${label}[${auditIndex}]`).device, `${label}[${auditIndex}].device`),
    ),
  );

  expect(coveredDevices, `${label} device coverage`).toEqual(new Set<PreviewDevice>(['desktop', 'tablet', 'mobile']));

  return audits;
}

function expectThemedCaptureCoverage(value: unknown, label: string, language: SolutionProofLanguage) {
  const audits = asArray(value, label);
  const expectedDevices = THEMED_CAPTURE_DEVICE_EXPECTATIONS[language];

  expect(audits, label).toHaveLength(CAPTURE_FILENAMES.length);
  expect(
    audits.map((auditValue, auditIndex) => asRecord(auditValue, `${label}[${auditIndex}]`).filename),
    `${label} filenames`,
  ).toEqual(CAPTURE_FILENAMES);
  expect(expectedDevices, `${label} fixture/device alignment`).toHaveLength(CAPTURE_FILENAMES.length);

  for (const [auditIndex, auditValue] of audits.entries()) {
    const auditLabel = `${label}[${auditIndex}]`;
    const audit = asRecord(auditValue, auditLabel);
    const filename = asString(audit.filename, `${auditLabel}.filename`);
    const expectedDevice = expectedDevices[auditIndex];
    const states = asArray(audit.states, `${auditLabel}.states`);

    if (!expectedDevice) {
      throw new Error(`${auditLabel} has no declared ${language.toUpperCase()} Preview device`);
    }

    expect(states, `${auditLabel}.states`).toHaveLength(SOLUTION_PROOF_VISUAL_THEMES.length);

    for (const [stateIndex, stateValue] of states.entries()) {
      const stateLabel = `${auditLabel}.states[${stateIndex}]`;
      const state = asRecord(stateValue, stateLabel);
      const expectedTheme = SOLUTION_PROOF_VISUAL_THEMES[stateIndex];

      if (!expectedTheme) {
        throw new Error(`${stateLabel} has no declared capture theme`);
      }

      expect(state.theme, `${stateLabel}.theme`).toBe(expectedTheme);
      expect(state.device, `${stateLabel}.device`).toBe(expectedDevice);
      expectResponsiveAudit(state.responsive, `${stateLabel}.responsive`, {
        stage: `${filename.replace(/\.png$/u, '')}-${expectedTheme}`,
        device: expectedDevice,
      });
    }
  }

  const coveredDevices = new Set(expectedDevices);

  expect(coveredDevices, `${label} device coverage`).toEqual(new Set<PreviewDevice>(['desktop', 'tablet', 'mobile']));

  return audits;
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

    expect(() =>
      expectVisualDifference({ changedPixelRatio: 0.2, meanAbsoluteDifference: 12 }, 'native-theme-difference'),
    ).not.toThrow();
    expect(() => expectVisualDifference(undefined, 'missing-native-theme-difference')).toThrow();
    expect(() =>
      expectVisualDifference({ changedPixelRatio: 0.001, meanAbsoluteDifference: 1 }, 'weak-native-theme-difference'),
    ).toThrow();
  });

  it('requires the exact interaction target itself to be a normal-state visible orange action', () => {
    const contract = SOLUTION_PROOF_INTERACTION_CONTRACTS['website-builder'].en;

    const targetOrangeAudit = () => ({
      colorMatchesParent: false,
      disabled: false,
      effectivelyVisible: true,
      elementTag: 'a',
      enabled: true,
      focused: false,
      intersectionRatio: 1,
      inViewport: true,
      orange: true,
      ownColors: {
        backgroundColor: 'rgb(249, 115, 22)',
        borderBottomColor: 'rgb(249, 115, 22)',
        borderLeftColor: 'rgb(249, 115, 22)',
        borderRightColor: 'rgb(249, 115, 22)',
        borderTopColor: 'rgb(249, 115, 22)',
        color: 'rgb(255, 255, 255)',
      },
      ownOrangeProperties: ['backgroundColor'],
      rect: { bottom: 148, height: 48, left: 100, right: 300, top: 100, width: 200 },
      renderedOwnBorderProperties: [],
      unoccluded: true,
      viewport: { height: 900, width: 1440 },
      visible: true,
    });
    const scenarioAudit = (target: unknown) => ({
      role: contract.role,
      name: contract.name,
      expectedResult: serializedInteractionExpectedResult(contract),
      exactTargetCount: 1,
      resultMatchCount: 1,
      interactiveCount: 4,
      stateChanged: true,
      targetOrangeAudit: target,
    });

    expect(() => expectScenarioAudit(scenarioAudit(targetOrangeAudit()), 'valid-target', contract)).not.toThrow();

    for (const [caseName, target] of [
      ['missing', undefined],
      ['not-visible', { ...targetOrangeAudit(), visible: false }],
      ['not-effectively-visible', { ...targetOrangeAudit(), effectivelyVisible: false }],
      ['outside-viewport', { ...targetOrangeAudit(), inViewport: false, intersectionRatio: 0.5 }],
      ['occluded', { ...targetOrangeAudit(), unoccluded: false }],
      ['not-enabled', { ...targetOrangeAudit(), enabled: false }],
      ['disabled', { ...targetOrangeAudit(), disabled: true }],
      ['focus-only', { ...targetOrangeAudit(), focused: true }],
      ['not-orange', { ...targetOrangeAudit(), orange: false }],
      ['no-own-orange', { ...targetOrangeAudit(), ownOrangeProperties: [] }],
      ['decorated-parent-only', { ...targetOrangeAudit(), parentColor: 'rgb(249, 115, 22)', ownOrangeProperties: [] }],
      [
        'inherited-parent-color',
        {
          ...targetOrangeAudit(),
          colorMatchesParent: true,
          ownColors: {
            ...targetOrangeAudit().ownColors,
            backgroundColor: 'rgb(37, 99, 235)',
            color: 'rgb(249, 115, 22)',
          },
          ownOrangeProperties: ['color'],
        },
      ],
      [
        'forged-orange-property',
        {
          ...targetOrangeAudit(),
          ownColors: { ...targetOrangeAudit().ownColors, backgroundColor: 'rgb(37, 99, 235)' },
        },
      ],
      [
        'unrendered-orange-border',
        {
          ...targetOrangeAudit(),
          ownOrangeProperties: ['borderTopColor'],
          renderedOwnBorderProperties: [],
        },
      ],
    ] as const) {
      expect(
        () => expectScenarioAudit(scenarioAudit(target), `invalid-target-${caseName}`, contract),
        caseName,
      ).toThrow();
    }
  });

  it('rejects incomplete or mislabeled top-level responsive manifest coverage', () => {
    const fixture = (language: SolutionProofLanguage) =>
      RESPONSIVE_STATE_AUDIT_EXPECTATIONS[language].map((expected) => ({
        ...expected,
        identityVisible: true,
        horizontalOverflow: 0,
        textLength: 240,
        imageBytes: 12_000,
        entropy: 0.75,
      }));

    const english = fixture('en');
    const french = fixture('fr');

    expect(() => expectResponsiveStateAuditCoverage(english, 'english-responsive', 'en')).not.toThrow();
    expect(() => expectResponsiveStateAuditCoverage(french, 'french-responsive', 'fr')).not.toThrow();
    expect(english).toHaveLength(5);
    expect(french).toHaveLength(6);

    expect(() => expectResponsiveStateAuditCoverage(english.slice(0, -1), 'missing-english-state', 'en')).toThrow();
    expect(() =>
      expectResponsiveStateAuditCoverage(
        english.map((audit, index) => (index === 1 ? { ...audit, device: 'desktop' } : audit)),
        'wrong-english-device',
        'en',
      ),
    ).toThrow();
    expect(() =>
      expectResponsiveStateAuditCoverage(
        french.map((audit, index) => (index === 1 ? { ...audit, stage: 'overview' } : audit)),
        'wrong-french-stage',
        'fr',
      ),
    ).toThrow();
  });

  it('rejects missing native Webview evidence and forged direct viewport metadata', () => {
    const nativeAudit = {
      attached: true,
      entropy: 0.75,
      expectedIdentity: 'PeopleOps',
      horizontalOverflow: 0,
      identityVisible: true,
      imageBytes: 12_000,
      imageSha256: 'a'.repeat(64),
      imageSize: { height: 600, width: 900 },
      nonBlank: true,
      textLength: 240,
      visible: true,
      visibleErrors: [],
    };

    expect(() => expectNativeWebviewAudit(nativeAudit, 'native', 'PeopleOps')).not.toThrow();
    expect(() => expectNativeWebviewAudit(undefined, 'missing-native', 'PeopleOps')).toThrow();
    expect(() =>
      expectNativeWebviewAudit({ ...nativeAudit, expectedIdentity: 'Other' }, 'wrong-native', 'PeopleOps'),
    ).toThrow();

    const tabletComposition = {
      background: { alpha: 1, b: 250, g: 248, r: 246 },
      canvas: { height: 900, width: 1440 },
      capturedViewport: { height: 1024, width: 768 },
      composed: true,
      fit: 'contain',
      position: 'centre',
      renderedRect: { height: 900, width: 675, x: 382, y: 0 },
      sourceImage: { height: 1024, width: 768 },
      withoutEnlargement: true,
    };

    expect(() => expectDirectCaptureComposition(tabletComposition, 'tablet', 'tablet', 'light')).not.toThrow();
    expect(() =>
      expectDirectCaptureComposition(
        {
          ...tabletComposition,
          capturedViewport: { height: 900, width: 1440 },
          sourceImage: { height: 900, width: 1440 },
        },
        'forged-tablet',
        'tablet',
        'light',
      ),
    ).toThrow();
  });

  it('rejects missing slots, themes, or locale-specific devices in themed manifest coverage', () => {
    const fixture = (language: SolutionProofLanguage) =>
      CAPTURE_FILENAMES.map((filename, auditIndex) => {
        const device = THEMED_CAPTURE_DEVICE_EXPECTATIONS[language][auditIndex];

        if (!device) {
          throw new Error(`Missing ${language} fixture device for ${filename}`);
        }

        return {
          filename,
          states: SOLUTION_PROOF_VISUAL_THEMES.map((theme) => ({
            theme,
            device,
            responsive: {
              stage: `${filename.replace(/\.png$/u, '')}-${theme}`,
              device,
              identityVisible: true,
              horizontalOverflow: 0,
              textLength: 240,
              imageBytes: 12_000,
              entropy: 0.75,
            },
          })),
        };
      });

    const english = fixture('en');
    const french = fixture('fr');

    expect(() => expectThemedCaptureCoverage(english, 'english-themed', 'en')).not.toThrow();
    expect(() => expectThemedCaptureCoverage(french, 'french-themed', 'fr')).not.toThrow();
    expect(() => expectThemedCaptureCoverage(english.slice(0, -1), 'missing-slot', 'en')).toThrow();
    expect(() =>
      expectThemedCaptureCoverage(
        english.map((audit, index) => (index === 0 ? { ...audit, states: audit.states.slice(0, 1) } : audit)),
        'missing-dark-state',
        'en',
      ),
    ).toThrow();
    expect(() =>
      expectThemedCaptureCoverage(
        french.map((audit, index) =>
          index === 1
            ? {
                ...audit,
                states: audit.states.map((state) => ({
                  ...state,
                  device: 'desktop',
                  responsive: { ...state.responsive, device: 'desktop' },
                })),
              }
            : audit,
        ),
        'wrong-french-preview-device',
        'fr',
      ),
    ).toThrow();
  });

  it('recomputes every French surface audit and rejects missing, forged, reordered, or English proof blocks', () => {
    const slug = 'website-builder' as const;
    const contract = GENERATED_FR_SCENARIO_CONTRACTS[slug];

    const auditFixture = (phase: GeneratedFrSurfacePhase): GeneratedFrSurfaceAudit => {
      const required = [...contract.required, ...(phase === 'base' ? [] : contract.requiredByPhase[phase])];

      return inspectGeneratedFrenchSurface(
        {
          documentLanguage: 'fr-FR',
          entries: required.map((value, index) => ({
            selector: `body > main > p:nth-of-type(${index + 1})`,
            source: 'text',
            value,
          })),
          rootSelector: 'body',
        },
        { phase, slug },
      );
    };

    const capturedStates: GeneratedFrenchCaptureStateExpectation[] = CAPTURE_FILENAMES.flatMap(
      (filename, filenameIndex) => {
        const device = THEMED_CAPTURE_DEVICE_EXPECTATIONS.fr[filenameIndex];

        if (!device) {
          throw new Error(`Missing French fixture device for ${filename}`);
        }

        return SOLUTION_PROOF_VISUAL_THEMES.map((theme) => ({
          captureSurface: 'ide-shell-native-webview',
          device,
          filename,
          theme,
        }));
      },
    );

    const proof = {
      captureAudits: capturedStates.map((state) => {
        const phase = generatedFrenchCapturePhase(state.filename);

        if (!phase) {
          throw new Error(`Missing French fixture phase for ${state.filename}`);
        }

        return {
          audit: auditFixture(phase),
          auditedSurface: 'native-preview-frame',
          captureSurface: state.captureSurface,
          device: state.device,
          filename: state.filename,
          phase,
          theme: state.theme,
        };
      }),
      locale: 'fr',
      proofSchemaVersion: 1,
      slug,
      stageAudits: GENERATED_FRENCH_STAGE_EXPECTATIONS.map(({ device, phase, stage }) => ({
        audit: auditFixture(phase),
        auditedSurface: 'native-preview-frame',
        device,
        stage,
      })),
    };

    expect(() => expectGeneratedFrenchSurfaceProof(proof, 'valid-fr-proof', slug, 'fr', capturedStates)).not.toThrow();
    expect(() =>
      expectGeneratedFrenchSurfaceProof(undefined, 'missing-fr-proof', slug, 'fr', capturedStates),
    ).toThrow();
    expect(() => expectGeneratedFrenchSurfaceProof(proof, 'forbidden-en-proof', slug, 'en', capturedStates)).toThrow();

    const missingStage = { ...proof, stageAudits: proof.stageAudits.slice(0, -1) };

    expect(() =>
      expectGeneratedFrenchSurfaceProof(missingStage, 'missing-stage', slug, 'fr', capturedStates),
    ).toThrow();

    const reorderedCapture = {
      ...proof,
      captureAudits: [proof.captureAudits[1], proof.captureAudits[0], ...proof.captureAudits.slice(2)],
    };

    expect(() =>
      expectGeneratedFrenchSurfaceProof(reorderedCapture, 'reordered-capture', slug, 'fr', capturedStates),
    ).toThrow();

    const forgedAudit = {
      ...proof,
      stageAudits: proof.stageAudits.map((stageAudit, index) =>
        index === 0 ? { ...stageAudit, audit: { ...stageAudit.audit, passed: false } } : stageAudit,
      ),
    };

    expect(() => expectGeneratedFrenchSurfaceProof(forgedAudit, 'forged-audit', slug, 'fr', capturedStates)).toThrow();
  });

  it('requires strict runtime recovery provenance bound to the promoted persisted revision', () => {
    const projectFilesRevision = 'b'.repeat(64);

    const emptyRecoveryProof = {
      packagePolicy: {
        packageJsonBytes: 2,
        packageJsonSha256: 'a'.repeat(64),
        packagePath: 'package.json',
        projectFilesRevision,
        scope: 'final-persisted-manifest',
        verified: true,
      },
      runtimeRecovery: {
        attemptCount: 0,
        commandCount: 0,
        commands: [],
        counts: { auto: 0, 'reinstall-ui': 0, terminal: 0 },
        events: [],
        mode: 'none',
        reasons: [],
      },
      schemaVersion: SOLUTION_RUNTIME_RECOVERY_PROOF_SCHEMA_VERSION,
    };

    expect(() => expectRuntimeRecoveryProof(emptyRecoveryProof, 'empty-recovery', projectFilesRevision)).not.toThrow();
    expect(() => expectRuntimeRecoveryProof(emptyRecoveryProof, 'wrong-revision', 'c'.repeat(64))).toThrow();

    const recoveryProofWithCommand = (source: 'auto' | 'terminal', command: string) => ({
      ...emptyRecoveryProof,
      runtimeRecovery: {
        attemptCount: 1,
        commandCount: 1,
        commands: [{ count: 1, sources: [source], value: command }],
        counts: { auto: source === 'auto' ? 1 : 0, 'reinstall-ui': 0, terminal: source === 'terminal' ? 1 : 0 },
        events: [{ commands: [command], reason: 'Preview recovery was required', sequence: 1, source }],
        mode: source,
        reasons: [{ count: 1, sources: [source], value: 'Preview recovery was required' }],
      },
    });

    const inventedAutoCommand = recoveryProofWithCommand('auto', 'npm run dev');
    const unobservedTerminalCommand = recoveryProofWithCommand('terminal', 'npm run dev');

    expect(validateSolutionRuntimeRecoveryProofManifest(inventedAutoCommand)).toEqual({ valid: true });
    expect(validateSolutionRuntimeRecoveryProofManifest(unobservedTerminalCommand)).toEqual({ valid: true });
    expect(() =>
      expectRuntimeRecoveryProof(inventedAutoCommand, 'invented-auto-command', projectFilesRevision),
    ).toThrow();
    expect(() =>
      expectRuntimeRecoveryProof(unobservedTerminalCommand, 'unobserved-terminal-command', projectFilesRevision),
    ).toThrow();
  });

  it('records only submitted terminal commands and validates final snapshot proof before public promotion', () => {
    const captureSource = readFileSync(resolve(process.cwd(), 'scripts/capture-app-builder-ide-proof.ts'), 'utf8');
    const terminalStart = captureSource.indexOf('const startPreviewFromTerminal = async () =>');
    const terminalEnd = captureSource.indexOf('const waitForPreviewSurface = () =>', terminalStart);
    const terminalSource = captureSource.slice(terminalStart, terminalEnd);

    for (const commandName of ['dependencyInstallCommand', 'viteVersionCommand', 'devServerCommand']) {
      const typeIndex = terminalSource.indexOf(`page.keyboard.type(${commandName})`);
      const enterIndex = terminalSource.indexOf("page.keyboard.press('Enter')", typeIndex);
      const recordIndex = terminalSource.indexOf(`submittedTerminalCommands.push(${commandName})`, enterIndex);

      expect(typeIndex, commandName).toBeGreaterThan(0);
      expect(enterIndex, commandName).toBeGreaterThan(typeIndex);
      expect(recordIndex, commandName).toBeGreaterThan(enterIndex);
    }

    expect(terminalSource).toContain("source: 'terminal'");
    expect(terminalSource).toContain('commands: submittedTerminalCommands');
    expect(captureSource).toMatch(/source: 'auto',[\s\S]{0,180}commands: \[\]/u);
    expect(captureSource).toMatch(/source: 'reinstall-ui',[\s\S]{0,180}commands: \[\]/u);

    const proofGateStart = captureSource.indexOf('async function verifyRuntimeFilesBeforePromotion(');
    const proofGateEnd = captureSource.indexOf('async function readRuntimePreviewPorts(', proofGateStart);
    const proofGateSource = captureSource.slice(proofGateStart, proofGateEnd);

    expect(proofGateSource).toContain('result.snapshot.files.filter');
    expect(proofGateSource).toContain('projectFilesRevision: result.snapshot.revision');
    expect(proofGateSource).toContain('buildFinalPersistedManifestPackagePolicyProof(finalPackagePolicyInput)');
    expect(proofGateSource).toContain('runtimeRecoveryProofTracker.manifest(packagePolicy)');
    expect(proofGateSource).toContain('validateSolutionRuntimeRecoveryProofManifest(');

    const promotionIndex = captureSource.indexOf('const promotedAssets = await promoteVerifiedThemedAssets');
    const finalProofGateIndex = captureSource.lastIndexOf('await verifyRuntimeFilesBeforePromotion(', promotionIndex);
    const captureResultIndex = captureSource.indexOf('const captureResult = {', promotionIndex);

    expect(finalProofGateIndex).toBeGreaterThan(0);
    expect(finalProofGateIndex).toBeLessThan(promotionIndex);
    expect(captureResultIndex).toBeGreaterThan(promotionIndex);
    expect(captureSource.slice(captureResultIndex, captureResultIndex + 1_500)).toContain('runtimeRecoveryProof,');

    const resumeGateIndex = captureSource.indexOf('if (resume && !repairOnly)');

    const trackerIndex = captureSource.indexOf(
      'const runtimeRecoveryProofTracker = createRuntimeRecoveryProofTracker()',
    );

    const browserLaunchIndex = captureSource.indexOf('await chromium.launch', trackerIndex);

    expect(resumeGateIndex).toBeGreaterThan(0);
    expect(trackerIndex).toBeGreaterThan(resumeGateIndex);
    expect(browserLaunchIndex).toBeGreaterThan(trackerIndex);
  });

  it('runs exact Page/Frame French audits and the complete proof gate before public promotion', () => {
    const captureSource = readFileSync(resolve(process.cwd(), 'scripts/capture-app-builder-ide-proof.ts'), 'utf8');

    const directAuditIndex = captureSource.indexOf(
      'generatedFrenchSurfaceAudit = await auditGeneratedFrenchSurface(directPage',
    );
    const directScreenshotIndex = captureSource.indexOf(
      'const nativeScreenshot = await directPage.screenshot',
      directAuditIndex,
    );

    const nativeGuardIndex = captureSource.indexOf('await beginIdeScreenshotGuard(page);');

    const nativeAuditIndex = captureSource.indexOf(
      'generatedFrenchSurfaceAudit = await auditGeneratedFrenchSurface(nativeFrame',
      nativeGuardIndex,
    );

    const nativeScreenshotIndex = captureSource.indexOf('await page.screenshot({', nativeAuditIndex);
    const promotionIndex = captureSource.indexOf('const promotedAssets = await promoteVerifiedThemedAssets');

    const completeProofGateIndex = captureSource.lastIndexOf(
      'const verifiedGeneratedFrenchSurfaceProof = assertCompleteGeneratedFrenchSurfaceProof',
      promotionIndex,
    );

    expect(directAuditIndex).toBeGreaterThan(0);
    expect(directScreenshotIndex).toBeGreaterThan(directAuditIndex);
    expect(nativeGuardIndex).toBeGreaterThan(0);
    expect(nativeAuditIndex).toBeGreaterThan(nativeGuardIndex);
    expect(nativeScreenshotIndex).toBeGreaterThan(nativeAuditIndex);
    expect(completeProofGateIndex).toBeGreaterThan(0);
    expect(completeProofGateIndex).toBeLessThan(promotionIndex);
    expect(captureSource).toContain("locale !== 'fr' || slug === 'app-builder'");
    expect(captureSource).toContain('fixez l’attribut lang de l’élément html à exactement "fr"');
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
        const expectedIdentity = COPY[slug][language].demo.brand;

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

        const promptSurfaceProvenance = asRecord(manifest.promptSurfaceProvenance, `${label}.promptSurfaceProvenance`);

        const promptMessageId = asString(
          promptSurfaceProvenance.messageId,
          `${label}.promptSurfaceProvenance.messageId`,
        );

        const initialAccentAudit = expectAccentAudit(manifest.accentAudit, `${label}.accentAudit`, true);

        const interactionAccentAudit = expectAccentAudit(
          manifest.interactionAccentAudit,
          `${label}.interactionAccentAudit`,
        );

        expectResponsiveAccentCoverage(
          manifest.responsiveAccentAudits,
          `${label}.responsiveAccentAudits`,
          language,
          initialAccentAudit,
          interactionAccentAudit,
        );
        expectInterSlotDifferenceCoverage(manifest.interSlotDifferences, `${label}.interSlotDifferences`);
        expectScenarioAudit(
          manifest.scenarioAudit,
          `${label}.scenarioAudit`,
          SOLUTION_PROOF_INTERACTION_CONTRACTS[slug][language],
        );

        const runtimePromotionProof = asRecord(manifest.runtimePromotionProof, `${label}.runtimePromotionProof`);

        const runtimePromotionRevision = asString(
          runtimePromotionProof.projectFilesRevision,
          `${label}.runtimePromotionProof.projectFilesRevision`,
        );

        expect(
          asString(runtimePromotionProof.workspaceId, `${label}.runtimePromotionProof.workspaceId`),
          label,
        ).toMatch(/^ws-[a-z0-9]+$/);
        expect(runtimePromotionRevision, label).toMatch(/^[a-f0-9]{64}$/);
        expect(runtimePromotionProof.matchingReads, label).toBeGreaterThanOrEqual(4);
        expect(runtimePromotionProof.stableForMs, label).toBeGreaterThanOrEqual(12_000);
        expectRuntimeRecoveryProof(
          manifest.runtimeRecoveryProof,
          `${label}.runtimeRecoveryProof`,
          runtimePromotionRevision,
        );

        const audits = expectThemedCaptureCoverage(
          manifest.themedCaptureAudits,
          `${label}.themedCaptureAudits`,
          language,
        );

        const generatedFrenchCapturedStates = audits.flatMap((auditValue, auditIndex) => {
          const auditLabel = `${label}.themedCaptureAudits[${auditIndex}]`;
          const audit = asRecord(auditValue, auditLabel);
          const filename = asString(audit.filename, `${auditLabel}.filename`);
          const states = asArray(audit.states, `${auditLabel}.states`);

          return states.map((stateValue, stateIndex) => {
            const stateLabel = `${auditLabel}.states[${stateIndex}]`;
            const state = asRecord(stateValue, stateLabel);

            return {
              captureSurface: asString(state.captureSurface, `${stateLabel}.captureSurface`),
              device: asString(state.device, `${stateLabel}.device`),
              filename,
              theme: asString(state.theme, `${stateLabel}.theme`),
            };
          });
        });

        expectGeneratedFrenchSurfaceProof(
          manifest.generatedFrenchSurfaceProof,
          `${label}.generatedFrenchSurfaceProof`,
          slug,
          language,
          generatedFrenchCapturedStates,
        );

        for (const [auditIndex, value] of audits.entries()) {
          const auditLabel = `${label}.themedCaptureAudits[${auditIndex}]`;
          const audit = asRecord(value, auditLabel);
          const filename = asString(audit.filename, `${auditLabel}.filename`);
          const states = asArray(audit.states, `${auditLabel}.states`);
          expectVisualDifference(audit.themeDifference, `${auditLabel}.themeDifference`);

          const usesShellCapture = states.some(
            (stateValue, stateIndex) =>
              asRecord(stateValue, `${auditLabel}.states[${stateIndex}]`).captureSurface !== 'official-runtime-direct',
          );
          const captureSurfaces = new Set(
            states.map((stateValue, stateIndex) =>
              asString(
                asRecord(stateValue, `${auditLabel}.states[${stateIndex}]`).captureSurface,
                `${auditLabel}.states[${stateIndex}].captureSurface`,
              ),
            ),
          );

          expect(captureSurfaces.size, `${auditLabel} capture surface must stay stable across themes`).toBe(1);

          if (usesShellCapture) {
            expectVisualDifference(audit.nativeWebviewThemeDifference, `${auditLabel}.nativeWebviewThemeDifference`);
            expect(audit.directRuntimeThemeDifference, auditLabel).toBeUndefined();
          } else {
            expect(audit.nativeWebviewThemeDifference, auditLabel).toBeUndefined();
            expectVisualDifference(audit.directRuntimeThemeDifference, `${auditLabel}.directRuntimeThemeDifference`);
          }

          for (const [stateIndex, stateValue] of states.entries()) {
            const stateLabel = `${auditLabel}.states[${stateIndex}]`;
            const state = asRecord(stateValue, stateLabel);
            const applicationTheme = asRecord(state.applicationTheme, `${stateLabel}.applicationTheme`);
            expectAccentAudit(state.accent, `${stateLabel}.accent`);
            expectCleanShell(state.shell, `${stateLabel}.shell`);
            expect(applicationTheme.activeTheme, stateLabel).toBe(state.theme);
            expect(applicationTheme.strategy, stateLabel).toMatch(
              /^(?:explicit-state-already-applied|visible-runtime-control)$/,
            );
            expect(state.device, stateLabel).toMatch(/^(?:desktop|tablet|mobile)$/);
            expect(state.captureSurface, stateLabel).toMatch(
              /^(?:ide-shell-native-webview|ide-shell-official-runtime-verified|official-runtime-direct)$/,
            );

            if (state.captureSurface === 'official-runtime-direct') {
              expect(['ide-webview-overview.png', 'ide-webview-iteration.png'], stateLabel).toContain(filename);

              const provenance = expectCleanRuntimeProvenance(state.provenance, `${stateLabel}.provenance`);

              expect(provenance.mode, stateLabel).toBe('official-runtime-direct');
              expectDirectCaptureComposition(
                state.directCaptureComposition,
                `${stateLabel}.directCaptureComposition`,
                state.device as PreviewDevice,
                state.theme as (typeof SOLUTION_PROOF_VISUAL_THEMES)[number],
              );
              expect(state.nativeWebviewAudit, stateLabel).toBeUndefined();
            }

            if (state.captureSurface === 'ide-shell-official-runtime-verified') {
              expect(state.provenance, stateLabel).toBeUndefined();
              expectNativeWebviewAudit(state.nativeWebviewAudit, `${stateLabel}.nativeWebviewAudit`, expectedIdentity);
              expect(state.directCaptureComposition, stateLabel).toBeUndefined();
            }

            if (state.captureSurface === 'ide-shell-native-webview') {
              expect(state.provenance, stateLabel).toBeUndefined();
              expectNativeWebviewAudit(state.nativeWebviewAudit, `${stateLabel}.nativeWebviewAudit`, expectedIdentity);
              expect(state.directCaptureComposition, stateLabel).toBeUndefined();
            }

            if (filename === 'ide-agent-prompt.png') {
              expect(state.captureSurface, stateLabel).not.toBe('official-runtime-direct');
              expectPromptViewportAudit(
                state.promptViewportAudit,
                `${stateLabel}.promptViewportAudit`,
                expectedIdentity,
                promptMessageId,
              );
            } else {
              expect(state.promptViewportAudit, stateLabel).toBeUndefined();
            }
          }
        }

        expectResponsiveStateAuditCoverage(manifest.responsiveStateAudits, `${label}.responsiveStateAudits`, language);
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
