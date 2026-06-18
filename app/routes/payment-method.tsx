import type { MetaFunction } from 'react-router';
import { Form, useActionData } from 'react-router';
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

export const meta: MetaFunction = () => [{ title: 'Payment method - E-Code' }];

export async function action({ request }: EnterpriseActionArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return json({ error: 'No organization found for your account.' }, { status: 400 });
  }

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

    /*
     * Non-Response failures (e.g. AbortSignal.timeout or a hung api pod) would
     * otherwise crash the page; surface a friendly message instead.
     */
    console.error('Failed to open Stripe customer portal:', error);

    return json({ error: 'The Stripe customer portal is temporarily unavailable. Please try again in a moment.' });
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
