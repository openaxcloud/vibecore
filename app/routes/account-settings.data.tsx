import * as RadixDialog from '@radix-ui/react-dialog';
import { AlertTriangle, Download, ShieldAlert, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import type { MetaFunction } from 'react-router';
import { data as json } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation, useRevalidator } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { StatusPill } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import { Dialog, DialogTitle } from '~/components/ui/Dialog';
import {
  apiErrorMessage,
  apiRequest,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { isReauthRedirect, shouldRethrowActionError } from '~/lib/route-reauth';

export const meta: MetaFunction = () => [{ title: 'Data & privacy - E-Code' }];

type DeletionStatus = 'none' | 'requested' | 'grace_period' | 'ready_to_purge' | 'purged';

/**
 * Mirrors the API's `accountDeletionView` (services/api/src/app.ts → GET
 * `/account/deletion`). The endpoint records deletion *intent* with a 14-day
 * grace window during which the user can still cancel; the destructive purge
 * runs out-of-band. We only request / cancel / surface that intent here.
 */
type DeletionView = {
  status: DeletionStatus;
  canCancel: boolean;
  requestedAt: string | null;
  purgeDueAt: string | null;
  gracePeriodDays: number;
  scope: { deleted: string[]; retained: string[] };
};

/*
 * The delete dialog requires typing the account EMAIL (the User model has no
 * username — email is the unique human-readable identity). Compared
 * case-insensitively after trimming, and re-validated server-side in the
 * action so the client-side gate is never the only check.
 */
function emailConfirmMatches(confirm: string, email: string): boolean {
  return confirm.trim().toLowerCase() === email.trim().toLowerCase() && email.trim().length > 0;
}

const EXPORT_INCLUDES = [
  'Profile and account preferences',
  'Organizations and your membership roles',
  'Projects (names and metadata)',
  'API keys (names and prefixes only)',
  'Connected accounts (provider and status)',
  'Recent account activity',
] as const;

const EXPORT_EXCLUDES = [
  'Passwords and password hashes',
  'API key secrets',
  'OAuth / connection access tokens',
] as const;

export async function loader({ request }: EnterpriseLoaderArgs) {
  /*
   * Data export (GDPR right of access) is served FROM the loader, not a raw
   * browser anchor: the API base URL is server-only and the request must carry
   * the session cookie. We fetch the export over the same authenticated channel,
   * then stream it back as a downloadable attachment — mirroring the audit-log
   * export (app/routes/audit-logs.tsx). Triggered by `?export=data`.
   */
  const url = new URL(request.url);

  if (url.searchParams.get('export') === 'data') {
    const document = await apiRequest<unknown>(request, '/account/data-export', { redirectOn401: true });
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(JSON.stringify(document, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="ecode-data-export-${stamp}.json"`,
        'cache-control': 'no-store',
      },
    });
  }

  try {
    const [view, me] = await Promise.all([
      apiRequest<DeletionView>(request, '/account/deletion'),
      apiRequest<{ user?: { email?: string } }>(request, '/auth/me'),
    ]);

    return json({ view, email: me.user?.email ?? '', loadError: null });
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    return json({
      view: null,
      email: '',
      loadError: 'Data and privacy settings are temporarily unavailable.',
    });
  }
}

type ActionResult =
  | { ok: true; intent: 'request' | 'cancel'; view: DeletionView }
  | { ok: false; intent: string; error: string };

export async function action({ request }: EnterpriseActionArgs) {
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  try {
    if (intent === 'cancel') {
      await apiRequest(request, '/account/deletion/cancel', { method: 'POST' });

      // Re-read so the UI reflects authoritative server state after cancelling.
      const view = await apiRequest<DeletionView>(request, '/account/deletion');

      return json<ActionResult>({ ok: true, intent: 'cancel', view });
    }

    if (intent === 'request') {
      const confirm = String(form.get('confirm') ?? '');

      /*
       * Authoritative re-check against the CURRENT session's email (never a
       * hidden form field, which the client could tamper with).
       */
      const me = await apiRequest<{ user?: { email?: string } }>(request, '/auth/me');
      const email = me.user?.email ?? '';

      if (!emailConfirmMatches(confirm, email)) {
        return json<ActionResult>(
          { ok: false, intent, error: 'Type your account email exactly to confirm deletion.' },
          { status: 400 },
        );
      }

      const view = await apiRequest<DeletionView>(request, '/account/deletion', { method: 'POST' });

      return json<ActionResult>({ ok: true, intent: 'request', view });
    }

    return json<ActionResult>({ ok: false, intent, error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    /*
     * apiRequest throws a 3xx redirect Response when the session expired mid-flight
     * (login redirect on 401) or MFA is required, and a 5xx Response on server
     * failures — both must be re-thrown so the framework redirects / the error
     * boundary handles it rather than swallowing into a dead-end inline message.
     */
    if (shouldRethrowActionError(error)) {
      throw error;
    }

    return json<ActionResult>(
      { ok: false, intent, error: await apiErrorMessage(error, 'Could not update your deletion request.') },
      { status: 500 },
    );
  }
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : null;
}

const STATUS_LABEL: Record<DeletionStatus, string> = {
  none: 'Active',
  requested: 'Deletion requested',
  grace_period: 'Pending deletion',
  ready_to_purge: 'Deletion in progress',
  purged: 'Deleted',
};

export default function AccountDataPage() {
  const { view: loaderView, email, loadError } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionResult | undefined;
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const busy = navigation.state !== 'idle';
  const retrying = revalidator.state !== 'idle';
  const [confirmValue, setConfirmValue] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (loadError || !loaderView) {
    return (
      <div className="space-y-6">
        {retrying ? (
          <AsyncPanelSkeleton label="Loading data and privacy settings" rows={5} />
        ) : (
          <AsyncPanelError
            title="Data and privacy settings could not load"
            description="Account status, exports, and deletion controls are hidden because the latest request failed. No account data was changed."
            onRetry={revalidator.revalidate}
          />
        )}
      </div>
    );
  }

  // Prefer the freshest authoritative state returned by the action over the loader snapshot.
  const view = actionData?.ok ? actionData.view : loaderView;
  const failure = actionData && !actionData.ok ? actionData : null;

  // Failed deletion requests surface INSIDE the dialog; everything else banners at the top.
  const requestError = failure?.intent === 'request' ? failure.error : null;
  const error = failure && failure.intent !== 'request' ? failure.error : null;

  const pending = view.status === 'grace_period' || view.status === 'requested';
  const purgeDate = formatDate(view.purgeDueAt);
  const requestedDate = formatDate(view.requestedAt);
  const confirmOk = emailConfirmMatches(confirmValue, email);

  // Projected end of the grace window if the user confirms right now (approximate by design).
  const projectedPurgeDate = formatDate(
    new Date(Date.now() + view.gracePeriodDays * 24 * 60 * 60 * 1000).toISOString(),
  );

  return (
    <>
      <div className="space-y-6">
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-sm"
            style={{ color: 'var(--status-error-text)' }}
          >
            {error}
          </p>
        ) : null}

        {actionData?.ok && actionData.intent === 'cancel' ? (
          <p
            role="status"
            aria-live="polite"
            className="rounded-md border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-3 py-2 text-sm text-bolt-elements-textSecondary"
          >
            Account deletion cancelled. Your account stays active.
          </p>
        ) : null}

        {/* Current status */}
        <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Account status</h2>
            <StatusPill label={STATUS_LABEL[view.status]} />
          </div>

          {pending ? (
            <div className="mt-4 rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className="mt-0.5 h-5 w-5 shrink-0"
                  style={{ color: 'var(--status-warning-text)' }}
                  aria-hidden
                />
                <div className="min-w-0 text-sm text-bolt-elements-textSecondary">
                  <p className="font-medium text-bolt-elements-textPrimary">Your account is scheduled for deletion.</p>
                  <p className="mt-1">
                    {requestedDate ? `Requested ${requestedDate}. ` : null}
                    {purgeDate
                      ? `Your data will be permanently removed on ${purgeDate}.`
                      : `You have ${view.gracePeriodDays} days to cancel.`}
                  </p>
                </div>
              </div>

              {view.canCancel ? (
                <Form method="post" className="mt-4">
                  <input type="hidden" name="intent" value="cancel" />
                  <Button type="submit" variant="outline" disabled={busy} aria-busy={busy} className="gap-1.5">
                    <Undo2 className="h-4 w-4" aria-hidden />
                    {busy ? 'Cancelling…' : 'Cancel deletion request'}
                  </Button>
                </Form>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm text-bolt-elements-textSecondary">
              Your account is active. You can request deletion below.
            </p>
          )}
        </section>

        {/* What deletion removes / retains */}
        <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-bolt-elements-textPrimary">What gets deleted</h2>
          <p className="mt-1 text-sm text-bolt-elements-textSecondary">
            Deletion is permanent after a {view.gracePeriodDays}-day grace period. Some records are retained where the
            law requires it.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
              <p className="text-sm font-medium text-bolt-elements-textPrimary">Permanently removed</p>
              <ul className="mt-2 space-y-1 text-sm text-bolt-elements-textSecondary">
                {view.scope.deleted.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Trash2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bolt-elements-textTertiary" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
              <p className="text-sm font-medium text-bolt-elements-textPrimary">Retained (legal/financial)</p>
              <ul className="mt-2 space-y-1 text-sm text-bolt-elements-textSecondary">
                {view.scope.retained.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bolt-elements-textTertiary" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Download my data (GDPR export) */}
        <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Download my data</h2>
          <p className="mt-1 text-sm text-bolt-elements-textSecondary">
            Export a copy of your personal data as a JSON file. The export is generated server-side over your session —
            no secrets, tokens, or passwords are ever included.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
              <p className="text-sm font-medium text-bolt-elements-textPrimary">Included</p>
              <ul className="mt-2 space-y-1 text-sm text-bolt-elements-textSecondary">
                {EXPORT_INCLUDES.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Download className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bolt-elements-textTertiary" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
              <p className="text-sm font-medium text-bolt-elements-textPrimary">Never included</p>
              <ul className="mt-2 space-y-1 text-sm text-bolt-elements-textSecondary">
                {EXPORT_EXCLUDES.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bolt-elements-textTertiary" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <a
            href="/account-data?export=data"
            download
            data-testid="account-data-export"
            className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
          >
            <Download className="h-4 w-4" aria-hidden />
            Download my data (JSON)
          </a>
        </section>

        {/* Danger zone: request deletion (typed-confirmation dialog) */}
        {!pending ? (
          <section className="rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-5 shadow-sm sm:p-6">
            <h2 className="text-base font-semibold" style={{ color: 'var(--status-error-text)' }}>
              Delete account
            </h2>
            <p className="mt-1 text-sm text-bolt-elements-textSecondary">
              This schedules your account for permanent deletion. You can cancel within the {view.gracePeriodDays}-day
              grace period — sign back in and cancel from this page — after which it cannot be undone.
            </p>

            <button
              type="button"
              data-testid="account-delete-open"
              onClick={() => {
                setConfirmValue('');
                setDeleteOpen(true);
              }}
              style={{
                color: 'var(--status-error-text)',
                borderColor: 'color-mix(in srgb, var(--vc-ide-accent-error) 40%, transparent)',
              }}
              className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-md border px-4 text-sm font-medium transition-colors hover:bg-[var(--status-error-bg)]"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete account…
            </button>
          </section>
        ) : null}
      </div>

      {/*
       * Typed-confirmation dialog (same RadixDialog.Root + Dialog idiom as
       * app/routes/api-keys.tsx). The destructive submit stays disabled until
       * the user types their account email — the User model has no username.
       */}
      <RadixDialog.Root open={deleteOpen && !pending} onOpenChange={setDeleteOpen}>
        {deleteOpen && !pending ? (
          <Dialog onClose={() => setDeleteOpen(false)} onBackdrop={() => setDeleteOpen(false)}>
            <div className="p-6">
              <DialogTitle asChild>
                <h2 className="text-base font-semibold" style={{ color: 'var(--status-error-text)' }}>
                  Delete your account?
                </h2>
              </DialogTitle>
              <p className="mt-1 text-sm text-bolt-elements-textSecondary">
                Your account will be scheduled for permanent deletion after a {view.gracePeriodDays}-day grace period
                {projectedPurgeDate ? (
                  <>
                    {' '}
                    (on or after{' '}
                    <span className="font-medium text-bolt-elements-textPrimary">{projectedPurgeDate}</span>)
                  </>
                ) : null}
                . Until then you can sign back in and cancel from this page.
              </p>

              {requestError ? (
                <p
                  role="alert"
                  className="mt-3 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-sm"
                  style={{ color: 'var(--status-error-text)' }}
                >
                  {requestError}
                </p>
              ) : null}

              <Form method="post" className="mt-4 space-y-4">
                <input type="hidden" name="intent" value="request" />

                <div>
                  <label htmlFor="confirm" className="block text-sm font-medium text-bolt-elements-textPrimary">
                    Type <span className="font-mono font-semibold">{email}</span> to confirm
                  </label>
                  <input
                    id="confirm"
                    name="confirm"
                    type="text"
                    autoComplete="off"
                    autoFocus
                    value={confirmValue}
                    onChange={(event) => setConfirmValue(event.target.value)}
                    placeholder={email}
                    className="mt-1 min-h-[44px] w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:border-bolt-elements-focus focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteOpen(false)}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-bolt-elements-borderColor px-4 text-sm font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    data-testid="account-delete-confirm"
                    disabled={busy || !confirmOk}
                    aria-busy={busy}
                    style={{
                      color: 'var(--status-error-text)',
                      borderColor: 'color-mix(in srgb, var(--vc-ide-accent-error) 40%, transparent)',
                    }}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border px-4 text-sm font-medium transition-colors hover:bg-[var(--status-error-bg)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    {busy ? 'Requesting…' : 'Request account deletion'}
                  </button>
                </div>
              </Form>
            </div>
          </Dialog>
        ) : null}
      </RadixDialog.Root>
    </>
  );
}
