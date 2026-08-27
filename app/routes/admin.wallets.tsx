import { Landmark, WalletCards } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { useFetcher, useLoaderData, useRevalidator } from 'react-router';
import { toast } from 'react-toastify';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { EnterpriseFormPage, PrimaryButton, SelectField, TextField } from '~/components/enterprise/EnterpriseFormPage';
import { FieldError, fieldErrorProps } from '~/components/ui/FieldError';
import {
  apiRequest,
  formObject,
  json,
  loginRedirectFromRequest,
  requirePlatformAdmin,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  adminWalletInlineStatus,
  formatAdminWalletCount,
  formatAdminWalletCurrency,
  formatAdminWalletDateTime,
  formatAdminWalletError,
  formatAdminWalletStatus,
  getAdminWalletsCopy,
  readAdminWalletApiCode,
  resolveAdminWalletErrorCode,
  resolveAdminWalletsLanguage,
  type AdminWalletActionData,
  type AdminWalletField,
  type AdminWalletsCopy,
  type AdminWalletsLanguage,
} from '~/lib/i18n/catalogs/admin-wallets';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isReauthRedirect } from '~/lib/route-reauth';

/*
 * Admin credit wallets — platform admins read every org's credit balance and
 * caps AND adjust a balance (credit / debit) here, instead of editing the DB by
 * hand. The adjustment appends an ADJUSTMENT CreditLedger entry (the audit
 * trail) and updates the materialized balance atomically server-side.
 */

type Wallet = {
  id: string;
  organizationId: string;
  balanceCents: number;
  currency: string;
  budgetCapCents?: number;
  serviceShutdownCents?: number;
  autoTopupCents?: number;
  createdAt?: string;
  updatedAt?: string;
};

const MAX_ORGANIZATION_ID_LENGTH = 256;
const MAX_REASON_LENGTH = 500;
const MAX_ADJUSTMENT_CENTS = 2_147_483_647;
const ADJUSTMENT_CURRENCY = 'USD';

function optionalCents(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) ? value : undefined;
}

function normalizeWallets(payload: unknown): Wallet[] | null {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { wallets?: unknown }).wallets)) {
    return null;
  }

  return (payload as { wallets: unknown[] }).wallets.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      return [];
    }

    const wallet = candidate as Partial<Wallet>;
    const balanceCents = optionalCents(wallet.balanceCents);
    const budgetCapCents = optionalCents(wallet.budgetCapCents);
    const serviceShutdownCents = optionalCents(wallet.serviceShutdownCents);
    const autoTopupCents = optionalCents(wallet.autoTopupCents);

    if (
      typeof wallet.id !== 'string' ||
      !wallet.id ||
      typeof wallet.organizationId !== 'string' ||
      !wallet.organizationId ||
      balanceCents === undefined
    ) {
      return [];
    }

    return [
      {
        id: wallet.id,
        organizationId: wallet.organizationId,
        balanceCents,
        currency: typeof wallet.currency === 'string' ? wallet.currency : ADJUSTMENT_CURRENCY,
        ...(budgetCapCents === undefined ? {} : { budgetCapCents }),
        ...(serviceShutdownCents === undefined ? {} : { serviceShutdownCents }),
        ...(autoTopupCents === undefined ? {} : { autoTopupCents }),
        ...(typeof wallet.createdAt === 'string' ? { createdAt: wallet.createdAt } : {}),
        ...(typeof wallet.updatedAt === 'string' ? { updatedAt: wallet.updatedAt } : {}),
      },
    ];
  });
}

function parseAdjustmentCents(
  rawAmount: string,
): { cents: number } | { errorCode: 'amountRequired' | 'amountInvalid' | 'amountPrecision' | 'amountTooLarge' } {
  const amount = rawAmount.trim();

  if (!amount) {
    return { errorCode: 'amountRequired' };
  }

  if (!/^\d+(?:[.,]\d+)?$/u.test(amount)) {
    return { errorCode: 'amountInvalid' };
  }

  const fraction = amount.split(/[.,]/u)[1];

  if (fraction && fraction.length > 2) {
    return { errorCode: 'amountPrecision' };
  }

  const numericAmount = Number(amount.replace(',', '.'));
  const cents = Math.round(numericAmount * 100);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || cents <= 0) {
    return { errorCode: 'amountInvalid' };
  }

  if (!Number.isSafeInteger(cents) || cents > MAX_ADJUSTMENT_CENTS) {
    return { errorCode: 'amountTooLarge' };
  }

  return { cents };
}

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const copy = getAdminWalletsCopy(data?.language ?? rootData?.language);
  const title = copy['adminWallets.meta.title'];
  const description = copy['adminWallets.meta.description'];

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
  await requirePlatformAdmin(request);

  const language = resolveAdminWalletsLanguage(resolveRequestLocale(request).language);

  try {
    const data = await apiRequest<unknown>(request, '/admin/wallets');
    const wallets = normalizeWallets(data);

    return json({
      wallets: wallets ?? [],
      walletsUnavailable: wallets === null,
      language,
    });
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    /* A permission drift belongs in the route boundary, not a retrying data panel. */
    if (error instanceof Response && (error.status === 401 || error.status === 403)) {
      throw error;
    }

    return json({ wallets: [] as Wallet[], walletsUnavailable: true, language });
  }
}

