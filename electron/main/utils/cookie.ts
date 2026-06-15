import { safeStorage, session } from 'electron';
import { DEFAULT_PORT } from './constants';
import { store } from './store';

/**
 * On app startup: read any existing cookies from store and set it as a cookie.
 */
export async function initCookies() {
  await loadStoredCookies();
}

/*
 * Session cookies authorize the user's account, so they must not sit on disk
 * protected only by electron-store's hardcoded (obfuscation-only) encryptionKey.
 * Wrap each persisted cookie with the OS keychain via safeStorage - the same
 * protection the bearer token already gets in desktop/auth.ts. When safeStorage
 * is unavailable we fall back to the (obfuscated) plain object so behaviour is
 * unchanged on those platforms, and reads transparently handle both shapes
 * (incl. legacy bare-cookie rows written before this change).
 */
type StoredBrowserCookie = Electron.Cookie & { url?: string };
type StoredCookie = { encrypted: true; value: string } | { encrypted: false; cookie: StoredBrowserCookie };

function encodeCookie(cookie: StoredBrowserCookie): StoredCookie {
  if (safeStorage.isEncryptionAvailable()) {
    return { encrypted: true, value: safeStorage.encryptString(JSON.stringify(cookie)).toString('base64') };
  }

  return { encrypted: false, cookie };
}

function decodeCookie(stored: unknown): StoredBrowserCookie | undefined {
  if (!stored || typeof stored !== 'object') {
    return undefined;
  }

  const record = stored as Partial<StoredCookie> & { name?: string };

  if (record.encrypted === true && typeof record.value === 'string') {
    if (!safeStorage.isEncryptionAvailable()) {
      return undefined;
    }

    try {
      return JSON.parse(safeStorage.decryptString(Buffer.from(record.value, 'base64'))) as StoredBrowserCookie;
    } catch {
      return undefined;
    }
  }

  if (record.encrypted === false && record.cookie) {
    return record.cookie;
  }

  // Legacy rows persisted as the bare cookie object (pre-safeStorage).
  return record.name ? (stored as StoredBrowserCookie) : undefined;
}

// Function to store all cookies
export async function storeCookies(cookies: Electron.Cookie[]) {
  for (const cookie of cookies) {
    store.set(`cookie:${cookie.name}`, encodeCookie(cookie));
  }
}

// Function to load stored cookies
async function loadStoredCookies() {
  // Get all keys that start with 'cookie:'
  const cookieKeys = store.store ? Object.keys(store.store).filter((key) => key.startsWith('cookie:')) : [];

  for (const key of cookieKeys) {
    const cookie = decodeCookie(store.get(key));

    if (cookie) {
      try {
        /*
         * Add default URL if not present. Electron.Cookie carries no `url`
         * (it's a set-time field), so read it defensively off the stored shape.
         */
        const cookieWithUrl = {
          ...cookie,
          url: (cookie as { url?: string }).url || `http://localhost:${DEFAULT_PORT}`,
        };
        await session.defaultSession.cookies.set(cookieWithUrl);
      } catch (error) {
        console.error(`Failed to set cookie ${key}:`, error);
      }
    }
  }
}
