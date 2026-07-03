import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { EnterpriseFormPage, TextField, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import { RelativeTime } from '~/components/ui/RelativeTime';
import {
  apiRequest,
  formObject,
  json,
  requirePlatformAdmin,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

/*
 * Admin Stripe configuration — a platform admin pastes the live secret key and
 * webhook signing secret here (write-only, encrypted at rest, never returned to
 * the browser) and edits the per-plan Stripe price IDs, instead of editing
 * values-prod.yaml + redeploying.
 *
 * Safe-by-design: billing reads this DB config FIRST and falls back to env, so an
 * empty form is a no-op — the current env-based behaviour is unchanged until a
 * value is saved. Saving rebuilds the Stripe client so the new key takes effect
 * without a redeploy. The secret fields are WRITE-ONLY: the loader exposes only
 * whether a secret is set (hasSecretKey / hasWebhookSecret), never the value.
 *
 * Gated to platform-admin like the rest of /admin/*, plus a password step-up on
 * save (mirrors /admin/oauth-providers).
 */

type PlanPrices = {
  key: string;
  name: string;
  stripeProductId: string;
  stripePriceId: string;
  stripePriceMonthlyId: string;
  stripePriceAnnualId: string;
};

type StripeConfigView = {
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
  envSecretKeyPresent: boolean;
  envWebhookSecretPresent: boolean;
  stripeConfigured: boolean;
  plans: PlanPrices[];
};

/*
 * E28 — a Stripe webhook whose processing threw. The api persists the full
 * event payload server-side (never sent to the browser); this view is the
 * metadata for the "Failed webhooks" health table.
 */
type WebhookFailure = {
  id: string;
  eventId: string;
  type: string;
  attempts: number;
  lastError: string;
  failedAt: string;
  resolvedAt?: string;
};

type ReplayResult = {
  eventId: string;
  type: string;
  ok: boolean;
  attempts?: number;
  error?: string;
};

export async function loader({ request }: EnterpriseLoaderArgs) {
  await requirePlatformAdmin(request);

  const [data, webhookHealth] = await Promise.all([
    apiRequest<StripeConfigView>(request, '/admin/stripe-config'),
    apiRequest<{ failures: WebhookFailure[] }>(request, '/admin/stripe/webhook-failures'),
  ]);

  return json({ ...data, webhookFailures: webhookHealth.failures });
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

async function mutationError(
  error: unknown,
  fallback = 'The Stripe configuration could not be saved.',
): Promise<string> {
  if (error instanceof Response) {
    const payload = (await error.json().catch(() => ({}))) as { error?: string; code?: string };

    if (payload.code === 'ADMIN_REAUTH_REQUIRED') {
      return 'Re-authentication expired. Enter your password and submit again.';
    }

    if (payload.code === 'PLATFORM_ADMIN_REQUIRED') {
      return 'This action requires a platform administrator account.';
    }

    return payload.error ?? fallback;
  }

  return 'The admin service is not reachable. Please try again in a moment.';
}

const PRICE_FIELDS = ['stripeProductId', 'stripePriceId', 'stripePriceMonthlyId', 'stripePriceAnnualId'] as const;

export async function action({ request }: EnterpriseActionArgs) {
  await requirePlatformAdmin(request);

  const body = formObject(await request.formData()) as Record<string, string>;

  /*
   * Webhook replay intents (E28). No password step-up: unlike the secret-key
   * form below, a replay handles no credential material — it re-runs an event
   * our own webhook handler already received. Platform-admin (checked above +
   * again by the api) is the gate.
   */
  if (body.intent === 'replay-webhook' || body.intent === 'replay-all-webhooks') {
    try {
      if (body.intent === 'replay-webhook') {
        if (!body.eventId) {
          return json({ error: 'Missing webhook event id.' }, { status: 400 });
        }

        const { result } = await apiRequest<{ result: ReplayResult }>(
          request,
          `/admin/stripe/webhook-failures/${encodeURIComponent(body.eventId)}/replay`,
          { method: 'POST', redirectOn401: false },
        );

        return result.ok
          ? json({ status: `Webhook ${result.eventId} replayed successfully.` })
          : json(
              { error: `Replay of ${result.eventId} failed again: ${result.error ?? 'unknown error'}` },
              { status: 502 },
            );
      }

      const summary = await apiRequest<{ replayed: number; failed: number }>(
        request,
        '/admin/stripe/webhook-failures/replay-all',
        { method: 'POST', redirectOn401: false },
      );

      if (summary.replayed === 0 && summary.failed === 0) {
        return json({ status: 'No failed webhooks to replay.' });
      }

      return summary.failed === 0
        ? json({ status: `Replayed ${summary.replayed} webhook${summary.replayed === 1 ? '' : 's'} successfully.` })
        : json(
            {
              error: `Replayed ${summary.replayed}, ${summary.failed} failed again — the table shows each last error.`,
            },
            { status: 502 },
          );
    } catch (error) {
      return json({ error: await mutationError(error, 'The webhook replay could not be completed.') }, { status: 502 });
    }
  }

  if (!body.password) {
    return json({ error: 'Enter your password to confirm this change.', field: 'password' }, { status: 400 });
  }

  let reauthError: string | undefined;

  try {
    reauthError = await reauthenticate(request, body.password);
  } catch (error) {
    return json({ error: await mutationError(error) }, { status: 502 });
  }

  if (reauthError) {
    return json({ error: reauthError }, { status: 401 });
  }

  /*
   * Reconstruct the per-plan price map from flat `price:<key>:<field>` inputs.
   * An empty string clears that price id; a field absent from the form is left
   * unchanged server-side.
   */
  const prices: Record<string, Record<string, string>> = {};

  for (const [name, value] of Object.entries(body)) {
    if (!name.startsWith('price:')) {
      continue;
    }

    const [, planKey, field] = name.split(':');

    if (!planKey || !PRICE_FIELDS.includes(field as (typeof PRICE_FIELDS)[number])) {
      continue;
    }

    (prices[planKey] ??= {})[field] = value;
  }

  // Only send a secret when the admin actually typed one (blank keeps the stored value).
  const payload: Record<string, unknown> = { prices };

  if (typeof body.secretKey === 'string' && body.secretKey.trim().length > 0) {
    payload.secretKey = body.secretKey.trim();
  }

  if (typeof body.webhookSecret === 'string' && body.webhookSecret.trim().length > 0) {
    payload.webhookSecret = body.webhookSecret.trim();
  }

  try {
    await apiRequest(request, '/admin/stripe-config', {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify(payload),
    });

    return json({ status: 'Stripe configuration saved.' });
  } catch (error) {
    return json({ error: await mutationError(error) }, { status: 403 });
  }
}

function StatusPill({ ok, set, fallback }: { ok: boolean; set: string; fallback: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${
        ok
          ? 'bg-[var(--vc-ide-accent-success)]/15 text-[var(--status-success-text)]'
          : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary'
      }`}
    >
      {ok ? set : fallback}
    </span>
  );
}

export default function AdminStripePage() {
  const config = useLoaderData<typeof loader>();

  const actionData = useActionData<typeof action>() as { status?: string; error?: string; field?: string } | undefined;

  const passwordError = actionData?.field === 'password' ? actionData.error : undefined;
  const navigation = useNavigation();
  const replaying = navigation.state !== 'idle' && navigation.formData?.get('intent')?.toString().startsWith('replay');

  return (
    <EnterpriseFormPage
      title="Stripe configuration"
      description="Paste the live Stripe secret key and webhook signing secret (stored encrypted, write-only) and set the per-plan price IDs. Billing reads these first and falls back to the API service's environment variables, so an empty field changes nothing."
      status={actionData?.status}
      error={actionData?.field ? undefined : actionData?.error}
    >
      <Form method="post" className="space-y-8">
        <section className="space-y-4 rounded-lg border border-bolt-elements-borderColor p-4">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-bolt-elements-textPrimary">Secrets</strong>
            <StatusPill ok={config.hasSecretKey} set="Secret key set" fallback="No DB secret key" />
            <StatusPill ok={config.hasWebhookSecret} set="Webhook secret set" fallback="No DB webhook secret" />
            <StatusPill ok={config.stripeConfigured} set="Stripe live" fallback="Stripe not configured" />
          </div>

          <p className="text-xs text-bolt-elements-textSecondary">
            Env fallback — secret key: {config.envSecretKeyPresent ? 'present' : 'absent'}; webhook secret:{' '}
            {config.envWebhookSecretPresent ? 'present' : 'absent'}. Saving a value here overrides the env fallback.
          </p>

          <TextField
            label={config.hasSecretKey ? 'Secret key (leave blank to keep current)' : 'Secret key (sk_live_…)'}
            name="secretKey"
            type="password"
            autoComplete="off"
            placeholder={config.hasSecretKey ? '•••••••• (unchanged)' : 'sk_live_…'}
          />
          <TextField
            label={
              config.hasWebhookSecret
                ? 'Webhook signing secret (leave blank to keep current)'
                : 'Webhook signing secret (whsec_…)'
            }
            name="webhookSecret"
            type="password"
            autoComplete="off"
            placeholder={config.hasWebhookSecret ? '•••••••• (unchanged)' : 'whsec_…'}
          />
        </section>

        <section className="space-y-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-bolt-elements-textSecondary">
            Plan price IDs
          </h2>

          {config.plans.length === 0 ? (
            <p className="text-sm text-bolt-elements-textSecondary">No billing plans found.</p>
          ) : (
            config.plans.map((plan) => (
              <div key={plan.key} className="space-y-3 rounded-lg border border-bolt-elements-borderColor p-4">
                <strong className="text-bolt-elements-textPrimary">
                  {plan.name} <span className="font-mono text-xs text-bolt-elements-textSecondary">({plan.key})</span>
                </strong>
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    label="Product ID"
                    name={`price:${plan.key}:stripeProductId`}
                    defaultValue={plan.stripeProductId}
                    placeholder="prod_…"
                  />
                  <TextField
                    label="Price ID (legacy / monthly fallback)"
                    name={`price:${plan.key}:stripePriceId`}
                    defaultValue={plan.stripePriceId}
                    placeholder="price_…"
                  />
                  <TextField
                    label="Monthly price ID"
                    name={`price:${plan.key}:stripePriceMonthlyId`}
                    defaultValue={plan.stripePriceMonthlyId}
                    placeholder="price_…"
                  />
                  <TextField
                    label="Annual price ID"
                    name={`price:${plan.key}:stripePriceAnnualId`}
                    defaultValue={plan.stripePriceAnnualId}
                    placeholder="price_…"
                  />
                </div>
              </div>
            ))
          )}
        </section>

        <section className="space-y-4 rounded-lg border border-bolt-elements-borderColor p-4">
          <TextField
            label="Confirm with your password"
            name="password"
            id="password"
            type="password"
            autoComplete="current-password"
            required
            error={passwordError}
          />
          <PrimaryButton>Save Stripe configuration</PrimaryButton>
        </section>
      </Form>

      {/*
       * E28 — webhook health. Failed deliveries are persisted server-side with
       * their payload; Replay re-runs the exact event through the same
       * processing path the live webhook uses (payload already verified at
       * delivery, so no signature check — the api endpoint is admin-gated).
       */}
      <section className="mt-8 space-y-4 rounded-lg border border-bolt-elements-borderColor p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-bolt-elements-textPrimary">Failed webhooks</strong>
            <StatusPill
              ok={config.webhookFailures.length === 0}
              set="All deliveries processed"
              fallback={`${config.webhookFailures.length} unresolved`}
            />
          </div>
          {config.webhookFailures.length > 0 ? (
            <Form method="post">
              <input type="hidden" name="intent" value="replay-all-webhooks" />
              <button
                type="submit"
                disabled={replaying}
                className="rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                style={{ color: 'var(--vc-ide-accent-action)' }}
              >
                {replaying ? 'Replaying…' : 'Replay all failed'}
              </button>
            </Form>
          ) : null}
        </div>

        <p className="text-xs text-bolt-elements-textSecondary">
          Stripe events whose processing threw after delivery. Replay re-runs the stored event through the same webhook
          processing path; a successful replay marks the row resolved.
        </p>

        {config.webhookFailures.length === 0 ? (
          <p className="text-sm text-bolt-elements-textSecondary">No failed webhooks.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.08em] text-bolt-elements-textSecondary">
                  <th className="py-2 pr-3 font-medium">Event</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">Attempts</th>
                  <th className="py-2 pr-3 font-medium">Last error</th>
                  <th className="py-2 pr-3 font-medium">Failed</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {config.webhookFailures.map((failure) => (
                  <tr key={failure.eventId} className="border-t border-bolt-elements-borderColor align-top">
                    <td className="py-2 pr-3 font-mono text-xs text-bolt-elements-textPrimary">{failure.eventId}</td>
                    <td className="py-2 pr-3 text-xs">{failure.type}</td>
                    <td className="py-2 pr-3 text-xs">{failure.attempts}</td>
                    <td className="py-2 pr-3">
                      <div
                        className="max-w-[16rem] truncate text-xs"
                        title={failure.lastError}
                        style={{ color: 'var(--status-error-text)' }}
                      >
                        {failure.lastError}
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-xs text-bolt-elements-textSecondary">
                      <RelativeTime value={failure.failedAt} />
                    </td>
                    <td className="py-2">
                      <Form method="post">
                        <input type="hidden" name="intent" value="replay-webhook" />
                        <input type="hidden" name="eventId" value={failure.eventId} />
                        <button
                          type="submit"
                          disabled={replaying}
                          className="rounded-md border border-bolt-elements-borderColor px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ color: 'var(--vc-ide-accent-action)' }}
                        >
                          Replay
                        </button>
                      </Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </EnterpriseFormPage>
  );
}
