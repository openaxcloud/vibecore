import { createHash } from 'node:crypto';

import { validateGeneratedSolutionPackageJson } from './solution-generated-package-policy.js';

export const RUNTIME_RECOVERY_MODES = ['none', 'auto', 'reinstall-ui', 'terminal'] as const;
export const RUNTIME_RECOVERY_SOURCES = ['auto', 'reinstall-ui', 'terminal'] as const;
export const FINAL_PERSISTED_MANIFEST_SCOPE = 'final-persisted-manifest' as const;
export const SOLUTION_RUNTIME_RECOVERY_PROOF_SCHEMA_VERSION = 1 as const;

export type RuntimeRecoveryMode = (typeof RUNTIME_RECOVERY_MODES)[number];
export type RuntimeRecoverySource = (typeof RUNTIME_RECOVERY_SOURCES)[number];

export type RuntimeRecoveryEventInput = Readonly<{
  commands: readonly string[];
  reason: string;
  source: RuntimeRecoverySource;
}>;

export type RuntimeRecoveryEvent = RuntimeRecoveryEventInput &
  Readonly<{
    sequence: number;
  }>;

export type RuntimeRecoveryAggregate = Readonly<{
  count: number;
  sources: readonly RuntimeRecoverySource[];
  value: string;
}>;

export type RuntimeRecoveryRecord = Readonly<{
  attemptCount: number;
  commandCount: number;
  commands: readonly RuntimeRecoveryAggregate[];
  counts: Readonly<Record<RuntimeRecoverySource, number>>;
  events: readonly RuntimeRecoveryEvent[];

  /** Highest recovery escalation reached; `none` is valid only with zero events. */
  mode: RuntimeRecoveryMode;
  reasons: readonly RuntimeRecoveryAggregate[];
}>;

export type FinalPersistedManifestPackagePolicyInput = Readonly<{
  packageJsonSource: string;
  projectFilesRevision: string;
}>;

export type FinalPersistedManifestPackagePolicyProof = Readonly<{
  packageJsonBytes: number;
  packageJsonSha256: string;
  packagePath: 'package.json';
  projectFilesRevision: string;
  scope: typeof FINAL_PERSISTED_MANIFEST_SCOPE;
  verified: true;
}>;

export type SolutionRuntimeRecoveryProofManifest = Readonly<{
  packagePolicy: FinalPersistedManifestPackagePolicyProof;
  runtimeRecovery: RuntimeRecoveryRecord;
  schemaVersion: typeof SOLUTION_RUNTIME_RECOVERY_PROOF_SCHEMA_VERSION;
}>;

export type RuntimeRecoveryProofValidationResult =
  | Readonly<{ valid: true }>
  | Readonly<{ errors: readonly string[]; valid: false }>;

export class RuntimeRecoveryProofError extends Error {
  readonly errors: readonly string[];

  constructor(message: string, errors: readonly string[]) {
    super(`${message}:\n- ${errors.join('\n- ')}`);
    this.name = 'RuntimeRecoveryProofError';
    this.errors = Object.freeze([...errors]);
  }
}

const RECOVERY_SOURCE_RANK = {
  auto: 1,
  'reinstall-ui': 2,
  terminal: 3,
} as const satisfies Record<RuntimeRecoverySource, number>;

const RECOVERY_EVENT_KEYS = ['commands', 'reason', 'source'] as const;
const RECOVERY_EVENT_WITH_SEQUENCE_KEYS = ['commands', 'reason', 'sequence', 'source'] as const;
const RECOVERY_AGGREGATE_KEYS = ['count', 'sources', 'value'] as const;

const RECOVERY_RECORD_KEYS = [
  'attemptCount',
  'commandCount',
  'commands',
  'counts',
  'events',
  'mode',
  'reasons',
] as const;

const RECOVERY_COUNTS_KEYS = ['auto', 'reinstall-ui', 'terminal'] as const;

const PACKAGE_POLICY_KEYS = [
  'packageJsonBytes',
  'packageJsonSha256',
  'packagePath',
  'projectFilesRevision',
  'scope',
  'verified',
] as const;

