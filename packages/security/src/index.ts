import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const secretKeyPattern = /authorization|cookie|password|secret|token|api[-_]?key|refresh/i;
export const secretValuePatterns = [
  /\bcanary_[A-Za-z0-9_-]{16,}\b/g,
  /\bsk_(?:live|test)_[A-Za-z0-9_-]{16,}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bghp_[A-Za-z0-9_]{16,}\b/g,
  /\bya29\.[A-Za-z0-9._-]{16,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/g,
];

export function redactSecretString(value: string) {
  return secretValuePatterns.reduce((output, pattern) => output.replace(pattern, '[REDACTED]'), value);
}

export function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactSecretString(value);
  }

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

function resolveEncryptionSecret(secret?: string) {
  const resolved = secret ?? process.env.CONFIG_ENCRYPTION_KEY ?? 'dev-config-encryption-key-change-me';

  if (process.env.NODE_ENV === 'production' && resolved === 'dev-config-encryption-key-change-me') {
    throw Object.assign(new Error('CONFIG_ENCRYPTION_KEY is required in production'), {
      statusCode: 500,
      code: 'CONFIG_ENCRYPTION_KEY_REQUIRED',
    });
  }

  return resolved;
}

export function encryptJson(value: unknown, secret?: string) {
  const resolvedSecret = resolveEncryptionSecret(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(resolvedSecret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptJson<T = unknown>(encrypted: string, secret?: string): T {
  const resolvedSecret = resolveEncryptionSecret(secret);
  const [version, iv, tag, ciphertext] = encrypted.split('.');

  if (version !== 'v1' || !iv || !tag || !ciphertext) {
    throw new Error('Invalid encrypted payload');
  }

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(resolvedSecret), Buffer.from(iv, 'base64url'));
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

export interface AbuseSignal {
  type:
    | 'crypto_mining'
    | 'fork_bomb'
    | 'port_scanning'
    | 'suspicious_egress'
    | 'spam_preview'
    | 'excessive_ai_usage'
    | 'failed_auth_spike'
    | 'workspace_creation_spike'
    | 'storage_abuse'
    | 'cpu_abuse'
    | 'malware_download'
    | 'reverse_shell'
    | 'command_injection';
  severity: 'low' | 'medium' | 'high' | 'critical';
  action: 'log' | 'throttle' | 'stop_workspace' | 'suspend_org' | 'alert_admin' | 'manual_review';
  reason: string;
}

const abuseCommandPatterns: Array<{ pattern: RegExp; signal: AbuseSignal }> = [
  {
    pattern: /\b(xmrig|minerd|cpuminer|ethminer|monero|stratum\+tcp|nicehash)\b/i,
    signal: { type: 'crypto_mining', severity: 'critical', action: 'stop_workspace', reason: 'crypto mining command pattern' },
  },
  {
    pattern: /:\(\)\s*\{\s*:\|:|while\s+true.*fork|bomb/i,
    signal: { type: 'fork_bomb', severity: 'critical', action: 'stop_workspace', reason: 'fork bomb pattern' },
  },
  {
    pattern: /\b(nmap|masscan|zmap|hping3|nping)\b/i,
    signal: { type: 'port_scanning', severity: 'high', action: 'stop_workspace', reason: 'port scanning tool' },
  },
  {
    pattern: /\b(curl|wget|nc|netcat|socat)\b.*\b(169\.254\.169\.254|metadata\.google|metadata\.aws|100\.100\.100\.200)\b/i,
    signal: { type: 'suspicious_egress', severity: 'critical', action: 'stop_workspace', reason: 'metadata service access attempt' },
  },
  {
    pattern: /\b(curl|wget)\b.*\|\s*(sh|bash|zsh)|base64\s+-d\s*\|\s*(sh|bash|zsh)/i,
    signal: { type: 'malware_download', severity: 'high', action: 'manual_review', reason: 'download and execute pattern' },
  },
  {
    pattern: /\b(bash|sh|zsh|python|perl|ruby|php)\b.*\/dev\/tcp|nc\s+-e|socat\s+.*exec:|mkfifo\s+.*nc/i,
    signal: { type: 'reverse_shell', severity: 'critical', action: 'stop_workspace', reason: 'reverse shell pattern' },
  },
  {
    pattern: /;\s*(rm|curl|wget|bash|sh)\b|&&\s*(rm|curl|wget|bash|sh)\b|\|\s*(bash|sh|zsh)\b/i,
    signal: { type: 'command_injection', severity: 'high', action: 'manual_review', reason: 'command chaining/injection pattern' },
  },
];

export function detectCommandAbuse(command = '', args: string[] = []): AbuseSignal | undefined {
  const line = [command, ...args].join(' ').trim();
  return abuseCommandPatterns.find(({ pattern }) => pattern.test(line))?.signal;
}

export function detectUsageAbuse(input: {
  aiMessages?: number;
  failedAuthAttempts?: number;
  workspaceCreations?: number;
  storageBytes?: number;
  cpuSeconds?: number;
  previewRequests?: number;
}): AbuseSignal | undefined {
  if ((input.failedAuthAttempts ?? 0) >= 20) {
    return { type: 'failed_auth_spike', severity: 'high', action: 'throttle', reason: 'many failed auth attempts' };
  }
  if ((input.workspaceCreations ?? 0) >= 30) {
    return { type: 'workspace_creation_spike', severity: 'high', action: 'manual_review', reason: 'workspace creation spike' };
  }
  if ((input.aiMessages ?? 0) >= 1000) {
    return { type: 'excessive_ai_usage', severity: 'medium', action: 'throttle', reason: 'excessive AI usage' };
  }
  if ((input.storageBytes ?? 0) >= 100 * 1024 * 1024 * 1024) {
    return { type: 'storage_abuse', severity: 'high', action: 'manual_review', reason: 'storage abuse threshold exceeded' };
  }
  if ((input.cpuSeconds ?? 0) >= 6 * 60 * 60) {
    return { type: 'cpu_abuse', severity: 'high', action: 'manual_review', reason: 'CPU abuse threshold exceeded' };
  }
  if ((input.previewRequests ?? 0) >= 10_000) {
    return { type: 'spam_preview', severity: 'medium', action: 'throttle', reason: 'preview spam threshold exceeded' };
  }
  return undefined;
}
