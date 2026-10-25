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

/** Stream a bounded prefix while draining grep; preserve its actual exit code. */
export function buildSecurityGrepCommand(kind: 'secrets' | 'sast'): string {
  const pattern =
    kind === 'secrets'
      ? '(api[_-]?key|secret|password|token)[[:space:]]*[:=]'
      : '(dangerouslySetInnerHTML|eval\\(|new Function\\(|innerHTML[[:space:]]*=|document\\.write\\(|child_process|exec\\(|spawn\\(|cors\\(|Access-Control-Allow-Origin)';
  const args = [
    '-RInE',
    pattern,
    '.',
    '--exclude-dir=node_modules',
    '--exclude-dir=.git',
    ...(kind === 'sast' ? ['--exclude-dir=dist', '--exclude-dir=build'] : []),
  ];

  /*
   * No temporary file containing source credentials. Output is bounded even for
   * a single huge matching line, while grep errors remain visible as failures.
   */
  const script = `const {spawn}=require('node:child_process');
const child=spawn('grep',${JSON.stringify(args)},{stdio:['ignore','pipe','ignore']});
let lines=0, bytes=0, truncated=false;
child.stdout.on('data',chunk=>{
  let end=0;
  while(end<chunk.length && lines<${kind === 'secrets' ? 50 : 80} && bytes<65536) {
    if(chunk[end]===10) lines++;
    end++; bytes++;
  }
  if(end) process.stdout.write(chunk.subarray(0,end));
  if(end<chunk.length) truncated=true;
});
child.on('error',()=>{process.exitCode=2;});
child.on('close',code=>{
  process.exitCode=(code===0||code===1)?0:(code||2);
  if(process.exitCode===0) process.stdout.write('\\n__VIBECORE_GREP_SCAN_V1__:'+JSON.stringify({complete:!truncated})+'\\n');
});`;

  return `node -e '${script.replace(/'/g, "'\\''")}'`;
}

/** npm audit exit 1 is usable only when it contains a supported audit report. */
export function isSuccessfulNpmAudit(exitCode: number, output: string): boolean {
  if (exitCode !== 0 && exitCode !== 1) {
    return false;
  }

  try {
    const report = JSON.parse(output);
    return (
      report !== null &&
      typeof report === 'object' &&
      !report.error &&
      report.auditReportVersion === 2 &&
      report.vulnerabilities !== null &&
      typeof report.vulnerabilities === 'object' &&
      !Array.isArray(report.vulnerabilities)
    );
  } catch {
    return false;
  }
}

/** A missing footer cannot certify completeness (old runtime or transport truncation). */
export function readSecurityGrepOutput(output: string): { output: string; complete: boolean } {
  const footer = output.match(/\n__VIBECORE_GREP_SCAN_V1__:(\{"complete":(?:true|false)\})\n$/);

  return footer
    ? { output: output.slice(0, footer.index), complete: JSON.parse(footer[1]).complete === true }
    : { output, complete: false };
}

export interface SecurityScanCoverage {
  source: 'npm-audit' | 'secret-scan' | 'sast';
  completeness: 'complete' | 'unknown' | 'failed';
}

interface StoredSecurityFinding {
  id: string;
  source?: string;
  status?: string;
  hidden?: boolean;
  createdAt?: string;
  details?: string;
}

/** Old grep IDs include output order; order must not own a user's triage. */
function findingIdentity(finding: StoredSecurityFinding): string {
  const id =
    finding.source === 'secret-scan' && /^secret:\d+:[a-f0-9]{16}$/.test(finding.id)
      ? finding.id.replace(/^secret:\d+:/, 'secret:')
      : finding.source === 'sast' && finding.details && isGrepMatchLine(finding.details)
        ? `sast:${createHash('sha256').update(finding.details).digest('hex')}`
        : finding.id;

  return JSON.stringify([finding.source ?? '', id]);
}

/** Only an authoritative result can remove old findings, and only for its own source. */
export function reconcileSecurityFindings<T extends StoredSecurityFinding>(
  previous: T[],
  findings: T[],
  coverage: SecurityScanCoverage[],
): T[] {
  const authoritativeSources = new Set(
    coverage.filter((item) => item.completeness === 'complete').map((item) => item.source),
  );

  const counts = (items: T[]) =>
    items.reduce((result, item) => {
      const identity = findingIdentity(item);
      result.set(identity, (result.get(identity) ?? 0) + 1);

      return result;
    }, new Map<string, number>());

  const previousCounts = counts(previous);
  const nextCounts = counts(findings);

  const identityFor = (finding: T) => {
    const identity = findingIdentity(finding);
    return (previousCounts.get(identity) ?? 0) <= 1 && (nextCounts.get(identity) ?? 0) <= 1
      ? identity
      : JSON.stringify([finding.source ?? '', finding.id]);
  };

  const previousByIdentity = new Map(previous.map((finding) => [identityFor(finding), finding]));

  const reconciled = new Map(
    previous
      .filter(
        (finding) =>
          !authoritativeSources.has(finding.source as SecurityScanCoverage['source']) ||
          finding.hidden ||
          finding.status === 'ignored' ||
          finding.status === 'fixed',
      )
      .map((finding) => [identityFor(finding), finding]),
  );

  for (const finding of findings) {
    const identity = identityFor(finding);
    const existing = previousByIdentity.get(identity);
    reconciled.set(
      identity,
      existing
        ? {
            ...existing,
            ...finding,
            id: existing.id,
            status: existing.status ?? finding.status,
            hidden: existing.hidden ?? finding.hidden,
            createdAt: existing.createdAt ?? finding.createdAt,
          }
        : {
            ...finding,
            id:
              (finding.source === 'secret-scan' || finding.source === 'sast') &&
              (nextCounts.get(findingIdentity(finding)) ?? 0) === 1
                ? (JSON.parse(findingIdentity(finding))[1] as string)
                : finding.id,
          },
    );
  }

  return [...reconciled.values()];
}
