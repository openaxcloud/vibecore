import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const secretKeyPattern = /authorization|cookie|password|secret|token|api[-_]?key|refresh/i;

export function redactSecrets(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }

  const output: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value)) {
    output[key] = secretKeyPattern.test(key) ? '[redacted]' : redactSecrets(item);
  }

  return output;
}

export function assertStrictCorsOrigin(origin: string | undefined, allowedOrigins: string[]) {
  if (!origin) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

export function requireCsrfToken(headers: Record<string, string | string[] | undefined>, method: string) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
    return;
  }

  const token = headers['x-csrf-token'];

  if (!token || Array.isArray(token)) {
    const error = new Error('Missing CSRF token');
    Object.assign(error, { statusCode: 403, code: 'CSRF_REQUIRED' });
    throw error;
  }
}

function encryptionKey(secret: string) {
  return createHash('sha256').update(secret).digest();
}

export function encryptJson(value: unknown, secret = process.env.CONFIG_ENCRYPTION_KEY ?? 'dev-config-encryption-key-change-me') {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptJson<T = unknown>(encrypted: string, secret = process.env.CONFIG_ENCRYPTION_KEY ?? 'dev-config-encryption-key-change-me'): T {
  const [version, iv, tag, ciphertext] = encrypted.split('.');

  if (version !== 'v1' || !iv || !tag || !ciphertext) {
    throw new Error('Invalid encrypted payload');
  }

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]);

  return JSON.parse(plaintext.toString('utf8')) as T;
}

function ipv4ToInt(ip: string) {
  const parts = ip.split('.').map((part) => Number.parseInt(part, 10));

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return undefined;
  }

  return parts.reduce((accumulator, part) => (accumulator << 8) + part, 0) >>> 0;
}

export function isIpAllowed(ip: string, allowlist: string[] | undefined) {
  if (!allowlist || allowlist.length === 0) {
    return true;
  }

  const normalizedIp = ip.replace(/^::ffff:/, '');
  const ipValue = ipv4ToInt(normalizedIp);

  return allowlist.some((entry) => {
    const normalizedEntry = entry.trim().replace(/^::ffff:/, '');

    if (normalizedEntry === normalizedIp) {
      return true;
    }

    const [rangeIp, prefixText] = normalizedEntry.split('/');
    const prefix = Number.parseInt(prefixText ?? '', 10);
    const rangeValue = ipv4ToInt(rangeIp);

    if (rangeValue === undefined || ipValue === undefined || Number.isNaN(prefix) || prefix < 0 || prefix > 32) {
      return false;
    }

    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;

    return (ipValue & mask) === (rangeValue & mask);
  });
}

export function hasRecentReauth(lastReauthAt: string | undefined, maxAgeSeconds: number) {
  if (!lastReauthAt) {
    return false;
  }

  return Date.now() - new Date(lastReauthAt).getTime() <= maxAgeSeconds * 1000;
}
