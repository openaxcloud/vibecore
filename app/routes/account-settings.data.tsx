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
import { apiRequest, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import {
  formatAccountDataDate,
  formatAccountDataPlural,
  getAccountDataPageCopy,
  interpolateAccountDataCopy,
  localizeDeletionScopeItem,
  resolveAccountDataActionErrorCode,
  type AccountDataActionErrorCode,
  type AccountDataActionIntent,
  type AccountDeletionStatus,
} from '~/lib/i18n/catalogs/account-data';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isReauthRedirect, shouldRethrowActionError } from '~/lib/route-reauth';

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const copy = getAccountDataPageCopy(data?.language).seo;

  return [{ title: copy.title }, { name: 'description', content: copy.description }];
};

/**
 * Mirrors the API's `accountDeletionView` (services/api/src/app.ts → GET
 * `/account/deletion`). The endpoint records deletion *intent* with a 14-day
 * grace window during which the user can still cancel; the destructive purge
 * runs out-of-band. We only request / cancel / surface that intent here.
 */
type DeletionView = {
  status: AccountDeletionStatus;
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

export async function loader({ request }: EnterpriseLoaderArgs) {
  /*
   * Data export (GDPR right of access) is served FROM the loader, not a raw
   * browser anchor: the API base URL is server-only and the request must carry
   * the session cookie. We fetch the export over the same authenticated channel,
   * then stream it back as a downloadable attachment — mirroring the audit-log
   * export (app/routes/audit-logs.tsx). Triggered by `?export=data`.
   */
  const url = new URL(request.url);
  const language = resolveRequestLocale(request).language;
  const copy = getAccountDataPageCopy(language);

  if (url.searchParams.get('export') === 'data') {
    const document = await apiRequest<unknown>(request, '/account/data-export', { redirectOn401: true });
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(JSON.stringify(document, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${copy.export.filenamePrefix}-${stamp}.json"`,
        'content-language': language,
        'cache-control': 'no-store',
      },
    });
  }

  try {
    const [view, me] = await Promise.all([
      apiRequest<DeletionView>(request, '/account/deletion'),
      apiRequest<{ user?: { email?: string } }>(request, '/auth/me'),
    ]);

    return json({ view, email: me.user?.email ?? '', loadError: false, language, loadedAt: new Date().toISOString() });
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    return json({
      view: null,
      email: '',
      loadError: true,
      language,
      loadedAt: new Date().toISOString(),
    });
  }
}

type ActionResult =
  | { ok: true; intent: 'request' | 'cancel'; view: DeletionView }
  | { ok: false; intent: AccountDataActionIntent; errorCode: AccountDataActionErrorCode };

export async function action({ request }: EnterpriseActionArgs) {
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const actionIntent: AccountDataActionIntent = intent === 'request' || intent === 'cancel' ? intent : 'unknown';

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
        return json<ActionResult>({ ok: false, intent: 'request', errorCode: 'confirmationMismatch' }, { status: 400 });
      }

      const view = await apiRequest<DeletionView>(request, '/account/deletion', { method: 'POST' });

      return json<ActionResult>({ ok: true, intent: 'request', view });
    }

    return json<ActionResult>({ ok: false, intent: 'unknown', errorCode: 'unknownAction' }, { status: 400 });
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

    if (error instanceof Response) {
      return json<ActionResult>(
        { ok: false, intent: actionIntent, errorCode: resolveAccountDataActionErrorCode(error.status, actionIntent) },
        { status: error.status },
      );
    }

    return json<ActionResult>({ ok: false, intent: actionIntent, errorCode: 'requestFailed' }, { status: 500 });
  }
}

