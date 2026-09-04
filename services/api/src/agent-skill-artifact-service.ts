import { createHash } from 'node:crypto';

import { auditGithubSkillBundle } from './agent-skill-audit.js';
import {
  computeGithubSkillBundleDigest,
  type GithubSkillBundle,
  type GithubSkillBundleFile,
  normalizeGithubSkillSource,
  validateGithubSkillBundleFiles,
} from './skill-source-github.js';
import type { AgentSkillArtifactWithBundleRecord, AgentSkillStoredFile } from './store.js';

const COMMIT_SHA_RE = /^[a-f0-9]{40}$/;
const DIGEST_RE = /^[a-f0-9]{64}$/;
const MANAGED_SKILL_MARKER_VERSION = 1 as const;
const MANAGED_SKILL_MARKER_ROOT = '.agents/.vibecore/managed-skills';

export type AgentSkillArtifactErrorCode =
  | 'AGENT_SKILL_ARTIFACT_CORRUPT'
  | 'AGENT_SKILL_AUDIT_BLOCKED'
  | 'AGENT_SKILL_COLLISION'
  | 'AGENT_SKILL_INSTALL_FAILED'
  | 'AGENT_SKILL_STATE_INVALID';

export class AgentSkillArtifactError extends Error {
  readonly code: AgentSkillArtifactErrorCode;
  readonly statusCode: number;

  constructor(code: AgentSkillArtifactErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = 'AgentSkillArtifactError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface AgentSkillWorkspaceFile {
  content: string;
  encoding: 'utf8' | 'base64';
}

export interface AgentSkillWorkspaceAdapter {
  listFiles(root: string): Promise<string[]>;
  readFile(path: string): Promise<AgentSkillWorkspaceFile | undefined>;
  writeFile(file: { path: string; content: string; encoding: 'base64' }): Promise<void>;
  deleteTree(root: string): Promise<void>;
}

export interface ManagedAgentSkillMarker {
  version: typeof MANAGED_SKILL_MARKER_VERSION;
  artifactId: string;
  projectId: string;
  workspaceKey: string;
  name: string;
  digest: string;
  commitSha: string;
}

export interface ManagedAgentSkillMarkerManifest {
  path: string;
  byteLength: number;
  sha256: string;
}

function bundleForArtifact(artifact: AgentSkillArtifactWithBundleRecord): GithubSkillBundle {
  return {
    ownerRepo: artifact.ownerRepo,
    skillPath: artifact.skillPath,
    commitSha: artifact.commitSha,
    digest: artifact.digest,
    sourceUrl: artifact.sourceUrl,
    files: artifact.bundle.map((file) => ({ ...file })),
  };
}

function bytesFromWorkspaceFile(file: AgentSkillWorkspaceFile): Buffer {
  return Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8');
}

function assertSafeSkillName(name: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new AgentSkillArtifactError(
      'AGENT_SKILL_ARTIFACT_CORRUPT',
      'The audited skill name is not safe for installation.',
      422,
    );
  }
}

function expectedInstallPath(name: string): string {
  assertSafeSkillName(name);

  return `.agents/skills/${name}`;
}

/** Reserved ownership sidecar for one externally managed Agent Skill. */
export function managedAgentSkillMarkerPath(name: string): string {
  assertSafeSkillName(name);

  return `${MANAGED_SKILL_MARKER_ROOT}/${name}.json`;
}

/** Canonical marker bytes. Fixed key order plus a final newline make the digest deterministic. */
export function managedAgentSkillMarkerBytes(
  artifact: Pick<
    AgentSkillArtifactWithBundleRecord,
    'id' | 'projectId' | 'workspaceKey' | 'name' | 'digest' | 'commitSha'
  >,
): Buffer {
  assertSafeSkillName(artifact.name);

  if (!artifact.id || !artifact.projectId || !artifact.workspaceKey) {
    throw new AgentSkillArtifactError(
      'AGENT_SKILL_ARTIFACT_CORRUPT',
      'The managed skill marker scope is incomplete.',
      422,
    );
  }

  if (!COMMIT_SHA_RE.test(artifact.commitSha) || !DIGEST_RE.test(artifact.digest)) {
    throw new AgentSkillArtifactError('AGENT_SKILL_ARTIFACT_CORRUPT', 'Skill provenance is malformed.', 422);
  }

  const marker: ManagedAgentSkillMarker = {
    version: MANAGED_SKILL_MARKER_VERSION,
    artifactId: artifact.id,
    projectId: artifact.projectId,
    workspaceKey: artifact.workspaceKey,
    name: artifact.name,
    digest: artifact.digest,
    commitSha: artifact.commitSha,
  };

  return Buffer.from(`${JSON.stringify(marker)}\n`, 'utf8');
}

