import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import { FieldError, fieldErrorProps } from '~/components/ui/FieldError';
import {
  apiRequest,
  formObject,
  json,
  requirePlatformAdmin,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  adminBillingInlineStatus,
  formatAdminBillingCopy,
  formatAdminBillingDate,
  formatAdminBillingError,
  formatAdminBillingMonthlyPrice,
  formatAdminBillingPlanCount,
  formatAdminBillingStatus,
  formatAdminBillingSubscriptionCount,
  getAdminBillingCopy,
  getAdminBillingSubscriptionStatus,
  resolveAdminBillingErrorCode,
  type AdminBillingErrorCode,
  type AdminBillingIntent,
  type AdminBillingMessageData,
} from '~/lib/i18n/catalogs/admin-billing';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';

type BillingPlan = {
  key: string;
  name: string;
  monthlyCents: number;
};

type BillingSubscription = {
  id: string;
  organizationId: string;
  planKey: string;
  status: string;
  externalId?: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd?: string;
};

type AdminBillingData = {
  plans: BillingPlan[];
  subscriptions: BillingSubscription[];
};

type BillingField = 'password' | 'orgId' | 'key' | 'limit' | 'planKey' | 'reason';

type ActionData = AdminBillingMessageData & {
  intent?: AdminBillingIntent;
  field?: BillingField;
};

const QUOTA_KEY_EXAMPLE = 'projects.count';

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const copy = getAdminBillingCopy(data?.language);

  return [
    { title: copy['adminBilling.meta.title'] },
    { name: 'description', content: copy['adminBilling.meta.description'] },
  ];
};

