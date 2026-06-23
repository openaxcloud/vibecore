import { Preferences } from '@capacitor/preferences';

const sessionPrefix = 'vibecore.mobile.session.';

export interface SessionLockState {
  locked: boolean;
  biometricEnabled: boolean;
  lastUnlockedAt?: string;
  userHint?: string;
}

export class SecureSessionStore {
  async saveLockState(state: SessionLockState): Promise<void> {
    await Preferences.set({
      key: `${sessionPrefix}lock-state`,
      value: JSON.stringify({
        locked: state.locked,
        biometricEnabled: state.biometricEnabled,
        lastUnlockedAt: state.lastUnlockedAt,
        userHint: state.userHint,
      }),
    });
  }

  async loadLockState(): Promise<SessionLockState> {
    const { value } = await Preferences.get({ key: `${sessionPrefix}lock-state` });

    if (!value) {
      return { locked: false, biometricEnabled: false };
    }

    return parseSessionLockState(value);
  }

  async clear(): Promise<void> {
    await Preferences.remove({ key: `${sessionPrefix}lock-state` });
  }
}

export function parseSessionLockState(value: string): SessionLockState {
  let parsed: Partial<SessionLockState>;

  try {
    parsed = JSON.parse(value) as Partial<SessionLockState>;
  } catch {
    // Corrupt/truncated storage (interrupted write, OS migration, tampering).
    // Fall back to the safe locked-out default rather than crashing init.
    return { locked: false, biometricEnabled: false };
  }

  if (parsed === null || typeof parsed !== 'object') {
    return { locked: false, biometricEnabled: false };
  }

  return {
    locked: parsed.locked === true,
    biometricEnabled: parsed.biometricEnabled === true,
    lastUnlockedAt: typeof parsed.lastUnlockedAt === 'string' ? parsed.lastUnlockedAt : undefined,
    userHint: typeof parsed.userHint === 'string' ? parsed.userHint : undefined,
  };
}