const PROOF_MANIFEST_KEYS = ['packagePolicy', 'runtimeRecovery', 'schemaVersion'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value) ?? 'undefined';
}

function hasCanonicalObjectShape(value: Record<string, unknown>, canonical: object) {
  return canonicalJson(value) === canonicalJson(canonical);
}

function exactKeyErrors(value: Record<string, unknown>, expected: readonly string[], label: string) {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  const errors: string[] = [];
  const missing = expectedKeys.filter((key) => !Object.hasOwn(value, key));
  const extra = actualKeys.filter((key) => !expectedKeys.includes(key));

  if (missing.length > 0) {
    errors.push(`${label} is missing keys: ${missing.join(', ')}`);
  }

  if (extra.length > 0) {
    errors.push(`${label} contains unknown keys: ${extra.join(', ')}`);
  }

  return errors;
}

function strictSingleLineString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new RuntimeRecoveryProofError('Invalid runtime recovery proof input', [
      `${label} must be a non-empty string`,
    ]);
  }

  if (value !== value.trim()) {
    throw new RuntimeRecoveryProofError('Invalid runtime recovery proof input', [
      `${label} must not contain leading or trailing whitespace`,
    ]);
  }

  if (/\r|\n|\0/u.test(value)) {
    throw new RuntimeRecoveryProofError('Invalid runtime recovery proof input', [
      `${label} must be an exact single-line value`,
    ]);
  }

  return value;
}

function isRecoverySource(value: unknown): value is RuntimeRecoverySource {
  return typeof value === 'string' && (RUNTIME_RECOVERY_SOURCES as readonly string[]).includes(value);
}

function isRecoveryMode(value: unknown): value is RuntimeRecoveryMode {
  return typeof value === 'string' && (RUNTIME_RECOVERY_MODES as readonly string[]).includes(value);
}

function assertRuntimeRecoveryEventInput(value: unknown, label = 'runtime recovery event'): RuntimeRecoveryEventInput {
  if (!isRecord(value)) {
    throw new RuntimeRecoveryProofError('Invalid runtime recovery proof input', [`${label} must be an object`]);
  }

  const keyErrors = exactKeyErrors(value, RECOVERY_EVENT_KEYS, label);

  if (keyErrors.length > 0) {
    throw new RuntimeRecoveryProofError('Invalid runtime recovery proof input', keyErrors);
  }

  if (!isRecoverySource(value.source)) {
    throw new RuntimeRecoveryProofError('Invalid runtime recovery proof input', [
      `${label}.source must be auto, reinstall-ui, or terminal; none is represented by zero events`,
    ]);
  }

  const reason = strictSingleLineString(value.reason, `${label}.reason`);

  if (!Array.isArray(value.commands) || value.commands.length === 0) {
    throw new RuntimeRecoveryProofError('Invalid runtime recovery proof input', [
      `${label}.commands must contain at least one exact executed command`,
    ]);
  }

  const commands = value.commands.map((command, index) =>
    strictSingleLineString(command, `${label}.commands[${index}]`),
  );

  return Object.freeze({ commands: Object.freeze(commands), reason, source: value.source });
}

function highestRecoveryMode(events: readonly RuntimeRecoveryEvent[]): RuntimeRecoveryMode {
  if (events.length === 0) {
    return 'none';
  }

  return events.reduce<RuntimeRecoverySource>(
    (highest, event) => (RECOVERY_SOURCE_RANK[event.source] > RECOVERY_SOURCE_RANK[highest] ? event.source : highest),
    events[0].source,
  );
}

function aggregateValues(
  values: readonly Readonly<{ source: RuntimeRecoverySource; value: string }>[],
): readonly RuntimeRecoveryAggregate[] {
  const aggregates = new Map<string, { count: number; sources: Set<RuntimeRecoverySource> }>();

  for (const entry of values) {
    const current = aggregates.get(entry.value) ?? { count: 0, sources: new Set<RuntimeRecoverySource>() };

    current.count += 1;
    current.sources.add(entry.source);
    aggregates.set(entry.value, current);
  }

  return Object.freeze(
    [...aggregates.entries()].map(([value, aggregate]) =>
      Object.freeze({
        count: aggregate.count,
        sources: Object.freeze(RUNTIME_RECOVERY_SOURCES.filter((source) => aggregate.sources.has(source))),
        value,
      }),
    ),
  );
}

