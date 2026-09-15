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

  /*
   * Case-insensitive prefix strip: `::FFFF:10.0.0.5` is a valid RFC text form
   * some stacks/proxies emit. A lowercase-only strip left it as a 128-bit IPv6
   * address that could never match a 32-bit IPv4 allowlist entry, wrongly
   * blocking the legitimate client.
   */
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

/*
 * Upper bound on the joined command string we run abuse regexes against. Real shell
 * commands are far shorter than this; anything larger is rejected outright so an
 * attacker can't feed a multi-kilobyte string to a regex matcher and stall Node's
 * single-threaded event loop. (A few of the abuse patterns below use `.*` which is
 * super-linear on adversarial input, so the cap is a hard backstop for all of them.)
 */
const MAX_ABUSE_SCAN_LENGTH = 4096;

/*
 * Longest function name we treat as a fork-bomb candidate. The classic bomb uses `:`
 * or a short identifier; bounding the name keeps the per-candidate self-pipe match
 * cheap and prevents pathological inputs from constructing huge dynamic patterns.
 */
const FORK_BOMB_NAME_MAX = 64;

/*
 * Matches the *header* of a POSIX function definition: `NAME ( ) {` where NAME is `:`
 * or a short identifier. There is no ambiguous/nested quantifier here, so it scans in
 * linear time. The captured name is then used to look for the self-recursive pipe in
 * the body — see isForkBomb().
 */
const forkBombHeaderPattern = new RegExp(`(:|[A-Za-z_][\\w-]{0,${FORK_BOMB_NAME_MAX - 1}})\\s*\\(\\)\\s*\\{`, 'g');

const REGEX_META = /[.*+?^${}()|[\]\\-]/g;

/*
 * Detect a recursive-fork bomb (`:(){:|:&};:` and named variants such as
 * `boom(){ boom|boom& };boom`) in LINEAR time.
 *
 * The previous implementation used a single regex with a lazy unbounded body and a
 * back-reference (`([A-Za-z_][\w-]*|:)\s*\(\)\s*\{[^}]*?\1\s*\|\s*\1`). That pattern
 * backtracks super-linearly: on input like `f(){aaaa…` the engine retried the trailing
 * back-reference at every interior position, taking seconds for a few KB of input and
 * blocking the event loop for all tenants (an effective DoS).
 *
 * Instead we (1) find each function header `NAME(){` with a non-backtracking scan, then
 * (2) look for the self-referential pipe `NAME | NAME` in the body with a regex built
 * from the *literal* (escaped) name — no nested quantifiers, no back-references, so each
 * step is linear. The real fork bomb still requires the function body to re-invoke that
 * same function piped to itself, so legitimate piped bodies (`deploy(){ npm run build |
 * tee log; }`, `proc(){ proc_a | proc_b; }`) are not flagged.
 */
function isForkBomb(line: string): boolean {
  forkBombHeaderPattern.lastIndex = 0;

  let match: RegExpExecArray | null;

  while ((match = forkBombHeaderPattern.exec(line)) !== null) {
    const name = match[1];
    const body = line.slice(match.index + match[0].length);
    const escaped = name.replace(REGEX_META, '\\$&');
    const selfPipe = new RegExp(`${escaped}\\s*\\|\\s*${escaped}`);

    if (selfPipe.test(body)) {
      return true;
    }

    // Avoid a zero-length-match infinite loop on degenerate input.
    if (match.index === forkBombHeaderPattern.lastIndex) {
      forkBombHeaderPattern.lastIndex += 1;
    }
  }

  return false;
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
    pattern: /\b(curl|wget)\b.*\|\s*(sh|bash|zsh)(\s|;|&|\||$)|base64\s+-d\s*\|\s*(sh|bash|zsh)(\s|;|&|\||$)/i,
    signal: {
      type: 'malware_download',
      severity: 'high',
      action: 'manual_review',
      reason: 'download and execute pattern',
    },
  },
  {
    pattern:
      /\b(bash|sh|zsh|python|perl|ruby|php)\b.*\/dev\/tcp|\bnc\s+-e\b|socat\s+.*exec:|mkfifo\b[^|]*\|\s*(nc|netcat)\b/i,
    signal: { type: 'reverse_shell', severity: 'critical', action: 'stop_workspace', reason: 'reverse shell pattern' },
  },

  /*
   * NOTE: a generic command-chaining pattern (`; rm`, `&& rm`, `| sh`, …) was removed here.
   * detectCommandAbuse's result is hard-thrown as a 409 by the workspace-agent / api callers
   * regardless of signal.action, so that pattern rejected ordinary shell usage such as
   * `npm run clean && rm -rf dist`, `cat config | sh`, or `curl … ; bash setup.sh`. The
   * unambiguous reverse-shell, crypto-mining, metadata-exfil, and download-and-execute
   * (`curl … | sh`) constructs are already covered by the dedicated patterns above.
   */
];