export default function AccountDataPage() {
  const { view: loaderView, email, loadError, language, loadedAt } = useLoaderData<typeof loader>();
  const copy = getAccountDataPageCopy(language);
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
          <AsyncPanelSkeleton label={copy.load.loading} rows={5} />
        ) : (
          <AsyncPanelError
            title={copy.load.errorTitle}
            description={copy.load.errorDescription}
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
  const requestError = failure?.intent === 'request' ? copy.errors[failure.errorCode] : null;
  const error = failure && failure.intent !== 'request' ? copy.errors[failure.errorCode] : null;

  const deletionScheduled = view.status !== 'none';
  const cancellableWindow = view.status === 'grace_period' || view.status === 'requested';
  const purgeDate = view.purgeDueAt ? formatAccountDataDate(view.purgeDueAt, language) : null;
  const requestedDate = view.requestedAt ? formatAccountDataDate(view.requestedAt, language) : null;
  const confirmOk = emailConfirmMatches(confirmValue, email);
  const gracePeriodDays = Number.isFinite(view.gracePeriodDays) ? Math.max(0, view.gracePeriodDays) : 0;

  // Project from the loader timestamp to keep server rendering and hydration deterministic.
  const loadedAtMs = new Date(loadedAt).getTime();

  const projectedPurgeDate = Number.isFinite(loadedAtMs)
    ? formatAccountDataDate(loadedAtMs + gracePeriodDays * 24 * 60 * 60 * 1000, language)
    : null;
  const dialogDescription = formatAccountDataPlural(
    language,
    gracePeriodDays,
    projectedPurgeDate
      ? {
          one: copy.dialog.descriptionWithDate_one,
          other: copy.dialog.descriptionWithDate_other,
        }
      : {
          one: copy.dialog.descriptionWithoutDate_one,
          other: copy.dialog.descriptionWithoutDate_other,
        },
    projectedPurgeDate ? { date: projectedPurgeDate } : {},
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
            className="rounded-md border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-3 py-2 text-sm text-[var(--status-success-text)]"
          >
            {copy.success.cancellation}
          </p>
        ) : null}

        {/* Current status */}
        <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">{copy.status.title}</h2>
            <StatusPill label={copy.status.labels[view.status]} />
          </div>

          {deletionScheduled ? (
            <div className="mt-4 rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className="mt-0.5 h-5 w-5 shrink-0"
                  style={{ color: 'var(--status-warning-text)' }}
                  aria-hidden
                />
                <div className="min-w-0 text-sm text-bolt-elements-textSecondary">
                  {view.status === 'ready_to_purge' ? (
                    <>
                      <p className="break-words font-medium text-bolt-elements-textPrimary">{copy.status.readyTitle}</p>
                      <p className="mt-1 break-words leading-5">{copy.status.readyDescription}</p>
                    </>
                  ) : view.status === 'purged' ? (
                    <>
                      <p className="break-words font-medium text-bolt-elements-textPrimary">
                        {copy.status.purgedTitle}
                      </p>
                      <p className="mt-1 break-words leading-5">{copy.status.purgedDescription}</p>
                    </>
                  ) : (
                    <>
                      <p className="break-words font-medium text-bolt-elements-textPrimary">
                        {copy.status.scheduledTitle}
                      </p>
                      <p className="mt-1 break-words leading-5">
                        {requestedDate
                          ? `${interpolateAccountDataCopy(copy.status.requestedOn, { date: requestedDate })} `
                          : null}
                        {purgeDate
                          ? interpolateAccountDataCopy(copy.status.purgeOn, { date: purgeDate })
                          : formatAccountDataPlural(language, gracePeriodDays, {
                              one: copy.status.daysToCancel_one,
                              other: copy.status.daysToCancel_other,
                            })}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {cancellableWindow && view.canCancel ? (
                <Form method="post" className="mt-4">
                  <input type="hidden" name="intent" value="cancel" />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={busy}
                    aria-busy={busy}
                    className="min-h-[44px] w-full gap-1.5 whitespace-normal sm:w-auto"
                  >
                    <Undo2 className="h-4 w-4" aria-hidden />
                    {busy ? copy.status.cancelling : copy.status.cancelRequest}
                  </Button>
                </Form>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 break-words text-sm leading-5 text-bolt-elements-textSecondary">
              {copy.status.activeDescription}
            </p>
          )}
        </section>

        {/* What deletion removes / retains */}
        <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6">
          <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">{copy.deletion.title}</h2>
          <p className="mt-1 break-words text-sm leading-5 text-bolt-elements-textSecondary">
            {formatAccountDataPlural(language, gracePeriodDays, {
              one: copy.deletion.description_one,
              other: copy.deletion.description_other,
            })}
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
              <p className="break-words text-sm font-medium text-bolt-elements-textPrimary">
                {copy.deletion.permanentlyRemoved}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-bolt-elements-textSecondary">
                {view.scope.deleted.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Trash2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bolt-elements-textTertiary" aria-hidden />
                    <span className="min-w-0 break-words">{localizeDeletionScopeItem(item, 'deleted', language)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
              <p className="break-words text-sm font-medium text-bolt-elements-textPrimary">{copy.deletion.retained}</p>
              <ul className="mt-2 space-y-1 text-sm text-bolt-elements-textSecondary">
                {view.scope.retained.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bolt-elements-textTertiary" aria-hidden />
                    <span className="min-w-0 break-words">{localizeDeletionScopeItem(item, 'retained', language)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Download my data (GDPR export) */}
        <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6">
          <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">{copy.export.title}</h2>
          <p className="mt-1 break-words text-sm leading-5 text-bolt-elements-textSecondary">
            {copy.export.description}
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
              <p className="break-words text-sm font-medium text-bolt-elements-textPrimary">{copy.export.included}</p>
              <ul className="mt-2 space-y-1 text-sm text-bolt-elements-textSecondary">
                {copy.export.includes.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Download className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bolt-elements-textTertiary" aria-hidden />
                    <span className="min-w-0 break-words">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
              <p className="break-words text-sm font-medium text-bolt-elements-textPrimary">{copy.export.excluded}</p>
              <ul className="mt-2 space-y-1 text-sm text-bolt-elements-textSecondary">
                {copy.export.excludes.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bolt-elements-textTertiary" aria-hidden />
                    <span className="min-w-0 break-words">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <a
            href="/account-data?export=data"
            download
            data-testid="account-data-export"
            className="mt-4 inline-flex min-h-[44px] w-full min-w-0 items-center justify-center gap-1.5 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 text-center text-sm font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 sm:w-auto"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            <span className="break-words">{copy.export.download}</span>
          </a>
        </section>

        {/* Danger zone: request deletion (typed-confirmation dialog) */}
        {!deletionScheduled ? (
          <section className="rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-5 shadow-sm sm:p-6">
            <h2 className="break-words text-base font-semibold" style={{ color: 'var(--status-error-text)' }}>
              {copy.danger.title}
            </h2>
            <p className="mt-1 break-words text-sm leading-5 text-bolt-elements-textSecondary">
              {formatAccountDataPlural(language, gracePeriodDays, {
                one: copy.danger.description_one,
                other: copy.danger.description_other,
              })}
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
              className="mt-4 inline-flex min-h-[44px] w-full min-w-0 items-center justify-center gap-1.5 rounded-md border px-4 text-center text-sm font-medium transition-colors hover:bg-[var(--status-error-bg)] sm:w-auto"
            >
              <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
              <span className="break-words">{copy.danger.open}</span>
            </button>
          </section>
        ) : null}
      </div>

      {/*
       * Typed-confirmation dialog (same RadixDialog.Root + Dialog idiom as
       * app/routes/api-keys.tsx). The destructive submit stays disabled until
       * the user types their account email — the User model has no username.
       */}
      <RadixDialog.Root open={deleteOpen && !deletionScheduled} onOpenChange={setDeleteOpen}>
        {deleteOpen && !deletionScheduled ? (
          <Dialog onClose={() => setDeleteOpen(false)} onBackdrop={() => setDeleteOpen(false)}>
            <div className="p-6">
              <DialogTitle asChild>
                <h2 className="break-words text-base font-semibold" style={{ color: 'var(--status-error-text)' }}>
                  {copy.dialog.title}
                </h2>
              </DialogTitle>
              <p className="mt-1 break-words text-sm leading-5 text-bolt-elements-textSecondary">{dialogDescription}</p>

              {requestError ? (
                <p
                  role="alert"
                  className="mt-3 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-sm"
                  style={{ color: 'var(--status-error-text)' }}
                >
                  {requestError}
                </p>
              ) : null}

              <Form method="post" noValidate className="mt-4 space-y-4">
                <input type="hidden" name="intent" value="request" />

                <div>
                  <label
                    htmlFor="confirm"
                    className="block break-words text-sm font-medium leading-5 text-bolt-elements-textPrimary"
                  >
                    {copy.dialog.confirmPrefix} <span className="break-all font-mono font-semibold">{email}</span>{' '}
                    {copy.dialog.confirmSuffix}
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
                    className="mt-1 min-h-[44px] w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-[16px] text-bolt-elements-textPrimary focus:border-bolt-elements-focus focus:outline-none sm:text-sm"
                  />
                </div>

                <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setDeleteOpen(false)}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-bolt-elements-borderColor px-4 text-sm font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3"
                  >
                    {copy.dialog.cancel}
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
                    className="inline-flex min-h-[44px] min-w-0 items-center justify-center gap-1.5 rounded-md border px-4 text-center text-sm font-medium transition-colors hover:bg-[var(--status-error-bg)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="break-words">{busy ? copy.dialog.requesting : copy.dialog.requestDeletion}</span>
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
