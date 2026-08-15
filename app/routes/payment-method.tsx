import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData } from 'react-router';
import { EnterpriseFormPage, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import { FieldError, fieldErrorProps } from '~/components/ui/FieldError';
import { requireBillingEnabled } from '~/lib/billing/require-billing-enabled.server';
import {
  apiRequest,
  firstOrganizationOrNull,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { billingEn, billingFr, type BillingMessageKey } from '~/lib/i18n/catalogs/billing';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { shouldRethrowActionError } from '~/lib/route-reauth';

type PaymentFeedback = {
  errorKey?: BillingMessageKey;
  successKey?: BillingMessageKey;
  values?: Record<string, string | number>;
  field?: 'billingEmail';
};

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: (data?.language === 'fr' ? billingFr : billingEn)['paymentMethod.meta.title'] },
];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader({ request }: EnterpriseLoaderArgs) {
  // KILL-SWITCH FACTURATION : à OFF cette surface n'existe pas (404 sec).
  requireBillingEnabled();

  const orgs = await apiRequest<{ organizations: Array<{ id: string; billingEmail?: string }> }>(request, '/orgs');
  const organization = orgs.organizations[0];

  if (!organization) {
    return redirect('/');
  }

  return json({
    billingEmail: organization.billingEmail ?? '',
    language: resolveRequestLocale(request).language,
  });
}

export async function action({ request }: EnterpriseActionArgs) {
  // KILL-SWITCH FACTURATION : à OFF cette surface n'existe pas (404 sec).
  requireBillingEnabled();

  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return json<PaymentFeedback>({ errorKey: 'paymentMethod.feedback.noOrganization' }, { status: 400 });
  }

  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'portal');

  try {
    if (intent === 'billing-email') {
      const email = String(form.get('billingEmail') ?? '').trim();

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json<PaymentFeedback>(
          { errorKey: 'paymentMethod.feedback.invalidEmail', field: 'billingEmail' },
          { status: 400 },
        );
      }

      await apiRequest(request, `/orgs/${organization.id}/billing/email`, {
        method: 'PATCH',
        body: JSON.stringify({ email: email || null }),
      });

      return json<PaymentFeedback>({
        successKey: email ? 'paymentMethod.feedback.emailSaved' : 'paymentMethod.feedback.emailCleared',
        values: email ? { email } : undefined,
      });
    }

    const result = await apiRequest<{ portalUrl: string }>(request, `/orgs/${organization.id}/billing/portal`, {
      method: 'POST',
      body: JSON.stringify({ returnUrl: new URL('/payment-method', request.url).toString() }),
    });

    return redirect(result.portalUrl);
  } catch (error) {
    /* Preserve login/MFA redirects and route-boundary handling for server failures. */
    if (shouldRethrowActionError(error)) {
      throw error;
    }

    if (!isApiResponse(error)) {
      console.error('Failed to update payment settings:', error);
    }

    return json<PaymentFeedback>(
      {
        errorKey:
          intent === 'billing-email'
            ? 'paymentMethod.feedback.emailFailed'
            : isApiResponse(error)
              ? 'paymentMethod.feedback.portalUnavailable'
              : 'paymentMethod.feedback.actionUnavailable',
      },
      { status: isApiResponse(error) ? error.status : 503 },
    );
  }
}

export default function PaymentMethodPage() {
  const { t } = useTranslation();
  const { billingEmail } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as PaymentFeedback | undefined;
  const actionError = actionData?.errorKey ? t(actionData.errorKey, actionData.values) : undefined;
  const actionStatus = actionData?.successKey ? t(actionData.successKey, actionData.values) : undefined;
  const billingEmailError = actionData?.field === 'billingEmail' ? actionError : undefined;

  return (
    <EnterpriseFormPage
      title={t('paymentMethod.page.title')}
      description={t('paymentMethod.page.description')}
      status={actionStatus}
      error={actionData?.field ? undefined : actionError}
    >
      <div className="space-y-8">
        <Form method="post" reloadDocument>
          <input type="hidden" name="intent" value="portal" />
          <PrimaryButton type="submit">{t('paymentMethod.manage')}</PrimaryButton>
        </Form>

        <Form method="post" className="max-w-md space-y-3">
          <input type="hidden" name="intent" value="billing-email" />
          <label className="grid gap-2 text-sm font-medium">
            {t('paymentMethod.emailLabel')}
            <input
              id="billingEmail"
              name="billingEmail"
              type="email"
              defaultValue={billingEmail}
              placeholder={t('paymentMethod.emailPlaceholder')}
              className={`h-11 rounded-md border ${
                billingEmailError ? 'border-[var(--vc-ide-accent-error)]' : 'border-bolt-elements-borderColor'
              } bg-bolt-elements-background-depth-1 px-3 text-[16px] outline-none focus:border-bolt-elements-focus sm:text-sm`}
              {...fieldErrorProps('billingEmail', billingEmailError)}
            />
            <FieldError fieldId="billingEmail" error={billingEmailError} />
          </label>
          <p className="text-xs text-bolt-elements-textSecondary">{t('paymentMethod.emailHelp')}</p>
          <PrimaryButton type="submit">{t('paymentMethod.saveEmail')}</PrimaryButton>
        </Form>
      </div>
    </EnterpriseFormPage>
  );
}