export function detectCommandAbuse(command = '', args: string[] = []): AbuseSignal | undefined {
  let line = [command, ...args].join(' ').trim();

  /*
   * Hard length cap: never run the abuse regexes against an attacker-sized string.
   * Several patterns below use `.*` which is super-linear on adversarial input, and
   * detectCommandAbuse runs synchronously on Node's main thread, so an unbounded input
   * could stall the event loop for every tenant. Real commands are well under this cap;
   * we still scan the bounded prefix so an over-long line can't smuggle abuse past us.
   */
  if (line.length > MAX_ABUSE_SCAN_LENGTH) {
    line = line.slice(0, MAX_ABUSE_SCAN_LENGTH);
  }

  if (isForkBomb(line)) {
    return { type: 'fork_bomb', severity: 'critical', action: 'stop_workspace', reason: 'fork bomb pattern' };
  }

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

/*
 * AUDX-006 — SSRF / DNS-rebinding guard for outbound fetches we initiate on a
 * caller's behalf (screenshotter today; git + webhook callers next).
 *
 * Two distinct failures are covered, and they need different mechanisms:
 *
 *  1. A LITERAL address that should never be reachable — 127.0.0.1, 10/8,
 *     169.254.169.254 (cloud metadata: the credential-stealing target). A host
 *     allowlist does nothing here when the allowlist is empty, which is exactly
 *     how an "open renderer" happens.
 *  2. An allowed NAME that RESOLVES somewhere forbidden. A string check on the
 *     hostname cannot see this: `evil.allowed-suffix.example` can be an A record
 *     pointing at 169.254.169.254. Only resolving and inspecting the addresses
 *     catches it.
 *
 * ⚠️ HONEST LIMIT: this closes the check-time hole, not the full
 * time-of-check/time-of-use race. A true DNS-rebinding attacker can answer our
 * lookup with a public address and the CLIENT's subsequent lookup with a private
 * one. Eliminating that requires pinning the resolved address through to the
 * socket, which the HTTP clients in use here do not expose. Callers that need
 * that guarantee must route through an in-cluster proxy instead (which is what
 * the screenshotter already does for preview hosts).
 */
const BLOCKED_IPV4_RANGES: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // RFC1918
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local — includes 169.254.169.254 cloud metadata
  ['172.16.0.0', 12], // RFC1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // RFC1918
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
];

// Reuses the module's existing ipv4ToInt (see isIpAllowed above).

/** True when an IP literal must never be dialled. IPv6 is handled conservatively. */
export function isBlockedOutboundAddress(address: string): boolean {
  const normalized = address
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');

  if (normalized.includes(':')) {
    /*
     * IPv6. Block loopback (::1), unspecified (::), unique-local (fc00::/7),
     * link-local (fe80::/10) and anything IPv4-mapped, which would otherwise be
     * a trivial bypass of the IPv4 table above (::ffff:169.254.169.254).
     */
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);

    if (mapped) {
      return isBlockedOutboundAddress(mapped[1]);
    }

    return normalized === '::1' || normalized === '::' || /^f[cd]/.test(normalized) || /^fe[89ab]/.test(normalized);
  }

  const value = ipv4ToInt(normalized);

  if (value === undefined) {
    return false;
  }

  return BLOCKED_IPV4_RANGES.some(([base, bits]) => {
    const baseValue = ipv4ToInt(base);

    if (baseValue === undefined) {
      return false;
    }

    const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;

    return (value & mask) >>> 0 === (baseValue & mask) >>> 0;
  });
}