/** Build the only canonical recovery record accepted by the proof validator. */
export function buildRuntimeRecoveryRecord(inputs: readonly RuntimeRecoveryEventInput[]): RuntimeRecoveryRecord {
  const events = Object.freeze(
    inputs.map((input, index) => {
      const normalized = assertRuntimeRecoveryEventInput(input, `runtime recovery event ${index + 1}`);

      return Object.freeze({ ...normalized, sequence: index + 1 });
    }),
  );

  const counts = Object.freeze(
    Object.fromEntries(
      RUNTIME_RECOVERY_SOURCES.map((source) => [source, events.filter((event) => event.source === source).length]),
    ) as Record<RuntimeRecoverySource, number>,
  );

  const commandEntries = events.flatMap((event) =>
    event.commands.map((command) => ({ source: event.source, value: command })),
  );

  const reasonEntries = events.map((event) => ({ source: event.source, value: event.reason }));

  return Object.freeze({
    attemptCount: events.length,
    commandCount: commandEntries.length,
    commands: aggregateValues(commandEntries),
    counts,
    events,
    mode: highestRecoveryMode(events),
    reasons: aggregateValues(reasonEntries),
  });
}

/**
 * Validate and fingerprint the final persisted root manifest. This proves final
 * state only; it deliberately makes no assertion about prior shell chronology.
 */
export function buildFinalPersistedManifestPackagePolicyProof(
  input: FinalPersistedManifestPackagePolicyInput,
): FinalPersistedManifestPackagePolicyProof {
  const projectFilesRevision = strictSingleLineString(input.projectFilesRevision, 'projectFilesRevision');

  if (typeof input.packageJsonSource !== 'string') {
    throw new RuntimeRecoveryProofError('Invalid final persisted manifest proof input', [
      'packageJsonSource must be a string',
    ]);
  }

  const validation = validateGeneratedSolutionPackageJson(input.packageJsonSource);

  if (!validation.valid) {
    throw new RuntimeRecoveryProofError('Final persisted package.json violates the closed package policy', [
      ...validation.errors,
    ]);
  }

  return Object.freeze({
    packageJsonBytes: Buffer.byteLength(input.packageJsonSource, 'utf8'),
    packageJsonSha256: createHash('sha256').update(input.packageJsonSource).digest('hex'),
    packagePath: 'package.json',
    projectFilesRevision,
    scope: FINAL_PERSISTED_MANIFEST_SCOPE,
    verified: true,
  });
}

export function buildSolutionRuntimeRecoveryProofManifest(input: {
  packagePolicy: FinalPersistedManifestPackagePolicyProof;
  runtimeRecovery: RuntimeRecoveryRecord;
}): SolutionRuntimeRecoveryProofManifest {
  const validation = validateSolutionRuntimeRecoveryProofManifest({
    packagePolicy: input.packagePolicy,
    runtimeRecovery: input.runtimeRecovery,
    schemaVersion: SOLUTION_RUNTIME_RECOVERY_PROOF_SCHEMA_VERSION,
  });

  if (!validation.valid) {
    throw new RuntimeRecoveryProofError('Invalid Solution runtime recovery proof manifest', validation.errors);
  }

  return Object.freeze({
    packagePolicy: Object.freeze({ ...input.packagePolicy }),
    runtimeRecovery: buildRuntimeRecoveryRecord(
      input.runtimeRecovery.events.map(({ commands, reason, source }) => ({ commands, reason, source })),
    ),
    schemaVersion: SOLUTION_RUNTIME_RECOVERY_PROOF_SCHEMA_VERSION,
  });
}

