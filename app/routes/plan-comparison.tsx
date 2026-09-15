import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData } from 'react-router';
import { EnterpriseFormPage, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiErrorMessage,
  apiRequest,
  firstOrganizationOrNull,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
} from '~/lib/enterprise-api.server';
import { shouldRethrowActionError } from '~/lib/route-reauth';

export const meta: MetaFunction = () => [{ title: 'Plan comparison - E-Code' }];

const PLANS = [
  { key: 'starter', name: 'Starter', summary: 'Free daily Agent credits, public apps and one published project.' },
  { key: 'core', name: 'Core', summary: '€25/mo of credits, 5 collaborators, any-region publishing.' },
  { key: 'pro', name: 'Pro', summary: 'The most powerful models, 10 parallel agents, 28-day DB rollbacks.' },
  {
    key: 'enterprise',
    name: 'Enterprise',
    summary: 'SSO, SCIM, custom quotas, audit export and private deployment options.',
  },
];

export async function action({ request }: EnterpriseActionArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return json({ error: 'No organization found for your account.' }, { status: 400 });
  }

  const form = await request.formData();

  try {
    const result = await apiRequest<{ checkoutUrl: string }>(request, `/orgs/${organization.id}/billing/checkout`, {
      method: 'POST',
      body: JSON.stringify({
        planKey: String(form.get('planKey') ?? 'core'),
        successUrl: new URL('/billing', request.url).toString(),
        cancelUrl: new URL('/plan-comparison', request.url).toString(),
      }),
    });

    return redirect(result.checkoutUrl);
  } catch (error) {
    /*
     * A re-auth redirect (3xx) or a server (5xx) Response must propagate so the
     * framework performs the login/MFA redirect or surfaces the error boundary,
     * rather than being swallowed into an inline message.
     */
    if (shouldRethrowActionError(error)) {
      throw error;
    }

    if (isApiResponse(error)) {
      return json(
        { error: await apiErrorMessage(error, 'Checkout is unavailable right now. Please try again later.') },
        { status: error.status },
      );
    }

    /*
     * Non-Response failures (request timeout via AbortSignal.timeout, DNS /
     * connection errors when the API pod is hung or draining) must not crash to
     * the route error boundary — keep the user on the plan-comparison page.
     */
    console.error('Failed to start plan checkout:', error);

    return json({ error: 'Checkout is temporarily unavailable. Please try again in a moment.' });
  }
}

export default function PlanComparisonPage() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="Plan comparison"
      description="Compare Free, Pro, Team and Enterprise capabilities."
      error={actionData?.error}
    >
      <div className="grid gap-3 text-sm">
        {PLANS.map((plan) => (
          <div
            key={plan.key}
            className="flex items-center justify-between gap-4 rounded-md border border-bolt-elements-borderColor p-4"
          >
            <div>
              <p className="font-medium text-bolt-elements-textPrimary">{plan.name}</p>
              <p className="text-bolt-elements-textSecondary">{plan.summary}</p>
            </div>
            {plan.key === 'free' ? (
              <Link
                to="/downgrade"
                className="shrink-0 rounded-md border border-bolt-elements-borderColor px-3 py-1.5 font-medium hover:border-bolt-elements-focus"
              >
                Choose Free
              </Link>
            ) : plan.key === 'enterprise' ? (
              <Link
                to="/contact-sales"
                className="shrink-0 rounded-md border border-bolt-elements-borderColor px-3 py-1.5 font-medium hover:border-bolt-elements-focus"
              >
                Talk to sales
              </Link>
            ) : (
              <Form method="post" reloadDocument className="shrink-0">
                <input type="hidden" name="planKey" value={plan.key} />
                <PrimaryButton type="submit">Choose {plan.name}</PrimaryButton>
              </Form>
            )}
          </div>
        ))}
      </div>
    </EnterpriseFormPage>
  );
}
