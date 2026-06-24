import { createHash } from 'node:crypto';

export interface SecretScanFinding {
  id: string;
  packageName: string;
  title: string;
  severity: string;
  status: string;
  hidden: boolean;
  source: string;
  details: string;
  recommendation: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Build the persisted findings for a workspace secret scan.
 *
 * The matched grep line can contain the raw secret value, written with either an `=`
 * separator (`API_KEY=sk-live-...`) or a `:` separator (`api_secret: sk-live-...`,
 * `"token": "ghp_..."`). The upstream scanner greps for `(...)\s*[:=]`, so `details`
 * MUST redact on the same separator class — redacting only on `=` leaks colon-delimited
 * secrets verbatim to the panel client. The finding id must NEVER embed the raw line
 * either: the id is stored back into project env-vars (a less-protected store than
 * project secrets) and shipped to the panel client, which would defeat the redaction.
 * We derive a stable id from a hash of the line instead.
 */
/**
 * Redact the secret value from a single `grep -RInE` match line.
 *
 * grep `-In` emits `path:lineno:body`, so the leading `path:lineno:` prefix is preserved
 * (it carries no secret) and only the body is redacted, on the first `:` OR `=` separator —
 * matching the scanner's `[:=]` class. Falls back to redacting the whole line's first
 * separator when the path/lineno prefix can't be identified.
 */
export function redactSecretScanLine(line: string): string {
  /*
   * Preserve the separator and any whitespace following it, redact only the value:
   *   `API_KEY=sk-live-...`     -> `API_KEY=***`
   *   `api_secret: sk-live-...` -> `api_secret: ***`
   *   `"token": "ghp_..."`      -> `"token": ***`
   */
  const redactBody = (body: string) => body.replace(/([:=]\s*)\S.*$/, '$1***');

  // grep -In prefix: "<path>:<lineno>:<body>". lineno is purely numeric.
  const prefixMatch = line.match(/^(.*?:\d+:)([\s\S]*)$/);

  if (prefixMatch) {
    return prefixMatch[1] + redactBody(prefixMatch[2]);
  }

  return redactBody(line);
}

export function vulnerabilitiesFromSecretScan(output: string, timestamp: string): SecretScanFinding[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((line, index) => ({
      id: `secret:${index}:${createHash('sha1').update(line).digest('hex').slice(0, 16)}`,
      packageName: 'workspace',
      title: 'Potential secret in source file',
      severity: 'high',
      status: 'open',
      hidden: false,
      source: 'secret-scan',
      details: redactSecretScanLine(line),
      recommendation: 'Move credentials into project secrets and rotate exposed values.',
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
}

/** Returns true when an enabled scheduled scan's nextRunAt is in the past (or now). */
export function isSecurityScheduleDue(state: any, now: Date): boolean {
  if (!state?.settings?.schedule?.enabled || !state.settings.schedule.nextRunAt) {
    return false;
  }

  const nextRunAt = new Date(state.settings.schedule.nextRunAt);

  return !Number.isNaN(nextRunAt.getTime()) && nextRunAt.getTime() <= now.getTime();
}