function validateRecoveryAggregate(value: unknown, label: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return;
  }

  errors.push(...exactKeyErrors(value, RECOVERY_AGGREGATE_KEYS, label));

  if (!Number.isInteger(value.count) || Number(value.count) <= 0) {
    errors.push(`${label}.count must be a positive integer`);
  }

  if (
    !Array.isArray(value.sources) ||
    value.sources.length === 0 ||
    value.sources.some((source) => !isRecoverySource(source))
  ) {
    errors.push(`${label}.sources must contain recovery sources`);
  }

  if (typeof value.value !== 'string' || value.value.length === 0 || value.value !== value.value.trim()) {
    errors.push(`${label}.value must be a non-empty trimmed string`);
  }
}

function validationResult(errors: string[]): RuntimeRecoveryProofValidationResult {
  return errors.length === 0
    ? Object.freeze({ valid: true })
    : Object.freeze({ errors: Object.freeze([...errors]), valid: false });
}

export function validateRuntimeRecoveryRecord(value: unknown): RuntimeRecoveryProofValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return validationResult(['runtimeRecovery must be an object']);
  }

  errors.push(...exactKeyErrors(value, RECOVERY_RECORD_KEYS, 'runtimeRecovery'));

  if (!Number.isInteger(value.attemptCount) || Number(value.attemptCount) < 0) {
    errors.push('runtimeRecovery.attemptCount must be a non-negative integer');
  }

  if (!Number.isInteger(value.commandCount) || Number(value.commandCount) < 0) {
    errors.push('runtimeRecovery.commandCount must be a non-negative integer');
  }

  if (!isRecoveryMode(value.mode)) {
    errors.push('runtimeRecovery.mode must be none, auto, reinstall-ui, or terminal');
  }

  if (!isRecord(value.counts)) {
    errors.push('runtimeRecovery.counts must be an object');
  } else {
    errors.push(...exactKeyErrors(value.counts, RECOVERY_COUNTS_KEYS, 'runtimeRecovery.counts'));

    for (const source of RUNTIME_RECOVERY_SOURCES) {
      if (!Number.isInteger(value.counts[source]) || Number(value.counts[source]) < 0) {
        errors.push(`runtimeRecovery.counts.${source} must be a non-negative integer`);
      }
    }
  }

  if (!Array.isArray(value.commands)) {
    errors.push('runtimeRecovery.commands must be an array');
  } else {
    value.commands.forEach((aggregate, index) =>
      validateRecoveryAggregate(aggregate, `runtimeRecovery.commands[${index}]`, errors),
    );
  }

  if (!Array.isArray(value.reasons)) {
    errors.push('runtimeRecovery.reasons must be an array');
  } else {
    value.reasons.forEach((aggregate, index) =>
      validateRecoveryAggregate(aggregate, `runtimeRecovery.reasons[${index}]`, errors),
    );
  }

  const eventInputs: RuntimeRecoveryEventInput[] = [];

  if (!Array.isArray(value.events)) {
    errors.push('runtimeRecovery.events must be an array');
  } else {
    value.events.forEach((event, index) => {
      const label = `runtimeRecovery.events[${index}]`;

      if (!isRecord(event)) {
        errors.push(`${label} must be an object`);
        return;
      }

      errors.push(...exactKeyErrors(event, RECOVERY_EVENT_WITH_SEQUENCE_KEYS, label));

      if (event.sequence !== index + 1) {
        errors.push(`${label}.sequence must equal ${index + 1}`);
      }

      try {
        eventInputs.push(
          assertRuntimeRecoveryEventInput(
            { commands: event.commands, reason: event.reason, source: event.source },
            label,
          ),
        );
      } catch (error) {
        errors.push(...(error instanceof RuntimeRecoveryProofError ? error.errors : [String(error)]));
      }
    });
  }

  if (errors.length === 0) {
    const canonical = buildRuntimeRecoveryRecord(eventInputs);

    if (!hasCanonicalObjectShape(value, canonical)) {
      errors.push('runtimeRecovery derived counts, mode, commands, or reasons do not match its ordered events');
    }
  }

  return validationResult(errors);
}

