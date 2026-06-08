import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string | null;
  emailVerifiedAt?: string | null;
  mfaEnabled?: boolean;
  platformAdmin?: boolean;
}

export interface AuthenticatedSession {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function createOpaqueToken(prefix = 'vc') {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function createTotpSecret(bytes = 20) {
  const input = randomBytes(bytes);
  let bits = '';
  let output = '';

  for (const byte of input) {
    bits += byte.toString(2).padStart(8, '0');
  }

  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, '0');
    output += base32Alphabet[Number.parseInt(chunk, 2)];
  }

  return output;
}

function decodeBase32(secret: string) {
  const normalized = secret.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = '';
  const bytes: number[] = [];

  for (const char of normalized) {
    const value = base32Alphabet.indexOf(char);

    if (value === -1) {
      throw new Error('Invalid base32 secret');
    }

    bits += value.toString(2).padStart(5, '0');
  }

  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }

  return Buffer.from(bytes);
}

export function createTotpCode(secret: string, timeStep = Math.floor(Date.now() / 30_000)) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(timeStep));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTotpCode(secret: string, code: string, window = 1) {
  const normalized = code.replace(/\D+/g, '');

  if (normalized.length !== 6) {
    return false;
  }

  const currentStep = Math.floor(Date.now() / 30_000);
  const provided = Buffer.from(normalized);

  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = Buffer.from(createTotpCode(secret, currentStep + offset));

    if (candidate.length === provided.length && timingSafeEqual(candidate, provided)) {
      return true;
    }
  }

  return false;
}

export function createTotpUri(input: { issuer: string; accountName: string; secret: string }) {
  const label = encodeURIComponent(`${input.issuer}:${input.accountName}`);
  const issuer = encodeURIComponent(input.issuer);

  return `otpauth://totp/${label}?secret=${input.secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export function createRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => `${randomBytes(4).toString('hex')}-${randomBytes(4).toString('hex')}`);
}

export function hashRecoveryCode(code: string) {
  return hashToken(code.trim().toLowerCase());
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url');
  const derived = scryptSync(password, salt, 64).toString('base64url');

  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) {
    return false;
  }

  const [scheme, salt, expected] = storedHash.split('$');

  if (scheme !== 'scrypt' || !salt || !expected) {
    return false;
  }

  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'base64url');

  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

export function authCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/',
  };
}
