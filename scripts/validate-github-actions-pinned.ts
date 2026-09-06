#!/usr/bin/env -S node --import tsx

import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument, type ParsedNode } from 'yaml';

import temporaryExceptions from './github-actions-temporary-exceptions.json' with { type: 'json' };

const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/;
const CONTAINER_WITH_DIGEST = /^(.+)@sha256:([0-9a-f]{64})$/i;
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9_.-]+$/;
const MAX_YAML_BYTES = 2 * 1024 * 1024;

const TRUSTED_ACTION_OWNERS = new Set([
  'actions',
  'amannn',
  'anchore',
  'aquasecurity',
  'azure',
  'cloudflare',
  'docker',
  'github',
  'google-github-actions',
  'hashicorp',
  'lewagon',
  'openaxcloud',
  'pnpm',
  'softprops',
]);

export type FindingKind = 'action' | 'container' | 'dynamic' | 'trust' | 'yaml';

export interface PinningFinding {
  filename: string;
  line: number;
  location: string;
  action: string;
  ref: string;
  kind: FindingKind;
  detail?: string;
  contextFingerprint?: string;
}

export interface TemporaryException {
  filename: string;
  location: string;
  action: string;
  ref: string;
  owner: string;
  ticket: string;
  createdOn: string;
  expiresOn: string;
  contextFingerprint: string;
}

export interface ExceptionResult {
  blocked: PinningFinding[];
  coordinated: PinningFinding[];
  stale: TemporaryException[];
  expired: TemporaryException[];
  inactive: TemporaryException[];
}

export interface LocalActionReference {
  filename: string;
  line: number;
  location: string;
  path: string;
  contextFingerprint: string;
}

export interface YamlAnalysis {
  findings: PinningFinding[];
  localActions: LocalActionReference[];
  contextFingerprint?: string;
}

export interface YamlAnalysisOptions {
  localActionMetadata?: boolean;
}

export interface RepositoryScanResult {
  findings: PinningFinding[];
  scannedFiles: string[];
}

type LocationSegment = string | number;

/*
 * These are the 24 exact mutable references temporarily blocked by
 * coordination. Every exception names one structural YAML location, not an
 * occurrence count: pinning an exempt step and adding the same mutable action
 * elsewhere therefore produces both a new blocked finding and a stale debt.
 *
 * 15 locations are owned by Claude's active PR #352; five belong to the legacy
 * preview workflow whose Cloudflare trust boundary needs explicit approval;
 * four belong to the privileged stable-release workflow pending approval of
 * its tag/release/force-push boundary.
 */
export const TEMPORARY_EXCEPTIONS: readonly TemporaryException[] = temporaryExceptions;

function formatLocation(segments: readonly LocationSegment[]): string {
  return `$${segments
    .map((segment) => (typeof segment === 'number' ? `[${segment}]` : `[${JSON.stringify(segment)}]`))
    .join('')}`;
}

function lineFor(node: ParsedNode | null | undefined, lineCounter: LineCounter): number {
  const offset = node?.range?.[0] ?? 0;
  return lineCounter.linePos(offset).line;
}

function displayNode(node: ParsedNode | null | undefined): string {
  if (isAlias(node)) {
    return `*${node.source}`;
  }

  if (isScalar(node)) {
    return typeof node.value === 'string' ? node.value : JSON.stringify(node.value);
  }

  return '<non-scalar>';
}

function canonicalNode(node: ParsedNode | null | undefined): unknown {
  if (node === null || node === undefined) {
    return null;
  }

  if (isAlias(node)) {
    return { alias: node.source };
  }

  if (isScalar(node)) {
    return { scalar: node.value };
  }

  if (isSeq(node)) {
    return { sequence: node.items.map((item) => canonicalNode(item)) };
  }

  if (isMap(node)) {
    return {
      mapping: node.items.map((pair) => [canonicalNode(pair.key), canonicalNode(pair.value)]),
    };
  }

  return { unknown: String(node) };
}

function fingerprint(node: ParsedNode | null | undefined): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalNode(node)))
    .digest('hex');
}

function isLiteralLocalAction(value: string): boolean {
  if (!value.startsWith('./')) {
    return false;
  }

  const segments = value.slice(2).split('/');

  return (
    segments.length > 0 &&
    segments.every(
      (segment) => segment !== '' && segment !== '.' && segment !== '..' && SAFE_PATH_SEGMENT.test(segment),
    )
  );
}

