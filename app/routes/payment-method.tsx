import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData } from 'react-router';
import { EnterpriseFormPage, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import { FieldError, fieldErrorProps } from '~/components/ui/FieldError';
import {
  apiErrorMessage,
  apiRequest,
  firstOrganizationOrNull,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { shouldRethrowActionError } from '~/lib/route-reauth';

export const meta: MetaFunction = () => [{ title: 'Payment method - E-Code' }];

export async function loader({ request }: EnterpriseLoaderArgs) {
  const orgs = await apiRequest<{ organizations: Array<{ id: string; billingEmail?: string }> }>(request, '/orgs');
  const organization = orgs.organizations[0];

  if (!organization) {
    return redirect('/');
  }

  return json({ billingEmail: organization.billingEmail ?? '' });
}

export async function action({ request }: EnterpriseActionArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return json({ error: 'No organization found for your account.' }, { status: 400 });
  }

  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'portal');

  try {
    if (intent === 'billing-email') {
      const email = String(form.get('billingEmail') ?? '').trim();

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json(
          { error: 'Enter a valid billing email address (or leave blank to clear it).', field: 'billingEmail' },
          { status: 400 },
        );
      }

      await apiRequest(request, `/orgs/${organization.id}/billing/email`, {
        method: 'PATCH',
        body: JSON.stringify({ email: email || null }),
      });

      return json({
        status: email ? `Billing emails will be CC'd to ${email}.` : 'Billing CC address cleared.',
      });
    }

    const result = await apiRequest<{ portalUrl: string }>(request, `/orgs/${organization.id}/billing/portal`, {
      method: 'POST',
      body: JSON.stringify({ returnUrl: new URL('/payment-method', request.url).toString() }),
    });

    return redirect(result.portalUrl);
  } catch (error) {
    /*
     * A mid-session 401 (login redirect) or 403 MFA_REQUIRED (step-up redirect)
     * surfaces here as a thrown 3xx Response. Re-throw those (and 5xx server
     * responses) so the framework performs the redirect / error boundary handles
     * them, instead of swallowing them into a misleading "portal unavailable"
     * inline message with a 302 status.
     */
    if (shouldRethrowActionError(error)) {
      throw error;
    }

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
    console.error('Failed to update payment settings:', error);

    return json({ error: 'This action is temporarily unavailable. Please try again in a moment.' });
  }
}

export default function PaymentMethodPage() {
  const { billingEmail } = useLoaderData<typeof loader>();

  const actionData = useActionData<typeof action>() as { status?: string; error?: string; field?: string } | undefined;

  const billingEmailError = actionData?.field === 'billingEmail' ? actionData.error : undefined;

  return (
    <EnterpriseFormPage
      title="Payment method"
      description="Update billing details through the Stripe customer portal."
      status={actionData?.status}
      error={actionData?.field ? undefined : actionData?.error}
    >
      <div className="space-y-8">
        <Form method="post" reloadDocument>
          <input type="hidden" name="intent" value="portal" />
          <PrimaryButton type="submit">Manage payment method</PrimaryButton>
        </Form>

        <Form method="post" className="max-w-md space-y-3">
          <input type="hidden" name="intent" value="billing-email" />
          <label className="grid gap-2 text-sm font-medium">
            Billing email (CC)
            <input
              id="billingEmail"
              name="billingEmail"
              type="email"
              defaultValue={billingEmail}
              placeholder="finance@company.com"
              className={`h-10 rounded-md border ${
                billingEmailError ? 'border-[var(--vc-ide-accent-error)]' : 'border-bolt-elements-borderColor'
              } bg-bolt-elements-background-depth-1 px-3 text-[16px] outline-none focus:border-bolt-elements-focus sm:text-sm`}
              {...fieldErrorProps('billingEmail', billingEmailError)}
            />
            <FieldError fieldId="billingEmail" error={billingEmailError} />
          </label>
          <p className="text-xs text-bolt-elements-textSecondary">
            Spend alerts and billing notifications are CC&apos;d to this address. Leave blank to clear it.
          </p>
          <PrimaryButton type="submit">Save billing email</PrimaryButton>
        </Form>
      </div>
    </EnterpriseFormPage>
  );
}
