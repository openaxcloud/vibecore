import type { MetaFunction } from 'react-router';
import { Form, useActionData } from 'react-router';
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

export const meta: MetaFunction = () => [{ title: 'Downgrade - VibeCore' }];

export async function action({ request }: EnterpriseActionArgs) {
  const organization = await firstOrganization(request);
  const form = await request.formData();
  const planKey = String(form.get('planKey') ?? 'free');

  try {
    /*
     * Stripe has no "checkout" for the free plan — moving down to free means
     * cancelling the paid subscription, which happens in the customer portal.
     * Switching between two paid plans goes through checkout like an upgrade.
     */
    if (planKey === 'free') {
      const portal = await apiRequest<{ portalUrl: string }>(request, `/orgs/${organization.id}/billing/portal`, {
        method: 'POST',
        body: JSON.stringify({ returnUrl: new URL('/billing', request.url).toString() }),
      });

      return redirect(portal.portalUrl);
    }

    const checkout = await apiRequest<{ checkoutUrl: string }>(request, `/orgs/${organization.id}/billing/checkout`, {
      method: 'POST',
      body: JSON.stringify({
        planKey,
        successUrl: new URL('/billing', request.url).toString(),
        cancelUrl: new URL('/downgrade', request.url).toString(),
      }),
    });

    return redirect(checkout.checkoutUrl);
  } catch (error) {
    if (isApiResponse(error)) {
      return json(
        { error: await apiErrorMessage(error, 'The subscription change is unavailable right now.') },
        { status: error.status },
      );
    }

    throw error;
  }
}

export default function DowngradePage() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="Downgrade"
      description="Preview lower-plan limits before scheduling a subscription change."
      error={actionData?.error}
    >
      <Form method="post" reloadDocument className="space-y-4">
        <SelectField
          label="Plan"
          name="planKey"
          options={[
            { value: 'free', label: 'Free' },
            { value: 'pro', label: 'Pro' },
            { value: 'team', label: 'Team' },
          ]}
        />
        <PrimaryButton type="submit">Schedule change</PrimaryButton>
      </Form>
    </EnterpriseFormPage>
  );
}