export function validateFinalPersistedManifestPackagePolicyProof(
  value: unknown,
  expected?: FinalPersistedManifestPackagePolicyInput,
): RuntimeRecoveryProofValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return validationResult(['packagePolicy must be an object']);
  }

  errors.push(...exactKeyErrors(value, PACKAGE_POLICY_KEYS, 'packagePolicy'));

  if (value.scope !== FINAL_PERSISTED_MANIFEST_SCOPE) {
    errors.push(`packagePolicy.scope must equal ${FINAL_PERSISTED_MANIFEST_SCOPE}`);
  }

  if (value.verified !== true) {
    errors.push('packagePolicy.verified must equal true');
  }

  if (value.packagePath !== 'package.json') {
    errors.push('packagePolicy.packagePath must equal package.json');
  }

  if (!Number.isInteger(value.packageJsonBytes) || Number(value.packageJsonBytes) <= 0) {
    errors.push('packagePolicy.packageJsonBytes must be a positive integer');
  }

  if (typeof value.packageJsonSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.packageJsonSha256)) {
    errors.push('packagePolicy.packageJsonSha256 must be a lowercase SHA-256 digest');
  }

  if (
    typeof value.projectFilesRevision !== 'string' ||
    value.projectFilesRevision.length === 0 ||
    value.projectFilesRevision !== value.projectFilesRevision.trim() ||
    /\r|\n|\0/u.test(value.projectFilesRevision)
  ) {
    errors.push('packagePolicy.projectFilesRevision must be a non-empty exact single-line string');
  }

  if (expected && errors.length === 0) {
    try {
      const canonical = buildFinalPersistedManifestPackagePolicyProof(expected);

      if (!hasCanonicalObjectShape(value, canonical)) {
        errors.push('packagePolicy does not match the supplied final persisted package.json and project revision');
      }
    } catch (error) {
      errors.push(...(error instanceof RuntimeRecoveryProofError ? error.errors : [String(error)]));
    }
  }

  return validationResult(errors);
}

export function validateSolutionRuntimeRecoveryProofManifest(
  value: unknown,
  expectedPackagePolicy?: FinalPersistedManifestPackagePolicyInput,
): RuntimeRecoveryProofValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return validationResult(['runtime recovery proof manifest must be an object']);
  }

  errors.push(...exactKeyErrors(value, PROOF_MANIFEST_KEYS, 'runtime recovery proof manifest'));

  if (value.schemaVersion !== SOLUTION_RUNTIME_RECOVERY_PROOF_SCHEMA_VERSION) {
    errors.push(
      `runtime recovery proof manifest.schemaVersion must equal ${SOLUTION_RUNTIME_RECOVERY_PROOF_SCHEMA_VERSION}`,
    );
  }

  const recoveryValidation = validateRuntimeRecoveryRecord(value.runtimeRecovery);

  const packageValidation = validateFinalPersistedManifestPackagePolicyProof(
    value.packagePolicy,
    expectedPackagePolicy,
  );

  if (!recoveryValidation.valid) {
    errors.push(...recoveryValidation.errors);
  }

  if (!packageValidation.valid) {
    errors.push(...packageValidation.errors);
  }

  return validationResult(errors);
}

export type RuntimeRecoveryProofTracker = Readonly<{
  manifest: (packagePolicy: FinalPersistedManifestPackagePolicyProof) => SolutionRuntimeRecoveryProofManifest;
  record: (event: RuntimeRecoveryEventInput) => RuntimeRecoveryRecord;
  snapshot: () => RuntimeRecoveryRecord;
}>;

/** Mutable event collector with immutable, independently validated snapshots. */
export function createRuntimeRecoveryProofTracker(
  initialEvents: readonly RuntimeRecoveryEventInput[] = [],
): RuntimeRecoveryProofTracker {
  let events = initialEvents.map((event, index) =>
    assertRuntimeRecoveryEventInput(event, `initial runtime recovery event ${index + 1}`),
  );

  return Object.freeze({
    manifest: (packagePolicy: FinalPersistedManifestPackagePolicyProof) =>
      buildSolutionRuntimeRecoveryProofManifest({ packagePolicy, runtimeRecovery: buildRuntimeRecoveryRecord(events) }),
    record: (event: RuntimeRecoveryEventInput) => {
      events = [...events, assertRuntimeRecoveryEventInput(event)];

      return buildRuntimeRecoveryRecord(events);
    },
    snapshot: () => buildRuntimeRecoveryRecord(events),
  });
}
