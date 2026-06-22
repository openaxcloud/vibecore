/*
 * Doc-accuracy guard for services/preview-proxy/README.md.
 *
 * The README is an ops-critical document on the production preview data plane:
 * a stale README previously claimed the service "exposes only /health" and "does
 * not currently serve any production traffic", and framed WebSocket proxying as a
 * future contract — all false, masking both the live HMR gap and the open
 * cross-tenant hole. These pure checks assert the README states the truth, so a
 * regression to the stale wording fails a unit test instead of misleading an
 * operator.
 */

export interface ReadmeAccuracyIssue {
  kind: 'stale-claim' | 'missing-fact';
  message: string;
}

/* Phrases that were literally in the stale README and are now false. */
const STALE_CLAIMS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /exposes only `?\/health`?/i,
    message: 'README still claims the service "exposes only /health" — it is the production preview data plane.',
  },
  {
    pattern: /does not currently serve any production traffic/i,
    message:
      'README still claims the service "does not currently serve any production traffic" — it serves all *.preview.e-code.ai traffic.',
  },
  {
    pattern: /reserved for a future/i,
    message: 'README still describes the service as reserved for a future layer — it is already the live data plane.',
  },
];

/*
 * Facts the README MUST surface so the live limitations stay visible: the
 * host-based production routing, the WebSocket/HMR known gap, and the tenant
 * enforcement dark-launch / cross-tenant note.
 */
const REQUIRED_FACTS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /host-based routing/i,
    message: 'README must document host-based routing (the production preview data plane).',
  },
  {
    pattern: /known gap/i,
    message: 'README must call out KNOWN GAPs (WebSocket/HMR + tenant enforcement) rather than burying them.',
  },
  {
    pattern: /websocket[\s\S]{0,120}(not proxied|not yet|hmr)/i,
    message: 'README must mark WebSocket/HMR as a known gap, not a harmless future contract.',
  },
  {
    pattern: /PREVIEW_PROXY_ENFORCE_TENANT/,
    message: 'README must document the tenant-enforcement dark-launch flag PREVIEW_PROXY_ENFORCE_TENANT.',
  },
];

/* Returns every accuracy issue found in the given README text (empty = accurate). */
export function findReadmeAccuracyIssues(readme: string): ReadmeAccuracyIssue[] {
  const issues: ReadmeAccuracyIssue[] = [];

  for (const claim of STALE_CLAIMS) {
    if (claim.pattern.test(readme)) {
      issues.push({ kind: 'stale-claim', message: claim.message });
    }
  }

  for (const fact of REQUIRED_FACTS) {
    if (!fact.pattern.test(readme)) {
      issues.push({ kind: 'missing-fact', message: fact.message });
    }
  }

  return issues;
}

/* Convenience boolean wrapper. */
export function isReadmeAccurate(readme: string): boolean {
  return findReadmeAccuracyIssues(readme).length === 0;
}
