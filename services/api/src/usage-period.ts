import type { SubscriptionRecord } from './store.js';

type UsageSubscription = Pick<SubscriptionRecord, 'status' | 'currentPeriodStart' | 'currentPeriodEnd'>;

/*
 * The stored contract has no billing interval. Only subdivide a demonstrably
 * long period; ordinary 28–31-day monthly periods (plus clock/calendar margin)
 * must retain their original start, even while their next webhook is delayed.
 */
const LONG_PERIOD_MIN_MS = 45 * 24 * 60 * 60 * 1000;

function monthlyAnniversary(start: Date, offset: number): Date {
  const anniversary = new Date(start);
  anniversary.setUTCDate(1);
  anniversary.setUTCMonth(anniversary.getUTCMonth() + offset);

  const lastDay = new Date(anniversary);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
  anniversary.setUTCDate(Math.min(start.getUTCDate(), lastDay.getUTCDate()));

  return anniversary;
}

export function monthlyUsagePeriodStart(subscription: UsageSubscription | undefined, now = new Date()): Date {
  /*
   * Canceled/unpaid subscriptions retain old billing dates; their free allowance
   * must keep resetting at the calendar month, as it did before this resolver.
   */
  if (subscription?.currentPeriodStart && ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(subscription.status)) {
    const start = new Date(subscription.currentPeriodStart);

    if (!Number.isNaN(start.getTime())) {
      const end = new Date(subscription.currentPeriodEnd ?? '');

      if (end.getTime() - start.getTime() > LONG_PERIOD_MIN_MS && now.getTime() > start.getTime()) {
        /*
         * Do not grant another allowance after the known paid period ends.
         * Recompute each anniversary from the original anchor so Jan 31 clamps
         * to Feb 28/29 and returns to Mar 31, preserving the UTC time of day.
         */
        const effectiveNow = new Date(Math.min(now.getTime(), end.getTime() - 1));

        const offset =
          (effectiveNow.getUTCFullYear() - start.getUTCFullYear()) * 12 +
          effectiveNow.getUTCMonth() -
          start.getUTCMonth();

        const anniversary = monthlyAnniversary(start, offset);

        return anniversary.getTime() <= effectiveNow.getTime() ? anniversary : monthlyAnniversary(start, offset - 1);
      }

      return start;
    }
  }

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
