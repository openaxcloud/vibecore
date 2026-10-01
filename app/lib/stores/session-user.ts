import { atom } from 'nanostores';

/**
 * UIB-03 — l'utilisateur AUTHENTIFIÉ, pour l'afficher dans la coque de la zone
 * utilisateur.
 *
 * Mesuré le 2026-09-30 : après une inscription, la barre latérale affichait
 * « Utilisateur connecté » au lieu du nom saisi. Elle lisait `profileStore`, le
 * profil LOCAL hérité de bolt.diy (vide pour un compte neuf), alors que
 * `/api/auth/user` rendait bien `displayName`.
 *
 * En mémoire seulement, jamais dans `localStorage` : un nom persisté survivrait
 * à une déconnexion et s'afficherait pour le compte suivant sur le même poste.
 */
export interface SessionUser {
  displayName: string | null;
  name: string | null;
  email: string | null;
}

export const sessionUserStore = atom<SessionUser | null>(null);

let pending: Promise<void> | null = null;

export function loadSessionUser(fetcher: typeof fetch = fetch): Promise<void> {
  if (sessionUserStore.get() || pending) {
    return pending ?? Promise.resolve();
  }

  pending = fetcher('/api/auth/user', { credentials: 'include', headers: { accept: 'application/json' } })
    .then(async (response) => {
      if (!response.ok) {
        return;
      }

      const body = (await response.json()) as Partial<SessionUser> | null;

      if (body && (body.displayName || body.name || body.email)) {
        sessionUserStore.set({
          displayName: body.displayName ?? null,
          name: body.name ?? null,
          email: body.email ?? null,
        });
      }
    })
    .catch(() => undefined)
    .finally(() => {
      pending = null;
    });

  return pending;
}

/** Nom à afficher : le compte authentifié d'abord, puis le profil local, puis le libellé générique. */
export function sessionDisplayName(
  sessionUser: SessionUser | null,
  localUsername: string | undefined,
  fallback: string,
): string {
  return (
    sessionUser?.displayName?.trim() ||
    sessionUser?.name?.trim() ||
    localUsername?.trim() ||
    sessionUser?.email?.trim() ||
    fallback
  );
}
