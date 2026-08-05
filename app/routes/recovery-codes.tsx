import { Check, Copy, KeyRound, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation, useRevalidator, useSubmit } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { EnterpriseFormPage, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import {
  apiRequest,
  formObject,
  json,
  loginRedirectFromRequest,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  formatRecoveryCodesCopy,
  formatRecoveryCodesRemaining,
  getRecoveryCodesCopy,
  recoveryCodesErrorCodeForStatus,
  recoveryCodesErrorMessage,
  recoveryCodesStatusMessage,
  resolveRecoveryCodesLanguage,
  type RecoveryCodesActionData,
} from '~/lib/i18n/catalogs/recovery-codes';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { formatUserAreaNumber } from '~/lib/i18n/user-area-locale';
import { isReauthRedirect } from '~/lib/route-reauth';

type RecoveryCodesStatus = { remaining: number; total?: number };

/** Below this many unused codes we nudge the user to regenerate. */
const LOW_REMAINING_THRESHOLD = 3;

function normalizeStatus(payload: unknown): RecoveryCodesStatus | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as { remaining?: unknown; total?: unknown };

  if (typeof candidate.remaining !== 'number' || !Number.isInteger(candidate.remaining) || candidate.remaining < 0) {
    return null;
  }

  const total =
    typeof candidate.total === 'number' && Number.isInteger(candidate.total) && candidate.total >= 0
      ? candidate.total
      : undefined;

  if (total !== undefined && total < candidate.remaining) {
    return null;
  }

  return { remaining: candidate.remaining, ...(total === undefined ? {} : { total }) };
}

async function apiResponseCode(error: Response): Promise<string | undefined> {
  try {
    const body = (await error.clone().json()) as { code?: unknown };

    return typeof body.code === 'string' ? body.code : undefined;
  } catch {
    return undefined;
  }
}

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const copy = getRecoveryCodesCopy(data?.language ?? rootData?.language);
  const title = copy['recoveryCodes.meta.title'];
  const description = copy['recoveryCodes.meta.description'];

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
  ];
};

export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const language = resolveRecoveryCodesLanguage(resolveRequestLocale(request).language);

  try {
    const result = await apiRequest<RecoveryCodesStatus>(request, '/auth/recovery-codes/status');
    const status = normalizeStatus(result);

    return json({ status, statusUnavailable: status === null, language });
  } catch (error) {
    /* A login / MFA re-auth redirect must navigate, not be swallowed into the page. */
    if (isReauthRedirect(error)) {
      throw error;
    }

    return json({ status: null as RecoveryCodesStatus | null, statusUnavailable: true, language });
  }
}

async function safeActionError(error: unknown, options?: { request: Request; passwordReauthStep: boolean }) {
  if (isReauthRedirect(error)) {
    throw error;
  }

  if (error instanceof Response) {
    const upstreamCode = await apiResponseCode(error);

    if (
      options?.passwordReauthStep &&
      (upstreamCode === 'SESSION_REQUIRED' || (error.status === 401 && upstreamCode !== 'AUTH_INVALID_CREDENTIALS'))
    ) {
      throw loginRedirectFromRequest(options.request);
    }

    const errorCode = recoveryCodesErrorCodeForStatus(error.status, upstreamCode);

    return json<RecoveryCodesActionData>({ errorCode }, { status: error.status });
  }

  return json<RecoveryCodesActionData>({ errorCode: 'unavailable' }, { status: 503 });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as { password?: string };
  const password = body.password ?? '';

  if (!password) {
    return json<RecoveryCodesActionData>({ errorCode: 'passwordRequired' }, { status: 400 });
  }

  /*
   * Recovery-code rotation requires a fresh password step-up. Perform the real
   * re-auth and rotation in one action so the UI never asks users to retry an
   * operation that was guaranteed to fail with REAUTH_REQUIRED.
   */
  try {
    await apiRequest(request, '/auth/reauth', {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify({ password }),
    });
  } catch (error) {
    return safeActionError(error, { request, passwordReauthStep: true });
  }

  try {
    const result = await apiRequest<{ codes?: unknown }>(request, '/auth/recovery-codes', { method: 'POST' });

    if (
      !Array.isArray(result.codes) ||
      result.codes.length === 0 ||
      !result.codes.every((code) => typeof code === 'string' && code.length > 0)
    ) {
      return json<RecoveryCodesActionData>({ errorCode: 'unavailable' }, { status: 502 });
    }

    return json<RecoveryCodesActionData>({ statusCode: 'rotated', codes: result.codes });
  } catch (error) {
    return safeActionError(error);
  }
}

