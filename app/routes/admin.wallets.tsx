import { Form, useActionData, useLoaderData } from 'react-router';
import { EnterpriseFormPage, TextField, SelectField, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  formObject,
  json,
  requirePlatformAdmin,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

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
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
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
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;

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
                      {new Date(wallet.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Form method="post" className="space-y-4 rounded-lg border border-bolt-elements-borderColor p-4">
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

          <TextField
            label="Reason (recorded in the audit trail)"
            name="reason"
            placeholder="e.g. goodwill credit / manual correction"
            required
          />

          <TextField
            label="Confirm with your password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />

          <PrimaryButton>Apply adjustment</PrimaryButton>
        </Form>
      </section>
    </EnterpriseFormPage>
  );
}
