import { detectMobileLanguage, getMobileCopy, type MobileLanguage } from './i18n';

export interface BiometricChallenge {
  userId: string;
  username: string;
  challenge: Uint8Array;
}

export interface BiometricUnlockResult {
  ok: boolean;

  /** Stable machine code, never translated. Use message for display. */
  reason?: 'unsupported' | 'cancelled' | 'failed';
  message?: string;
}

export interface BiometricCapabilityHost {
  PublicKeyCredential?: unknown;
}

export function supportsPlatformBiometrics(win: BiometricCapabilityHost = window): boolean {
  return typeof win.PublicKeyCredential !== 'undefined';
}

function biometricFailure(
  reason: NonNullable<BiometricUnlockResult['reason']>,
  language: MobileLanguage,
): BiometricUnlockResult {
  const copy = getMobileCopy(language);

  const messages = {
    unsupported: copy.biometricUnsupported,
    cancelled: copy.biometricCancelled,
    failed: copy.biometricFailed,
  };

  return { ok: false, reason, message: messages[reason] };
}

export async function verifyBiometricUnlock(
  challenge: BiometricChallenge,
  language: MobileLanguage = detectMobileLanguage(),
): Promise<BiometricUnlockResult> {
  if (!supportsPlatformBiometrics()) {
    return biometricFailure('unsupported', language);
  }

  try {
    await navigator.credentials.get({
      publicKey: {
        challenge: challenge.challenge,
        timeout: 60_000,
        userVerification: 'required',
        allowCredentials: [],
      },
      mediation: 'optional',
    } as CredentialRequestOptions);

    return { ok: true };
  } catch (error) {
    return biometricFailure(
      error instanceof DOMException && error.name === 'NotAllowedError' ? 'cancelled' : 'failed',
      language,
    );
  }
}
