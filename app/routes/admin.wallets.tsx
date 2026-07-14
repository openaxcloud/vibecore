import { useEffect, useRef, useState } from 'react';
import { useFetcher, useLoaderData } from 'react-router';
import { toast } from 'react-toastify';
import { EnterpriseFormPage, TextField, SelectField, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import { FieldError, fieldErrorProps } from '~/components/ui/FieldError';
import {
  apiRequest,
  formObject,
  json,
  requirePlatformAdmin,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { formatUserAreaDateTime, formatUserAreaNumber } from '~/lib/i18n/user-area-locale';

/*
 * Admin credit wallets — platform admins read every org's credit balance and
 * caps AND adjust a balance (credit / debit) here, instead of editing the DB by
 * hand. The adjustment appends an ADJUSTMENT CreditLedger entry (the audit
 * trail) and updates the materialized balance atomically server-side
 * (POST /admin/wallets/:organizationId/adjust — backend contract §10).
 *
 * Replaces the generic read-only DataPanel that /admin/:section renders for
 * `wallets`: this static route wins over admin.$section.tsx for /admin/wallets,
 * mirroring admin.stripe.tsx / admin.oauth-providers.tsx. Gated to platform-admin
 * plus a password step-up on adjust (the backend also enforces recent re-auth).
 */

type Wallet = {
  id: string;
  organizationId: string;
  balanceCents: number;
  currency: string;
  budgetCapCents?: number;
  serviceShutdownCents?: number;
  autoTopupCents?: number;
  createdAt: string;
  updatedAt: string;
};

function formatCents(cents: number | undefined, currency = 'USD') {
  if (cents == null) {
    return '—';
  }

  try {
    return formatUserAreaNumber(cents / 100, { style: 'currency', currency });
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  await requirePlatformAdmin(request);

  const data = await apiRequest<{ wallets: Wallet[] }>(request, '/admin/wallets');

  return json({ wallets: data.wallets ?? [] });
}

async function reauthenticate(request: Request, password: string) {
  try {
    await apiRequest(request, '/auth/reauth', {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify({ password }),
    });

    return undefined;
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      return 'Incorrect password. Re-enter your password to confirm this change.';
    }

    throw error;
  }
}

async function mutationError(error: unknown): Promise<string> {
  if (error instanceof Response) {
    const payload = (await error.json().catch(() => ({}))) as { error?: string; code?: string };

    if (payload.code === 'ADMIN_REAUTH_REQUIRED') {
      return 'Re-authentication expired. Enter your password and submit again.';
    }

    if (payload.code === 'PLATFORM_ADMIN_REQUIRED') {
      return 'This action requires a platform administrator account.';
    }

    return payload.error ?? 'The wallet adjustment could not be applied.';
  }

  return 'The admin service is not reachable. Please try again in a moment.';
}

export async function action({ request }: EnterpriseActionArgs) {
  await requirePlatformAdmin(request);

  const body = formObject(await request.formData()) as Record<string, string>;

  const organizationId = (body.organizationId ?? '').trim();
  const reason = (body.reason ?? '').trim();
  const direction = body.direction === 'debit' ? 'debit' : 'credit';
  const amount = Number.parseFloat(body.amount ?? '');

  if (!organizationId) {
    return json({ error: 'Choose an organization to adjust.' }, { status: 400 });
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return json({ error: 'Enter an amount greater than zero.' }, { status: 400 });
  }

  if (!reason) {
    return json({ error: 'Enter a reason — it is recorded in the audit trail.' }, { status: 400 });
  }

  if (!body.password) {
    return json({ error: 'Enter your password to confirm this change.' }, { status: 400 });
  }

  // Dollars (the admin types) → integer cents the backend expects. Sign by direction.
  const magnitudeCents = Math.round(amount * 100);

  if (magnitudeCents === 0) {
    return json({ error: 'The amount rounds to zero cents.' }, { status: 400 });
  }

  const deltaCents = direction === 'debit' ? -magnitudeCents : magnitudeCents;

  let reauthError: string | undefined;

  try {
    reauthError = await reauthenticate(request, body.password);
  } catch (error) {
    return json({ error: await mutationError(error) }, { status: 502 });
  }

  if (reauthError) {
    return json({ error: reauthError }, { status: 401 });
  }

  try {
    const result = await apiRequest<{ wallet: { organizationId: string; balanceCents: number } }>(
      request,
      `/admin/wallets/${encodeURIComponent(organizationId)}/adjust`,
      {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({ deltaCents, reason }),
      },
    );

    const verb = direction === 'debit' ? 'Debited' : 'Credited';

    return json({
      status: `${verb} ${formatCents(magnitudeCents)} — new balance ${formatCents(
        result.wallet.balanceCents,
      )} for ${organizationId}.`,
    });
  } catch (error) {
    return json({ error: await mutationError(error) }, { status: 403 });
  }
}

export default function AdminWalletsPage() {
  const { wallets } = useLoaderData<typeof loader>();

  /*
   * Fetcher (not <Form> navigation) so the Apply button shows a real loading
   * state and a success/error toast fires — mirrors the admin System-settings
   * Save pattern. A successful adjust also revalidates the loader, so the table
   * above re-renders the org's new balance without a manual refresh.
   */
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== 'idle';
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<unknown>(null);

  /*
   * F20: the reason is mandatory. We control it so the Apply button can be
   * disabled while it is empty/whitespace and an inline error can surface (after
   * the field is touched) — the backend enforces the same rule (400
   * WALLET_ADJUST_REASON_REQUIRED), this is the client-side guard.
   */
  const [reason, setReason] = useState('');
  const [reasonTouched, setReasonTouched] = useState(false);
  const reasonEmpty = reason.trim().length === 0;
  const reasonError = reasonTouched && reasonEmpty ? 'Enter a reason — it is recorded in the audit trail.' : null;

  const actionData = fetcher.data as { status?: string; error?: string } | undefined;

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data || fetcher.data === handled.current) {
      return;
    }

    handled.current = fetcher.data;

    const result = fetcher.data as { status?: string; error?: string };

    if (result.status) {
      toast.success(result.status);

      // Clear amount / reason / password after a successful adjustment.
      formRef.current?.reset();
      setReason('');
      setReasonTouched(false);
    } else if (result.error) {
      toast.error(result.error);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <EnterpriseFormPage
      title="Credit wallets"
      description="Per-organization credit balances, budget caps and service-shutdown limits. Adjust a balance below — credits and debits are recorded as an auditable ADJUSTMENT ledger entry and applied atomically."
      status={actionData?.status}
      error={actionData?.error}
    >
      <section className="space-y-6">
        <div className="overflow-x-auto rounded-lg border border-bolt-elements-borderColor">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-bolt-elements-textSecondary">
                <th className="px-3 py-2 font-medium">Organization</th>
                <th className="px-3 py-2 font-medium">Balance</th>
                <th className="px-3 py-2 font-medium">Budget cap</th>
                <th className="px-3 py-2 font-medium">Shutdown at</th>
                <th className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {wallets.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-bolt-elements-textSecondary" colSpan={5}>
                    No credit wallets yet.
                  </td>
                </tr>
              ) : (
                wallets.map((wallet) => (
                  <tr key={wallet.id} className="border-t border-bolt-elements-borderColor">
                    <td className="px-3 py-2 font-mono text-xs">{wallet.organizationId}</td>
                    <td className="px-3 py-2">{formatCents(wallet.balanceCents, wallet.currency)}</td>
                    <td className="px-3 py-2">{formatCents(wallet.budgetCapCents, wallet.currency)}</td>
                    <td className="px-3 py-2">{formatCents(wallet.serviceShutdownCents, wallet.currency)}</td>
                    <td className="px-3 py-2 text-xs text-bolt-elements-textSecondary">
                      {formatUserAreaDateTime(wallet.updatedAt) ?? 'Date unavailable'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <fetcher.Form
          ref={formRef}
          method="post"
          className="space-y-4 rounded-lg border border-bolt-elements-borderColor p-4"
          onSubmit={(event) => {
            // Block submit on an empty/whitespace reason and surface the inline error.
            if (reasonEmpty) {
              event.preventDefault();
              setReasonTouched(true);
            }
          }}
        >
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-bolt-elements-textSecondary">
            Adjust a balance
          </h2>

          <label className="block text-sm font-medium">
            Organization
            <input
              className="mt-2 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm outline-none focus:border-bolt-elements-focus"
              name="organizationId"
              list="wallet-org-ids"
              placeholder="organization id"
              required
            />
            <datalist id="wallet-org-ids">
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.organizationId} />
              ))}
            </datalist>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Direction"
              name="direction"
              defaultValue="credit"
              options={[
                { value: 'credit', label: 'Credit (add funds)' },
                { value: 'debit', label: 'Debit (remove funds)' },
              ]}
            />
            <TextField label="Amount (USD)" name="amount" type="number" placeholder="10.00" />
          </div>

          <label className="block text-sm font-medium">
            Reason (recorded in the audit trail)
            <input
              id="wallet-reason"
              className={`mt-2 w-full rounded-md border ${
                reasonError ? 'border-[var(--vc-ide-accent-error)]' : 'border-bolt-elements-borderColor'
              } bg-bolt-elements-background-depth-1 px-3 py-2 text-sm outline-none focus:border-bolt-elements-focus`}
              name="reason"
              placeholder="e.g. goodwill credit / manual correction"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              onBlur={() => setReasonTouched(true)}
              required
              {...fieldErrorProps('wallet-reason', reasonError)}
            />
            <FieldError fieldId="wallet-reason" error={reasonError} />
          </label>

          <TextField
            label="Confirm with your password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />

          <PrimaryButton type="submit" disabled={busy || reasonEmpty}>
            {busy ? 'Applying…' : 'Apply adjustment'}
          </PrimaryButton>
        </fetcher.Form>
      </section>
    </EnterpriseFormPage>
  );
}
