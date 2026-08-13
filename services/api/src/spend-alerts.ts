/**
 * Replit-parity usage-based spend alerts (50% / 80% / 100% of the budget cap).
 *
 * Dormant until billing goes live: the settle path only calls `maybeSpendAlert`
 * when `BILLING_CREDITS_ENABLED === 'true'`, so in SHADOW no alert is ever sent.
 * The threshold ladder itself is the shared `paygAlertThresholdCrossed` from
 * `@vibecore/billing`. De-dup is per (billing-period, threshold): an alert fires
 * once when spend first crosses a higher rung, and the ladder resets each period.
 */
import { paygAlertThresholdCrossed } from '@vibecore/billing';

/** Threshold the wallet last alerted on, as a whole percent (50 | 80 | 100). */
export type SpendAlertPct = 50 | 80 | 100;

function toPct(threshold: number): SpendAlertPct {
  if (threshold >= 1) {
    return 100;
  }

  if (threshold >= 0.8) {
    return 80;
  }

  return 50;
}

/**
 * Decide whether a spend alert should fire, and at what percent. Returns the
 * percent to alert on (50/80/100) or `null` for "no alert". Pure — the caller
 * owns reading the cumulative period spend and persisting the marker.
 *
 * The previously-alerted rung only counts within the SAME billing period; a new
 * period (periodStartMs changed) resets the ladder so the next period can alert
 * from 50% again. An alert fires only when spend crosses a STRICTLY higher rung
 * than the last one sent this period (so 80% won't re-fire after 80%).
 */
export function nextSpendAlertPct(input: {
  paygSpentCents: number;
  budgetCapCents: number | null | undefined;
  lastAlertPct: number | null | undefined;
  periodStartMs: number;
  lastAlertPeriodStartMs: number | null | undefined;
}): SpendAlertPct | null {
  if (!input.budgetCapCents || input.budgetCapCents <= 0) {
    return null;
  }

  const crossed = paygAlertThresholdCrossed(input.paygSpentCents, input.budgetCapCents);

  if (crossed == null) {
    return null;
  }

  const crossedPct = toPct(crossed);
  const samePeriod = input.lastAlertPeriodStartMs === input.periodStartMs;
  const effectiveLastPct = samePeriod ? (input.lastAlertPct ?? 0) : 0;

  return crossedPct > effectiveLastPct ? crossedPct : null;
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Spend-alert email body (e-code tone, English to match the other system mails). */
export function spendAlertEmailContent(input: {
  pct: SpendAlertPct;
  paygSpentCents: number;
  budgetCapCents: number;
}): { subject: string; text: string; html: string } {
  const spent = formatUsd(input.paygSpentCents);
  const cap = formatUsd(input.budgetCapCents);
  const atCap = input.pct >= 100;

  const subject = atCap
    ? `You've reached your E-Code usage limit (${cap})`
    : `You've used ${input.pct}% of your E-Code usage limit`;

  const lead = atCap
    ? `Your usage-based spend has reached your limit of ${cap}. Usage-based services are paused until you raise the limit.`
    : `Your usage-based spend is at ${spent} — ${input.pct}% of your ${cap} limit.`;

  const text = [
    lead,
    atCap
      ? 'Raise your usage limit in Billing → Usage limits to resume usage-based services.'
      : 'You can review or change your usage limit any time in Billing → Usage limits.',
  ].join('\n\n');

  const html =
    `<p>${lead}</p>` +
    `<p>${
      atCap
        ? 'Raise your usage limit in <strong>Billing → Usage limits</strong> to resume usage-based services.'
        : 'You can review or change your usage limit any time in <strong>Billing → Usage limits</strong>.'
    }</p>`;

  return { subject, text, html };
}
