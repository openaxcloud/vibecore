/**
 * Replit-parity account inactivity + Starter publish-expiry (pure, IO-free).
 * Free accounts inactive >= 1 year are eligible for deletion (after warnings);
 * paid accounts are exempt. Starter published links expire after 30 days.
 * See docs/REPLIT_PARITY_SPEC.md §16.5.
 */

export const INACTIVITY_DAYS = 365;
export const INACTIVITY_WARNING_DAYS = [335, 358] as const;
export const STARTER_PUBLISH_EXPIRY_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type InactivityStage = 'active' | 'warning' | 'eligible_for_deletion';

/** Whole days between lastActiveAt and now (clamped >= 0; 0 for non-finite). */
export function daysSince(lastActiveAtMs: number, nowMs: number): number {
  if (!Number.isFinite(lastActiveAtMs) || !Number.isFinite(nowMs)) {
    return 0;
  }
  return Math.max(0, Math.floor((nowMs - lastActiveAtMs) / MS_PER_DAY));
}

/** Inactivity stage. Paid accounts are always 'active'. */
export function inactivityStage(input: { lastActiveAtMs: number; nowMs: number; isPaid: boolean }): InactivityStage {
  if (input.isPaid) {
    return 'active';
  }
  const days = daysSince(input.lastActiveAtMs, input.nowMs);
  if (days >= INACTIVITY_DAYS) {
    return 'eligible_for_deletion';
  }
  if (days >= INACTIVITY_WARNING_DAYS[0]) {
    return 'warning';
  }
  return 'active';
}

/** A FREE account is eligible for inactivity deletion at >= INACTIVITY_DAYS. */
export function isEligibleForInactivityDeletion(input: {
  lastActiveAtMs: number;
  nowMs: number;
  isPaid: boolean;
}): boolean {
  return !input.isPaid && daysSince(input.lastActiveAtMs, input.nowMs) >= INACTIVITY_DAYS;
}

/** Highest inactivity-warning threshold crossed (for notifications), or null. */
export function inactivityWarningCrossed(daysInactive: number): number | null {
  if (!Number.isFinite(daysInactive)) {
    return null;
  }
  let crossed: number | null = null;
  for (const threshold of INACTIVITY_WARNING_DAYS) {
    if (daysInactive >= threshold) {
      crossed = threshold;
    }
  }
  return crossed;
}

/** Starter published link expired (>= 30 days since publish). */
export function isStarterPublishExpired(publishedAtMs: number, nowMs: number): boolean {
  return daysSince(publishedAtMs, nowMs) >= STARTER_PUBLISH_EXPIRY_DAYS;
}

/**
 * E-code-tone inactivity-warning email content (pure). Sent at the 335/358-day
 * thresholds before a free account is deleted at INACTIVITY_DAYS.
 */
export function inactivityWarningEmailContent(daysInactive: number): { subject: string; text: string; html: string } {
  const daysLeft = Math.max(0, INACTIVITY_DAYS - daysInactive);
  const subject = `Your E-Code account will be deleted in ${daysLeft} days`;
  const text = [
    `Your free E-Code account has been inactive for ${daysInactive} days.`,
    `Inactive free accounts are permanently deleted after ${INACTIVITY_DAYS} days.`,
    `You have ${daysLeft} days left — sign in to keep your account and projects.`,
  ].join('\n\n');
  const html =
    `<p>Your free E-Code account has been inactive for <strong>${daysInactive} days</strong>.</p>` +
    `<p>Inactive free accounts are permanently deleted after ${INACTIVITY_DAYS} days. ` +
    `You have <strong>${daysLeft} days</strong> left.</p>` +
    `<p>Sign in to keep your account and projects.</p>`;
  return { subject, text, html };
}

/**
 * De-dup guard for inactivity-warning emails (pure). Returns true if no warning
 * was sent for this threshold yet, or the last one was more than `renotifyDays`
 * ago. The marker lives in `User.preferences.inactivityWarnings['d<threshold>']`
 * (ISO timestamp) — no schema change.
 */
export function shouldSendInactivityWarning(
  preferences: { inactivityWarnings?: Record<string, string> } | null | undefined,
  threshold: number,
  nowMs: number,
  renotifyDays = 7,
): boolean {
  const last = preferences?.inactivityWarnings?.[`d${threshold}`];

  if (!last) {
    return true;
  }

  const lastMs = new Date(last).getTime();

  if (!Number.isFinite(lastMs)) {
    return true;
  }

  return nowMs - lastMs >= renotifyDays * MS_PER_DAY;
}
