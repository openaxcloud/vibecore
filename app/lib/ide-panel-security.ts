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
 * The matched grep line can contain the raw secret value (e.g. `API_KEY=sk-live-...`).
 * The `details` field redacts everything after the first `=`, but the finding id must
 * NEVER embed the raw line: the id is stored back into project env-vars (a less-protected
 * store than project secrets) and shipped to the panel client, which would defeat the
 * redaction. We derive a stable id from a hash of the line instead.
 */
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
      details: line.replace(/=.*/, '=***'),
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
