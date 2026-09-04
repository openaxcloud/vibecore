import { createHash } from 'node:crypto';
import { managedAgentSkillMarkerManifest } from './agent-skill-artifact-service.js';
import type {
  AgentSkillArtifactWithBundleRecord,
  AgentSkillRuntimePolicyRecord,
  AgentSkillArtifactStatus,
} from './store.js';

export const AGENT_SKILL_RUNTIME_POLICY_MAX_NAMES = 512;
export const AGENT_SKILL_RUNTIME_POLICY_MAX_RECORDS = 4_096;
export const AGENT_SKILL_RUNTIME_POLICY_MAX_MANIFEST_FILES = 512;
export const AGENT_SKILL_RUNTIME_POLICY_MAX_TOTAL_MANIFEST_FILES = 512;
export const AGENT_SKILL_RUNTIME_POLICY_MAX_TOTAL_BYTES = 10 * 1024 * 1024;

export interface AgentSkillRuntimeFileManifest {
  path: string;
  byteLength: number;
  sha256: string;
}

interface AgentSkillRuntimePolicyBase {
  artifactId: string;
  projectId: string;
  workspaceKey: string;
  name: string;
  digest: string;
  auditStatus: AgentSkillArtifactStatus;
  enabled: boolean;
}

export interface ActiveAgentSkillRuntimePolicy extends AgentSkillRuntimePolicyBase {
  auditStatus: 'approved';
  enabled: true;
  marker: AgentSkillRuntimeFileManifest;
  files: AgentSkillRuntimeFileManifest[];
}

export interface InactiveAgentSkillRuntimePolicy extends AgentSkillRuntimePolicyBase {
  enabled: false;
}

export type AgentSkillRuntimePolicy = ActiveAgentSkillRuntimePolicy | InactiveAgentSkillRuntimePolicy;

export class AgentSkillRuntimePolicyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'AgentSkillRuntimePolicyError';
  }
}

interface BuildAgentSkillRuntimePoliciesInput {
  projectId: string;
  workspaceKey: string;
  records: readonly AgentSkillRuntimePolicyRecord[];
  loadArtifact: (artifactId: string) => Promise<AgentSkillArtifactWithBundleRecord | undefined>;
  maxNames?: number;
  maxRecords?: number;
  maxTotalBytes?: number;
  maxTotalManifestFiles?: number;
}

function policyError(code: string, message: string, statusCode = 409): AgentSkillRuntimePolicyError {
  return new AgentSkillRuntimePolicyError(code, message, statusCode);
}

function compareCanonicalRecords(left: AgentSkillRuntimePolicyRecord, right: AgentSkillRuntimePolicyRecord): number {
  const updatedAt = right.updatedAt.localeCompare(left.updatedAt);

  return updatedAt !== 0 ? updatedAt : right.id.localeCompare(left.id);
}

function inactivePolicy(record: AgentSkillRuntimePolicyRecord): InactiveAgentSkillRuntimePolicy {
  return {
    artifactId: record.id,
    projectId: record.projectId,
    workspaceKey: record.workspaceKey,
    name: record.name,
    digest: record.digest,
    auditStatus: record.auditStatus,
    enabled: false,
  };
}

function assertLoadedArtifactMatches(
  record: AgentSkillRuntimePolicyRecord,
  artifact: AgentSkillArtifactWithBundleRecord | undefined,
): asserts artifact is AgentSkillArtifactWithBundleRecord {
  if (
    !artifact ||
    artifact.id !== record.id ||
    artifact.projectId !== record.projectId ||
    artifact.workspaceKey !== record.workspaceKey ||
    artifact.name !== record.name ||
    artifact.digest !== record.digest ||
    artifact.commitSha !== record.commitSha ||
    artifact.auditStatus !== 'approved' ||
    !artifact.enabled
  ) {
    throw policyError(
      'AGENT_SKILL_RUNTIME_POLICY_STALE',
      'The approved Agent Skill changed while its runtime policy was being materialized.',
    );
  }
}

