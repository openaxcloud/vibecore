import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ciphertextKeyId, decryptJson, encryptJson, reencryptJson } from './index.js';

/*
 * AUDX-010 — the encrypted corpus must carry the identity of the key that
 * sealed it, otherwise rotating CONFIG_ENCRYPTION_KEY makes every existing
 * ciphertext undecryptable and rotation is impossible without a flag day.
 *
 * Every test here fails on the pre-fix code: `decryptJson` resolved exactly one
 * secret (`CONFIG_ENCRYPTION_KEY`), so a payload sealed under the previous key
 * threw `Unsupported state or unable to authenticate data` the moment the env
 * var changed.
 */

const ENV_KEYS = ['CONFIG_ENCRYPTION_KEY', 'CONFIG_ENCRYPTION_KEYS', 'CONFIG_ENCRYPTION_PRIMARY_KEY_ID', 'NODE_ENV'];
const ORIGINAL: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    ORIGINAL[key] = process.env[key];
    delete (process.env as Record<string, string | undefined>)[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (ORIGINAL[key] === undefined) {
      delete (process.env as Record<string, string | undefined>)[key];
    } else {
      process.env[key] = ORIGINAL[key];
    }
  }
});

describe('AUDX-010 versioned encryption and key rotation', () => {
  it('decrypts a ciphertext sealed under a retired key after the primary key rotated', () => {
    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({ k1: 'secret-one' });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'k1';

    const sealed = encryptJson({ value: 'pat-github-abc' });

    expect(ciphertextKeyId(sealed)).toBe('k1');

    // Rotation: k2 becomes primary, k1 is retained for decryption only.
    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({ k1: 'secret-one', k2: 'secret-two' });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'k2';

    expect(decryptJson<{ value: string }>(sealed).value).toBe('pat-github-abc');

    const fresh = encryptJson({ value: 'pat-github-abc' });
    expect(ciphertextKeyId(fresh)).toBe('k2');
  });

  it('re-encrypts a retired-key payload onto the primary key without changing the plaintext', () => {
    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({ k1: 'secret-one' });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'k1';

    const sealed = encryptJson({ value: 'stripe-sk-live' });

    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({ k1: 'secret-one', k2: 'secret-two' });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'k2';

    const rotated = reencryptJson(sealed);

    expect(ciphertextKeyId(rotated)).toBe('k2');
    expect(decryptJson<{ value: string }>(rotated).value).toBe('stripe-sk-live');

    // Idempotent: re-encrypting an already-primary payload is a no-op on identity.
    expect(ciphertextKeyId(reencryptJson(rotated))).toBe('k2');
  });

  it('still decrypts the legacy v1 corpus written before any keyring existed', () => {
    // A v1 payload is what production holds today; it must survive the upgrade.
    process.env.CONFIG_ENCRYPTION_KEY = 'legacy-secret';

    const legacy = encryptJson({ value: 'legacy-token' });

    expect(legacy.startsWith('v1.')).toBe(true);
    expect(ciphertextKeyId(legacy)).toBeUndefined();

    // Keyring introduced afterwards, legacy secret retained as a named key.
    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({ k1: 'brand-new-secret' });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'k1';

    expect(decryptJson<{ value: string }>(legacy).value).toBe('legacy-token');
    expect(ciphertextKeyId(reencryptJson(legacy))).toBe('k1');
  });

  it('refuses a ciphertext whose keyId is not in the keyring instead of failing open', () => {
    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({ k1: 'secret-one' });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'k1';

    const sealed = encryptJson({ value: 'x' });

    // k1 removed from the keyring: the payload must fail loudly and name the key.
    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({ k2: 'secret-two' });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'k2';

    expect(() => decryptJson(sealed)).toThrowError(/k1/);
  });

  it('binds the keyId into the AEAD so a relabelled ciphertext cannot be decrypted', () => {
    process.env.CONFIG_ENCRYPTION_KEYS = JSON.stringify({ k1: 'shared-secret', k2: 'shared-secret' });
    process.env.CONFIG_ENCRYPTION_PRIMARY_KEY_ID = 'k1';

    const sealed = encryptJson({ value: 'bound' });
    const relabelled = sealed.replace(/^v2\.k1\./, 'v2.k2.');

    // Same underlying secret, different label: the tag must not verify.
    expect(() => decryptJson(relabelled)).toThrowError();
  });
});
