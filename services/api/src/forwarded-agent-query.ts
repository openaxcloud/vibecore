/**
 * Query params of the client's runtime socket that MUST reach the workspace
 * agent. Everything else (including `token`, re-minted per hop, and `managed`,
 * which only the API reads) is deliberately dropped — an allowlist keeps a
 * client from injecting arbitrary params into the internal agent URL.
 *
 * Why this matters: the agent keys terminal sessions by `sessionId`
 * (`terminal-session.ts` `getOrCreate`). When the param never arrives it
 * generates a fresh id on every connection, so a reconnect NEVER reattaches —
 * it spawns a brand-new shell, loses the scrollback, and burns a slot of the
 * per-workspace `maxSessions` budget (8). Observed live: 21 orphan `bash -i`
 * and a permanent 429 storm within minutes of opening one terminal. `cols`/`rows`
 * matter for the same reason at a smaller scale: without them the PTY is stuck
 * at the 80x24 default no matter how the pane is sized.
 */
const AGENT_FORWARDED_QUERY_KEYS = ['sessionId', 'cols', 'rows'] as const;

export function forwardedAgentQuery(clientQuery: unknown): string {
  if (!clientQuery || typeof clientQuery !== 'object') {
    return '';
  }

  const source = clientQuery as Record<string, unknown>;
  const params = new URLSearchParams();

  for (const key of AGENT_FORWARDED_QUERY_KEYS) {
    const value = source[key];

    if (value === undefined || value === null) {
      continue;
    }

    const text = String(Array.isArray(value) ? value[0] : value);

    if (text) {
      params.set(key, text);
    }
  }

  const serialized = params.toString();

  return serialized ? `&${serialized}` : '';
}