function actionError(
  errorCode: NonNullable<AdminWalletActionData['errorCode']>,
  field?: AdminWalletField,
  status = 400,
) {
  return json<AdminWalletActionData>({ errorCode, ...(field ? { field } : {}) }, { status });
}

async function reauthenticate(request: Request, password: string) {
  await apiRequest(request, '/auth/reauth', {
    method: 'POST',
    redirectOn401: false,
    body: JSON.stringify({ password }),
  });
}

async function shouldRedirectExpiredSession(error: unknown): Promise<boolean> {
  if (!(error instanceof Response)) {
    return false;
  }

  const code = await readAdminWalletApiCode(error);

  return code === 'SESSION_REQUIRED' || (error.status === 401 && code !== 'AUTH_INVALID_CREDENTIALS');
}

export async function action({ request }: EnterpriseActionArgs) {
  await requirePlatformAdmin(request);

  const body = formObject(await request.formData()) as {
    organizationId?: string;
    direction?: string;
    amount?: string;
    reason?: string;
    password?: string;
  };

  const organizationId = body.organizationId?.trim() ?? '';
  const reason = body.reason?.trim() ?? '';

  if (!organizationId) {
    return actionError('organizationRequired', 'organizationId');
  }

  if (!/^\S+$/u.test(organizationId) || organizationId.length > MAX_ORGANIZATION_ID_LENGTH) {
    return actionError('organizationInvalid', 'organizationId');
  }

  if (body.direction !== 'credit' && body.direction !== 'debit') {
    return actionError('directionInvalid');
  }

  const parsedAmount = parseAdjustmentCents(body.amount ?? '');

  if ('errorCode' in parsedAmount) {
    return actionError(parsedAmount.errorCode, 'amount');
  }

  if (!reason) {
    return actionError('reasonRequired', 'reason');
  }

  if (reason.length > MAX_REASON_LENGTH) {
    return actionError('reasonTooLong', 'reason');
  }

  if (!body.password) {
    return actionError('passwordRequired', 'password');
  }

  try {
    await reauthenticate(request, body.password);
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (await shouldRedirectExpiredSession(error)) {
      throw loginRedirectFromRequest(request);
    }

    return actionError(await resolveAdminWalletErrorCode(error, 'reauth'), 'password', adminWalletInlineStatus(error));
  }

  const deltaCents = body.direction === 'debit' ? -parsedAmount.cents : parsedAmount.cents;

  try {
    const result = await apiRequest<{ wallet?: { organizationId?: unknown; balanceCents?: unknown } }>(
      request,
      `/admin/wallets/${encodeURIComponent(organizationId)}/adjust`,
      {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({ deltaCents, reason }),
      },
    );

    const balanceCents = optionalCents(result.wallet?.balanceCents);

    if (balanceCents === undefined) {
      return actionError('serviceUnavailable', undefined, 502);
    }

    return json<AdminWalletActionData>({
      statusCode: body.direction === 'debit' ? 'debited' : 'credited',
      organizationId,
      amountCents: parsedAmount.cents,
      balanceCents,
      currency: ADJUSTMENT_CURRENCY,
    });
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (await shouldRedirectExpiredSession(error)) {
      throw loginRedirectFromRequest(request);
    }

    const errorCode = await resolveAdminWalletErrorCode(error, 'adjust');
    const field = errorCode === 'reasonRequired' ? 'reason' : undefined;

    return actionError(errorCode, field, adminWalletInlineStatus(error));
  }
}

function walletValues({
  wallet,
  copy,
  language,
}: {
  wallet: Wallet;
  copy: AdminWalletsCopy;
  language: AdminWalletsLanguage;
}) {
  return [
    {
      key: 'balance',
      label: copy['adminWallets.table.balance'],
      value: formatAdminWalletCurrency(wallet.balanceCents, wallet.currency, language),
    },
    {
      key: 'budget',
      label: copy['adminWallets.table.budgetCap'],
      value: formatAdminWalletCurrency(wallet.budgetCapCents, wallet.currency, language),
    },
    {
      key: 'shutdown',
      label: copy['adminWallets.table.shutdownAt'],
      value: formatAdminWalletCurrency(wallet.serviceShutdownCents, wallet.currency, language),
    },
    {
      key: 'updated',
      label: copy['adminWallets.table.updated'],
      value: formatAdminWalletDateTime(wallet.updatedAt, language),
    },
  ];
}

