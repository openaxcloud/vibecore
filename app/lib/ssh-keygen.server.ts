/**
 * Server-side SSH key-pair generation (Replit "generate key" parity).
 *
 * Uses only `node:crypto` — no external SSH library. Produces an OpenSSH
 * `authorized_keys`-style public key line + a SHA256 fingerprint for display,
 * and a private key in a format the stock `ssh` client reads directly:
 *   - ed25519 → the native `openssh-key-v1` private-key container (unencrypted)
 *   - rsa     → a classic PKCS#1 `RSA PRIVATE KEY` PEM
 *
 * The private key is meant to be stored encrypted (project secret) and never
 * returned again; only the public key + fingerprint are surfaced to the UI.
 */
import { createHash, generateKeyPairSync, randomBytes, type KeyObject } from 'node:crypto';

export type SshKeyType = 'ed25519' | 'rsa';

export interface GeneratedSshKeyPair {
  type: SshKeyType;

  /** OpenSSH public key line, e.g. `ssh-ed25519 AAAA... comment`. */
  publicKey: string;

  /** Private key (PEM/OpenSSH container) — store encrypted, never display. */
  privateKey: string;

  /** `SHA256:...` fingerprint of the public key (matches `ssh-keygen -lf`). */
  fingerprint: string;
}

/** SSH wire `string`: 4-byte big-endian length prefix + bytes. */
function sshString(data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  return Buffer.concat([length, data]);
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);

  return buffer;
}

/** SSH `mpint`: big-endian, minimal, with a leading 0x00 when the top bit is set. */
function sshMpint(bytes: Buffer): Buffer {
  let start = 0;

  while (start < bytes.length - 1 && bytes[start] === 0) {
    start += 1;
  }

  let value = bytes.subarray(start);

  if (value.length > 0 && (value[0] & 0x80) !== 0) {
    value = Buffer.concat([Buffer.from([0]), value]);
  }

  return sshString(value);
}

function jwkBuffer(value: string | undefined): Buffer {
  return Buffer.from(value ?? '', 'base64url');
}

function fingerprintOf(publicBlob: Buffer): string {
  return `SHA256:${createHash('sha256').update(publicBlob).digest('base64').replace(/=+$/, '')}`;
}

function publicKeyLine(algorithm: string, publicBlob: Buffer, comment: string): string {
  const line = `${algorithm} ${publicBlob.toString('base64')}`;

  return comment ? `${line} ${comment}` : line;
}

/** Build the ed25519 OpenSSH public-key wire blob: string(alg) + string(pub32). */
function ed25519PublicBlob(pub: Buffer): Buffer {
  return Buffer.concat([sshString(Buffer.from('ssh-ed25519')), sshString(pub)]);
}

/** Wrap raw bytes as a PEM block with 70-char base64 lines. */
function pem(label: string, body: Buffer): string {
  const base64 = body.toString('base64').replace(/(.{70})/g, '$1\n');

  return `-----BEGIN ${label}-----\n${base64}${base64.endsWith('\n') ? '' : '\n'}-----END ${label}-----\n`;
}

/**
 * Encode an unencrypted ed25519 private key in the `openssh-key-v1` container
 * so the stock `ssh -i` client accepts it without conversion.
 */
function ed25519OpenSshPrivateKey(seed: Buffer, pub: Buffer, comment: string): string {
  const publicBlob = ed25519PublicBlob(pub);
  const check = randomBytes(4);

  let privateSection = Buffer.concat([
    check,
    check,
    sshString(Buffer.from('ssh-ed25519')),
    sshString(pub),
    sshString(Buffer.concat([seed, pub])),
    sshString(Buffer.from(comment)),
  ]);

  // Pad to the "none" cipher block size (8) with the 1,2,3… sequence.
  for (let pad = 1; privateSection.length % 8 !== 0; pad += 1) {
    privateSection = Buffer.concat([privateSection, Buffer.from([pad])]);
  }

  const container = Buffer.concat([
    Buffer.from('openssh-key-v1\0', 'binary'),
    sshString(Buffer.from('none')), // ciphername
    sshString(Buffer.from('none')), // kdfname
    sshString(Buffer.alloc(0)), // kdfoptions
    uint32(1), // number of keys
    sshString(publicBlob),
    sshString(privateSection),
  ]);

  return pem('OPENSSH PRIVATE KEY', container);
}

function generateEd25519(comment: string): GeneratedSshKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const jwk = (privateKey as KeyObject).export({ format: 'jwk' }) as { d?: string; x?: string };
  const seed = jwkBuffer(jwk.d);
  const pub = jwkBuffer(jwk.x);
  const publicBlob = ed25519PublicBlob(pub);

  void publicKey;

  return {
    type: 'ed25519',
    publicKey: publicKeyLine('ssh-ed25519', publicBlob, comment),
    privateKey: ed25519OpenSshPrivateKey(seed, pub, comment),
    fingerprint: fingerprintOf(publicBlob),
  };
}

function generateRsa(comment: string, modulusLength: number): GeneratedSshKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength });
  const jwk = (publicKey as KeyObject).export({ format: 'jwk' }) as { n?: string; e?: string };

  const publicBlob = Buffer.concat([
    sshString(Buffer.from('ssh-rsa')),
    sshMpint(jwkBuffer(jwk.e)),
    sshMpint(jwkBuffer(jwk.n)),
  ]);

  return {
    type: 'rsa',
    publicKey: publicKeyLine('ssh-rsa', publicBlob, comment),
    privateKey: (privateKey as KeyObject).export({ format: 'pem', type: 'pkcs1' }).toString(),
    fingerprint: fingerprintOf(publicBlob),
  };
}

/**
 * Generate an SSH key pair. Defaults to ed25519 (modern, small). RSA uses a
 * 3072-bit modulus. `comment` is appended to the public key line (e.g. an
 * email or `user@host`); it is sanitized of whitespace/control characters.
 */
export function generateSshKeyPair(
  options: { type?: SshKeyType; comment?: string; rsaModulusLength?: number } = {},
): GeneratedSshKeyPair {
  const type: SshKeyType = options.type === 'rsa' ? 'rsa' : 'ed25519';

  const comment = (options.comment ?? '')

    // strip control chars, then collapse any whitespace run to a single space

    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

  return type === 'rsa' ? generateRsa(comment, options.rsaModulusLength ?? 3072) : generateEd25519(comment);
}
