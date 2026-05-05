export interface BiometricChallenge {
  userId: string;
  username: string;
  challenge: Uint8Array;
}

export interface BiometricUnlockResult {
  ok: boolean;
  reason?: 'unsupported' | 'cancelled' | 'failed';
}

export interface BiometricCapabilityHost {
  PublicKeyCredential?: unknown;
}

export function supportsPlatformBiometrics(win: BiometricCapabilityHost = window): boolean {
  return typeof win.PublicKeyCredential !== 'undefined';
}

export async function verifyBiometricUnlock(challenge: BiometricChallenge): Promise<BiometricUnlockResult> {
  if (!supportsPlatformBiometrics()) {
    return { ok: false, reason: 'unsupported' };
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
    return { ok: false, reason: error instanceof DOMException && error.name === 'NotAllowedError' ? 'cancelled' : 'failed' };
  }
}
