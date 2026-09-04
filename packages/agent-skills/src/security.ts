import type {
  AgentSkillMetadata,
  AgentSkillResource,
  SkillSecurityCategory,
  SkillSecurityFinding,
  SkillSecurityReport,
  SkillSecuritySeverity,
} from './types.js';

export const MAX_SECURITY_SCAN_CHARS = 1_000_000;
const MAX_FINDINGS_PER_RULE = 4;

interface SecurityRule {
  id: string;
  category: SkillSecurityCategory;
  severity: SkillSecuritySeverity;
  message: string;
  pattern: RegExp;
}

/* Keep expressions line-bounded and quantified with small maxima to avoid ReDoS. */
const SECURITY_RULES: readonly SecurityRule[] = [
  {
    id: 'prompt.ignore-instructions',
    category: 'prompt_injection',
    severity: 'high',
    message: 'Attempts to override prior, system, or developer instructions.',
    pattern: /\bignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|system|developer)(?:\s+(?:system|developer))?\s+(?:instructions?|messages?|rules?)\b/i,
  },
  {
    id: 'prompt.role-spoofing',
    category: 'prompt_injection',
    severity: 'high',
    message: 'Contains role or tool-result markup that can spoof prompt structure.',
    pattern: /<(?:system|developer|assistant|tool(?:_result|_call)?)\b|\b(?:system|developer)\s*:\s*(?:ignore|override|you must)/i,
  },
  {
    id: 'prompt.identity-override',
    category: 'prompt_injection',
    severity: 'high',
    message: 'Attempts to replace the agent identity or governing policy.',
    pattern: /\byou are now\b|\boverride\s+(?:the\s+)?(?:system|developer|safety|policy)/i,
  },
  {
    id: 'prompt.concealment',
    category: 'prompt_injection',
    severity: 'high',
    message: 'Requests concealment of behavior from the user or reviewer.',
    pattern: /\b(?:hide|conceal|do not (?:tell|show|mention))\b.{0,80}\b(?:user|operator|reviewer)\b/i,
  },
  {
    id: 'exfil.transmit-secrets',
    category: 'data_exfiltration',
    severity: 'critical',
    message: 'Requests transmission of secrets or credentials.',
    pattern: /\b(?:send|upload|post|transmit|exfiltrate)\b.{0,100}\b(?:secret|token|credential|api[-_ ]?key|\.env|environment variable|private key)\b/i,
  },
  {
    id: 'exfil.collect-secrets',
    category: 'data_exfiltration',
    severity: 'high',
    message: 'Requests collection or disclosure of sensitive local data.',
    pattern: /\b(?:read|print|dump|collect|enumerate)\b.{0,100}\b(?:\.env|credentials?|private key|access token|api[-_ ]?key|environment variables?)\b/i,
  },
  {
    id: 'destructive.filesystem',
    category: 'destructive_action',
    severity: 'critical',
    message: 'Contains a destructive filesystem command.',
    pattern: /\brm\s+-[^\r\n]{0,12}r[^\r\n]{0,12}f\s+(?:\/|~|\*)|\b(?:del|erase)\s+\/(?:s|q)\b/i,
  },
  {
    id: 'destructive.git',
    category: 'destructive_action',
    severity: 'high',
    message: 'Contains a destructive Git command.',
    pattern: /\bgit\s+(?:reset\s+--hard|clean\s+-[a-z]*f)/i,
  },
  {
    id: 'destructive.database',
    category: 'destructive_action',
    severity: 'high',
    message: 'Contains a destructive database statement.',
    pattern: /\b(?:drop\s+(?:database|schema|table)|truncate\s+table)\b/i,
  },
  {
    id: 'network.download-execute',
    category: 'network_access',
    severity: 'critical',
    message: 'Downloads remote content and pipes it to an interpreter.',
    pattern: /\b(?:curl|wget)\b[^\r\n|]{0,200}\|\s*(?:ba)?sh\b|\bbase64\s+(?:--decode|-d)\b[^\r\n|]{0,100}\|\s*(?:ba)?sh\b/i,
  },
  {
    id: 'network.egress',
    category: 'network_access',
    severity: 'medium',
    message: 'Declares outbound network access that requires review.',
    pattern: /https?:\/\/|\b(?:curl|wget|invoke-webrequest)\b|\bfetch\s*\(|\brequests?\.(?:get|post|put|delete)\s*\(/i,
  },
  {
    id: 'obfuscation.encoded-payload',
    category: 'obfuscation',
    severity: 'medium',
    message: 'Contains a long encoded payload.',
    pattern: /(?:[A-Za-z0-9+/]{100,}={0,2})/,
  },
  {
    id: 'obfuscation.dynamic-execution',
    category: 'obfuscation',
    severity: 'high',
    message: 'Uses dynamic code execution that requires manual review.',
    pattern: /\b(?:eval|exec)\s*\(|\bnew\s+Function\s*\(|\bfromCharCode\s*\(/i,
  },
  {
    id: 'bidi.control-character',
    category: 'bidi_control',
    severity: 'high',
    message: 'Contains invisible bidirectional control characters.',
    pattern: /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/u,
  },
] as const;

const SEVERITY_RANK: Record<SkillSecuritySeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function redactExcerpt(value: string): string {
  return value
    .replace(
      /\b(?:token|secret|password|api[-_ ]?key)\s*[:=]\s*[^\s,;]+/gi,
      (match) => `${match.split(/[:=]/, 1)[0]}=[REDACTED]`,
    )
    .replace(/\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .trim()
    .slice(0, 240);
}

function metadataSources(metadata: AgentSkillMetadata, location: string): Array<{ location: string; content: string }> {
  const sources = [
    { location: `${location}#name`, content: metadata.name },
    { location: `${location}#description`, content: metadata.description },
  ];

  if (metadata.license) sources.push({ location: `${location}#license`, content: metadata.license });
  if (metadata.compatibility) sources.push({ location: `${location}#compatibility`, content: metadata.compatibility });
  if (metadata.allowedTools) sources.push({ location: `${location}#allowed-tools`, content: metadata.allowedTools });

  for (const [key, value] of Object.entries(metadata.metadata ?? {})) {
    sources.push({ location: `${location}#metadata.${key}`, content: value });
  }

  return sources;
}

export interface ScanAgentSkillInput {
  metadata: AgentSkillMetadata;
  body: string;
  location: string;
  resources?: readonly AgentSkillResource[];
  maxCharacters?: number;
}

/** Static, deterministic first-pass scanner. It never produces `approved`. */
export function scanAgentSkillSecurity(input: ScanAgentSkillInput): SkillSecurityReport {
  const maxCharacters = input.maxCharacters ?? MAX_SECURITY_SCAN_CHARS;
  const rawSources = [
    ...metadataSources(input.metadata, input.location),
    { location: `${input.location}#body`, content: input.body },
    ...(input.resources ?? [])
      .filter((resource) => !resource.isBinary && typeof resource.content === 'string')
      .map((resource) => ({ location: resource.location, content: resource.content! })),
  ];
  const findings: SkillSecurityFinding[] = [];
  let remaining = maxCharacters;
  let scannedCharacters = 0;
  let truncated = false;

  for (const source of rawSources) {
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const content = source.content.slice(0, remaining);

    if (content.length < source.content.length) truncated = true;
    remaining -= content.length;
    scannedCharacters += content.length;
    const lines = content.split(/\r?\n/);

    for (const rule of SECURITY_RULES) {
      let ruleFindings = 0;

      for (let index = 0; index < lines.length && ruleFindings < MAX_FINDINGS_PER_RULE; index += 1) {
        const line = lines[index];

        if (!rule.pattern.test(line)) continue;
        findings.push({
          ruleId: rule.id,
          category: rule.category,
          severity: rule.severity,
          message: rule.message,
          location: source.location,
          line: index + 1,
          excerpt: redactExcerpt(line),
        });
        ruleFindings += 1;
      }
    }
  }

  if (truncated) {
    findings.push({
      ruleId: 'scan.input-truncated',
      category: 'obfuscation',
      severity: 'medium',
      message: 'Static scan input exceeded the bounded character budget.',
      location: input.location,
      excerpt: 'Additional content requires manual review.',
    });
  }

  const highest = findings.reduce<SkillSecuritySeverity | undefined>((current, finding) => {
    if (!current || SEVERITY_RANK[finding.severity] > SEVERITY_RANK[current]) return finding.severity;
    return current;
  }, undefined);
  const status: SkillSecurityReport['status'] =
    highest === 'critical'
      ? 'blocked'
      : highest === 'high'
        ? 'quarantined'
        : highest
          ? 'review_required'
          : 'available';

  return { status, findings, scannedCharacters, truncated };
}
