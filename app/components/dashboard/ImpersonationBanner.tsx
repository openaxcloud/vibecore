import { useEffect } from 'react';
import { useFetcher } from 'react-router';

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

export function ImpersonationBanner() {
  const status = useFetcher<ImpersonationState>();
  const stop = useFetcher<{ stopped: boolean }>();

  // Load impersonation status once on mount.
  useEffect(() => {
    if (status.state === 'idle' && status.data === undefined) {
      status.load('/api/impersonation');
    }
  }, [status]);

  // After a successful stop, reload so the app re-renders as the admin (or login).
  useEffect(() => {
    if (stop.data?.stopped && typeof window !== 'undefined') {
      window.location.reload();
    }
  }, [stop.data]);

  if (!status.data?.impersonatedBy) {
    return null;
  }

  const stopping = stop.state !== 'idle';

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex w-full items-center justify-center gap-3 px-4 py-2 text-[13px] font-medium text-white"
      style={{ background: 'var(--ecode-accent, #f26207)' }}
      data-testid="impersonation-banner"
    >
      <span>
        Viewing as <strong>{status.data.email ?? 'another user'}</strong> — admin impersonation session.
      </span>
      <stop.Form method="post" action="/api/impersonation">
        <button
          type="submit"
          disabled={stopping}
          className="rounded-full border border-white/40 bg-white/15 px-3 py-0.5 text-[12px] font-semibold text-white transition-colors hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {stopping ? 'Stopping…' : 'Stop impersonating'}
        </button>
      </stop.Form>
    </div>
  );
}
