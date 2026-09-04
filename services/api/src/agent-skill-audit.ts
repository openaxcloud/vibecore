import {
  auditAgentSkillBundle,
  type AgentSkillBundle,
  type AgentSkillBundleApprovalGate,
  type AgentSkillMetadata,
  type SkillDiagnostic,
  type SkillSecurityFinding,
} from '@vibecore/agent-skills';
import { validateGithubSkillBundleFiles, type GithubSkillBundle } from './skill-source-github.js';

export type PersistedAgentSkillAuditStatus = 'quarantined' | 'blocked';

/**
 * Audit data safe to persist and return to reviewers. Full instruction/resource
 * bodies live only in the protected immutable bundle; findings may contain only
 * the scanner's bounded, secret-redacted evidence excerpts.
 */
export interface PersistedAgentSkillAuditReport {
  schemaVersion: 1;
  scanner: 'vibecore-agent-skills-static-v1';
  status: PersistedAgentSkillAuditStatus;
  scanStatus: 'available' | 'review_required' | 'quarantined' | 'blocked';
  metadata?: AgentSkillMetadata;
  diagnostics: SkillDiagnostic[];
  findings: SkillSecurityFinding[];
  scannedCharacters: number;
  scanTruncated: boolean;
  approval: AgentSkillBundleApprovalGate;
  inventory: Array<{ path: string; byteLength: number; mode: '100644' | '100755'; binary: boolean }>;
  source: {
    ownerRepo: string;
    skillPath: string;
    commitSha: string;
    digest: string;
    sourceUrl: string;
  };
}

export interface AuditedGithubSkillBundle {
  status: PersistedAgentSkillAuditStatus;
  name?: string;
  description?: string;
  report: PersistedAgentSkillAuditReport;
}

function decodeBundleFile(contentBase64: string): { content?: string; binary: boolean } {
  const bytes = Buffer.from(contentBase64, 'base64');

  if (bytes.includes(0)) {
    return { binary: true };
  }

  try {
    return { content: new TextDecoder('utf-8', { fatal: true }).decode(bytes), binary: false };
  } catch {
    return { binary: true };
  }
}

/** Convert the transport bundle to scanner entries without interpreting binary assets. */
export function decodedAgentSkillBundle(bundle: GithubSkillBundle): AgentSkillBundle {
  const decoded: Record<string, NonNullable<AgentSkillBundle[string]>> = Object.create(null) as Record<
    string,
    NonNullable<AgentSkillBundle[string]>
  >;

  for (const file of bundle.files) {
    const value = decodeBundleFile(file.contentBase64);
    decoded[file.path] = {
      ...(value.content !== undefined ? { content: value.content } : {}),
      isBinary: value.binary,
      byteLength: file.byteLength,
    };
  }

  return decoded;
}

/**
 * Run the deterministic specification/injection scan over one immutable GitHub
 * folder. A clean result is still quarantined: only a later persisted human
 * decision may promote this exact digest to approved.
 */
export function auditGithubSkillBundle(bundle: GithubSkillBundle): AuditedGithubSkillBundle {
  validateGithubSkillBundleFiles(bundle.files);

  const directoryName = bundle.skillPath.split('/').at(-1) ?? '';
  const decoded = decodedAgentSkillBundle(bundle);
  const audit = auditAgentSkillBundle(decoded, { directoryName });

  const inventory = bundle.files.map((file) => {
    const decodedFile = decoded[file.path];
    const binary = typeof decodedFile === 'string' ? false : decodedFile?.isBinary === true;

    return {
      path: file.path,
      byteLength: file.byteLength,
      mode: file.mode,
      binary,
    };
  });
  const executableBinaryFindings: SkillSecurityFinding[] = inventory
    .filter((file) => file.binary && file.mode === '100755')
    .map((file) => ({
      ruleId: 'binary.executable-unscanned',
      category: 'obfuscation',
      severity: 'high',
      message: 'Executable binary content cannot be inspected by the static Agent Skill scanner.',
      location: file.path,
      excerpt: 'Executable binary requires a new auditable source artifact.',
    }));

  const blocksExecutableBinary = executableBinaryFindings.length > 0;

  const approval: AgentSkillBundleApprovalGate = blocksExecutableBinary
    ? {
        ...audit.approval,
        eligibleForManualApproval: false,
        blockingCodes: [...new Set([...audit.approval.blockingCodes, 'binary.executable-unscanned'])],
      }
    : audit.approval;

  const status: PersistedAgentSkillAuditStatus = approval.eligibleForManualApproval ? 'quarantined' : 'blocked';

  return {
    status,
    name: audit.skill?.metadata.name,
    description: audit.skill?.metadata.description,
    report: {
      schemaVersion: 1,
      scanner: 'vibecore-agent-skills-static-v1',
      status,
      scanStatus: blocksExecutableBinary ? 'blocked' : audit.status,
      ...(audit.skill ? { metadata: audit.skill.metadata } : {}),
      diagnostics: audit.diagnostics,
      findings: [...audit.findings, ...executableBinaryFindings],
      scannedCharacters: audit.scannedCharacters,
      scanTruncated: audit.scanTruncated,
      approval,
      inventory,
      source: {
        ownerRepo: bundle.ownerRepo,
        skillPath: bundle.skillPath,
        commitSha: bundle.commitSha,
        digest: bundle.digest,
        sourceUrl: bundle.sourceUrl,
      },
    },
  };
}
