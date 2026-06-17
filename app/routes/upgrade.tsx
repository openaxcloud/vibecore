import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData } from 'react-router';
import { EnterpriseFormPage, PrimaryButton, SelectField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiErrorMessage,
  apiRequest,
  firstOrganization,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
} from '~/lib/enterprise-api.server';

export const meta: MetaFunction = () => [{ title: 'Upgrade - VibeCore' }];

export async function action({ request }: EnterpriseActionArgs) {
  const organization = await firstOrganization(request);
  const form = await request.formData();

  try {
    const result = await apiRequest<{ checkoutUrl: string }>(request, `/orgs/${organization.id}/billing/checkout`, {
      method: 'POST',
      body: JSON.stringify({
        planKey: String(form.get('planKey') ?? 'pro'),
        successUrl: new URL('/billing', request.url).toString(),
        cancelUrl: new URL('/upgrade', request.url).toString(),
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

export default function UpgradePage() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="Upgrade"
      description="Move an organization to a higher plan before quota-restricted actions are retried."
      error={actionData?.error}
    >
      <Form method="post" reloadDocument className="space-y-4">
        <SelectField
          label="Plan"
          name="planKey"
          options={[
            { value: 'pro', label: 'Pro' },
            { value: 'team', label: 'Team' },
          ]}
        />
        <PrimaryButton type="submit">Start checkout</PrimaryButton>
      </Form>
      <p className="mt-4 text-sm text-bolt-elements-textSecondary">
        Need Enterprise (SSO/SAML, custom quotas, premium support)?{' '}
        <Link to="/contact-sales" className="underline">
          Talk to sales
        </Link>
        .
      </p>
    </EnterpriseFormPage>
  );
}
