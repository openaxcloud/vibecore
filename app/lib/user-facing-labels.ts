const ACRONYMS: Readonly<Record<string, string>> = {
  ai: 'AI',
  api: 'API',
  cpu: 'CPU',
  eur: 'EUR',
  gb: 'GB',
  gpu: 'GPU',
  id: 'ID',
  mb: 'MB',
  mfa: 'MFA',
  payg: 'Pay-as-you-go',
  ram: 'RAM',
  saml: 'SAML',
  scim: 'SCIM',
  siem: 'SIEM',
  sla: 'SLA',
  sso: 'SSO',
  url: 'URL',
  utc: 'UTC',
};

/**
 * Product vocabulary for identifiers returned by billing, quota and support
 * APIs. Keys are normalized to lowercase so legacy snake_case and current
 * camelCase payloads can share one user-facing label.
 */
const PRODUCT_LABELS: Readonly<Record<string, string>> = {
  active: 'Active',
  canceled: 'Cancelled',
  cancelled: 'Cancelled',
  closed: 'Closed',
  draft: 'Draft',
  failed: 'Failed',
  incomplete: 'Incomplete',
  incomplete_expired: 'Incomplete - expired',
  open: 'Open',
  paid: 'Paid',
  past_due: 'Past due',
  paused: 'Paused',
  pending: 'Pending',
  processing: 'Processing',
  resolved: 'Resolved',
  succeeded: 'Succeeded',
  trialing: 'Trial',
  uncollectible: 'Payment failed',
  unpaid: 'Unpaid',
  void: 'Void',

  'agent.checkpoints': 'Agent checkpoints',
  'agent.requests': 'Agent requests',
  'ai.input_tokens': 'AI input tokens',
  'ai.inputtokens': 'AI input tokens',
  'ai.messages': 'AI messages',
  'ai.output_tokens': 'AI output tokens',
  'ai.outputtokens': 'AI output tokens',
  'ai.toolcalls': 'AI tool calls',
  'api.ratelimitperminute': 'API requests per minute',
  'compute.seconds': 'Compute time',
  'deployments.count': 'Deployments',
  'previews.public': 'Public previews',
  'project.count': 'Projects',
  'project.created': 'Projects created',
  'projects.count': 'Projects',
  'projects.created': 'Projects created',
  'snapshots.count': 'Snapshots',
  'snapshots.sizemb': 'Snapshot storage (MB)',
  'storage.bytes': 'Storage used',
  'storage.gb': 'Storage (GB)',
  'team.members': 'Team members',
  'terminals.concurrent': 'Concurrent terminals',
  'workspace.cpumillicores': 'Workspace CPU capacity',
  'workspace.minutes': 'Workspace minutes',
  'workspace.rammb': 'Workspace memory (MB)',
  'workspaces.active': 'Active workspaces',
  'workspaces.runtimeminutes': 'Workspace runtime (minutes)',
};

export const KNOWN_QUOTA_KEYS = [
  'projects.count',
  'workspaces.active',
  'workspaces.runtimeMinutes',
  'workspace.cpuMillicores',
  'workspace.ramMb',
  'storage.gb',
  'snapshots.count',
  'snapshots.sizeMb',
  'ai.messages',
  'ai.inputTokens',
  'ai.outputTokens',
  'ai.toolCalls',
  'deployments.count',
  'previews.public',
  'team.members',
  'terminals.concurrent',
  'api.rateLimitPerMinute',
] as const;

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Humanize an unexpected API identifier without ever echoing dotted, colon or
 * snake-case implementation syntax into the interface.
 */
export function humanizeTechnicalIdentifier(value: string, emptyLabel = 'Recorded activity'): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return emptyLabel;
  }

  const words = trimmed
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .split(/[.:_\s-]+/u)
    .filter(Boolean)
    .map((word) => word.toLowerCase());

  if (words.length === 0) {
    return emptyLabel;
  }

  return words
    .map((word, index) => {
      const acronym = ACRONYMS[word];

      if (acronym) {
        return acronym;
      }

      return index === 0 ? `${word[0].toUpperCase()}${word.slice(1)}` : word;
    })
    .join(' ');
}

export function userFacingLabel(value: string, emptyLabel?: string): string {
  return PRODUCT_LABELS[normalizeLookupKey(value)] ?? humanizeTechnicalIdentifier(value, emptyLabel);
}

export function quotaDisplayLabel(key: string): string {
  return userFacingLabel(key, 'Plan allowance');
}

export function statusDisplayLabel(status: string): string {
  return userFacingLabel(status, 'Status unavailable');
}