export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader({ request }: EnterpriseLoaderArgs) {
  await requirePlatformAdmin(request);

  const language = resolveRequestLocale(request).language;
  const data = await apiRequest<AdminBillingData>(request, '/admin/billing');

  return json({
    plans: data.plans ?? [],
    subscriptions: data.subscriptions ?? [],
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

function actionError(
  errorCode: AdminBillingErrorCode,
  intent?: AdminBillingIntent,
  field?: BillingField,
  status = 400,
) {
  return json<ActionData>(
    {
      errorCode,
      ...(intent ? { intent } : {}),
      ...(field ? { field } : {}),
    },
    { status },
  );
}

export async function action({ request }: EnterpriseActionArgs) {
  await requirePlatformAdmin(request);

  const body = formObject(await request.formData()) as {
    intent?: string;
    orgId?: string;
    key?: string;
    limit?: string;
    planKey?: string;
    reason?: string;
    password?: string;
  };

  const intent: AdminBillingIntent | undefined =
    body.intent === 'quota' || body.intent === 'plan' ? body.intent : undefined;

  if (!intent) {
    return actionError('invalidIntent');
  }

  if (!body.password) {
    return actionError('passwordRequired', intent, 'password');
  }

  const organizationId = body.orgId?.trim();

  let quotaLimit: number | undefined;

  if (!organizationId) {
    return actionError('organizationRequired', intent, 'orgId');
  }

  if (intent === 'plan') {
    if (!body.planKey) {
      return actionError('planRequired', intent, 'planKey');
    }

    if (!body.reason?.trim()) {
      return actionError('reasonRequired', intent, 'reason');
    }
  } else {
    if (!body.key?.trim()) {
      return actionError('quotaKeyRequired', intent, 'key');
    }

    if (body.limit === undefined || body.limit.trim() === '') {
      return actionError('limitRequired', intent, 'limit');
    }

    quotaLimit = Number(body.limit);

    if (!Number.isInteger(quotaLimit) || quotaLimit < 0) {
      return actionError('invalidLimit', intent, 'limit');
    }
  }

  try {
    await reauthenticate(request, body.password);
  } catch (error) {
    const errorCode = await resolveAdminBillingErrorCode(error, 'reauth');
    const field = errorCode === 'incorrectPassword' || errorCode === 'reauthExpired' ? 'password' : undefined;

    return actionError(errorCode, intent, field, adminBillingInlineStatus(error));
  }

  try {
    if (intent === 'plan') {
      await apiRequest(request, '/admin/plan-overrides', {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({
          organizationId,
          planKey: body.planKey,
          reason: body.reason,
        }),
      });

      return json<ActionData>({ statusCode: 'planCreated', intent });
    }

    const language = resolveRequestLocale(request).language;
    const copy = getAdminBillingCopy(language);

    await apiRequest(request, '/admin/quota-overrides', {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify({
        organizationId,
        key: body.key?.trim(),
        limit: quotaLimit,
        reason: body.reason?.trim() ? body.reason : copy['adminBilling.audit.defaultQuotaReason'],
      }),
    });

    return json<ActionData>({ statusCode: 'quotaCreated', intent });
  } catch (error) {
    return actionError(
      await resolveAdminBillingErrorCode(error, intent),
      intent,
      undefined,
      adminBillingInlineStatus(error),
    );
  }
}

function CountBadge({ children }: { children: string }) {
  return (
    <span className="inline-flex max-w-full whitespace-normal break-words rounded-full bg-bolt-elements-background-depth-2 px-2 py-0.5 text-left text-xs leading-snug text-bolt-elements-textSecondary">
      {children}
    </span>
  );
}

export default function AdminBillingPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();
  const copy = getAdminBillingCopy(data.language);
  const status = formatAdminBillingStatus(actionData ?? {}, data.language);
  const error = formatAdminBillingError(actionData ?? {}, data.language);
  const busy = navigation.state !== 'idle';
  const pendingIntent = navigation.formData?.get('intent')?.toString();
  const creatingQuota = busy && pendingIntent === 'quota';
  const applyingPlan = busy && pendingIntent === 'plan';

  const fieldError = (intent: AdminBillingIntent, field: BillingField) =>
    actionData?.intent === intent && actionData.field === field ? error : undefined;

  return (
    <EnterpriseFormPage
      title={copy['adminBilling.page.title']}
      description={copy['adminBilling.page.description']}
      status={status}
      error={actionData?.field ? undefined : error}
    >
      <div className="min-w-0 space-y-8">
        <section className="min-w-0 space-y-4 rounded-lg border border-bolt-elements-borderColor p-4">
          <div className="min-w-0 space-y-1">
            <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
              {copy['adminBilling.quota.title']}
            </h2>
            <p className="break-words text-xs leading-relaxed text-bolt-elements-textSecondary">
              {copy['adminBilling.quota.description']}
            </p>
          </div>
          <Form method="post" className="min-w-0 space-y-4">
            <input type="hidden" name="intent" value="quota" />
            <TextField
              label={copy['adminBilling.field.organizationId']}
              name="orgId"
              id="quota-org-id"
              required
              error={fieldError('quota', 'orgId')}
            />
            <TextField
              label={copy['adminBilling.field.quotaKey']}
              name="key"
              id="quota-key"
              placeholder={QUOTA_KEY_EXAMPLE}
              required
              error={fieldError('quota', 'key')}
            />
            <TextField
              label={copy['adminBilling.field.limit']}
              name="limit"
              id="quota-limit"
              type="number"
              required
              error={fieldError('quota', 'limit')}
            />
            <TextField
              label={copy['adminBilling.field.reason']}
              name="reason"
              placeholder={copy['adminBilling.field.quotaReasonPlaceholder']}
            />
            <TextField
              label={copy['adminBilling.field.password']}
              name="password"
              id="quota-password"
              type="password"
              autoComplete="current-password"
              required
              error={fieldError('quota', 'password')}
            />
            <div className="[&_button]:w-full [&_button]:max-w-full [&_button]:!whitespace-normal sm:[&_button]:w-auto">
              <PrimaryButton type="submit" disabled={busy}>
                {copy[creatingQuota ? 'adminBilling.action.creatingQuota' : 'adminBilling.action.createQuota']}
              </PrimaryButton>
            </div>
          </Form>
        </section>

        <section className="min-w-0 space-y-4 rounded-lg border border-bolt-elements-borderColor p-4">
          <div className="min-w-0 space-y-1">
            <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
              {copy['adminBilling.planOverride.title']}
            </h2>
            <p className="break-words text-xs leading-relaxed text-bolt-elements-textSecondary">
              {copy['adminBilling.planOverride.description']}
            </p>
          </div>
          <Form method="post" className="min-w-0 space-y-4">
            <input type="hidden" name="intent" value="plan" />
            <TextField
              label={copy['adminBilling.field.organizationId']}
              name="orgId"
              id="plan-org-id"
              required
              error={fieldError('plan', 'orgId')}
            />
            <label className="grid min-w-0 gap-1 text-sm" htmlFor="plan-key">
              <span className="break-words font-medium text-bolt-elements-textPrimary">
                {copy['adminBilling.field.plan']}
              </span>
              <select
                name="planKey"
                id="plan-key"
                required
                disabled={busy || data.plans.length === 0}
                className={`min-h-[44px] max-w-full rounded-md border ${
                  fieldError('plan', 'planKey')
                    ? 'border-[var(--vc-ide-accent-error)]'
                    : 'border-bolt-elements-borderColor'
                } bg-bolt-elements-background-depth-2 px-3 py-2 text-bolt-elements-textPrimary disabled:cursor-not-allowed disabled:opacity-60`}
                {...fieldErrorProps('plan-key', fieldError('plan', 'planKey'))}
              >
                {data.plans.length === 0 ? (
                  <option value="">{copy['adminBilling.field.planUnavailable']}</option>
                ) : (
                  data.plans.map((plan) => (
                    <option key={plan.key} value={plan.key}>
                      {formatAdminBillingCopy(copy['adminBilling.field.planOption'], {
                        name: plan.name,
                        price: formatAdminBillingMonthlyPrice(plan.monthlyCents, data.language),
                      })}
                    </option>
                  ))
                )}
              </select>
              <FieldError fieldId="plan-key" error={fieldError('plan', 'planKey')} />
            </label>
            <TextField
              label={copy['adminBilling.field.reason']}
              name="reason"
              id="plan-reason"
              placeholder={copy['adminBilling.field.planReasonPlaceholder']}
              required
              error={fieldError('plan', 'reason')}
            />
            <TextField
              label={copy['adminBilling.field.password']}
              name="password"
              id="plan-password"
              type="password"
              autoComplete="current-password"
              required
              error={fieldError('plan', 'password')}
            />
            <div className="[&_button]:w-full [&_button]:max-w-full [&_button]:!whitespace-normal sm:[&_button]:w-auto">
              <PrimaryButton type="submit" disabled={busy || data.plans.length === 0}>
                {copy[applyingPlan ? 'adminBilling.action.applyingPlan' : 'adminBilling.action.applyPlan']}
              </PrimaryButton>
            </div>
          </Form>
        </section>

        <section className="min-w-0 space-y-4 rounded-lg border border-bolt-elements-borderColor p-4">
          <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
              {copy['adminBilling.plans.title']}
            </h2>
            <CountBadge>{formatAdminBillingPlanCount(data.plans.length, data.language)}</CountBadge>
          </div>
          {data.plans.length === 0 ? (
            <p className="text-sm text-bolt-elements-textSecondary">{copy['adminBilling.plans.empty']}</p>
          ) : (
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {data.plans.map((plan) => (
                <article
                  key={plan.key}
                  className="min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3"
                >
                  <div className="flex min-w-0 flex-col items-start justify-between gap-2 sm:flex-row sm:gap-3">
                    <strong className="min-w-0 break-words text-bolt-elements-textPrimary">{plan.name}</strong>
                    <span className="break-words text-sm font-medium text-bolt-elements-textPrimary">
                      {formatAdminBillingMonthlyPrice(plan.monthlyCents, data.language)}
                    </span>
                  </div>
                  <code className="mt-2 block break-all text-xs text-bolt-elements-textSecondary">{plan.key}</code>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="min-w-0 space-y-4 rounded-lg border border-bolt-elements-borderColor p-4">
          <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
              {copy['adminBilling.subscriptions.title']}
            </h2>
            <CountBadge>{formatAdminBillingSubscriptionCount(data.subscriptions.length, data.language)}</CountBadge>
          </div>
          {data.subscriptions.length === 0 ? (
            <p className="text-sm text-bolt-elements-textSecondary">{copy['adminBilling.subscriptions.empty']}</p>
          ) : (
            <div className="max-w-full overflow-x-auto">
              <table className="min-w-[54rem] table-fixed text-left text-xs">
                <caption className="sr-only">{copy['adminBilling.subscriptions.title']}</caption>
                <thead>
                  <tr className="border-b border-bolt-elements-borderColor text-bolt-elements-textPrimary">
                    <th className="w-44 py-2 pr-3 font-medium">{copy['adminBilling.subscriptions.organization']}</th>
                    <th className="w-32 py-2 pr-3 font-medium">{copy['adminBilling.subscriptions.plan']}</th>
                    <th className="w-40 py-2 pr-3 font-medium">{copy['adminBilling.subscriptions.status']}</th>
                    <th className="w-48 py-2 pr-3 font-medium">{copy['adminBilling.subscriptions.stripeId']}</th>
                    <th className="w-40 py-2 pr-3 font-medium">{copy['adminBilling.subscriptions.periodEnd']}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subscriptions.map((subscription) => (
                    <tr
                      key={subscription.id}
                      className="border-b border-bolt-elements-borderColor align-top last:border-b-0"
                    >
                      <td className="break-all py-2 pr-3 font-mono text-bolt-elements-textPrimary">
                        {subscription.organizationId}
                      </td>
                      <td className="break-all py-2 pr-3">{subscription.planKey}</td>
                      <td className="break-words py-2 pr-3">
                        <span className="block">
                          {getAdminBillingSubscriptionStatus(subscription.status, data.language)}
                        </span>
                        {subscription.cancelAtPeriodEnd ? (
                          <span className="mt-1 block text-bolt-elements-textSecondary">
                            {copy['adminBilling.subscriptions.cancellationScheduled']}
                          </span>
                        ) : null}
                      </td>
                      <td className="break-all py-2 pr-3 font-mono">
                        {subscription.externalId ?? copy['adminBilling.subscriptions.manual']}
                      </td>
                      <td className="break-words py-2 pr-3">
                        {subscription.currentPeriodEnd
                          ? formatAdminBillingDate(subscription.currentPeriodEnd, data.language)
                          : copy['adminBilling.subscriptions.dateNotSet']}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </EnterpriseFormPage>
  );
}