function isLiteralExternalAction(action: string): boolean {
  const segments = action.split('/');
  return (
    segments.length >= 2 &&
    segments.every(
      (segment) => segment !== '' && segment !== '.' && segment !== '..' && SAFE_PATH_SEGMENT.test(segment),
    )
  );
}

function isLiteralContainerAction(value: string): boolean {
  if (!value.startsWith('docker://')) {
    return false;
  }

  return isLiteralContainerImage(value.slice('docker://'.length));
}

function isLiteralContainerImage(value: string): boolean {
  const match = CONTAINER_WITH_DIGEST.exec(value);

  if (!match) {
    return false;
  }

  const image = match[1];
  const segments = image.split('/');

  return (
    /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(image) &&
    segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

function isServiceImagePath(path: readonly LocationSegment[]): boolean {
  return (
    path.length === 5 &&
    path[0] === 'jobs' &&
    typeof path[1] === 'string' &&
    path[2] === 'services' &&
    typeof path[3] === 'string' &&
    path[4] === 'image'
  );
}

function isJobContainerPath(path: readonly LocationSegment[]): boolean {
  return (
    (path.length === 3 && path[0] === 'jobs' && typeof path[1] === 'string' && path[2] === 'container') ||
    (path.length === 4 &&
      path[0] === 'jobs' &&
      typeof path[1] === 'string' &&
      path[2] === 'container' &&
      path[3] === 'image')
  );
}

function inspectRunnerImage(
  node: ParsedNode | null,
  filename: string,
  location: string,
  lineCounter: LineCounter,
  contextFingerprint: string,
): PinningFinding | null {
  const value = displayNode(node);

  if (isScalar(node) && typeof node.value === 'string' && isLiteralContainerImage(value)) {
    return null;
  }

  return {
    filename,
    line: lineFor(node, lineCounter),
    location,
    action: value,
    ref: 'mutable-container-image',
    kind: 'container',
    detail: 'job and service containers must use a literal full sha256 digest',
    contextFingerprint,
  };
}

function inspectLocalActionImage(
  node: ParsedNode | null,
  filename: string,
  location: string,
  lineCounter: LineCounter,
  contextFingerprint: string,
): PinningFinding | null {
  const value = displayNode(node);

  if (
    isScalar(node) &&
    typeof node.value === 'string' &&
    (node.value === 'Dockerfile' || isLiteralContainerAction(node.value))
  ) {
    return null;
  }

  return {
    filename,
    line: lineFor(node, lineCounter),
    location,
    action: value,
    ref: 'mutable-container-image',
    kind: 'container',
    detail:
      'local Docker actions must use the checked-in Dockerfile or a literal docker:// image with a full sha256 digest',
    contextFingerprint,
  };
}

function inspectUses(
  node: ParsedNode | null,
  filename: string,
  location: string,
  lineCounter: LineCounter,
  contextFingerprint: string,
): PinningFinding | null {
  const line = lineFor(node, lineCounter);
  const value = displayNode(node);

  if (!isScalar(node) || typeof node.value !== 'string') {
    return {
      filename,
      line,
      location,
      action: value,
      ref: 'missing-or-dynamic-ref',
      kind: 'dynamic',
      detail: '`uses` must be a literal string scalar',
      contextFingerprint,
    };
  }

  if (value.startsWith('docker://')) {
    if (isLiteralContainerAction(value)) {
      return null;
    }

    return {
      filename,
      line,
      location,
      action: value,
      ref: 'mutable-container-image',
      kind: 'container',
      contextFingerprint,
    };
  }

  if (value.startsWith('./')) {
    if (isLiteralLocalAction(value)) {
      return null;
    }

    return {
      filename,
      line,
      location,
      action: value,
      ref: 'missing-or-dynamic-ref',
      kind: 'dynamic',
      detail: 'local action paths must be literal, repository-relative paths',
      contextFingerprint,
    };
  }

  const separator = value.lastIndexOf('@');

  if (separator <= 0) {
    return {
      filename,
      line,
      location,
      action: value,
      ref: 'missing-or-dynamic-ref',
      kind: 'dynamic',
      contextFingerprint,
    };
  }

  const action = value.slice(0, separator);
  const ref = value.slice(separator + 1);

  if (!isLiteralExternalAction(action)) {
    return {
      filename,
      line,
      location,
      action,
      ref,
      kind: 'dynamic',
      detail: 'external action identity is not a literal owner/repository path',
      contextFingerprint,
    };
  }

  if (!FULL_COMMIT_SHA.test(ref)) {
    return { filename, line, location, action, ref, kind: 'action', contextFingerprint };
  }

  const owner = action.split('/')[0]?.toLowerCase();

  if (!owner || !TRUSTED_ACTION_OWNERS.has(owner)) {
    return {
      filename,
      line,
      location,
      action,
      ref,
      kind: 'trust',
      detail: `action owner ${owner || '<missing>'} is not in the reviewed trust policy`,
      contextFingerprint,
    };
  }

  return null;
}

export function analyzeGithubActionsYaml(
  source: string,
  filename = '<memory>',
  options: YamlAnalysisOptions = {},
): YamlAnalysis {
  if (Buffer.byteLength(source, 'utf8') > MAX_YAML_BYTES) {
    return {
      localActions: [],
      findings: [
        {
          filename,
          line: 1,
          location: '$',
          action: '<oversized-yaml>',
          ref: 'resource-limit',
          kind: 'yaml',
          detail: `YAML exceeds the ${MAX_YAML_BYTES}-byte validation limit`,
        },
      ],
    };
  }

  const lineCounter = new LineCounter();

  let document;

  try {
    document = parseDocument(source, {
      lineCounter,
      prettyErrors: false,
      strict: true,
      uniqueKeys: true,
    });
  } catch (error) {
    return {
      localActions: [],
      findings: [
        {
          filename,
          line: 1,
          location: '$',
          action: '<invalid-yaml>',
          ref: 'parse-error',
          kind: 'yaml',
          detail: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  const syntaxProblems = [...document.errors, ...document.warnings];

  if (syntaxProblems.length > 0) {
    return {
      localActions: [],
      findings: syntaxProblems.map((problem) => ({
        filename,
        line: problem.linePos?.[0]?.line ?? lineCounter.linePos(problem.pos[0]).line,
        location: '$',
        action: '<invalid-yaml>',
        ref: problem.code,
        kind: 'yaml' as const,
        detail: problem.message,
      })),
    };
  }

  const findings: PinningFinding[] = [];
  const localActions: LocalActionReference[] = [];

  /*
   * L'EMPREINTE COUVRE L'ÉTAPE, PAS LE FICHIER ENTIER.
   *
   * Elle portait sur `document.contents`, donc sur tout le workflow. Une
   * exception se périmait alors sur n'importe quel changement du YAML — y
   * compris l'ajout d'un job à l'autre bout du fichier, qui ne touche aucune
   * des étapes couvertes.
   *
   * Mesuré le 2026-09-06 sur `.github/workflows/e2e.yml`, qui porte 4
   * exceptions : ajouter un job SANS RAPPORT rend
   * `FAIL (4 blocked, 4 stale)`. Le contrôle ne savait pas distinguer un
   * changement anodin d'une modification de ce qu'il protège — et rendait donc
   * le même verdict pour les deux.
   *
   * Le principe reste entier : une exception ne survit pas à la modification de
   * ce qu'elle couvre. Seule la PORTÉE de l'ancrage change. Aucun refus n'est
   * assoupli, aucune exception n'est ajoutée.
   */
  const documentFingerprint = fingerprint(document.contents);

  /*
   * Le nœud porteur d'une référence : l'étape (`steps[i]`), le service
   * (`services.<nom>`) ou le conteneur d'un job. À défaut — une référence posée
   * hors de ces formes — on retombe sur l'empreinte du document, plus large mais
   * jamais plus permissive.
   */
  function noeudPorteur(path: readonly LocationSegment[]): unknown {
    for (let profondeur = path.length; profondeur > 0; profondeur -= 1) {
      const segment = path[profondeur - 1];
      const estPorteur = typeof segment === 'number' || segment === 'container' || path[profondeur - 2] === 'services';

      if (estPorteur) {
        const noeud = document.getIn(path.slice(0, profondeur), true);

        if (noeud) {
          return noeud;
        }
      }
    }

    return undefined;
  }

  function empreinteDe(path: readonly LocationSegment[]): string {
    const noeud = noeudPorteur(path);

    return noeud ? fingerprint(noeud) : documentFingerprint;
  }

  function walk(node: ParsedNode | null, path: readonly LocationSegment[]): void {
    if (isMap(node)) {
      for (const pair of node.items) {
        const keyNode = pair.key;
        const valueNode = pair.value;

        if (!isScalar(keyNode) || typeof keyNode.value !== 'string') {
          findings.push({
            filename,
            line: lineFor(keyNode, lineCounter),
            location: formatLocation(path),
            action: displayNode(keyNode),
            ref: 'non-literal-yaml-key',
            kind: 'yaml',
            detail: 'mapping keys must be literal strings so security-sensitive keys cannot be aliased',
          });
          walk(valueNode, path);
          continue;
        }

        const key = keyNode.value;
        const nextPath = [...path, key];

        if (key === '<<') {
          findings.push({
            filename,
            line: lineFor(keyNode, lineCounter),
            location: formatLocation(nextPath),
            action: '<<',
            ref: 'yaml-merge-key',
            kind: 'yaml',
            detail: 'YAML merge keys obscure the executed workflow shape',
          });
        } else if (key === 'uses') {
          const location = formatLocation(nextPath);
          const finding = inspectUses(valueNode, filename, location, lineCounter, empreinteDe(nextPath));

          if (finding) {
            findings.push(finding);
          } else if (isScalar(valueNode) && typeof valueNode.value === 'string' && valueNode.value.startsWith('./')) {
            localActions.push({
              filename,
              line: lineFor(valueNode, lineCounter),
              location,
              path: valueNode.value,
              contextFingerprint: empreinteDe(nextPath),
            });
          }
        } else if (isServiceImagePath(nextPath) || (isJobContainerPath(nextPath) && !isMap(valueNode))) {
          const finding = inspectRunnerImage(
            valueNode,
            filename,
            formatLocation(nextPath),
            lineCounter,
            empreinteDe(nextPath),
          );

          if (finding) {
            findings.push(finding);
          }
        } else if (
          options.localActionMetadata &&
          nextPath.length === 2 &&
          nextPath[0] === 'runs' &&
          nextPath[1] === 'image'
        ) {
          const finding = inspectLocalActionImage(
            valueNode,
            filename,
            formatLocation(nextPath),
            lineCounter,
            empreinteDe(nextPath),
          );

          if (finding) {
            findings.push(finding);
          }
        }

        walk(valueNode, nextPath);
      }
      return;
    }

    if (isSeq(node)) {
      node.items.forEach((item, index) => walk(item, [...path, index]));
    }
  }

  walk(document.contents, []);

  /*
   * L'empreinte du DOCUMENT reste rendue ici : elle sert aux appelants qui
   * raisonnent sur le fichier entier. Les constats, eux, portent désormais
   * chacun l'empreinte de leur étape.
   */
  return { findings, localActions, contextFingerprint: documentFingerprint };
}

export function findUnpinnedActions(source: string, filename = '<memory>'): PinningFinding[] {
  return analyzeGithubActionsYaml(source, filename).findings;
}

function exceptionKey(
  value: Pick<PinningFinding, 'filename' | 'location' | 'action' | 'ref' | 'contextFingerprint'>,
): string {
  return JSON.stringify([
    value.filename,
    value.location,
    value.action,
    value.ref,
    value.contextFingerprint ?? '<missing-context-fingerprint>',
  ]);
}

export function applyTemporaryExceptions(
  findings: readonly PinningFinding[],
  exceptions: readonly TemporaryException[] = TEMPORARY_EXCEPTIONS,
  asOf = new Date(),
): ExceptionResult {
  const manifestErrors = validateTemporaryExceptions(exceptions);

  if (manifestErrors.length > 0) {
    throw new Error(`invalid temporary exception manifest:\n${manifestErrors.join('\n')}`);
  }

  const today = asOf.toISOString().slice(0, 10);
  const expired = exceptions.filter((entry) => entry.expiresOn < today);
  const inactive = exceptions.filter((entry) => entry.createdOn > today);

  const remaining = new Map(
    exceptions
      .filter((entry) => entry.createdOn <= today && entry.expiresOn >= today)
      .map((entry) => [exceptionKey(entry), entry]),
  );

  const blocked: PinningFinding[] = [];
  const coordinated: PinningFinding[] = [];

  for (const finding of findings) {
    const key = exceptionKey(finding);

    if (remaining.delete(key)) {
      coordinated.push(finding);
    } else {
      blocked.push(finding);
    }
  }

  return { blocked, coordinated, stale: [...remaining.values()], expired, inactive };
}

function parseCalendarDate(value: string): number | null {
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

export function validateTemporaryExceptions(exceptions: readonly TemporaryException[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const seenLocations = new Set<string>();
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const ticketPattern = /^https:\/\/github\.com\/openaxcloud\/vibecore\/pull\/\d+$/;

  for (const [index, entry] of exceptions.entries()) {
    const label = `exception[${index}]`;
    const key = exceptionKey(entry);

    if (seen.has(key)) {
      errors.push(`${label}: duplicate authorization identity`);
    }

    seen.add(key);

    const locationKey = JSON.stringify([entry.filename, entry.location]);

    if (seenLocations.has(locationKey)) {
      errors.push(`${label}: only one authorization is allowed per workflow location`);
    }

    seenLocations.add(locationKey);

    if (!entry.filename.startsWith('.github/') || entry.filename.includes('..')) {
      errors.push(`${label}: filename must stay below .github`);
    }

    if (!entry.location.startsWith('$[')) {
      errors.push(`${label}: location must be an exact structural YAML path`);
    }

    if (!entry.action || !entry.ref || !entry.owner) {
      errors.push(`${label}: action, ref and owner are required`);
    }

    if (!ticketPattern.test(entry.ticket)) {
      errors.push(`${label}: ticket must be a verifiable Vibecore pull-request URL`);
    }

    if (!/^[0-9a-f]{64}$/.test(entry.contextFingerprint)) {
      errors.push(`${label}: contextFingerprint must be a full SHA-256`);
    }

    if (!datePattern.test(entry.createdOn) || !datePattern.test(entry.expiresOn)) {
      errors.push(`${label}: createdOn and expiresOn must use YYYY-MM-DD`);
      continue;
    }

    const created = parseCalendarDate(entry.createdOn);
    const expires = parseCalendarDate(entry.expiresOn);

    if (created === null || expires === null) {
      errors.push(`${label}: createdOn and expiresOn must be real calendar dates`);
      continue;
    }

    const lifetimeDays = (expires - created) / 86_400_000;

    if (lifetimeDays < 0 || lifetimeDays > 30) {
      errors.push(`${label}: exception lifetime must be between 0 and 30 days`);
    }
  }

  return errors;
}

function yamlFiles(root: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const metadata = lstatSync(path);

    if (metadata.isSymbolicLink()) {
      throw new Error(`refusing to follow symbolic link below .github: ${path}`);
    }

    if (metadata.isDirectory()) {
      files.push(...yamlFiles(path));
    } else if (metadata.isFile() && ['.yml', '.yaml'].includes(extname(entry))) {
      files.push(path);
    }
  }

  return files.sort();
}

function unsafeLocalReference(reference: LocalActionReference, detail: string): PinningFinding {
  return {
    filename: reference.filename,
    line: reference.line,
    location: reference.location,
    action: reference.path,
    ref: 'unsafe-local-action',
    kind: 'dynamic',
    detail,
    contextFingerprint: reference.contextFingerprint,
  };
}

function resolveLocalDescriptor(repositoryRoot: string, reference: LocalActionReference): string {
  const target = resolve(repositoryRoot, reference.path);
  const targetRelative = relative(repositoryRoot, target);

  if (
    targetRelative === '' ||
    targetRelative.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
    targetRelative === '..'
  ) {
    throw new Error('local action escapes the repository');
  }

  let cursor = repositoryRoot;

  for (const segment of targetRelative.split(/[\\/]/)) {
    cursor = join(cursor, segment);

    let metadata;

    try {
      metadata = lstatSync(cursor);
    } catch {
      throw new Error(`local action path does not exist: ${reference.path}`);
    }

    if (metadata.isSymbolicLink()) {
      throw new Error(`local action path contains a symbolic link: ${relative(repositoryRoot, cursor)}`);
    }
  }

  const targetMetadata = lstatSync(target);

  if (targetMetadata.isFile()) {
    if (!['.yml', '.yaml'].includes(extname(target))) {
      throw new Error('local reusable workflow must be a YAML file');
    }

    return target;
  }

  if (!targetMetadata.isDirectory()) {
    throw new Error('local action target is neither a directory nor a reusable workflow');
  }

  const descriptors = ['action.yml', 'action.yaml'].filter((name) => {
    try {
      const metadata = lstatSync(join(target, name));

      if (metadata.isSymbolicLink()) {
        throw new Error(`local action descriptor is a symbolic link: ${relative(repositoryRoot, join(target, name))}`);
      }

      return metadata.isFile();
    } catch (error) {
      if (error instanceof Error && error.message.includes('symbolic link')) {
        throw error;
      }

      return false;
    }
  });

  if (descriptors.length !== 1) {
    throw new Error(
      descriptors.length === 0
        ? 'local action directory has no action.yml or action.yaml'
        : 'local action directory has ambiguous action.yml and action.yaml descriptors',
    );
  }

  return join(target, descriptors[0]);
}

export function scanRepositoryForUnpinnedActions(repositoryRoot: string): RepositoryScanResult {
  const normalizedRoot = resolve(repositoryRoot);
  const workflowsRoot = join(normalizedRoot, '.github', 'workflows');
  const findings: PinningFinding[] = [];
  const findingKeys = new Set<string>();
  const scannedFiles = new Set<string>();
  const scannedModes = new Set<string>();

  function addFindings(candidates: readonly PinningFinding[]): void {
    for (const finding of candidates) {
      const key = JSON.stringify([
        finding.filename,
        finding.line,
        finding.location,
        finding.action,
        finding.ref,
        finding.kind,
        finding.detail,
        finding.contextFingerprint,
      ]);

      if (!findingKeys.has(key)) {
        findingKeys.add(key);
        findings.push(finding);
      }
    }
  }

  function scanFile(filename: string, ancestors: readonly string[], localActionMetadata = false): void {
    const absolute = resolve(filename);
    const repositoryFilename = relative(normalizedRoot, absolute);
    const scanMode = localActionMetadata ? 'local-action-metadata' : 'workflow';
    const scanKey = JSON.stringify([repositoryFilename, scanMode]);

    if (scannedModes.has(scanKey)) {
      return;
    }

    scannedModes.add(scanKey);
    scannedFiles.add(repositoryFilename);

    const analysis = analyzeGithubActionsYaml(readFileSync(absolute, 'utf8'), repositoryFilename, {
      localActionMetadata,
    });
    addFindings(analysis.findings);

    for (const reference of analysis.localActions) {
      let descriptor: string;

      try {
        descriptor = resolveLocalDescriptor(normalizedRoot, reference);
      } catch (error) {
        addFindings([unsafeLocalReference(reference, error instanceof Error ? error.message : String(error))]);
        continue;
      }

      const descriptorName = relative(normalizedRoot, descriptor);

      if (ancestors.includes(descriptorName) || descriptorName === repositoryFilename) {
        addFindings([unsafeLocalReference(reference, `local action cycle detected through ${descriptorName}`)]);
        continue;
      }

      scanFile(
        descriptor,
        [...ancestors, repositoryFilename],
        ['action.yml', 'action.yaml'].includes(basename(descriptor)),
      );
    }
  }

  for (const workflow of yamlFiles(workflowsRoot)) {
    scanFile(workflow, []);
  }

  return { findings, scannedFiles: [...scannedFiles].sort() };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`self-test failed: ${message}`);
  }
}

function selfTest(): void {
  const digest = 'a'.repeat(64);
  const sha = '0123456789abcdef0123456789abcdef01234567';

  const fixture = [
    'alias: &mutable-action vendor/action@main',
    'jobs:',
    '  test:',
    '    steps:',
    `      - uses: actions/checkout@${sha}`,
    '      - uses: ./my-local-action',
    '      - uses: actions/setup-node@v4',
    "      - { uses : 'vendor/action@main' }",
    '      - uses : docker://alpine:3.20',
    `      - uses: docker://alpine@sha256:${digest}`,
    `      - uses: "docker://\${{ matrix.image }}@sha256:${digest}"`,
    '      - uses: *mutable-action',
    '      - uses: "${{ matrix.action }}"',
    '      - uses: "./actions/${{ matrix.name }}"',
  ].join('\n');

  const findings = findUnpinnedActions(fixture);

  assert(findings.length === 7, `expected seven hostile findings, got ${JSON.stringify(findings)}`);
  assert(
    findings.some((finding) => finding.action === 'actions/setup-node' && finding.ref === 'v4'),
    'tagged action was accepted',
  );
  assert(
    findings.some((finding) => finding.action === 'vendor/action' && finding.ref === 'main'),
    '`uses :` or flow-map action was missed',
  );
  assert(
    findings.some((finding) => finding.kind === 'container'),
    'mutable docker image was accepted',
  );
  assert(
    findings.filter((finding) => finding.kind === 'container').length === 2,
    'dynamic docker image with a digest was accepted',
  );
  assert(
    findings.some((finding) => finding.action === '*mutable-action'),
    'YAML alias was accepted',
  );
  assert(
    findings.some((finding) => finding.action === '${{ matrix.action }}'),
    'dynamic action was accepted',
  );
  assert(
    findings.some((finding) => finding.action.includes('${{ matrix.name }}')),
    'dynamic local path was accepted',
  );

  const duplicate = findUnpinnedActions('steps:\n  - { uses: actions/checkout@v4, uses: actions/setup-node@v4 }');
  assert(
    duplicate.some((finding) => finding.kind === 'yaml' && finding.ref === 'DUPLICATE_KEY'),
    'duplicate `uses` key was accepted',
  );

  const untrustedPinned = findUnpinnedActions(`steps:\n  - uses: unreviewed-owner/action@${sha}`);
  assert(
    untrustedPinned.some((finding) => finding.kind === 'trust'),
    'full SHA from an unreviewed action owner was accepted',
  );

  const localDocker = analyzeGithubActionsYaml(
    'runs:\n  using: docker\n  image: docker://evil/image:latest\n',
    'actions/docker/action.yml',
    { localActionMetadata: true },
  );
  assert(
    localDocker.findings.some((finding) => finding.kind === 'container'),
    'mutable remote image in local Docker action metadata was accepted',
  );

  const workflowTreeFixture = mkdtempSync(join(tmpdir(), 'vibecore-actions-validator-self-test-'));

  try {
    mkdirSync(join(workflowTreeFixture, '.github', 'workflows', 'a-action'), { recursive: true });
    writeFileSync(
      join(workflowTreeFixture, '.github', 'workflows', 'a-action', 'action.yml'),
      'runs:\n  using: docker\n  image: docker://alpine:latest\n',
    );
    writeFileSync(
      join(workflowTreeFixture, '.github', 'workflows', 'ci.yml'),
      'jobs:\n  test:\n    steps:\n      - uses: ./.github/workflows/a-action\n',
    );

    const workflowTreeFindings = scanRepositoryForUnpinnedActions(workflowTreeFixture).findings;
    assert(
      workflowTreeFindings.length === 1 &&
        workflowTreeFindings[0]?.filename === '.github/workflows/a-action/action.yml' &&
        workflowTreeFindings[0]?.kind === 'container',
      'workflow-tree action descriptor was not rescanned as local action metadata',
    );
  } finally {
    rmSync(workflowTreeFixture, { force: true, recursive: true });
  }

  const exactFinding: PinningFinding = {
    filename: '.github/workflows/workflow.yml',
    line: 1,
    location: '$["jobs"]["one"]["steps"][0]["uses"]',
    action: 'vendor/action',
    ref: 'main',
    kind: 'action',
    contextFingerprint: 'b'.repeat(64),
  };
  const exactException: TemporaryException = {
    filename: exactFinding.filename,
    location: exactFinding.location,
    action: exactFinding.action,
    ref: exactFinding.ref,
    contextFingerprint: exactFinding.contextFingerprint!,
    owner: 'self-test',
    ticket: 'https://github.com/openaxcloud/vibecore/pull/383',
    createdOn: '2026-01-01',
    expiresOn: '2026-01-30',
  };

  const testDate = new Date('2026-01-15T00:00:00.000Z');
  const exact = applyTemporaryExceptions([exactFinding], [exactException], testDate);
  assert(
    exact.coordinated.length === 1 &&
      exact.blocked.length === 0 &&
      exact.stale.length === 0 &&
      exact.expired.length === 0 &&
      exact.inactive.length === 0,
    'exact structural exception did not match',
  );

  const relocated = applyTemporaryExceptions(
    [{ ...exactFinding, location: '$["jobs"]["two"]["steps"][0]["uses"]' }],
    [exactException],
    testDate,
  );
  assert(
    relocated.blocked.length === 1 && relocated.stale.length === 1,
    'relocated mutable action reused an exception',
  );

  const changedContext = applyTemporaryExceptions(
    [{ ...exactFinding, contextFingerprint: 'c'.repeat(64) }],
    [exactException],
    testDate,
  );
  assert(
    changedContext.blocked.length === 1 && changedContext.stale.length === 1,
    'changed workflow context reused an exception',
  );

  const expired = applyTemporaryExceptions([exactFinding], [exactException], new Date('2026-02-01T00:00:00.000Z'));
  assert(expired.blocked.length === 1 && expired.expired.length === 1, 'expired exception was accepted');

  const inactive = applyTemporaryExceptions(
    [exactFinding],
    [{ ...exactException, createdOn: '2026-01-16', expiresOn: '2026-01-30' }],
    testDate,
  );
  assert(inactive.blocked.length === 1 && inactive.inactive.length === 1, 'future exception was accepted');

  assert(
    validateTemporaryExceptions([{ ...exactException, createdOn: '2026-02-31' }]).length === 1,
    'impossible calendar date was accepted',
  );

  console.log('GitHub Actions pinning self-test: PASS');
}

function reportFinding(finding: PinningFinding): void {
  const prefix = `${finding.filename}:${finding.line} ${finding.location}:`;

  if (finding.kind === 'container') {
    console.error(`${prefix} ${finding.action} is not pinned to a sha256 container digest`);
  } else if (finding.kind === 'action') {
    console.error(`${prefix} ${finding.action}@${finding.ref} is not pinned to a full commit SHA`);
  } else if (finding.kind === 'yaml') {
    console.error(`${prefix} unsafe or invalid YAML (${finding.ref}): ${finding.detail ?? finding.action}`);
  } else if (finding.kind === 'trust') {
    console.error(`${prefix} ${finding.action}@${finding.ref} is immutable but its owner is not trusted`);
  } else {
    console.error(`${prefix} ${finding.action} is not a literal local action or immutable external action reference`);
  }
}

function main(): void {
  if (process.argv.includes('--self-test')) {
    selfTest();
    return;
  }

  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(scriptDirectory, '..');
  const scan = scanRepositoryForUnpinnedActions(repositoryRoot);
  const findings = scan.findings;

  const allowTemporaryExceptions = process.argv.includes('--allow-temporary-exceptions');

  const result = allowTemporaryExceptions
    ? applyTemporaryExceptions(findings)
    : { blocked: findings, coordinated: [], stale: [], expired: [], inactive: [] };

  if (allowTemporaryExceptions && result.stale.length > 0) {
    for (const entry of result.stale) {
      console.error(
        `stale GitHub Actions coordination exception: ${entry.filename} ${entry.location} ${entry.action}@${entry.ref} (${entry.owner})`,
      );
    }
  }

  if (allowTemporaryExceptions && result.expired.length > 0) {
    for (const entry of result.expired) {
      console.error(
        `expired GitHub Actions coordination exception: ${entry.filename} ${entry.location} expired ${entry.expiresOn} (${entry.ticket})`,
      );
    }
  }

  if (allowTemporaryExceptions && result.inactive.length > 0) {
    for (const entry of result.inactive) {
      console.error(
        `not-yet-active GitHub Actions coordination exception: ${entry.filename} ${entry.location} starts ${entry.createdOn} (${entry.ticket})`,
      );
    }
  }

  if (result.blocked.length > 0) {
    result.blocked.forEach(reportFinding);
  }

  if (result.blocked.length > 0 || result.stale.length > 0 || result.expired.length > 0 || result.inactive.length > 0) {
    console.error(
      `GitHub Actions pinning validation: FAIL (${result.blocked.length} blocked, ${result.stale.length} stale, ${result.expired.length} expired, ${result.inactive.length} inactive exception(s))`,
    );
    process.exitCode = 1;

    return;
  }

  if (result.coordinated.length > 0) {
    console.warn(
      `GitHub Actions pinning coordination: ${result.coordinated.length} structurally bound mutable reference(s) remain authorized temporary debt`,
    );
  }

  console.log(
    `GitHub Actions pinning validation: PASS (${scan.scannedFiles.length} reachable GitHub YAML files, ${result.coordinated.length} temporary exception(s))`,
  );
}

const invokedPath = process.argv[1];

if (invokedPath && pathToFileURL(resolve(invokedPath)).href === import.meta.url) {
  main();
}