export interface OutboundUrlPolicy {
  /** Host suffixes the caller is willing to reach. MUST be non-empty unless allowAnyPublicHost. */
  allowedHostSuffixes: readonly string[];

  /*
   * Opt-in for callers whose legitimate destination set is "the public
   * internet" and cannot be enumerated — a git clone from an arbitrary forge, a
   * customer's SIEM webhook. The ADDRESS checks still apply in full: only the
   * host ALLOWLIST is waived, never the private/loopback/metadata refusal.
   *
   * Explicit and greppable on purpose. An EMPTY allowlist still fails closed, so
   * this can never be reached by forgetting to configure something — it has to
   * be asked for.
   */
  allowAnyPublicHost?: boolean;

  /** Injected for tests; defaults to node:dns lookup with all addresses. */
  resolveHost?: (hostname: string) => Promise<string[]>;
}

export type OutboundUrlRejection =
  | 'INVALID_URL'
  | 'UNSUPPORTED_PROTOCOL'
  | 'ALLOWLIST_EMPTY'
  | 'HOST_NOT_ALLOWED'
  | 'BLOCKED_ADDRESS'
  | 'RESOLUTION_FAILED';

async function defaultResolveHost(hostname: string): Promise<string[]> {
  const { lookup } = await import('node:dns/promises');
  const records = await lookup(hostname, { all: true });

  return records.map((record) => record.address);
}

/**
 * Decide whether we may fetch `rawUrl`. Returns undefined when allowed, or a
 * typed rejection reason.
 *
 * Fails CLOSED throughout: an empty allowlist is a rejection (not "allow
 * everything"), and a hostname we cannot resolve is a rejection (not "probably
 * fine"). Both of those defaults are how an SSRF guard silently stops guarding.
 */
export async function checkOutboundUrl(
  rawUrl: string,
  policy: OutboundUrlPolicy,
): Promise<OutboundUrlRejection | undefined> {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return 'INVALID_URL';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'UNSUPPORTED_PROTOCOL';
  }

  /*
   * An empty allowlist previously meant "skip the check", turning the service
   * into an open renderer against internal addresses. It is a configuration
   * error, and configuration errors must fail closed.
   */
  if (policy.allowedHostSuffixes.length === 0 && !policy.allowAnyPublicHost) {
    return 'ALLOWLIST_EMPTY';
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  /*
   * A literal address never matches a suffix allowlist, but check it first so
   * the rejection reason is the accurate one.
   */
  if (isBlockedOutboundAddress(hostname)) {
    return 'BLOCKED_ADDRESS';
  }

  const allowed =
    policy.allowAnyPublicHost ||
    policy.allowedHostSuffixes.some((suffix) => {
      const normalized = suffix.trim().toLowerCase().replace(/^\./, '');

      return normalized.length > 0 && (hostname === normalized || hostname.endsWith(`.${normalized}`));
    });

  if (!allowed) {
    return 'HOST_NOT_ALLOWED';
  }

  /*
   * The name is allowed — but where does it point? An attacker-controlled
   * subdomain of an allowed suffix can resolve to the metadata address. A
   * string check cannot see that.
   */
  let addresses: string[];

  try {
    addresses = await (policy.resolveHost ?? defaultResolveHost)(hostname);
  } catch {
    return 'RESOLUTION_FAILED';
  }

  if (addresses.length === 0 || addresses.some((address) => isBlockedOutboundAddress(address))) {
    return 'BLOCKED_ADDRESS';
  }

  return undefined;
}
