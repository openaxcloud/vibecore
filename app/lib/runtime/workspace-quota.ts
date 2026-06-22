import { RuntimeError } from '@vibecore/runtime-contract';

export interface WorkspaceQuotaPrompt {
  warning: string;
  upgrade: string;
}

/*
 * Human-readable label for the quota keys a workspace start can trip. The
 * billing chokepoint (`assertQuota`) tags the thrown error with a `quotaKey`
 * such as `workspaces.active` or `terminals.concurrent`; surfacing the specific
 * limit tells the user what to free up rather than a generic "quota exceeded".
 */
const QUOTA_KEY_LABELS: Record<string, string> = {
  'workspaces.active': 'active workspace',
  'terminals.concurrent': 'concurrent terminal',
};

/*
 * The remote runtime adapter wraps a non-2xx response in a RuntimeError whose
 * `details` carries the raw response body. Quota rejections flow through the
 * billing `assertQuota` chokepoint, which always answers HTTP 429 with a
 * `code: 'QUOTA_EXCEEDED'` JSON body. The IDE historically only branched on 402
 * (payment-required), so a real 429 quota ceiling produced a bare
 * "Remote runtime request failed: 429" with no upgrade path. Treat 402, 429, or
 * an explicit QUOTA_EXCEEDED code as a quota signal — mirroring projects.new.tsx,
 * which already checks both 402 and 429 for the project-count quota.
 */
export function isWorkspaceQuotaError(error: unknown): boolean {
  if (!(error instanceof RuntimeError)) {
    return false;
  }

  if (error.status === 402 || error.status === 429) {
    return true;
  }

  if (error.code === 'QUOTA_EXCEEDED') {
    return true;
  }

  return extractQuotaKey(error.details) !== undefined;
}

/*
 * Build the quota warning + upgrade copy for a workspace-start failure. Returns
 * `undefined` when the error is not a quota error so callers can fall through to
 * their generic error handling.
 */
export function workspaceQuotaPrompt(error: unknown): WorkspaceQuotaPrompt | undefined {
  if (!isWorkspaceQuotaError(error)) {
    return undefined;
  }

  const quotaKey = error instanceof RuntimeError ? extractQuotaKey(error.details) : undefined;
  const label = quotaKey ? QUOTA_KEY_LABELS[quotaKey] : undefined;

  if (label) {
    return {
      warning: `You have reached your ${label} limit.`,
      upgrade: `Upgrade your plan to start more ${label}s.`,
    };
  }

  return {
    warning: 'Workspace quota exceeded',
    upgrade: 'Upgrade your plan to start more workspaces.',
  };
}

/*
 * The runtime adapter stores the upstream response body as an opaque string in
 * `details`. Parse it defensively to recover the `quotaKey` the billing layer
 * attached, so we can name the exact limit that was hit.
 */
function extractQuotaKey(details: unknown): string | undefined {
  if (typeof details !== 'string' || details.length === 0) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(details) as { quotaKey?: unknown };

    if (typeof parsed.quotaKey === 'string' && parsed.quotaKey.length > 0) {
      return parsed.quotaKey;
    }
  } catch {
    return undefined;
  }

  return undefined;
}
