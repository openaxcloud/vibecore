import { RuntimeError } from '@vibecore/runtime-contract';
import { clientStoresServicesText, type ClientStoresServicesKey } from '~/lib/i18n/catalogs/client-stores-services';

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
const QUOTA_PROMPT_KEYS: Readonly<
  Record<string, Readonly<{ warning: ClientStoresServicesKey; upgrade: ClientStoresServicesKey }>>
> = {
  'workspaces.active': {
    warning: 'clientRuntime.workspace.quota.activeWorkspaces.warning',
    upgrade: 'clientRuntime.workspace.quota.activeWorkspaces.upgrade',
  },
  'terminals.concurrent': {
    warning: 'clientRuntime.workspace.quota.concurrentTerminals.warning',
    upgrade: 'clientRuntime.workspace.quota.concurrentTerminals.upgrade',
  },
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
export function workspaceQuotaPrompt(error: unknown, language?: string | null): WorkspaceQuotaPrompt | undefined {
  if (!isWorkspaceQuotaError(error)) {
    return undefined;
  }

  const quotaKey = error instanceof RuntimeError ? extractQuotaKey(error.details) : undefined;
  const promptKeys = quotaKey ? QUOTA_PROMPT_KEYS[quotaKey] : undefined;

  if (promptKeys) {
    return {
      warning: clientStoresServicesText(promptKeys.warning, {}, language),
      upgrade: clientStoresServicesText(promptKeys.upgrade, {}, language),
    };
  }

  return {
    warning: clientStoresServicesText('clientRuntime.workspace.quota.generic.warning', {}, language),
    upgrade: clientStoresServicesText('clientRuntime.workspace.quota.generic.upgrade', {}, language),
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
