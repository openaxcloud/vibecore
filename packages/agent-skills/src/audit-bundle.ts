import { MAX_RESOURCES_PER_SKILL, discoverProjectSkills } from './discovery.js';
import { RECOMMENDED_INSTRUCTION_TOKENS } from './parse-skill.js';
import { validateSkillResourcePath } from './path-policy.js';
import type {
  DiscoveredAgentSkill,
  SkillAuditStatus,
  SkillDiagnostic,
  SkillSecurityFinding,
  SkillSecurityReport,
} from './types.js';

/** A decoded Git/catalog bundle entry. Binary content is never interpreted. */
export type AgentSkillBundleEntry =
  | string
  | {
      content?: string;
      isBinary?: boolean;
      /** Prefer the decoded byte length when the source transports base64. */
      byteLength?: number;
    };

/** Paths are relative to the selected skill directory. */
export type AgentSkillBundle = Readonly<Record<string, AgentSkillBundleEntry | undefined>>;

export interface AgentSkillBundleApprovalGate {
  /** No blocking Agent Skills specification or bundle-integrity diagnostic. */
  specificationValid: boolean;
  /**
   * A human reviewer may promote this immutable bundle digest to `approved`.
   * Static scanning alone never grants approval.
   */
  eligibleForManualApproval: boolean;
  /** External bundles always require an explicit persisted reviewer decision. */
  requiresManualReview: true;
  /** Stable diagnostic/rule ids suitable for an API error contract. */
  blockingCodes: string[];
}

/** Fully JSON-serializable result; no Error, Map, Set, or byte array escapes. */
export interface AgentSkillBundleAuditResult {
  status: Exclude<SkillAuditStatus, 'approved' | 'revoked' | 'stale'>;
  diagnostics: SkillDiagnostic[];
  findings: SkillSecurityFinding[];
  scannedCharacters: number;
  scanTruncated: boolean;
  skill?: DiscoveredAgentSkill;
  approval: AgentSkillBundleApprovalGate;
}

export interface AuditAgentSkillBundleOptions {
  /** Expected directory name; the frontmatter `name` must match it. */
  directoryName: string;
}

const SKILL_DIRECTORY_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UNSCANNED_DIAGNOSTIC_CODES = new Set(['skill.resource-too-large', 'skill.too-many-resources']);

/**
 * External instructions enter the model in one activation tool result. Keep that
 * payload within the open standard's recommended ~5k-token budget instead of
 * allowing the parser's broader file-safety ceiling to become a context/cost DoS.
 * The approximation deliberately matches parseAgentSkill's conservative char/4
 * estimate; project-authored local skills retain the broader parser limit.
 */
export const MAX_EXTERNAL_SKILL_INSTRUCTION_CHARS = RECOMMENDED_INSTRUCTION_TOKENS * 4;

function diagnostic(code: string, message: string, location?: string): SkillDiagnostic {
  return { code, severity: 'error', message, ...(location ? { location } : {}) };
}

function bundleEntry(entry: AgentSkillBundleEntry): {
  content: string;
  isBinary: boolean;
  size: number;
} {
  if (typeof entry === 'string') return { content: entry, isBinary: false, size: entry.length };

  const content = entry.content ?? '';
  const byteLength = entry.byteLength;
  const size =
    typeof byteLength === 'number' && Number.isSafeInteger(byteLength) && byteLength >= 0 ? byteLength : content.length;

  return { content, isBinary: entry.isBinary === true, size };
}

function emptySecurityReport(): SkillSecurityReport {
  return { status: 'blocked', findings: [], scannedCharacters: 0, truncated: false };
}

/**
 * Audit one decoded external skill bundle.
 *
 * Only the exact root `SKILL.md` is parsed as instructions; README.md,
 * AGENTS.md, nested files, and case variants are resources only. Unsafe paths
 * and any spec error make the bundle ineligible for approval.
 */