function WalletCollection({
  wallets,
  copy,
  language,
}: {
  wallets: Wallet[];
  copy: AdminWalletsCopy;
  language: AdminWalletsLanguage;
}) {
  if (wallets.length === 0) {
    return (
      <div className="flex min-w-0 items-start gap-3 p-5 sm:p-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
          <WalletCards className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="break-words text-sm font-semibold text-bolt-elements-textPrimary">
            {copy['adminWallets.wallets.emptyTitle']}
          </h3>
          <p className="mt-1 break-words text-sm leading-6 text-bolt-elements-textSecondary">
            {copy['adminWallets.wallets.emptyDescription']}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-bolt-elements-textSecondary">
              <th className="px-4 py-3 font-medium">{copy['adminWallets.table.organization']}</th>
              <th className="px-4 py-3 font-medium">{copy['adminWallets.table.balance']}</th>
              <th className="px-4 py-3 font-medium">{copy['adminWallets.table.budgetCap']}</th>
              <th className="px-4 py-3 font-medium">{copy['adminWallets.table.shutdownAt']}</th>
              <th className="px-4 py-3 font-medium">{copy['adminWallets.table.updated']}</th>
            </tr>
          </thead>
          <tbody>
            {wallets.map((wallet) => (
              <tr key={wallet.id} className="border-t border-bolt-elements-borderColor">
                <td className="max-w-72 break-all px-4 py-3 font-mono text-xs text-bolt-elements-textPrimary">
                  {wallet.organizationId}
                </td>
                {walletValues({ wallet, copy, language }).map((item) => (
                  <td key={item.key} className="whitespace-nowrap px-4 py-3 text-xs text-bolt-elements-textSecondary">
                    {item.value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-bolt-elements-borderColor md:hidden">
        {wallets.map((wallet) => (
          <li key={wallet.id} className="min-w-0 p-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
                <Landmark className="h-4 w-4" aria-hidden />
              </span>
              <code className="min-w-0 break-all pt-2 font-mono text-xs font-medium text-bolt-elements-textPrimary">
                {wallet.organizationId}
              </code>
            </div>
            <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              {walletValues({ wallet, copy, language }).map((item) => (
                <div key={item.key} className="min-w-0 rounded-md bg-bolt-elements-background-depth-1 p-3">
                  <dt className="break-words text-xs text-bolt-elements-textTertiary">{item.label}</dt>
                  <dd className="mt-1 break-words text-sm font-medium text-bolt-elements-textPrimary">{item.value}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function AdminWalletsPage() {
  const { wallets, walletsUnavailable, language: loaderLanguage } = useLoaderData<typeof loader>();
  const language = resolveAdminWalletsLanguage(loaderLanguage);
  const copy = getAdminWalletsCopy(language);
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const busy = fetcher.state !== 'idle';
  const retrying = revalidator.state !== 'idle';
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<unknown>(null);
  const [reason, setReason] = useState('');
  const [reasonTouched, setReasonTouched] = useState(false);
  const actionData = fetcher.data as AdminWalletActionData | undefined;
  const status = formatAdminWalletStatus(actionData ?? {}, language);
  const error = formatAdminWalletError(actionData ?? {}, language);
  const fieldError = (field: AdminWalletField) => (actionData?.field === field ? error : undefined);
  const reasonEmpty = reason.trim().length === 0;

  const reasonError =
    fieldError('reason') ?? (reasonTouched && reasonEmpty ? copy['adminWallets.error.reasonRequired'] : undefined);

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data || fetcher.data === handled.current) {
      return;
    }

    handled.current = fetcher.data;

    if (status) {
      toast.success(status);
      formRef.current?.reset();
      setReason('');
      setReasonTouched(false);
      revalidator.revalidate();
    } else if (error) {
      toast.error(error);
    }
  }, [error, fetcher.data, fetcher.state, revalidator, status]);

  return (
    <EnterpriseFormPage
      title={copy['adminWallets.page.title']}
      description={copy['adminWallets.page.description']}
      status={status}
      error={actionData?.field ? undefined : error}
    >
      <div className="min-w-0 space-y-7">
        <section className="min-w-0 overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-bolt-elements-borderColor px-4 py-3 sm:px-5">
            <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
              {copy['adminWallets.wallets.title']}
            </h2>
            {!walletsUnavailable ? (
              <span className="text-xs text-bolt-elements-textTertiary">
                {formatAdminWalletCount(wallets.length, language)}
              </span>
            ) : null}
          </div>

          {walletsUnavailable ? (
            retrying ? (
              <AsyncPanelSkeleton
                label={copy['adminWallets.wallets.loading']}
                rows={4}
                compact
                className="m-4 border-0 sm:m-5"
              />
            ) : (
              <AsyncPanelError
                title={copy['adminWallets.wallets.errorTitle']}
                description={copy['adminWallets.wallets.errorDescription']}
                retryLabel={copy['adminWallets.wallets.retry']}
                onRetry={() => revalidator.revalidate()}
                compact
                className="m-4 sm:m-5"
              />
            )
          ) : (
            <WalletCollection wallets={wallets} copy={copy} language={language} />
          )}
        </section>

        <fetcher.Form
          ref={formRef}
          method="post"
          aria-busy={busy}
          className="min-w-0 space-y-5 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-5"
          onSubmit={(event) => {
            if (reasonEmpty) {
              event.preventDefault();
              setReasonTouched(true);
            }
          }}
        >
          <div className="min-w-0 space-y-1">
            <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
              {copy['adminWallets.form.title']}
            </h2>
            <p className="break-words text-sm leading-6 text-bolt-elements-textSecondary">
              {copy['adminWallets.form.description']}
            </p>
          </div>

          <label className="block min-w-0 text-sm font-medium" htmlFor="wallet-organization-id">
            {copy['adminWallets.field.organization']}
            <input
              id="wallet-organization-id"
              className={`mt-2 min-h-[44px] w-full min-w-0 rounded-md border ${
                fieldError('organizationId')
                  ? 'border-[var(--vc-ide-accent-error)]'
                  : 'border-bolt-elements-borderColor'
              } bg-bolt-elements-background-depth-1 px-3 py-2 text-sm outline-none focus:border-bolt-elements-focus`}
              name="organizationId"
              list="wallet-org-ids"
              placeholder={copy['adminWallets.field.organizationPlaceholder']}
              required
              maxLength={MAX_ORGANIZATION_ID_LENGTH}
              autoComplete="off"
              {...fieldErrorProps('wallet-organization-id', fieldError('organizationId'))}
            />
            <datalist id="wallet-org-ids">
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.organizationId} />
              ))}
            </datalist>
            <FieldError fieldId="wallet-organization-id" error={fieldError('organizationId')} />
          </label>

          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <SelectField
              label={copy['adminWallets.field.direction']}
              name="direction"
              defaultValue="credit"
              options={[
                { value: 'credit', label: copy['adminWallets.direction.credit'] },
                { value: 'debit', label: copy['adminWallets.direction.debit'] },
              ]}
            />
            <label className="block min-w-0 text-sm font-medium" htmlFor="wallet-amount">
              {copy['adminWallets.field.amount']}
              <input
                id="wallet-amount"
                className={`mt-2 min-h-[44px] w-full min-w-0 rounded-md border ${
                  fieldError('amount') ? 'border-[var(--vc-ide-accent-error)]' : 'border-bolt-elements-borderColor'
                } bg-bolt-elements-background-depth-1 px-3 py-2 text-sm outline-none focus:border-bolt-elements-focus`}
                name="amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                placeholder={copy['adminWallets.field.amountPlaceholder']}
                required
                {...fieldErrorProps('wallet-amount', fieldError('amount'))}
              />
              <FieldError fieldId="wallet-amount" error={fieldError('amount')} />
            </label>
          </div>

          <label className="block min-w-0 text-sm font-medium" htmlFor="wallet-reason">
            {copy['adminWallets.field.reason']}
            <input
              id="wallet-reason"
              className={`mt-2 min-h-[44px] w-full min-w-0 rounded-md border ${
                reasonError ? 'border-[var(--vc-ide-accent-error)]' : 'border-bolt-elements-borderColor'
              } bg-bolt-elements-background-depth-1 px-3 py-2 text-sm outline-none focus:border-bolt-elements-focus`}
              name="reason"
              placeholder={copy['adminWallets.field.reasonPlaceholder']}
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
              onBlur={() => setReasonTouched(true)}
              required
              maxLength={MAX_REASON_LENGTH}
              {...fieldErrorProps('wallet-reason', reasonError)}
            />
            <FieldError fieldId="wallet-reason" error={reasonError} />
          </label>

          <TextField
            id="wallet-password"
            label={copy['adminWallets.field.password']}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            error={fieldError('password')}
          />

          <PrimaryButton type="submit" disabled={busy || reasonEmpty} aria-busy={busy}>
            <span className="break-words">
              {copy[busy ? 'adminWallets.action.applying' : 'adminWallets.action.apply']}
            </span>
          </PrimaryButton>
        </fetcher.Form>
      </div>
    </EnterpriseFormPage>
  );
}
