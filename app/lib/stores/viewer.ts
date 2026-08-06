import { atom } from 'nanostores';
import type { ViewerIdentity } from '~/lib/account-identity';

/**
 * BUG-USR-001 — the authenticated viewer's identity, loaded once from the same
 * `/api/me` proxy the account settings page uses, so the user-area shell can show
 * WHO is signed in (instead of the legacy localStorage profile, which is empty for
 * virtually every real user). Null until the first successful load; a failed load
 * leaves it null and the shell keeps the safe placeholder.
 */
export const viewerStore = atom<ViewerIdentity | null>(null);

let inflight: Promise<void> | null = null;

export async function loadViewer(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  // Already resolved or a load is in flight — the identity does not change per navigation.
  if (viewerStore.get() || inflight) {
    await inflight;
    return;
  }

  inflight = (async () => {
    try {
      const response = await fetch('/api/me', {
        headers: { accept: 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as ViewerIdentity | null;

      if (payload && typeof payload === 'object') {
        viewerStore.set({
          displayName: payload.displayName ?? null,
          name: payload.name ?? null,
          email: payload.email ?? null,
          username: payload.username ?? null,
        });
      }
    } catch {
      // Network/parse failure must never break the shell — keep the placeholder.
    } finally {
      inflight = null;
    }
  })();

  await inflight;
}
