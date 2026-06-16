import type { MetaFunction } from '@remix-run/cloudflare';
import { Form, useActionData } from '@remix-run/react';
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

export const meta: MetaFunction = () => [{ title: 'Payment method - VibeCore' }];

export async function action({ request }: EnterpriseActionArgs) {
  const organization = await firstOrganization(request);

  try {
    const result = await apiRequest<{ portalUrl: string }>(request, `/orgs/${organization.id}/billing/portal`, {
      method: 'POST',
      body: JSON.stringify({ returnUrl: new URL('/payment-method', request.url).toString() }),
    });

    return redirect(result.portalUrl);
  } catch (error) {
    if (isApiResponse(error)) {
      return json(
        { error: await apiErrorMessage(error, 'The Stripe customer portal is unavailable right now.') },
        { status: error.status },
      );
    }

    throw error;
  }
}

export default function PaymentMethodPage() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="Payment method"
      description="Update billing details through the Stripe customer portal."
      error={actionData?.error}
    >
      <Form method="post" reloadDocument>
        <PrimaryButton type="submit">Manage payment method</PrimaryButton>
      </Form>
    </EnterpriseFormPage>
  );
}
