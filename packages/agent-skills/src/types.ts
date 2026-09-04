/** Agent Skills metadata defined by https://agentskills.io/specification. */
export interface AgentSkillMetadata {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Readonly<Record<string, string>>;
  /**
   * Experimental declaration from the open specification. It is descriptive
   * only: Vibecore never turns it into a tool permission or an approval bypass.
   */
  allowedTools?: string;
}

export type SkillDiagnosticSeverity = 'warning' | 'error';

export interface SkillDiagnostic {
  code: string;
  severity: SkillDiagnosticSeverity;
  message: string;
  location?: string;
}

export type SkillSecurityCategory =
  | 'prompt_injection'
  | 'data_exfiltration'
  | 'destructive_action'
  | 'network_access'
  | 'obfuscation'
  | 'bidi_control';

export type SkillSecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * `available` means only that the local static scanner found no known pattern.
 * It is not a marketplace audit attestation. External/catalog artifacts should
 * be promoted to `approved` only by the persisted audit pipeline.
 */
export type SkillAuditStatus =
  | 'available'
  | 'review_required'
  | 'quarantined'
  | 'blocked'
  | 'approved'
  | 'revoked'
  | 'stale';

export interface SkillSecurityFinding {
  ruleId: string;
  category: SkillSecurityCategory;
  severity: SkillSecuritySeverity;
  message: string;
  location: string;
  line?: number;
  /** Short, secret-redacted evidence. Never the complete source line. */
  excerpt: string;
}

export interface SkillSecurityReport {
  status: Exclude<SkillAuditStatus, 'approved' | 'revoked' | 'stale'>;
  findings: SkillSecurityFinding[];
  scannedCharacters: number;
  truncated: boolean;
}

export interface ParsedAgentSkillDocument {
  metadata: AgentSkillMetadata;
  body: string;
  location: string;
  root: string;
}

export interface SkillParseResult {
  skill?: ParsedAgentSkillDocument;
  diagnostics: SkillDiagnostic[];
}

export interface AgentSkillResource {
  /** POSIX path relative to the skill directory. */
  path: string;
  /** Project-relative location. */
  location: string;
  size: number;
  isBinary: boolean;
  /** Server-only source. Catalog formatting never serializes this field. */
  content?: string;
}

export interface DiscoveredAgentSkill extends ParsedAgentSkillDocument {
  resources: readonly AgentSkillResource[];
  security: SkillSecurityReport;
  auditStatus: SkillAuditStatus;
}

export interface SkillCollision {
  name: string;
  winner: string;
  shadowed: string;
  reason: 'duplicate-location' | 'scope-precedence' | 'duplicate-name';
}

export interface SkillDiscoveryResult {
  skills: DiscoveredAgentSkill[];
  diagnostics: SkillDiagnostic[];
  collisions: SkillCollision[];
}

export interface SkillFileEntry {
  type: 'file' | 'folder';
  content?: string;
  isBinary?: boolean;
  /** Optional decoded byte length when the source transport knows it. */
  size?: number;
}

export type SkillFileMap = Readonly<Record<string, SkillFileEntry | undefined>>;

export interface SkillCatalogEntry {
  name: string;
  description: string;
  location: string;
  auditStatus: SkillAuditStatus;
}

export interface SkillActivationPayload {
  name: string;
  description: string;
  instructions: string;
  directory: string;
  resources: Array<Pick<AgentSkillResource, 'path' | 'size' | 'isBinary'>>;
  declaredAllowedTools?: string;
  grantsToolPermissions: false;
  alreadyActivated: boolean;
}

export interface SkillResourcePayload {
  skill: string;
  path: string;
  content: string;
  size: number;
}
