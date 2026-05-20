import type {
  ConnectionRequestMessage,
  ConnectionRequestScopeDescription,
  ConnectorDataPart,
  ExistingAccountConnection,
} from '~/lib/chat/connector-messages';

/*
 * Helpers used by the e-code agent orchestration to surface connector
 * requirements to the chat UI. Three responsibilities:
 *
 *   1. Detect which connectors the user's prompt or generated code is
 *      asking for (keyword + import-statement based for Phase 1; the
 *      Phase 3 IDE Integrations panel will hydrate the catalog at run
 *      time so this lookup stays in sync with ConnectorCatalog).
 *   2. Build a system prompt fragment that lists the project's linked
 *      connections + the user's account-level connections that have
 *      not yet been linked, so the model knows what is available
 *      before deciding whether to emit a connection_request.
 *   3. Construct ConnectorDataPart values the chat route can stream
 *      back to the browser as Vercel AI SDK data parts. The UI
 *      renderer in app/components/chat/ then turns those into
 *      inline cards.
 *
 * Distinct from the runtime tool invocation: the proxy in
 * services/connector-proxy/ is what actually calls the provider once
 * the connection is in place. This module is only about telling the
 * chat UI when a connection is missing.
 */

export interface ConnectorKeywordEntry {
  provider: string;
  displayName: string;
  logoUrl: string;
  defaultScopes: ConnectionRequestScopeDescription[];

  /*
   * Lowercased keywords matched against the user prompt and against
   * recently-generated code. The match is whole-word for prose and
   * substring for code so that `from "@octokit/rest"` triggers github.
   */
  keywords: string[];
  codePatterns?: string[];
}

export const DEFAULT_CONNECTOR_KEYWORD_CATALOG: ConnectorKeywordEntry[] = [
  {
    provider: 'github',
    displayName: 'GitHub',
    logoUrl: '/integrations/logos/github.svg',
    defaultScopes: [
      { scope: 'repo', label: 'Repositories', description: 'Read and write to your repositories.' },
      { scope: 'read:org', label: 'Organizations', description: 'Read the organizations you belong to.' },
      { scope: 'read:user', label: 'Profile', description: 'Read your public profile.' },
      { scope: 'user:email', label: 'Email', description: 'Read your primary email address.' },
    ],
    keywords: ['github', 'pull request', 'repo', 'repository', 'issue', 'octocat'],
    codePatterns: ['@octokit', 'api.github.com', 'github.com/api'],
  },
];

export interface DetectedConnector {
  provider: string;
  matchedFrom: 'prompt' | 'code' | 'both';
  matchedTokens: string[];
}

export interface DetectionInput {
  prompt?: string;
  recentCode?: string;
  catalog?: ConnectorKeywordEntry[];
}

export function detectConnectorNeeds(input: DetectionInput): DetectedConnector[] {
  const catalog = input.catalog ?? DEFAULT_CONNECTOR_KEYWORD_CATALOG;
  const lowerPrompt = (input.prompt ?? '').toLowerCase();
  const code = input.recentCode ?? '';
  const detected: DetectedConnector[] = [];

  for (const entry of catalog) {
    const matchedKeywords = entry.keywords.filter((keyword) => {
      const wordRegex = new RegExp(`\\b${escapeRegex(keyword.toLowerCase())}\\b`);

      return wordRegex.test(lowerPrompt);
    });

    const matchedPatterns = (entry.codePatterns ?? []).filter((pattern) => code.includes(pattern));

    if (matchedKeywords.length === 0 && matchedPatterns.length === 0) {
      continue;
    }

    let matchedFrom: DetectedConnector['matchedFrom'];

    if (matchedKeywords.length > 0 && matchedPatterns.length > 0) {
      matchedFrom = 'both';
    } else if (matchedKeywords.length > 0) {
      matchedFrom = 'prompt';
    } else {
      matchedFrom = 'code';
    }

    detected.push({
      provider: entry.provider,
      matchedFrom,
      matchedTokens: [...matchedKeywords, ...matchedPatterns],
    });
  }

  return detected;
}

export interface ConnectorContextEntry {
  provider: string;
  displayName: string;
  linkedToProject: boolean;
  accountConnectionId?: string;
  externalAccountLabel?: string;
  scopes: string[];
}

export interface ConnectorContextInput {
  linkedToProject: ConnectorContextEntry[];
  availableOnAccount: ConnectorContextEntry[];
  notConnected: ConnectorContextEntry[];
}

export function buildConnectorContextPrompt(input: ConnectorContextInput): string {
  const lines: string[] = [];
  lines.push('## Available connectors');

  if (input.linkedToProject.length > 0) {
    lines.push('Linked to this project:');

    for (const entry of input.linkedToProject) {
      lines.push(
        `- ${entry.displayName} (${entry.provider}) — connected as ${entry.externalAccountLabel ?? 'unknown'}; scopes: ${entry.scopes.join(', ') || 'none'}.`,
      );
    }
  }

  if (input.availableOnAccount.length > 0) {
    lines.push('Connected on the user account but not linked to this project:');

    for (const entry of input.availableOnAccount) {
      lines.push(
        `- ${entry.displayName} (${entry.provider}) — connected as ${entry.externalAccountLabel ?? 'unknown'}. Emit a connection_request with the existing accountConnectionId ${entry.accountConnectionId ?? '<id>'} to reuse it.`,
      );
    }
  }

  if (input.notConnected.length > 0) {
    lines.push('Not connected yet:');

    for (const entry of input.notConnected) {
      lines.push(`- ${entry.displayName} (${entry.provider}) — emit a connection_request to start the OAuth flow.`);
    }
  }

  lines.push('');
  lines.push(
    'When a connector is required to fulfil the task, emit a `connection_request` data part (kind: "connection_request") and wait for `connection_resolved` before continuing. Never reference raw tokens; the @e-code/sdk client and the connector-proxy sidecar handle authorization.',
  );

  return lines.join('\n');
}

export interface ConnectionRequestInput {
  messageId: string;
  provider: string;
  reason: string;
  resumeToken: string;
  scopes?: ConnectionRequestScopeDescription[];
  existingAccountConnections?: ExistingAccountConnection[];
  catalog?: ConnectorKeywordEntry[];
}

export function createConnectionRequestDataPart(input: ConnectionRequestInput): ConnectorDataPart {
  const catalog = input.catalog ?? DEFAULT_CONNECTOR_KEYWORD_CATALOG;
  const entry = catalog.find((row) => row.provider === input.provider);

  if (!entry) {
    throw new Error(`Unknown provider '${input.provider}' — add it to the keyword catalog or provide a custom one.`);
  }

  const payload: ConnectionRequestMessage = {
    kind: 'connection_request',
    messageId: input.messageId,
    provider: entry.provider,
    providerDisplayName: entry.displayName,
    providerLogoUrl: entry.logoUrl,
    scopes: input.scopes ?? entry.defaultScopes,
    reason: input.reason,
    resumeToken: input.resumeToken,
    existingAccountConnections: input.existingAccountConnections,
  };

  return { type: 'connector', payload };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/*
 * Re-export so callers in app/lib/.server/llm/ do not have to reach
 * across two import roots.
 */
export type { ConnectorDataPart };
