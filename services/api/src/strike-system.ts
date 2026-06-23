/**
 * Replit-parity moderation strike ladder (pure, IO-free).
 * Warning → Community Ban (keeps IDE, no public posting) → Account Ban (no login,
 * apps deleted). Appeals go to APPEALS_EMAIL. See docs/REPLIT_PARITY_SPEC.md §16.5.
 */

export type StrikeAction = 'WARNING' | 'COMMUNITY_BAN' | 'ACCOUNT_BAN';
export interface StrikeRecordLike {
  action: StrikeAction;
  createdAt: string | number | Date;
}

export const APPEALS_EMAIL =
  (typeof process !== 'undefined' && process.env?.MODERATION_APPEALS_EMAIL) || 'appeals@e-code.ai';

export const WARNING_THRESHOLD = 1;
export const COMMUNITY_BAN_THRESHOLD = 3;
export const ACCOUNT_BAN_THRESHOLD = 4;

export const STRIKE_EXPIRY_DAYS = 180;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Map a count of active strikes to the resulting action. */
export function consequenceForStrikeCount(activeStrikes: number): StrikeAction | 'NONE' {
  if (!Number.isFinite(activeStrikes) || activeStrikes < 0) {
    return 'NONE';
  }

  const n = Math.floor(activeStrikes);

  if (n >= ACCOUNT_BAN_THRESHOLD) {
    return 'ACCOUNT_BAN';
  }

  if (n >= COMMUNITY_BAN_THRESHOLD) {
    return 'COMMUNITY_BAN';
  }

  if (n >= WARNING_THRESHOLD) {
    return 'WARNING';
  }

  return 'NONE';
}

const LADDER: Array<StrikeAction | 'NONE'> = ['NONE', 'WARNING', 'COMMUNITY_BAN', 'ACCOUNT_BAN'];

function ladderIndex(action: StrikeAction | 'NONE'): number {
  const idx = LADDER.indexOf(action);
  return idx < 0 ? 0 : idx;
}

/** Escalate from the current action given a new violation severity. */
export function escalate(current: StrikeAction | 'NONE', severity: 'minor' | 'major' | 'severe'): StrikeAction {
  const idx = ladderIndex(current);

  if (severity === 'severe') {
    return 'ACCOUNT_BAN';
  }

  if (severity === 'major') {
    return LADDER[Math.min(idx + 1, LADDER.length - 1)] as StrikeAction;
  }

  if (current === 'NONE' || idx === 0) {
    return 'WARNING';
  }

  return current as StrikeAction;
}

/** Return the more severe of two actions per the ladder (NONE < WARNING < COMMUNITY_BAN < ACCOUNT_BAN). */
export function higherConsequence(a: StrikeAction | 'NONE', b: StrikeAction | 'NONE'): StrikeAction | 'NONE' {
  return ladderIndex(a) >= ladderIndex(b) ? a : b;
}

/** Human-readable effect of an action. */
export function describeConsequence(action: StrikeAction): string {
  switch (action) {
    case 'WARNING':
      return 'A warning for violating the community guidelines. No access is restricted.';
    case 'COMMUNITY_BAN':
      return 'You can no longer post or share apps publicly, but you keep full IDE access to your projects.';
    case 'ACCOUNT_BAN':
      return 'You can no longer log in and your apps have been deleted.';
    default:
      return `Unknown moderation action. To appeal, email ${APPEALS_EMAIL}.`;
  }
}

/** Effective permissions for a moderation action. Fails closed for unknown actions. */
export function permissionsForAction(action: StrikeAction | 'NONE'): {
  canLogin: boolean;
  canUseIde: boolean;
  canPostPublicly: boolean;
} {
  switch (action) {
    case 'NONE':
    case 'WARNING':
      return { canLogin: true, canUseIde: true, canPostPublicly: true };
    case 'COMMUNITY_BAN':
      return { canLogin: true, canUseIde: true, canPostPublicly: false };
    case 'ACCOUNT_BAN':
      return { canLogin: false, canUseIde: false, canPostPublicly: false };
    default:
      return { canLogin: false, canUseIde: false, canPostPublicly: false };
  }
}

/**
 * Count strikes that haven't expired. Defensive: ignores null entries, counts
 * unparseable/future timestamps as active (fail open on count), returns 0 for a
 * non-finite `now` or non-array input.
 */
export function countActiveStrikes(strikes: ReadonlyArray<StrikeRecordLike>, nowMs: number): number {
  if (!Array.isArray(strikes) || !Number.isFinite(nowMs)) {
    return 0;
  }

  const cutoff = nowMs - STRIKE_EXPIRY_DAYS * MS_PER_DAY;

  let count = 0;

  for (const strike of strikes) {
    if (!strike) {
      continue;
    }

    const ms = new Date(strike.createdAt as any).getTime();

    if (!Number.isFinite(ms)) {
      count += 1;
      continue;
    }

    if (ms >= cutoff) {
      count += 1;
    }
  }

  return count;
}
