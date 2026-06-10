import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const secretKeyPattern = /authorization|cookie|password|secret|token|api[-_]?key|refresh/i;
export const secretValuePatterns = [
  /\bcanary_[A-Za-z0-9_-]{16,}\b/g,
  /\bsk_(?:live|test)_[A-Za-z0-9_-]{16,}\b/g,
  // Generic `sk-` prefix covers OpenAI (sk-, sk-proj-, sk-svcacct-) and Anthropic (sk-ant-).
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bya29\.[A-Za-z0-9._-]{16,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/g,
  // GitHub tokens: classic PAT, fine-grained PAT, and the gho/ghu/ghs/ghr family.
  /\bghp_[A-Za-z0-9]{16,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g,
  /\bgh[ousr]_[A-Za-z0-9]{16,}\b/g,
  // JWT / generic Bearer tokens (header.payload.signature).
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  // AWS access key ids and Google API keys.
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  // Stripe restricted keys (rk_live/test).
  /\brk_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  // PEM private keys (any type) — redact the whole block.
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
  // Credentials embedded in connection-string / URL userinfo (scheme://user:pass@host).
  /\b([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s:/@]+):[^\s/@]+@/g,
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

export function requireProductionSecret(name: string, value: string | undefined | null, devFallback: string): string {
  const resolved = value && value.length > 0 ? value : devFallback;

  if (process.env.NODE_ENV === 'production' && resolved === devFallback) {
    const code = name
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_')
      .replace(/_+/g, '_');
    throw Object.assign(new Error(`${name} must be set when NODE_ENV=production`), {
      statusCode: 500,
      code: `${code}_REQUIRED`,
    });
  }

  return resolved;
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

function ipv6ToBigInt(ip: string): bigint | undefined {
  let text = ip;

  // Fold a trailing embedded IPv4 (e.g. ::ffff:1.2.3.4) into two hextets.
  if (text.includes('.')) {
    const lastColon = text.lastIndexOf(':');
    const v4 = ipv4ToInt(text.slice(lastColon + 1));

    if (v4 === undefined) {
      return undefined;
    }

    text = `${text.slice(0, lastColon + 1)}${((v4 >>> 16) & 0xffff).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }

  const halves = text.split('::');

  if (halves.length > 2) {
    return undefined;
  }

  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let groups: string[];

  if (halves.length === 2) {
    const missing = 8 - (head.length + tail.length);

    if (missing < 0) {
      return undefined;
    }

    groups = [...head, ...Array<string>(missing).fill('0'), ...tail];
  } else {
    groups = head;
  }

  if (groups.length !== 8) {
    return undefined;
  }

  let value = 0n;

  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
      return undefined;
    }

    value = (value << 16n) | BigInt(Number.parseInt(group, 16));
  }

  return value;
}

function ipToBigInt(ip: string): { value: bigint; bits: 32 | 128 } | undefined {
  if (ip.includes(':')) {
    const value = ipv6ToBigInt(ip);

    return value === undefined ? undefined : { value, bits: 128 };
  }

  const value = ipv4ToInt(ip);

  return value === undefined ? undefined : { value: BigInt(value), bits: 32 };
}

export function isIpAllowed(ip: string, allowlist: string[] | undefined) {
  if (!allowlist || allowlist.length === 0) {
    return true;
  }

  // Case-insensitive prefix strip: `::FFFF:10.0.0.5` is a valid RFC text form
  // some stacks/proxies emit. A lowercase-only strip left it as a 128-bit IPv6
  // address that could never match a 32-bit IPv4 allowlist entry, wrongly
  // blocking the legitimate client.
  const normalizedIp = ip.trim().replace(/^::ffff:/i, '');
  const ipParsed = ipToBigInt(normalizedIp);

  return allowlist.some((entry) => {
    const normalizedEntry = entry.trim().replace(/^::ffff:/i, '');

    if (normalizedEntry === normalizedIp) {
      return true;
    }

    const [rangeIp, prefixText] = normalizedEntry.split('/');

    if (prefixText === undefined) {
      return false;
    }

    const prefix = Number.parseInt(prefixText, 10);
    const rangeParsed = ipToBigInt(rangeIp);

    /*
     * CIDR match in BigInt so IPv6 ranges work (the old IPv4-only arithmetic
     * silently failed for any IPv6 allowlist entry, opening the allowlist).
     * IPv4 and IPv6 are distinct families — an entry never matches across them.
     */
    if (
      !rangeParsed ||
      !ipParsed ||
      rangeParsed.bits !== ipParsed.bits ||
      Number.isNaN(prefix) ||
      prefix < 0 ||
      prefix > rangeParsed.bits
    ) {
      return false;
    }

    const full = (1n << BigInt(rangeParsed.bits)) - 1n;
    const mask = full ^ ((1n << BigInt(rangeParsed.bits - prefix)) - 1n);

    return (ipParsed.value & mask) === (rangeParsed.value & mask);
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
    signal: {
      type: 'crypto_mining',
      severity: 'critical',
      action: 'stop_workspace',
      reason: 'crypto mining command pattern',
    },
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
    pattern:
      /\b(curl|wget|nc|netcat|socat)\b.*\b(169\.254\.169\.254|metadata\.google|metadata\.aws|100\.100\.100\.200)\b/i,
    signal: {
      type: 'suspicious_egress',
      severity: 'critical',
      action: 'stop_workspace',
      reason: 'metadata service access attempt',
    },
  },
  {
    pattern: /\b(curl|wget)\b.*\|\s*(sh|bash|zsh)|base64\s+-d\s*\|\s*(sh|bash|zsh)/i,
    signal: {
      type: 'malware_download',
      severity: 'high',
      action: 'manual_review',
      reason: 'download and execute pattern',
    },
  },
  {
    pattern: /\b(bash|sh|zsh|python|perl|ruby|php)\b.*\/dev\/tcp|nc\s+-e|socat\s+.*exec:|mkfifo\s+.*nc/i,
    signal: { type: 'reverse_shell', severity: 'critical', action: 'stop_workspace', reason: 'reverse shell pattern' },
  },
  {
    pattern: /;\s*(rm|curl|wget|bash|sh)\b|&&\s*(rm|curl|wget|bash|sh)\b|\|\s*(bash|sh|zsh)\b/i,
    signal: {
      type: 'command_injection',
      severity: 'high',
      action: 'manual_review',
      reason: 'command chaining/injection pattern',
    },
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
    return {
      type: 'workspace_creation_spike',
      severity: 'high',
      action: 'manual_review',
      reason: 'workspace creation spike',
    };
  }
  if ((input.aiMessages ?? 0) >= 1000) {
    return { type: 'excessive_ai_usage', severity: 'medium', action: 'throttle', reason: 'excessive AI usage' };
  }
  if ((input.storageBytes ?? 0) >= 100 * 1024 * 1024 * 1024) {
    return {
      type: 'storage_abuse',
      severity: 'high',
      action: 'manual_review',
      reason: 'storage abuse threshold exceeded',
    };
  }
  if ((input.cpuSeconds ?? 0) >= 6 * 60 * 60) {
    return { type: 'cpu_abuse', severity: 'high', action: 'manual_review', reason: 'CPU abuse threshold exceeded' };
  }
  if ((input.previewRequests ?? 0) >= 10_000) {
    return { type: 'spam_preview', severity: 'medium', action: 'throttle', reason: 'preview spam threshold exceeded' };
  }
  return undefined;
}
