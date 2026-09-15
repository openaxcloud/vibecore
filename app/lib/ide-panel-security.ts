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

/*
 * BUG-SEC-SCANNER-PHANTOM-FINDING: the secret and SAST scans shell out to
 * `grep -RInE …` inside the workspace pod. The runtime command endpoint merges
 * stdout AND stderr into a single `output` string, and the scan commands end in
 * `|| true`, so when the pod's grep (BusyBox) rejects an option its error/help
 * text — `grep: unrecognized option`, `Usage: grep [-HhnlLoqvsrRiwFE] [-m N] …`
 * and one line per documented flag — landed in `output` with exit code 0 and
 * every one of those lines was turned into a phantom finding ("LOW · Static
 * security review item · Usage: grep …") in the Security panel.
 *
 * A real `grep -RIn` match ALWAYS carries the `path:lineno:` prefix (grep adds
 * `-H`-style prefixes for recursive searches and `-n` guarantees the line
 * number), and that prefix contains no whitespace. Tool noise never has that
 * shape — `Usage: grep …` and `grep: …` break on the space after the first
 * colon, and the BusyBox banner's `12:00:00` timestamp sits after a space. So
 * findings are only ever built from lines in match format; everything else is
 * scanner noise and MUST be dropped, never reported as a vulnerability.
 */
const GREP_MATCH_LINE_PATTERN = /^[^:\s]\S*:\d+:/;

/** True when a scanner output line is a real `grep -RIn` match (`path:lineno:…`). */
export function isGrepMatchLine(line: string): boolean {
  return GREP_MATCH_LINE_PATTERN.test(line);
}

/**
 * Split raw grep scan output into trimmed match lines, dropping empty lines and
 * tool error/usage noise (stderr text such as `Usage: grep …`, `grep: …`,
 * `sh: …`, `Binary file … matches`).
 */
export function extractGrepMatchLines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && isGrepMatchLine(line));
}

export function vulnerabilitiesFromSecretScan(output: string, timestamp: string): SecretScanFinding[] {
  return extractGrepMatchLines(output)
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
