import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData } from 'react-router';
import { EnterpriseFormPage, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiErrorMessage,
  apiRequest,
  firstOrganization,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
} from '~/lib/enterprise-api.server';

export const meta: MetaFunction = () => [{ title: 'Plan comparison - E-Code' }];

const PLANS = [
  { key: 'free', name: 'Free', summary: 'Public templates and small workspaces.' },
  { key: 'pro', name: 'Pro', summary: 'Private previews, deployments and stronger models.' },
  { key: 'team', name: 'Team', summary: 'Collaboration, shared billing and audit logs.' },
  {
    key: 'enterprise',
    name: 'Enterprise',
    summary: 'SSO, SCIM, custom quotas, audit export and private deployment options.',
  },
];

export async function action({ request }: EnterpriseActionArgs) {
  const organization = await firstOrganization(request);
  const form = await request.formData();

  try {
    const result = await apiRequest<{ checkoutUrl: string }>(request, `/orgs/${organization.id}/billing/checkout`, {
      method: 'POST',
      body: JSON.stringify({
        planKey: String(form.get('planKey') ?? 'pro'),
        successUrl: new URL('/billing', request.url).toString(),
        cancelUrl: new URL('/plan-comparison', request.url).toString(),
      }),
    });

    return redirect(result.checkoutUrl);
  } catch (error) {
    if (isApiResponse(error)) {
      return json(
        { error: await apiErrorMessage(error, 'Checkout is unavailable right now. Please try again later.') },
        { status: error.status },
      );
    }

    throw error;
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