function RecoveryCodeResult({ codes, language }: { codes: readonly string[]; language: 'en' | 'fr' }) {
  const copy = getRecoveryCodesCopy(language);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [codes]);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
    } catch {
      /* Clipboard access can be blocked; the selectable code list remains usable. */
    }
  };

  return (
    <section
      className="min-w-0 rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-4 sm:p-5"
      aria-labelledby="recovery-code-result-title"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--status-warning-border)]">
          <ShieldAlert className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="recovery-code-result-title"
            className="break-words text-base font-semibold text-bolt-elements-textPrimary"
          >
            {copy['recoveryCodes.result.title']}
          </h2>
          <p className="mt-1 break-words text-sm leading-6 text-bolt-elements-textSecondary">
            {copy['recoveryCodes.result.description']}
          </p>
        </div>
      </div>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2" data-testid="recovery-code-list">
        {codes.map((code) => (
          <code
            key={code}
            className="min-w-0 break-all rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-center font-mono text-sm tracking-wider text-bolt-elements-textPrimary"
          >
            {code}
          </code>
        ))}
      </div>
      <button
        type="button"
        onClick={() => void copyAll()}
        className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 whitespace-normal rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-center text-sm font-medium leading-tight text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 sm:w-auto"
      >
        {copied ? (
          <Check className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <Copy className="h-4 w-4 shrink-0" aria-hidden />
        )}
        <span className="break-words">
          {copy[copied ? 'recoveryCodes.result.copied' : 'recoveryCodes.result.copy']}
        </span>
      </button>
    </section>
  );
}