function buildMinimalManifest(
  artifact: AgentSkillArtifactWithBundleRecord,
  remainingBytes: number,
): { files: AgentSkillRuntimeFileManifest[]; byteLength: number } {
  if (artifact.bundle.length > AGENT_SKILL_RUNTIME_POLICY_MAX_MANIFEST_FILES) {
    throw policyError(
      'AGENT_SKILL_RUNTIME_POLICY_TOO_LARGE',
      'The approved Agent Skill contains too many files for a runtime policy.',
      413,
    );
  }

  const seenPaths = new Set<string>();
  let byteLength = 0;

  const files = artifact.bundle
    .map((file) => {
      if (seenPaths.has(file.path)) {
        throw policyError(
          'AGENT_SKILL_RUNTIME_POLICY_CORRUPT',
          'The approved Agent Skill contains duplicate file paths.',
        );
      }

      seenPaths.add(file.path);

      if (!Number.isSafeInteger(file.byteLength) || file.byteLength < 0) {
        throw policyError(
          'AGENT_SKILL_RUNTIME_POLICY_CORRUPT',
          'The approved Agent Skill contains an invalid stored byte length.',
        );
      }

      byteLength += file.byteLength;

      if (byteLength > remainingBytes) {
        throw policyError(
          'AGENT_SKILL_RUNTIME_POLICY_TOO_LARGE',
          'Approved Agent Skill bytes exceed the aggregate runtime policy limit.',
          413,
        );
      }

      const bytes = Buffer.from(file.contentBase64, 'base64');

      if (bytes.byteLength !== file.byteLength) {
        throw policyError(
          'AGENT_SKILL_RUNTIME_POLICY_CORRUPT',
          'The approved Agent Skill manifest does not match its stored bytes.',
        );
      }

      return {
        path: file.path,
        byteLength: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  return { files, byteLength };
}

/**
 * Return one deterministic runtime policy per skill name.
 *
 * Disabled/quarantined/blocked/revoked records are compact tombstones and never
 * trigger a bundle read. Exactly one approved+enabled record may materialize a
 * hash-only manifest. Conflicting active rows, scope drift, truncation and all
 * configured bounds fail closed instead of silently dropping policy state.
 */
export async function buildAgentSkillRuntimePolicies(
  input: BuildAgentSkillRuntimePoliciesInput,
): Promise<AgentSkillRuntimePolicy[]> {
  const maxRecords = input.maxRecords ?? AGENT_SKILL_RUNTIME_POLICY_MAX_RECORDS;
  const maxNames = input.maxNames ?? AGENT_SKILL_RUNTIME_POLICY_MAX_NAMES;
  const maxTotalBytes = input.maxTotalBytes ?? AGENT_SKILL_RUNTIME_POLICY_MAX_TOTAL_BYTES;
  const maxTotalManifestFiles =
    input.maxTotalManifestFiles ?? AGENT_SKILL_RUNTIME_POLICY_MAX_TOTAL_MANIFEST_FILES;

  if (input.records.length > maxRecords) {
    throw policyError(
      'AGENT_SKILL_RUNTIME_POLICY_TOO_LARGE',
      'The Agent Skills policy history exceeds the runtime materialization limit.',
      413,
    );
  }

  const grouped = new Map<string, AgentSkillRuntimePolicyRecord[]>();

  for (const record of input.records) {
    if (record.projectId !== input.projectId || record.workspaceKey !== input.workspaceKey) {
      throw policyError(
        'AGENT_SKILL_RUNTIME_POLICY_SCOPE_MISMATCH',
        'An Agent Skill runtime policy escaped its project or workspace scope.',
      );
    }

    if (record.enabled && record.auditStatus !== 'approved') {
      throw policyError(
        'AGENT_SKILL_RUNTIME_POLICY_CONFLICT',
        'Only an approved Agent Skill may be enabled at runtime.',
      );
    }

    const records = grouped.get(record.name) ?? [];
    records.push(record);
    grouped.set(record.name, records);
  }

  if (grouped.size > maxNames) {
    throw policyError(
      'AGENT_SKILL_RUNTIME_POLICY_TOO_LARGE',
      'The workspace contains too many distinct Agent Skill policies.',
      413,
    );
  }

  const policies: AgentSkillRuntimePolicy[] = [];
  let totalBytes = 0;
  let totalManifestFiles = 0;

  for (const name of [...grouped.keys()].sort()) {
    const records = [...(grouped.get(name) ?? [])].sort(compareCanonicalRecords);
    const active = records.filter((record) => record.auditStatus === 'approved' && record.enabled);

    if (active.length > 1) {
      throw policyError(
        'AGENT_SKILL_RUNTIME_POLICY_CONFLICT',
        `Multiple approved Agent Skill artifacts are enabled for ${name}.`,
      );
    }

    const activeRecord = active[0];

    if (!activeRecord) {
      const newest = records[0];

      if (newest) policies.push(inactivePolicy(newest));
      continue;
    }

    const artifact = await input.loadArtifact(activeRecord.id);
    assertLoadedArtifactMatches(activeRecord, artifact);
    const marker = managedAgentSkillMarkerManifest(artifact);
    totalManifestFiles += artifact.bundle.length;

    if (totalManifestFiles > maxTotalManifestFiles) {
      throw policyError(
        'AGENT_SKILL_RUNTIME_POLICY_TOO_LARGE',
        'Approved Agent Skills contain too many aggregate runtime manifest files.',
        413,
      );
    }

    if (totalBytes + marker.byteLength > maxTotalBytes) {
      throw policyError(
        'AGENT_SKILL_RUNTIME_POLICY_TOO_LARGE',
        'Approved Agent Skill bytes exceed the aggregate runtime policy limit.',
        413,
      );
    }

    const manifest = buildMinimalManifest(artifact, maxTotalBytes - totalBytes - marker.byteLength);
    totalBytes += marker.byteLength + manifest.byteLength;
    policies.push({
      artifactId: artifact.id,
      projectId: artifact.projectId,
      workspaceKey: artifact.workspaceKey,
      name: artifact.name,
      digest: artifact.digest,
      auditStatus: 'approved',
      enabled: true,
      marker,
      files: manifest.files,
    });
  }

  return policies;
}
