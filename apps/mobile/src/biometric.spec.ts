// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { verifyBiometricUnlock } from './biometric';
import { getMobileCopy } from './i18n';

const challenge = { userId: 'user-1', username: 'user', challenge: new Uint8Array([1, 2, 3]) };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.cookie = 'vibecore-lang=; Max-Age=0; Path=/';
  document.cookie = 'vibecore-auto-lang=; Max-Age=0; Path=/';
});

describe('biometric machine codes and localized messages', () => {
  it.each(['en', 'fr'] as const)(
    'preserves the unsupported code in %s without requesting credentials',
    async (language) => {
      const get = vi.fn();
      vi.stubGlobal('PublicKeyCredential', undefined);
      vi.stubGlobal('navigator', { credentials: { get } });
      expect(await verifyBiometricUnlock(challenge, language)).toEqual({
        ok: false,
        reason: 'unsupported',
        message: getMobileCopy(language).biometricUnsupported,
      });
      expect(get).not.toHaveBeenCalled();
    },
  );

  it.each(['en', 'fr'] as const)('preserves cancelled and failed codes in %s', async (language) => {
    vi.stubGlobal('PublicKeyCredential', class {});

    const get = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('dismissed', 'NotAllowedError'))
      .mockRejectedValueOnce(new Error('private diagnostic'));
    vi.stubGlobal('navigator', { credentials: { get } });
    expect(await verifyBiometricUnlock(challenge, language)).toEqual({
      ok: false,
      reason: 'cancelled',
      message: getMobileCopy(language).biometricCancelled,
    });
    expect(await verifyBiometricUnlock(challenge, language)).toEqual({
      ok: false,
      reason: 'failed',
      message: getMobileCopy(language).biometricFailed,
    });
  });

  it.each(['en', 'fr'] as const)(
    'keeps the successful result and WebAuthn options unchanged in %s',
    async (language) => {
      vi.stubGlobal('PublicKeyCredential', class {});

      const get = vi.fn().mockResolvedValue({ id: 'credential-1' });
      vi.stubGlobal('navigator', { credentials: { get } });
      expect(await verifyBiometricUnlock(challenge, language)).toEqual({ ok: true });
      expect(get).toHaveBeenCalledWith({
        publicKey: {
          challenge: challenge.challenge,
          timeout: 60_000,
          userVerification: 'required',
          allowCredentials: [],
        },
        mediation: 'optional',
      });
    },
  );

  it('uses the existing manual language selection when a caller omits the locale', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined);
    document.cookie = 'vibecore-lang=fr; Path=/';
    expect(await verifyBiometricUnlock(challenge)).toEqual({
      ok: false,
      reason: 'unsupported',
      message: 'Le déverrouillage biométrique n’est pas pris en charge sur cet appareil.',
    });
  });
});