/** Exact marker manifest exposed to the runtime approval response. */
export function managedAgentSkillMarkerManifest(
  artifact: Pick<
    AgentSkillArtifactWithBundleRecord,
    'id' | 'projectId' | 'workspaceKey' | 'name' | 'digest' | 'commitSha'
  >,
): ManagedAgentSkillMarkerManifest {
  const bytes = managedAgentSkillMarkerBytes(artifact);

  return {
    path: managedAgentSkillMarkerPath(artifact.name),
    byteLength: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function verifiedArtifactBytes(artifact: AgentSkillArtifactWithBundleRecord): {
  installPath: string;
  files: GithubSkillBundleFile[];
} {
  if (!COMMIT_SHA_RE.test(artifact.commitSha) || !DIGEST_RE.test(artifact.digest)) {
    throw new AgentSkillArtifactError('AGENT_SKILL_ARTIFACT_CORRUPT', 'Skill provenance is malformed.', 422);
  }

  try {
    const source = normalizeGithubSkillSource({
      ownerRepo: artifact.ownerRepo,
      skillPath: artifact.skillPath,
      ref: artifact.commitSha,
    });

    if (source.ownerRepo !== artifact.ownerRepo || source.skillPath !== artifact.skillPath) {
      throw new Error('non-canonical source');
    }
  } catch {
    throw new AgentSkillArtifactError(
      'AGENT_SKILL_ARTIFACT_CORRUPT',
      'The stored skill source coordinates are malformed.',
      422,
    );
  }

  const expectedSourceUrl = `https://github.com/${artifact.ownerRepo}/tree/${artifact.commitSha}/${artifact.skillPath}`;

  if (artifact.sourceUrl !== expectedSourceUrl) {
    throw new AgentSkillArtifactError(
      'AGENT_SKILL_ARTIFACT_CORRUPT',
      'The stored skill source does not match its immutable provenance.',
      422,
    );
  }

  try {
    validateGithubSkillBundleFiles(artifact.bundle);
  } catch {
    throw new AgentSkillArtifactError(
      'AGENT_SKILL_ARTIFACT_CORRUPT',
      'The stored skill bundle failed integrity validation.',
      422,
    );
  }

  if (computeGithubSkillBundleDigest(artifact.bundle) !== artifact.digest) {
    throw new AgentSkillArtifactError(
      'AGENT_SKILL_ARTIFACT_CORRUPT',
      'The stored skill no longer matches its audited digest.',
      409,
    );
  }

  return {
    installPath: expectedInstallPath(artifact.name),
    files: artifact.bundle.map((file) => ({ ...file })),
  };
}

/** Recompute integrity + policy at the approval boundary; never trust stale report JSON. */
export function verifyAgentSkillArtifactForApproval(artifact: AgentSkillArtifactWithBundleRecord): {
  installPath: string;
  files: GithubSkillBundleFile[];
} {
  if (artifact.auditStatus !== 'quarantined' && artifact.auditStatus !== 'approved') {
    throw new AgentSkillArtifactError(
      'AGENT_SKILL_AUDIT_BLOCKED',
      'Only quarantined artifacts awaiting review or already approved artifacts may be installed.',
      422,
    );
  }

  const verified = verifiedArtifactBytes(artifact);
  const audit = auditGithubSkillBundle(bundleForArtifact(artifact));
  const metadata = audit.report.metadata;

  if (
    !audit.report.approval.eligibleForManualApproval ||
    audit.name !== artifact.name ||
    audit.description !== artifact.description ||
    metadata?.license !== artifact.license ||
    metadata?.compatibility !== artifact.compatibility ||
    metadata?.allowedTools !== artifact.declaredAllowedTools
  ) {
    throw new AgentSkillArtifactError(
      'AGENT_SKILL_AUDIT_BLOCKED',
      'This exact skill artifact has blocking specification or security findings.',
      422,
    );
  }

  return verified;
}

/** Reject impossible caller-supplied action/state combinations before persistence. */
export function validateAgentSkillArtifactTransition(input: {
  expectedStatuses: readonly AgentSkillArtifactWithBundleRecord['auditStatus'][];
  status: AgentSkillArtifactWithBundleRecord['auditStatus'];
  enabled: boolean;
  installedPath?: string | null;
  action: 'approved' | 'rejected' | 'revoked' | 'enabled' | 'disabled';
}): void {
  const expected = [...new Set(input.expectedStatuses)].sort();

  const isExact = (statuses: AgentSkillArtifactWithBundleRecord['auditStatus'][]) =>
    expected.length === statuses.length && expected.every((status, index) => status === [...statuses].sort()[index]);
  const valid =
    (input.action === 'approved' &&
      isExact(['quarantined']) &&
      input.status === 'approved' &&
      input.enabled &&
      typeof input.installedPath === 'string') ||
    (input.action === 'rejected' &&
      isExact(['blocked', 'quarantined']) &&
      input.status === 'blocked' &&
      !input.enabled &&
      input.installedPath === undefined) ||
    (input.action === 'revoked' &&
      isExact(['approved']) &&
      input.status === 'revoked' &&
      !input.enabled &&
      input.installedPath === null) ||
    (input.action === 'enabled' &&
      isExact(['approved']) &&
      input.status === 'approved' &&
      input.enabled &&
      typeof input.installedPath === 'string') ||
    (input.action === 'disabled' &&
      isExact(['approved']) &&
      input.status === 'approved' &&
      !input.enabled &&
      input.installedPath === null);

  if (!valid) {
    throw new AgentSkillArtifactError(
      'AGENT_SKILL_STATE_INVALID',
      'The requested Agent Skill state transition is invalid.',
      422,
    );
  }
}

async function workspaceMatchesBundle(
  adapter: AgentSkillWorkspaceAdapter,
  root: string,
  files: readonly AgentSkillStoredFile[],
): Promise<boolean> {
  const existingPaths = (await adapter.listFiles(root)).sort();
  const expectedPaths = files.map((file) => `${root}/${file.path}`).sort();

  if (
    existingPaths.length !== expectedPaths.length ||
    existingPaths.some((path, index) => path !== expectedPaths[index])
  ) {
    return false;
  }

  for (const file of files) {
    const existing = await adapter.readFile(`${root}/${file.path}`);

    if (!existing || !bytesFromWorkspaceFile(existing).equals(Buffer.from(file.contentBase64, 'base64'))) {
      return false;
    }
  }

  return true;
}

async function workspaceContainsOnlyExpectedBundleBytes(
  adapter: AgentSkillWorkspaceAdapter,
  root: string,
  files: readonly AgentSkillStoredFile[],
): Promise<boolean> {
  const expected = new Map(files.map((file) => [`${root}/${file.path}`, Buffer.from(file.contentBase64, 'base64')]));
  const existingPaths = await adapter.listFiles(root);

  for (const path of existingPaths) {
    const expectedBytes = expected.get(path);
    const existing = await adapter.readFile(path);

    if (!expectedBytes || !existing || !bytesFromWorkspaceFile(existing).equals(expectedBytes)) {
      return false;
    }
  }

  return true;
}

async function markerMatches(
  adapter: AgentSkillWorkspaceAdapter,
  markerPath: string,
  expectedBytes: Buffer,
): Promise<boolean> {
  const existing = await adapter.readFile(markerPath);

  return Boolean(existing && bytesFromWorkspaceFile(existing).equals(expectedBytes));
}

async function deleteExactMarker(
  adapter: AgentSkillWorkspaceAdapter,
  markerPath: string,
  expectedBytes: Buffer,
): Promise<void> {
  const existing = await adapter.readFile(markerPath);

  if (!existing) {
    return;
  }

  if (!bytesFromWorkspaceFile(existing).equals(expectedBytes)) {
    throw new AgentSkillArtifactError(
      'AGENT_SKILL_COLLISION',
      `Refusing to remove ${markerPath} because it belongs to a different managed skill artifact.`,
      409,
    );
  }

  await adapter.deleteTree(markerPath);

  if (await adapter.readFile(markerPath)) {
    throw new AgentSkillArtifactError(
      'AGENT_SKILL_INSTALL_FAILED',
      'The managed skill marker could not be removed completely.',
      502,
    );
  }
}

/**
 * Best-effort fail-closed rollback. The marker is removed only after the skill
 * directory is empty, and never if either location was concurrently replaced.
 */
async function rollbackAgentSkillInstall(
  adapter: AgentSkillWorkspaceAdapter,
  installPath: string,
  files: readonly AgentSkillStoredFile[],
  markerPath: string,
  markerBytes: Buffer,
): Promise<void> {
  try {
    if (await workspaceContainsOnlyExpectedBundleBytes(adapter, installPath, files)) {
      await adapter.deleteTree(installPath);
    }

    if ((await adapter.listFiles(installPath)).length === 0) {
      await deleteExactMarker(adapter, markerPath, markerBytes);
    }
  } catch {
    // A surviving marker keeps the external skill fail-closed until a safe retry.
  }
}

/**
 * Materialize the exact audited bytes, writing SKILL.md last so a partial copy
 * can never be discovered as an active skill. A failed copy is rolled back.
 */
export async function installVerifiedAgentSkill(
  artifact: AgentSkillArtifactWithBundleRecord,
  adapter: AgentSkillWorkspaceAdapter,
): Promise<{ installPath: string; alreadyInstalled: boolean }> {
  const verified = verifyAgentSkillArtifactForApproval(artifact);
  const markerPath = managedAgentSkillMarkerPath(artifact.name);
  const markerBytes = managedAgentSkillMarkerBytes(artifact);
  const existingMarker = await adapter.readFile(markerPath);
  const existingPaths = await adapter.listFiles(verified.installPath);

  if (existingMarker && !bytesFromWorkspaceFile(existingMarker).equals(markerBytes)) {
    throw new AgentSkillArtifactError(
      'AGENT_SKILL_COLLISION',
      `A different managed skill marker already occupies ${markerPath}.`,
      409,
    );
  }

  if (existingPaths.length > 0) {
    if (
      existingMarker &&
      (await workspaceMatchesBundle(adapter, verified.installPath, verified.files)) &&
      (await markerMatches(adapter, markerPath, markerBytes))
    ) {
      return { installPath: verified.installPath, alreadyInstalled: true };
    }

    throw new AgentSkillArtifactError(
      'AGENT_SKILL_COLLISION',
      `A different skill already occupies ${verified.installPath}.`,
      409,
    );
  }

  const ordered = [...verified.files].sort((left, right) => {
    if (left.path === 'SKILL.md') {
      return 1;
    }

    if (right.path === 'SKILL.md') {
      return -1;
    }

    return left.path.localeCompare(right.path);
  });

  try {
    if (!existingMarker) {
      await adapter.writeFile({
        path: markerPath,
        content: markerBytes.toString('base64'),
        encoding: 'base64',
      });
    }

    if (!(await markerMatches(adapter, markerPath, markerBytes))) {
      throw new AgentSkillArtifactError(
        'AGENT_SKILL_INSTALL_FAILED',
        'The workspace did not preserve the managed skill marker.',
        502,
      );
    }

    for (const file of ordered) {
      await adapter.writeFile({
        path: `${verified.installPath}/${file.path}`,
        content: file.contentBase64,
        encoding: 'base64',
      });
    }

    if (!(await workspaceMatchesBundle(adapter, verified.installPath, verified.files))) {
      throw new AgentSkillArtifactError(
        'AGENT_SKILL_INSTALL_FAILED',
        'The workspace did not preserve the audited skill bytes.',
        502,
      );
    }
  } catch (cause) {
    await rollbackAgentSkillInstall(adapter, verified.installPath, verified.files, markerPath, markerBytes);

    if (cause instanceof AgentSkillArtifactError) {
      throw cause;
    }

    throw new AgentSkillArtifactError(
      'AGENT_SKILL_INSTALL_FAILED',
      'The audited skill could not be installed atomically.',
      502,
    );
  }

  return { installPath: verified.installPath, alreadyInstalled: false };
}

export async function removeAgentSkillInstallation(
  artifact: AgentSkillArtifactWithBundleRecord,
  adapter: AgentSkillWorkspaceAdapter,
): Promise<string> {
  const verified = verifiedArtifactBytes(artifact);
  const installPath = verified.installPath;
  const markerPath = managedAgentSkillMarkerPath(artifact.name);
  const markerBytes = managedAgentSkillMarkerBytes(artifact);
  const existingMarker = await adapter.readFile(markerPath);
  const existingPaths = await adapter.listFiles(installPath);

  if (existingMarker && !bytesFromWorkspaceFile(existingMarker).equals(markerBytes)) {
    throw new AgentSkillArtifactError(
      'AGENT_SKILL_COLLISION',
      `Refusing to remove ${markerPath} because it belongs to a different managed skill artifact.`,
      409,
    );
  }

  if (existingPaths.length === 0 && !existingMarker) {
    return installPath;
  }

  if (!existingMarker) {
    throw new AgentSkillArtifactError(
      'AGENT_SKILL_COLLISION',
      `Refusing to remove files at ${installPath} without its exact managed skill marker.`,
      409,
    );
  }

  if (existingPaths.length > 0 && !(await workspaceMatchesBundle(adapter, installPath, verified.files))) {
    throw new AgentSkillArtifactError(
      'AGENT_SKILL_COLLISION',
      `Refusing to remove files at ${installPath} because they do not match this audited artifact.`,
      409,
    );
  }

  if (existingPaths.length > 0) {
    await adapter.deleteTree(installPath);
  }

  if ((await adapter.listFiles(installPath)).length > 0) {
    throw new AgentSkillArtifactError(
      'AGENT_SKILL_INSTALL_FAILED',
      'The skill directory could not be removed completely.',
      502,
    );
  }

  await deleteExactMarker(adapter, markerPath, markerBytes);

  return installPath;
}
