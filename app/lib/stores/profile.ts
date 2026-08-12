import { atom } from 'nanostores';

interface Profile {
  username: string;
  bio: string;
  avatar: string;
}

const defaultProfile: Profile = {
  username: '',
  bio: '',
  avatar: '',
};

/*
 * BD-06: the profile is the real account, not a localStorage blob. `username`
 * maps to the account name and `bio`/`avatar` to server-side user preferences,
 * proxied through `/api/account/profile`. The store hydrates from the server on
 * load and every edit is persisted back, so the profile follows the user across
 * devices instead of masquerading as account state in one browser.
 */
export const profileStore = atom<Profile>(defaultProfile);

let hydrated = false;

/**
 * Load the profile from the account (name + preferences.profile). Idempotent and
 * client-only; a 401 (self-host / no backend account) leaves the defaults in
 * place. Safe to call from multiple mount points (AppShell, ProfileTab).
 */
export async function hydrateProfileFromServer(): Promise<void> {
  if (typeof window === 'undefined' || hydrated) {
    return;
  }

  hydrated = true;

  try {
    const response = await fetch('/api/account/profile', {
      headers: { accept: 'application/json' },
      credentials: 'include',
    });

    if (!response.ok) {
      // 401 = no backend account (self-host); keep defaults, allow retry later.
      hydrated = false;
      return;
    }

    const data = (await response.json()) as Partial<Profile>;
    profileStore.set({
      username: typeof data.username === 'string' ? data.username : '',
      bio: typeof data.bio === 'string' ? data.bio : '',
      avatar: typeof data.avatar === 'string' ? data.avatar : '',
    });
  } catch {
    // Network hiccup: keep defaults and allow a later retry.
    hydrated = false;
  }
}

let persistTimer: ReturnType<typeof setTimeout> | undefined;

/*
 * Debounced write-back of the FULL profile. The API replaces `preferences.profile`
 * wholesale, so bio + avatar are always sent together; `username` is sent too and
 * the proxy ignores an empty value so it can never blank the account name.
 */
function schedulePersist() {
  if (typeof window === 'undefined') {
    return;
  }

  if (persistTimer) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    const profile = profileStore.get();
    void fetch('/api/account/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: profile.username, bio: profile.bio, avatar: profile.avatar }),
    }).catch(() => {
      // Best-effort; the optimistic store value stays and the next edit retries.
    });
  }, 600);
}

export const updateProfile = (updates: Partial<Profile>) => {
  profileStore.set({ ...profileStore.get(), ...updates });
  schedulePersist();
};
