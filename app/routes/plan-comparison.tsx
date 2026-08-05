import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useNavigation } from 'react-router';
import { EnterpriseFormPage } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  firstOrganizationOrNull,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { formatPlanQuotaCopy, getPlanQuotaCopy, type PlanQuotaKey } from '~/lib/i18n/catalogs/plan-quota';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isReauthRedirect } from '~/lib/route-reauth';

const PLAN_COMPARISON_CANONICAL_URL = 'https://e-code.ai/plan-comparison';

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getPlanQuotaCopy(language);
  const title = copy['planComparison.meta.title'];
  const description = copy['planComparison.meta.description'];

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: PLAN_COMPARISON_CANONICAL_URL },
    { property: 'og:locale', content: language === 'fr' ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: language === 'fr' ? 'en_US' : 'fr_FR' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { tagName: 'link', rel: 'canonical', href: PLAN_COMPARISON_CANONICAL_URL },
    {
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'en',
      href: `${PLAN_COMPARISON_CANONICAL_URL}?lang=en`,
    },
    {
      tagName: 'link',
      rel: 'alternate',
      hrefLang: 'fr',
      href: `${PLAN_COMPARISON_CANONICAL_URL}?lang=fr`,
    },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: PLAN_COMPARISON_CANONICAL_URL },
  ];
};

export function loader({ request }: EnterpriseLoaderArgs) {
  const localeResolution = resolveRequestLocale(request);

  return json({ language: localeResolution.language }, { headers: localeResponseHeaders(request, localeResolution) });
}

const PLANS = [
  {
    backendKey: 'free',
    nameKey: 'planComparison.plan.starter.name',
    summaryKey: 'planComparison.plan.starter.summary',
    action: 'downgrade',
  },
  {
    backendKey: 'pro',
    nameKey: 'planComparison.plan.core.name',
    summaryKey: 'planComparison.plan.core.summary',
    action: 'checkout',
  },
  {
    backendKey: 'team',
    nameKey: 'planComparison.plan.pro.name',
    summaryKey: 'planComparison.plan.pro.summary',
    action: 'checkout',
  },
  {
    backendKey: 'enterprise',
    nameKey: 'planComparison.plan.enterprise.name',
    summaryKey: 'planComparison.plan.enterprise.summary',
    action: 'sales',
  },
] as const;

const CHECKOUTABLE_PLAN_KEYS = new Set(['pro', 'team']);

type PlanComparisonErrorCode = 'organizationMissing' | 'invalidPlan' | 'checkoutUnavailable' | 'checkoutTemporary';

type PlanComparisonActionData = { errorCode: PlanComparisonErrorCode };

const ERROR_KEYS: Readonly<Record<PlanComparisonErrorCode, PlanQuotaKey>> = {
  organizationMissing: 'planComparison.error.organizationMissing',
  invalidPlan: 'planComparison.error.invalidPlan',
  checkoutUnavailable: 'planComparison.error.checkoutUnavailable',
  checkoutTemporary: 'planComparison.error.checkoutTemporary',
};

export async function action({ request }: EnterpriseActionArgs) {
  const localeResolution = resolveRequestLocale(request);

  const actionError = (errorCode: PlanComparisonErrorCode, status: number) =>
    json<PlanComparisonActionData>(
      { errorCode },
      { status, headers: localeResponseHeaders(request, localeResolution) },
    );

  const form = await request.formData();
  const planKey = String(form.get('planKey') ?? '');

  if (!CHECKOUTABLE_PLAN_KEYS.has(planKey)) {
    return actionError('invalidPlan', 400);
  }

  try {
    const organization = await firstOrganizationOrNull(request);

    if (!organization) {
      return actionError('organizationMissing', 400);
    }

    const result = await apiRequest<{ checkoutUrl: string }>(request, `/orgs/${organization.id}/billing/checkout`, {
      method: 'POST',
      body: JSON.stringify({
        planKey,
        successUrl: new URL('/billing', request.url).toString(),
        cancelUrl: new URL('/plan-comparison', request.url).toString(),
      }),
    });

    return redirect(result.checkoutUrl, { headers: localeResponseHeaders(request, localeResolution) });
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (isApiResponse(error)) {
      return actionError('checkoutUnavailable', error.status);
    }

    console.error(error);

    return actionError('checkoutTemporary', 503);
  }
}

const PLAN_ACTION_CLASS =
  'inline-flex min-h-11 w-full items-center justify-center whitespace-normal break-words rounded-md border border-bolt-elements-borderColor px-4 py-2 text-center text-sm font-medium text-bolt-elements-textPrimary transition-colors hover:border-bolt-elements-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-focus sm:w-auto';

const CHECKOUT_ACTION_CLASS =
  'inline-flex min-h-11 w-full items-center justify-center whitespace-normal break-words rounded-md bg-bolt-elements-button-primary-background px-4 py-2 text-center text-sm font-medium text-bolt-elements-button-primary-text transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-focus disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto';

export default function PlanComparisonPage() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getPlanQuotaCopy(language);
  const actionData = useActionData<typeof action>() as PlanComparisonActionData | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const submittingPlanKey = isSubmitting ? String(navigation.formData?.get('planKey') ?? '') : null;
  const submittingPlan = PLANS.find((plan) => plan.backendKey === submittingPlanKey);
  const error = actionData?.errorCode ? copy[ERROR_KEYS[actionData.errorCode]] : undefined;

  return (
    <EnterpriseFormPage
      title={copy['planComparison.page.title']}
      description={copy['planComparison.page.description']}
      error={error}
    >
      <div className="grid min-w-0 gap-3 text-sm">
        {PLANS.map((plan) => {
          const planName = copy[plan.nameKey];
          const isCurrentSubmission = submittingPlanKey === plan.backendKey;

          return (
            <section
              key={plan.backendKey}
              aria-labelledby={`plan-${plan.backendKey}-name`}
              className="flex min-w-0 flex-col gap-4 rounded-md border border-bolt-elements-borderColor p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <h2
                  id={`plan-${plan.backendKey}-name`}
                  className="break-words font-medium text-bolt-elements-textPrimary"
                >
                  {planName}
                </h2>
                <p className="break-words text-bolt-elements-textSecondary">{copy[plan.summaryKey]}</p>
              </div>
              {plan.action === 'downgrade' ? (
                <Link to="/downgrade" className={PLAN_ACTION_CLASS}>
                  {formatPlanQuotaCopy(copy['planComparison.action.choose'], { plan: planName })}
                </Link>
              ) : plan.action === 'sales' ? (
                <Link to="/contact-sales" className={PLAN_ACTION_CLASS}>
                  {copy['planComparison.action.sales']}
                </Link>
              ) : (
                <Form method="post" reloadDocument className="w-full shrink-0 sm:w-auto">
                  <input type="hidden" name="planKey" value={plan.backendKey} />
                  <button
                    type="submit"
                    className={CHECKOUT_ACTION_CLASS}
                    disabled={isSubmitting}
                    aria-busy={isCurrentSubmission}
                  >
                    {isCurrentSubmission
                      ? copy['planComparison.action.startingCheckout']
                      : formatPlanQuotaCopy(copy['planComparison.action.choose'], { plan: planName })}
                  </button>
                </Form>
              )}
            </section>
          );
        })}
      </div>
      {submittingPlan ? (
        <p role="status" className="sr-only">
          {formatPlanQuotaCopy(copy['planComparison.action.checkoutProgress'], {
            plan: copy[submittingPlan.nameKey],
          })}
        </p>
      ) : null}
    </EnterpriseFormPage>
  );
}
