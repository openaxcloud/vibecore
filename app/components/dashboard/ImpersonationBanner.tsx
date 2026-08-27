import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { impersonationBannerEn } from '~/lib/i18n/catalogs/impersonation-banner';

/*
 * Persistent banner shown whenever the current session is an admin impersonating
 * another user (P8). Loads its state from the /api/impersonation resource route
 * (which proxies GET /auth/me); when impersonating, it pins a high-contrast bar
 * with a Stop control that POSTs /auth/impersonation/stop and reloads. Rendered
 * in the app shell — renders nothing for normal sessions, so it's safe everywhere.
 */
interface ImpersonationState {
  impersonatedBy: string | null;
  email: string | null;
}

interface StopResult {
  stopped: boolean;
}

export const IMPERSONATION_STOP_ERROR = impersonationBannerEn['impersonationBanner.stop.error'];

/*
 * Derive what the Stop control should render from the fetcher's state + data.
 * The /api/impersonation action swallows every failure into { stopped: false }
 * with HTTP 200 (and never redirects on a 401), so a failed or expired stop
 * resolves to data we must surface — otherwise the button just flips back to
 * 'Stop impersonating' and the admin is left silently still impersonating.
 */
export function deriveStopState(state: 'idle' | 'submitting' | 'loading', data: StopResult | undefined) {
  const stopping = state !== 'idle';

  // A request resolved (state back to idle, data present) but the stop did not take.
  const failed = !stopping && data !== undefined && !data.stopped;

  return {
    stopping,
    failed,
    error: failed ? IMPERSONATION_STOP_ERROR : null,
  };
}

export function ImpersonationBanner() {
  const { t } = useTranslation();
  const status = useFetcher<ImpersonationState>();
  const stop = useFetcher<StopResult>();
  const requestedStatus = useRef(false);

  // Load impersonation status once on mount.
  useEffect(() => {
    if (!requestedStatus.current && status.state === 'idle' && status.data === undefined) {
      requestedStatus.current = true;
      status.load('/api/impersonation');
    }
  }, [status.data, status.load, status.state]);

  // After a successful stop, reload so the app re-renders as the admin (or login).
  useEffect(() => {
    if (stop.data?.stopped && typeof window !== 'undefined') {
      window.location.reload();
    }
  }, [stop.data]);

  if (status.data === undefined) {
    return (
      <span role="status" aria-live="polite" className="sr-only" data-testid="impersonation-banner-loading">
        {t('impersonationBanner.status.loading')}
      </span>
    );
  }

  if (!status.data.impersonatedBy) {
    return null;
  }

  const { stopping, failed } = deriveStopState(stop.state, stop.data);
  const account = status.data.email ?? t('impersonationBanner.account.fallback');

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex w-full flex-col flex-wrap items-stretch justify-center gap-2 border-y border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2 text-[13px] font-medium text-bolt-elements-textPrimary sm:flex-row sm:items-center sm:gap-x-4 sm:px-4"
      data-testid="impersonation-banner"
    >
      <span className="min-w-0 break-words text-center leading-5 sm:text-left">
        {t('impersonationBanner.message', { account })}
      </span>
      {failed ? (
        <span
          role="alert"
          className="min-w-0 break-words text-center text-[12px] font-semibold text-[var(--status-error-text)] sm:text-left"
          data-testid="impersonation-stop-error"
        >
          {t('impersonationBanner.stop.error')}
        </span>
      ) : null}
      <stop.Form method="post" action="/api/impersonation" className="flex shrink-0 justify-center">
        <button
          type="submit"
          disabled={stopping}
          aria-busy={stopping}
          className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[var(--status-warning-border)] bg-bolt-elements-background-depth-1 px-4 py-2 text-center text-[12px] font-semibold leading-4 text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] focus-visible:ring-offset-2 focus-visible:ring-offset-bolt-elements-background-depth-1 disabled:cursor-wait disabled:opacity-60"
        >
          {stopping ? t('impersonationBanner.stop.loading') : t('impersonationBanner.stop.action')}
        </button>
      </stop.Form>
    </div>
  );
}
