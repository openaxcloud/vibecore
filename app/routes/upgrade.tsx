import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { Form, Link, useActionData, useLoaderData } from 'react-router';
import { EnterpriseFormPage, PrimaryButton, SelectField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiErrorMessage,
  apiRequest,
  firstOrganizationOrNull,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
} from '~/lib/enterprise-api.server';
import { isReauthRedirect } from '~/lib/route-reauth';

export const meta: MetaFunction = () => [{ title: 'Upgrade - E-Code' }];

// The public pricing page uses display-tier keys; map them to the checkout enum.
function normalizePlanKey(raw: string | null): 'pro' | 'team' {
  const key = (raw ?? '').toLowerCase();

  if (key === 'team' || key === 'teams') {
    return 'team';
  }

  // core/pro (and anything else) → 'pro'
  return 'pro';
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const plan = normalizePlanKey(url.searchParams.get('plan'));

  const interval =
    url.searchParams.get('interval') === 'annual' || url.searchParams.get('interval') === 'yearly'
      ? 'annual'
      : 'monthly';

  return json({ plan, interval });
}

export async function action({ request }: EnterpriseActionArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return json({ error: 'No organization found for your account.' }, { status: 400 });
  }

  const form = await request.formData();
  const planKey = normalizePlanKey(String(form.get('planKey') ?? 'pro'));
  const interval = String(form.get('interval') ?? 'monthly') === 'annual' ? 'annual' : 'monthly';

  try {
    const result = await apiRequest<{ checkoutUrl: string }>(request, `/orgs/${organization.id}/billing/checkout`, {
      method: 'POST',
      body: JSON.stringify({
        planKey,
        interval,
        successUrl: new URL('/billing', request.url).toString(),
        cancelUrl: new URL('/upgrade', request.url).toString(),
      }),
    });

    return redirect(result.checkoutUrl);
  } catch (error) {
    /*
     * A 3xx redirect Response thrown mid-checkout is a session-expiry login or
     * MFA_REQUIRED re-auth navigation (see enterprise-api.server.ts). It is still
     * `instanceof Response`, so it must be re-thrown BEFORE the isApiResponse
     * branch — otherwise the redirect's Location is discarded and the user gets a
     * bogus json error with a 3xx status instead of reaching the re-auth page.
     */
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (isApiResponse(error)) {
      return json(
        { error: await apiErrorMessage(error, 'Checkout is unavailable right now. Please try again later.') },
        { status: error.status },
      );
    }

    /*
     * Non-Response failures (e.g. AbortSignal.timeout or a hung api pod) would
     * otherwise crash the page; surface a friendly message instead.
     */
    console.error('Failed to start checkout:', error);

    return json({ error: 'Checkout is temporarily unavailable. Please try again later.' });
  }
}

export default function UpgradePage() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const { plan, interval } = useLoaderData<typeof loader>();

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
          defaultValue={plan}
          options={[
            { value: 'pro', label: 'Core' },
            { value: 'team', label: 'Pro' },
          ]}
        />
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-bolt-elements-textPrimary">Billing interval</legend>
          <div className="flex gap-4 text-sm text-bolt-elements-textSecondary">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="interval" value="monthly" defaultChecked={interval !== 'annual'} />
              Monthly
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="interval" value="annual" defaultChecked={interval === 'annual'} />
              Annual <span className="text-[var(--status-success-text)]">(save ~20%)</span>
            </label>
          </div>
        </fieldset>
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