export function auditAgentSkillBundle(
  bundle: AgentSkillBundle,
  options: AuditAgentSkillBundleOptions,
): AgentSkillBundleAuditResult {
  const diagnostics: SkillDiagnostic[] = [];
  const directoryName = options.directoryName.trim();
  const root = `.agents/skills/${directoryName}`;
  const fileMap: Record<string, { type: 'file'; content: string; isBinary: boolean; size: number }> = Object.create(
    null,
  ) as Record<string, { type: 'file'; content: string; isBinary: boolean; size: number }>;
  const entries = Object.entries(bundle).sort(([left], [right]) => left.localeCompare(right));

  if (!directoryName) {
    diagnostics.push(
      diagnostic('bundle.missing-directory-name', 'A non-empty expected skill directory name is required.'),
    );
  } else if (!SKILL_DIRECTORY_NAME_RE.test(directoryName)) {
    diagnostics.push(
      diagnostic(
        'bundle.invalid-directory-name',
        'The expected directory name must use lowercase letters, numbers, and single hyphens.',
      ),
    );
  }

  if (entries.length > MAX_RESOURCES_PER_SKILL + 1) {
    diagnostics.push(
      diagnostic('bundle.too-many-files', `The bundle exceeds the ${MAX_RESOURCES_PER_SKILL + 1}-file audit limit.`),
    );
  }

  const instructionsEntry = Object.prototype.hasOwnProperty.call(bundle, 'SKILL.md') ? bundle['SKILL.md'] : undefined;

  if (instructionsEntry === undefined) {
    diagnostics.push(
      diagnostic('bundle.missing-skill-md', 'The bundle must contain one exact root SKILL.md text file.', 'SKILL.md'),
    );
  }

  for (const [path, value] of entries) {
    if (value === undefined) {
      diagnostics.push(diagnostic('bundle.missing-entry', 'Bundle file entry is undefined.', path));
      continue;
    }

    const entry = bundleEntry(value);

    if (path === 'SKILL.md') {
      if (entry.isBinary) {
        diagnostics.push(diagnostic('bundle.binary-skill-md', 'The exact root SKILL.md must be UTF-8 text.', path));
      }

      fileMap[`${root}/SKILL.md`] = {
        type: 'file',
        content: entry.content,
        isBinary: entry.isBinary,
        size: entry.size,
      };
      continue;
    }

    const policy = validateSkillResourcePath(path);

    if (!policy.ok) {
      diagnostics.push(diagnostic(`bundle.${policy.code.toLowerCase()}`, policy.reason, path));
      continue;
    }

    if (entry.isBinary) {
      diagnostics.push(
        diagnostic(
          'bundle.binary-resource',
          'External Agent Skill binaries are blocked because their behavior cannot be reviewed as text.',
          path,
        ),
      );
    }

    fileMap[`${root}/${policy.path}`] = {
      type: 'file',
      content: entry.content,
      isBinary: entry.isBinary,
      size: entry.size,
    };
  }

  const discovery = discoverProjectSkills(fileMap);
  diagnostics.push(
    ...discovery.diagnostics.map((item) =>
      UNSCANNED_DIAGNOSTIC_CODES.has(item.code) ? { ...item, severity: 'error' as const } : item,
    ),
  );
  const skill = discovery.skills.length === 1 ? discovery.skills[0] : undefined;

  if (skill && skill.body.length > MAX_EXTERNAL_SKILL_INSTRUCTION_CHARS) {
    diagnostics.push(
      diagnostic(
        'bundle.instruction-budget-exceeded',
        `External SKILL.md instructions exceed the ${RECOMMENDED_INSTRUCTION_TOKENS}-token activation budget.`,
        'SKILL.md',
      ),
    );
  }

  if (discovery.skills.length > 1) {
    diagnostics.push(diagnostic('bundle.multiple-skills', 'A bundle may contain only one root Agent Skill.'));
  }

  const security = skill?.security ?? emptySecurityReport();
  const blockingDiagnostics = diagnostics.filter((item) => item.severity === 'error');
  const specificationValid = Boolean(skill) && blockingDiagnostics.length === 0;
  const securityBlocksApproval =
    security.status === 'blocked' || security.status === 'quarantined' || security.truncated;
  const blockingFindingCodes = security.findings
    .filter((finding) => finding.severity === 'critical' || finding.severity === 'high')
    .map((finding) => finding.ruleId);
  const blockingCodes = [
    ...blockingDiagnostics.map((item) => item.code),
    ...blockingFindingCodes,
    ...(security.truncated ? ['scan.input-truncated'] : []),
  ].filter((code, index, codes) => codes.indexOf(code) === index);
  const status = specificationValid && !security.truncated ? security.status : 'blocked';

  return {
    status,
    diagnostics,
    findings: security.findings,
    scannedCharacters: security.scannedCharacters,
    scanTruncated: security.truncated,
    ...(skill ? { skill } : {}),
    approval: {
      specificationValid,
      eligibleForManualApproval: specificationValid && !securityBlocksApproval,
      requiresManualReview: true,
      blockingCodes,
    },
  };
}