export default function RecoveryCodesPage() {
  const { status, statusUnavailable, language: loaderLanguage } = useLoaderData<typeof loader>();
  const language = resolveRecoveryCodesLanguage(loaderLanguage);
  const copy = getRecoveryCodesCopy(language);
  const submit = useSubmit();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [password, setPassword] = useState('');
  const [pendingPassword, setPendingPassword] = useState('');
  const actionData = useActionData<typeof action>() as RecoveryCodesActionData | undefined;
  const actionStatus = recoveryCodesStatusMessage(actionData?.statusCode, language);
  const actionError = recoveryCodesErrorMessage(actionData?.errorCode, language);
  const generating = navigation.state !== 'idle' && navigation.formMethod?.toLowerCase() === 'post';
  const retrying = revalidator.state !== 'idle';

  // After a rotation, the fresh set is authoritative while the status loader revalidates.
  const remaining = actionData?.codes ? actionData.codes.length : status?.remaining;
  const total = actionData?.codes ? actionData.codes.length : status?.total;
  const isZero = remaining === 0;
  const isLow = typeof remaining === 'number' && remaining > 0 && remaining <= LOW_REMAINING_THRESHOLD;

  const formattedRemaining =
    typeof remaining === 'number' ? formatUserAreaNumber(remaining, undefined, language) : undefined;

  const formattedTotal = typeof total === 'number' ? formatUserAreaNumber(total, undefined, language) : undefined;

  return (
    <EnterpriseFormPage
      title={copy['recoveryCodes.page.title']}
      description={copy['recoveryCodes.page.description']}
      status={actionStatus}
      error={actionError}
    >
      <div className="min-w-0 space-y-7">
        {statusUnavailable ? (
          retrying ? (
            <AsyncPanelSkeleton label={copy['recoveryCodes.status.loading']} rows={1} compact />
          ) : (
            <AsyncPanelError
              title={copy['recoveryCodes.status.errorTitle']}
              description={copy['recoveryCodes.status.errorDescription']}
              retryLabel={copy['recoveryCodes.status.retry']}
              onRetry={() => revalidator.revalidate()}
              compact
            />
          )
        ) : typeof remaining === 'number' ? (
          <section
            className={`inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 ${
              isZero
                ? 'border-[var(--status-error-border)] bg-[var(--status-error-bg)]'
                : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-1'
            }`}
            aria-label={formatRecoveryCodesRemaining(remaining, language)}
          >
            <span className="break-words text-sm font-semibold text-bolt-elements-textPrimary">
              {formatRecoveryCodesRemaining(remaining, language)}
            </span>
            {formattedRemaining && formattedTotal ? (
              <span className="text-xs text-bolt-elements-textSecondary">
                {formatRecoveryCodesCopy(copy['recoveryCodes.status.total'], {
                  remaining: formattedRemaining,
                  total: formattedTotal,
                })}
              </span>
            ) : null}
            {isZero ? (
              <span className="break-words text-xs font-medium text-[var(--status-error-text)]">
                {copy['recoveryCodes.status.none']}
              </span>
            ) : isLow ? (
              <span className="break-words text-xs font-medium text-bolt-elements-textPrimary">
                {copy['recoveryCodes.status.low']}
              </span>
            ) : null}
          </section>
        ) : null}

        <section className="min-w-0" aria-labelledby="recovery-code-explanation-title">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
              <KeyRound className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2
                id="recovery-code-explanation-title"
                className="break-words text-base font-semibold text-bolt-elements-textPrimary"
              >
                {copy['recoveryCodes.explanation.title']}
              </h2>
              <div className="mt-2 space-y-2 break-words text-sm leading-6 text-bolt-elements-textSecondary">
                <p>{copy['recoveryCodes.explanation.what']}</p>
                <p>
                  {formattedRemaining && formattedTotal
                    ? formatRecoveryCodesCopy(copy['recoveryCodes.explanation.current_known'], {
                        remaining: formattedRemaining,
                        total: formattedTotal,
                      })
                    : copy['recoveryCodes.explanation.current_unknown']}
                </p>
                <p>{copy['recoveryCodes.explanation.storage']}</p>
              </div>
            </div>
          </div>
        </section>

        <section
          className="min-w-0 border-t border-bolt-elements-borderColor pt-6"
          aria-labelledby="recovery-code-form-title"
        >
          <h2
            id="recovery-code-form-title"
            className="break-words text-base font-semibold text-bolt-elements-textPrimary"
          >
            {copy['recoveryCodes.form.title']}
          </h2>
          <p className="mt-1 break-words text-sm leading-6 text-bolt-elements-textSecondary">
            {copy['recoveryCodes.form.description']}
          </p>
          <Form
            method="post"
            className="mt-4 grid min-w-0 gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setPendingPassword(password);
              setConfirmRegenerate(true);
            }}
          >
            <label className="min-w-0 text-sm font-medium text-bolt-elements-textPrimary" htmlFor="recovery-password">
              {copy['recoveryCodes.form.password']}
              <input
                id="recovery-password"
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                placeholder={copy['recoveryCodes.form.passwordPlaceholder']}
                autoComplete="current-password"
                required
                disabled={generating}
                className="mt-2 min-h-[44px] min-w-0 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm outline-none focus:border-bolt-elements-focus disabled:cursor-wait disabled:opacity-60"
              />
            </label>
            <PrimaryButton type="submit" disabled={generating} aria-busy={generating}>
              <span className="break-words">
                {copy[generating ? 'recoveryCodes.form.busy' : 'recoveryCodes.form.submit']}
              </span>
            </PrimaryButton>
          </Form>
        </section>

        {actionData?.codes ? <RecoveryCodeResult codes={actionData.codes} language={language} /> : null}
      </div>

      <ConfirmationDialog
        isOpen={confirmRegenerate}
        onClose={() => {
          if (!generating) {
            setConfirmRegenerate(false);
            setPendingPassword('');
          }
        }}
        onConfirm={() => {
          if (generating) {
            return;
          }

          const confirmedPassword = pendingPassword;
          setConfirmRegenerate(false);
          setPendingPassword('');
          setPassword('');
          submit({ password: confirmedPassword }, { method: 'post' });
        }}
        title={copy['recoveryCodes.dialog.title']}
        description={copy['recoveryCodes.dialog.description']}
        confirmLabel={copy['recoveryCodes.dialog.confirm']}
        cancelLabel={copy['recoveryCodes.dialog.cancel']}
        variant="destructive"
        isLoading={generating}
      />
    </EnterpriseFormPage>
  );
}
