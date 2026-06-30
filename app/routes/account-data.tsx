import { AlertTriangle, ShieldAlert, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import type { MetaFunction } from 'react-router';
import { data as json } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { AppShell, StatusPill } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiErrorMessage,
  apiRequest,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { shouldRethrowActionError } from '~/lib/route-reauth';

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

const CONFIRM_PHRASE = 'DELETE';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const view = await apiRequest<DeletionView>(request, '/account/deletion');

  return json({ view });
}

type ActionResult = { ok: true; intent: 'request' | 'cancel'; view: DeletionView } | { ok: false; error: string };

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
      const confirm = String(form.get('confirm') ?? '').trim();

      if (confirm !== CONFIRM_PHRASE) {
        return json<ActionResult>(
          { ok: false, error: `Type ${CONFIRM_PHRASE} to confirm account deletion.` },
          { status: 400 },
        );
      }

      const view = await apiRequest<DeletionView>(request, '/account/deletion', { method: 'POST' });

      return json<ActionResult>({ ok: true, intent: 'request', view });
    }

    return json<ActionResult>({ ok: false, error: 'Unknown action.' }, { status: 400 });
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
      { ok: false, error: await apiErrorMessage(error, 'Could not update your deletion request.') },
      { status: 500 },
    );
  }
}

const dateFormat: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString(undefined, dateFormat) : null;
}

const STATUS_LABEL: Record<DeletionStatus, string> = {
  none: 'Active',
  requested: 'Deletion requested',
  grace_period: 'Pending deletion',
  ready_to_purge: 'Deletion in progress',
  purged: 'Deleted',
};

export default function AccountDataPage() {
  const { view: loaderView } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionResult | undefined;
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const [confirmValue, setConfirmValue] = useState('');

  // Prefer the freshest authoritative state returned by the action over the loader snapshot.
  const view = actionData?.ok ? actionData.view : loaderView;
  const error = actionData && !actionData.ok ? actionData.error : null;

  const pending = view.status === 'grace_period' || view.status === 'requested';
  const purgeDate = formatDate(view.purgeDueAt);
  const requestedDate = formatDate(view.requestedAt);
  const confirmOk = confirmValue.trim() === CONFIRM_PHRASE;

  return (
    <AppShell
      title="Data & privacy"
      description="Review what an account deletion removes, then request or cancel deletion of your account."
    >
      <div className="space-y-6">
        {error ? (
          <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        ) : null}

        {actionData?.ok && actionData.intent === 'cancel' ? (
          <p
            role="status"
            aria-live="polite"
            className="rounded-md border border-green-500/40 bg-green-500/5 px-3 py-2 text-sm text-bolt-elements-textSecondary"
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
            <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden />
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

        {/* Danger zone: request deletion */}
        {!pending ? (
          <section className="rounded-lg border border-red-500/40 bg-red-500/5 p-5 shadow-sm sm:p-6">
            <h2 className="text-base font-semibold text-red-400">Delete account</h2>
            <p className="mt-1 text-sm text-bolt-elements-textSecondary">
              This schedules your account for permanent deletion. You can cancel within the {view.gracePeriodDays}-day
              grace period, after which it cannot be undone.
            </p>

            <Form method="post" className="mt-4 space-y-4">
              <input type="hidden" name="intent" value="request" />

              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-bolt-elements-textPrimary">
                  Type <span className="font-mono font-semibold">{CONFIRM_PHRASE}</span> to confirm
                </label>
                <input
                  id="confirm"
                  name="confirm"
                  type="text"
                  autoComplete="off"
                  value={confirmValue}
                  onChange={(event) => setConfirmValue(event.target.value)}
                  placeholder={CONFIRM_PHRASE}
                  className="mt-1 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:border-bolt-elements-focus focus:outline-none sm:max-w-xs"
                />
              </div>

              <button
                type="submit"
                disabled={busy || !confirmOk}
                aria-busy={busy}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-red-500 px-4 text-sm font-medium text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {busy ? 'Requesting…' : 'Request account deletion'}
              </button>
            </Form>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
