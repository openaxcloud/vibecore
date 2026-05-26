import type { MetaFunction } from '@remix-run/cloudflare';
import { Form, useActionData, useLoaderData } from '@remix-run/react';
import { CreditCard, FileText, TrendingUp } from 'lucide-react';
import { ActivityList, AppShell, LinkButton, StatGrid } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiRequest,
  apiErrorMessage,
  firstOrganization,
  firstOrganizationOrNull,
  isApiResponse,
  isForbiddenApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

type BillingData = {
  plan: { key: string; name: string; monthlyCents: number };
  subscription?: { status?: string } | null;
  usage: Array<{ id: string; type: string; quantity: number; createdAt?: string }>;
  upgradePrompts: Array<{ planKey: string; name: string }>;
};

export const meta: MetaFunction = () => [{ title: 'Billing - VibeCore' }];
export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  try {
    const billing = await apiRequest<BillingData>(request, `/orgs/${organization.id}/billing`);

    return json({ organization, billing, billingAccessLimited: false });
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      return json({
        organization,
        billingAccessLimited: true,
        billing: {
          plan: { key: 'unavailable', name: 'Unavailable', monthlyCents: 0 },
          subscription: null,
          usage: [],
          upgradePrompts: [],
        } satisfies BillingData,
      });
    }

    throw error;
  }
}

export async function action({ request }: EnterpriseActionArgs) {
  const organization = await firstOrganization(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'checkout');

  if (intent === 'portal') {
    try {
      const result = await apiRequest<{ portalUrl: string }>(request, `/orgs/${organization.id}/billing/portal`, {
        method: 'POST',
        body: JSON.stringify({ returnUrl: new URL('/billing', request.url).toString() }),
      });
      return Response.redirect(result.portalUrl);
    } catch (error) {
      if (isApiResponse(error)) {
        return json(
          { error: await apiErrorMessage(error, 'You cannot manage billing for this organization.') },
          { status: error.status },
        );
      }

      throw error;
    }
  }

  try {
    const result = await apiRequest<{ checkoutUrl: string }>(request, `/orgs/${organization.id}/billing/checkout`, {
      method: 'POST',
      body: JSON.stringify({
        planKey: String(form.get('planKey') ?? 'pro'),
        successUrl: new URL('/billing', request.url).toString(),
        cancelUrl: new URL('/billing', request.url).toString(),
      }),
    });

    return Response.redirect(result.checkoutUrl);
  } catch (error) {
    if (isApiResponse(error)) {
      return json(
        { error: await apiErrorMessage(error, 'Billing checkout is unavailable. Please try again later.') },
        { status: error.status },
      );
    }

    throw error;
  }
}

export default function BillingPage() {
  const { billing, billingAccessLimited } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;

  return (
    <AppShell
      title="Billing overview"
      description="Manage subscription state, checkout, customer portal access, invoices and metered usage."
      actions={
        <>
          <LinkButton to="/upgrade">Upgrade</LinkButton>
          <LinkButton to="/payment-method" variant="outline">
            Payment method
          </LinkButton>
        </>
      }
    >
      <div className="grid gap-6">
        {billingAccessLimited || actionData?.error ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            {actionData?.error ?? 'Billing is available only to organization owners or billing administrators.'}
          </div>
        ) : null}
        <StatGrid
          stats={[
            {
              label: 'Current plan',
              value: billing.plan.name,
              detail: `$${(billing.plan.monthlyCents / 100).toFixed(0)} per month`,
              icon: CreditCard,
            },
            {
              label: 'Billing state',
              value: billing.subscription?.status ?? 'No subscription',
              detail: 'Loaded from backend billing state',
              icon: TrendingUp,
            },
            {
              label: 'Usage events',
              value: String(billing.usage.length),
              detail: 'Metered usage ledger records actions',
              icon: TrendingUp,
            },
            {
              label: 'Upgrade options',
              value: String(billing.upgradePrompts.length),
              detail: 'Plan access controlled by backend',
              icon: FileText,
            },
          ]}
        />
        {!billingAccessLimited ? (
          <div className="flex flex-wrap gap-3">
            {billing.upgradePrompts.map((plan) => (
              <Form key={plan.planKey} method="post">
                <input type="hidden" name="planKey" value={plan.planKey} />
                <Button type="submit">Upgrade to {plan.name}</Button>
              </Form>
            ))}
            <Form method="post">
              <input type="hidden" name="intent" value="portal" />
              <Button type="submit" variant="outline">
                Open customer portal
              </Button>
            </Form>
          </div>
        ) : null}
        <ActivityList
          items={
            billing.usage.length
              ? billing.usage.slice(0, 8).map((event) => ({
                  title: event.type,
                  detail: `${event.quantity} - ${event.createdAt ? new Date(event.createdAt).toLocaleString() : 'recorded'}`,
                  icon: TrendingUp,
                }))
              : [
                  {
                    title: 'No usage events yet',
                    detail: 'Backend usage events will appear here after quota-protected actions.',
                    icon: TrendingUp,
                  },
                ]
          }
        />
      </div>
    </AppShell>
  );
}
