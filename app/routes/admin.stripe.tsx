import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  formObject,
  json,
  requirePlatformAdmin,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  adminStripeInlineStatus,
  formatAdminStripeAttemptCount,
  formatAdminStripeCopy,
  formatAdminStripeDateTime,
  formatAdminStripeError,
  formatAdminStripeStatus,
  formatAdminStripeWebhookCount,
  getAdminStripeCopy,
  resolveAdminStripeErrorCode,
  type AdminStripeMessageData,
} from '~/lib/i18n/catalogs/admin-stripe';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';

/*
 * Platform-admin Stripe configuration. Secrets are write-only and encrypted by
 * the API; this route only receives presence flags. Blank secret fields keep
 * the stored values. Webhook payloads and raw processing errors stay server-side.
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

type WebhookFailure = {
  id: string;
  eventId: string;
  type: string;
  attempts: number;
  lastError: string;
  failedAt: string;
  resolvedAt?: string;
};

type WebhookFailureView = Omit<WebhookFailure, 'lastError'>;

type ReplayResult = {
  eventId: string;
  type: string;
  ok: boolean;
  attempts?: number;
  error?: string;
};

type ActionData = AdminStripeMessageData & {
  field?: 'password';
};

const PRICE_FIELDS = ['stripeProductId', 'stripePriceId', 'stripePriceMonthlyId', 'stripePriceAnnualId'] as const;

function maskWebhookFailure(failure: WebhookFailure): WebhookFailureView {
  return {
    id: failure.id,
    eventId: failure.eventId,
    type: failure.type,
    attempts: failure.attempts,
    failedAt: failure.failedAt,
    ...(failure.resolvedAt ? { resolvedAt: failure.resolvedAt } : {}),
  };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const copy = getAdminStripeCopy(data?.language);

  return [
    { title: copy['adminStripe.meta.title'] },
    { name: 'description', content: copy['adminStripe.meta.description'] },
  ];
};

export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader({ request }: EnterpriseLoaderArgs) {
  await requirePlatformAdmin(request);

  const language = resolveRequestLocale(request).language;

  const [data, webhookHealth] = await Promise.all([
    apiRequest<StripeConfigView>(request, '/admin/stripe-config'),
    apiRequest<{ failures: WebhookFailure[] }>(request, '/admin/stripe/webhook-failures'),
  ]);

  return json({
    ...data,
    plans: data.plans ?? [],
    webhookFailures: (webhookHealth.failures ?? []).map(maskWebhookFailure),
    language,
  });
}

async function reauthenticate(request: Request, password: string) {
  await apiRequest(request, '/auth/reauth', {
    method: 'POST',
    redirectOn401: false,
    body: JSON.stringify({ password }),
  });
}

function safeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export async function action({ request }: EnterpriseActionArgs) {
  await requirePlatformAdmin(request);

  const body = formObject(await request.formData()) as Record<string, string>;

  /* Replays operate only on previously verified, server-stored Stripe events. */
  if (body.intent === 'replay-webhook' || body.intent === 'replay-all-webhooks') {
    if (body.intent === 'replay-webhook') {
      const eventId = body.eventId?.trim();

      if (!eventId) {
        return json<ActionData>({ errorCode: 'eventIdRequired' }, { status: 400 });
      }

      try {
        const { result } = await apiRequest<{ result: ReplayResult }>(
          request,
          `/admin/stripe/webhook-failures/${encodeURIComponent(eventId)}/replay`,
          { method: 'POST', redirectOn401: false },
        );

        return result.ok
          ? json<ActionData>({ statusCode: 'webhookReplayed', eventId })
          : json<ActionData>({ errorCode: 'replayFailed', eventId }, { status: 502 });
      } catch (error) {
        return json<ActionData>(
          { errorCode: await resolveAdminStripeErrorCode(error, 'replay'), eventId },
          { status: adminStripeInlineStatus(error) },
        );
      }
    }

    try {
      const summary = await apiRequest<{ replayed: number; failed: number }>(
        request,
        '/admin/stripe/webhook-failures/replay-all',
        { method: 'POST', redirectOn401: false },
      );

      const replayed = safeCount(summary.replayed);
      const failed = safeCount(summary.failed);

      if (replayed === 0 && failed === 0) {
        return json<ActionData>({ statusCode: 'noFailedWebhooks' });
      }

      return failed === 0
        ? json<ActionData>({ statusCode: 'webhooksReplayed', replayed })
        : json<ActionData>({ errorCode: 'partialReplay', replayed, failed }, { status: 502 });
    } catch (error) {
      return json<ActionData>(
        { errorCode: await resolveAdminStripeErrorCode(error, 'replay') },
        { status: adminStripeInlineStatus(error) },
      );
    }
  }

  if (!body.password) {
    return json<ActionData>({ errorCode: 'passwordRequired', field: 'password' }, { status: 400 });
  }

  try {
    await reauthenticate(request, body.password);
  } catch (error) {
    return json<ActionData>(
      { errorCode: await resolveAdminStripeErrorCode(error, 'reauth'), field: 'password' },
      { status: adminStripeInlineStatus(error) },
    );
  }

  /*
   * Rebuild the per-plan map from technical price:<plan>:<field> names. Empty
   * values deliberately clear an ID; absent fields remain unchanged server-side.
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

    return json<ActionData>({ statusCode: 'configurationSaved' });
  } catch (error) {
    return json<ActionData>(
      { errorCode: await resolveAdminStripeErrorCode(error, 'save') },
      { status: adminStripeInlineStatus(error) },
    );
  }
}

function StatusPill({ ok, set, fallback }: { ok: boolean; set: string; fallback: string }) {
  return (
    <span
      className={`inline-flex max-w-full whitespace-normal break-words rounded-full px-2 py-0.5 text-left text-xs leading-snug ${
        ok
          ? 'bg-[color-mix(in_srgb,var(--vc-ide-accent-success)_15%,transparent)] text-[var(--status-success-text)]'
          : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary'
      }`}
    >
      {ok ? set : fallback}
    </span>
  );
}

export default function AdminStripePage() {
  const config = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const copy = getAdminStripeCopy(config.language);
  const status = formatAdminStripeStatus(actionData ?? {}, config.language);
  const error = formatAdminStripeError(actionData ?? {}, config.language);
  const passwordError = actionData?.field === 'password' ? error : undefined;
  const navigation = useNavigation();
  const pendingIntent = navigation.formData?.get('intent')?.toString();
  const pendingEventId = navigation.formData?.get('eventId')?.toString();
  const busy = navigation.state !== 'idle';
  const savingConfiguration = busy && !pendingIntent;
  const replayingAll = busy && pendingIntent === 'replay-all-webhooks';
  const replayingEventId = busy && pendingIntent === 'replay-webhook' ? pendingEventId : undefined;

  return (
    <EnterpriseFormPage
      title={copy['adminStripe.page.title']}
      description={copy['adminStripe.page.description']}
      status={status}
      error={actionData?.field ? undefined : error}
    >
      <Form method="post" className="min-w-0 space-y-8">
        <section className="min-w-0 space-y-4 rounded-lg border border-bolt-elements-borderColor p-4">
          <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <strong className="break-words text-bolt-elements-textPrimary">
              {copy['adminStripe.section.secrets.title']}
            </strong>
            <StatusPill
              ok={config.hasSecretKey}
              set={copy['adminStripe.status.secretKeySet']}
              fallback={copy['adminStripe.status.secretKeyDatabaseMissing']}
            />
            <StatusPill
              ok={config.hasWebhookSecret}
              set={copy['adminStripe.status.webhookSecretSet']}
              fallback={copy['adminStripe.status.webhookSecretDatabaseMissing']}
            />
            <StatusPill
              ok={config.stripeConfigured}
              set={copy['adminStripe.status.live']}
              fallback={copy['adminStripe.status.notConfigured']}
            />
          </div>

          <p className="break-words text-xs leading-relaxed text-bolt-elements-textSecondary">
            {formatAdminStripeCopy(copy['adminStripe.environment.summary'], {
              secretKeyStatus:
                copy[config.envSecretKeyPresent ? 'adminStripe.environment.present' : 'adminStripe.environment.absent'],
              webhookSecretStatus:
                copy[
                  config.envWebhookSecretPresent ? 'adminStripe.environment.present' : 'adminStripe.environment.absent'
                ],
            })}
          </p>

          <TextField
            label={copy[config.hasSecretKey ? 'adminStripe.field.secretKeyKeep' : 'adminStripe.field.secretKey']}
            name="secretKey"
            type="password"
            autoComplete="off"
            placeholder={
              copy[
                config.hasSecretKey
                  ? 'adminStripe.field.secretKeepPlaceholder'
                  : 'adminStripe.field.secretKeyPlaceholder'
              ]
            }
          />
          <TextField
            label={
              copy[config.hasWebhookSecret ? 'adminStripe.field.webhookSecretKeep' : 'adminStripe.field.webhookSecret']
            }
            name="webhookSecret"
            type="password"
            autoComplete="off"
            placeholder={
              copy[
                config.hasWebhookSecret
                  ? 'adminStripe.field.secretKeepPlaceholder'
                  : 'adminStripe.field.webhookSecretPlaceholder'
              ]
            }
          />
        </section>

        <section className="min-w-0 space-y-6">
          <h2 className="break-words text-sm font-semibold uppercase tracking-[0.18em] text-bolt-elements-textSecondary">
            {copy['adminStripe.section.prices.title']}
          </h2>

          {config.plans.length === 0 ? (
            <p className="text-sm text-bolt-elements-textSecondary">{copy['adminStripe.section.prices.empty']}</p>
          ) : (
            config.plans.map((plan) => (
              <div key={plan.key} className="min-w-0 space-y-3 rounded-lg border border-bolt-elements-borderColor p-4">
                <strong className="block min-w-0 break-words text-bolt-elements-textPrimary">
                  {plan.name}{' '}
                  <span className="break-all font-mono text-xs text-bolt-elements-textSecondary">({plan.key})</span>
                </strong>
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <TextField
                    label={copy['adminStripe.field.productId']}
                    name={`price:${plan.key}:stripeProductId`}
                    defaultValue={plan.stripeProductId}
                    placeholder={copy['adminStripe.field.productIdPlaceholder']}
                  />
                  <TextField
                    label={copy['adminStripe.field.legacyPriceId']}
                    name={`price:${plan.key}:stripePriceId`}
                    defaultValue={plan.stripePriceId}
                    placeholder={copy['adminStripe.field.priceIdPlaceholder']}
                  />
                  <TextField
                    label={copy['adminStripe.field.monthlyPriceId']}
                    name={`price:${plan.key}:stripePriceMonthlyId`}
                    defaultValue={plan.stripePriceMonthlyId}
                    placeholder={copy['adminStripe.field.priceIdPlaceholder']}
                  />
                  <TextField
                    label={copy['adminStripe.field.annualPriceId']}
                    name={`price:${plan.key}:stripePriceAnnualId`}
                    defaultValue={plan.stripePriceAnnualId}
                    placeholder={copy['adminStripe.field.priceIdPlaceholder']}
                  />
                </div>
              </div>
            ))
          )}
        </section>

        <section className="min-w-0 space-y-4 rounded-lg border border-bolt-elements-borderColor p-4">
          <TextField
            label={copy['adminStripe.field.password']}
            name="password"
            id="password"
            type="password"
            autoComplete="current-password"
            required
            error={passwordError}
          />
          <div className="[&_button]:w-full [&_button]:max-w-full [&_button]:!whitespace-normal sm:[&_button]:w-auto">
            <PrimaryButton type="submit" disabled={busy}>
              {copy[savingConfiguration ? 'adminStripe.action.saving' : 'adminStripe.action.save']}
            </PrimaryButton>
          </div>
        </section>
      </Form>

      <section className="mt-8 min-w-0 space-y-4 rounded-lg border border-bolt-elements-borderColor p-4">
        <div className="flex min-w-0 flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <strong className="break-words text-bolt-elements-textPrimary">
              {copy['adminStripe.section.webhooks.title']}
            </strong>
            <StatusPill
              ok={config.webhookFailures.length === 0}
              set={copy['adminStripe.webhooks.status.healthy']}
              fallback={formatAdminStripeWebhookCount(config.webhookFailures.length, config.language)}
            />
          </div>
          {config.webhookFailures.length > 0 ? (
            <Form
              method="post"
              className="min-w-0 [&_button]:w-full [&_button]:!whitespace-normal sm:[&_button]:w-auto"
            >
              <input type="hidden" name="intent" value="replay-all-webhooks" />
              <button
                type="submit"
                disabled={busy}
                className="min-h-[44px] max-w-full rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                style={{ color: 'var(--vc-ide-accent-action)' }}
              >
                {copy[replayingAll ? 'adminStripe.action.replayingAll' : 'adminStripe.action.replayAll']}
              </button>
            </Form>
          ) : null}
        </div>

        <p className="break-words text-xs leading-relaxed text-bolt-elements-textSecondary">
          {copy['adminStripe.webhooks.description']}
        </p>

        {config.webhookFailures.length === 0 ? (
          <p className="text-sm text-bolt-elements-textSecondary">{copy['adminStripe.webhooks.empty']}</p>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="min-w-[52rem] table-fixed text-left text-sm">
              <caption className="sr-only">{copy['adminStripe.section.webhooks.title']}</caption>
              <thead>
                <tr className="text-xs uppercase tracking-[0.08em] text-bolt-elements-textSecondary">
                  <th className="w-40 py-2 pr-3 font-medium">{copy['adminStripe.webhooks.table.event']}</th>
                  <th className="w-32 py-2 pr-3 font-medium">{copy['adminStripe.webhooks.table.type']}</th>
                  <th className="w-24 py-2 pr-3 font-medium">{copy['adminStripe.webhooks.table.attempts']}</th>
                  <th className="w-56 py-2 pr-3 font-medium">{copy['adminStripe.webhooks.table.lastError']}</th>
                  <th className="w-40 py-2 pr-3 font-medium">{copy['adminStripe.webhooks.table.failedAt']}</th>
                  <th className="w-28 py-2 font-medium">
                    <span className="sr-only">{copy['adminStripe.webhooks.table.actions']}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {config.webhookFailures.map((failure) => {
                  const replayingThis = replayingEventId === failure.eventId;

                  return (
                    <tr key={failure.eventId} className="border-t border-bolt-elements-borderColor align-top">
                      <td className="break-all py-2 pr-3 font-mono text-xs text-bolt-elements-textPrimary">
                        {failure.eventId}
                      </td>
                      <td className="break-all py-2 pr-3 text-xs">{failure.type}</td>
                      <td className="break-words py-2 pr-3 text-xs">
                        {formatAdminStripeAttemptCount(failure.attempts, config.language)}
                      </td>
                      <td className="py-2 pr-3">
                        <div
                          className="max-w-full break-words text-xs leading-relaxed"
                          title={copy['adminStripe.webhooks.failure.masked']}
                          style={{ color: 'var(--status-error-text)' }}
                        >
                          {copy['adminStripe.webhooks.failure.masked']}
                        </div>
                      </td>
                      <td className="break-words py-2 pr-3 text-xs text-bolt-elements-textSecondary">
                        {formatAdminStripeDateTime(failure.failedAt, config.language)}
                      </td>
                      <td className="py-2">
                        <Form method="post" className="[&_button]:!whitespace-normal">
                          <input type="hidden" name="intent" value="replay-webhook" />
                          <input type="hidden" name="eventId" value={failure.eventId} />
                          <button
                            type="submit"
                            disabled={busy}
                            className="min-h-[44px] max-w-full rounded-md border border-bolt-elements-borderColor px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
                            style={{ color: 'var(--vc-ide-accent-action)' }}
                          >
                            {copy[replayingThis ? 'adminStripe.action.replaying' : 'adminStripe.action.replay']}
                          </button>
                        </Form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </EnterpriseFormPage>
  );
}
