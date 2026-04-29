import { app, ipcMain, safeStorage } from 'electron';
import { store } from '../utils/store';

const TOKEN_KEY = 'desktop.authToken';
const USER_KEY = 'desktop.user';

export interface DesktopLoginRequest {
  token: string;
  user?: {
    id?: string;
    email?: string;
    organizationId?: string;
  };
}

function encodeToken(token: string) {
  const value = Buffer.from(token, 'utf8');

  if (safeStorage.isEncryptionAvailable()) {
    return { encrypted: true, value: safeStorage.encryptString(token).toString('base64') };
  }

  return { encrypted: false, value: value.toString('base64') };
}

function decodeToken(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const token = payload as { encrypted?: boolean; value?: string };

  if (!token.value) {
    return undefined;
  }

  const bytes = Buffer.from(token.value, 'base64');

  if (token.encrypted && safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(bytes);
  }

  return bytes.toString('utf8');
}

export function getDesktopAuthToken() {
  return decodeToken(store.get(TOKEN_KEY));
}

export function setupDesktopAuthIpc() {
  ipcMain.handle('desktop:auth:get', () => ({
    token: getDesktopAuthToken(),
    user: store.get(USER_KEY),
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
  }));

  ipcMain.handle('desktop:auth:set', (_event, request: DesktopLoginRequest) => {
    if (!request?.token || typeof request.token !== 'string') {
      throw new Error('A token is required');
    }

    store.set(TOKEN_KEY, encodeToken(request.token));
    store.set(USER_KEY, request.user ?? null);

    return { ok: true, encryptionAvailable: safeStorage.isEncryptionAvailable() };
  });

  ipcMain.handle('desktop:auth:clear', () => {
    store.delete(TOKEN_KEY);
    store.delete(USER_KEY);

    return { ok: true };
  });

  app.on('before-quit', () => {
    store.set('desktop.lastAuthCheckAt', new Date().toISOString());
  });
}
