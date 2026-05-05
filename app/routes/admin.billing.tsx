import { Form, useActionData, useLoaderData } from '@remix-run/react';
import { EnterpriseFormPage, TextField, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  formObject,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

type AdminBillingData = {
  plans: Array<{ key: string; name: string; monthlyCents: number }>;
  subscriptions: Array<{
    id: string;
    organizationId: string;
    planKey: string;
    status: string;
    externalId?: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd?: string;
  }>;
};

export async function loader({ request }: EnterpriseLoaderArgs) {
  const data = await apiRequest<AdminBillingData>(request, '/admin/billing');
  return json(data);
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as {
    intent?: string;
    orgId?: string;
    key?: string;
    limit?: string;
    planKey?: string;
    reason?: string;
  };

  if (body.intent === 'plan') {
    if (!body.orgId || !body.planKey || !body.reason) {
      return json({ error: 'Organization ID, plan and reason are required.' }, { status: 400 });
    }

    await apiRequest(request, '/admin/plan-overrides', {
      method: 'POST',
      body: JSON.stringify({
        organizationId: body.orgId,
        planKey: body.planKey,
        reason: body.reason,
      }),
    });

    return json({ status: 'Plan override created.' });
  }

  if (!body.orgId || !body.key || !body.limit) {
    return json({ error: 'Organization ID, quota key and limit are required.' }, { status: 400 });
  }

  await apiRequest(request, '/admin/quota-overrides', {
    method: 'POST',
    body: JSON.stringify({
      organizationId: body.orgId,
      key: body.key,
      limit: Number(body.limit),
      reason: body.reason || 'Admin billing override',
    }),
  });

  return json({ status: 'Quota override created.' });
}

export default function AdminBillingPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="Admin billing"
      description="Review plans and create audited quota overrides for enterprise organizations."
      status={actionData?.status}
      error={actionData?.error}
    >
      <Form method="post" className="space-y-4">
        <input type="hidden" name="intent" value="quota" />
        <TextField label="Organization ID" name="orgId" required />
        <TextField label="Quota key" name="key" placeholder="projects.count" required />
        <TextField label="Limit" name="limit" type="number" required />
        <TextField label="Reason" name="reason" placeholder="contract expansion" />
        <PrimaryButton>Create override</PrimaryButton>
      </Form>
      <Form method="post" className="mt-6 space-y-4">
        <input type="hidden" name="intent" value="plan" />
        <TextField label="Organization ID" name="orgId" required />
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-bolt-elements-textPrimary">Plan</span>
          <select
            name="planKey"
            required
            className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-bolt-elements-textPrimary"
          >
            {data.plans.map((plan) => (
              <option key={plan.key} value={plan.key}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
        <TextField label="Reason" name="reason" placeholder="contract correction" required />
        <PrimaryButton>Apply plan override</PrimaryButton>
      </Form>
      <div className="mt-6 rounded-md border border-bolt-elements-borderColor p-3 text-xs text-bolt-elements-textSecondary">
        <strong className="block text-bolt-elements-textPrimary">Configured plans</strong>
        <pre className="mt-2 overflow-auto">{JSON.stringify(data.plans, null, 2)}</pre>
      </div>
      <div className="mt-6 rounded-md border border-bolt-elements-borderColor p-3 text-xs text-bolt-elements-textSecondary">
        <strong className="block text-bolt-elements-textPrimary">Recent subscriptions</strong>
        <div className="mt-2 overflow-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-bolt-elements-borderColor text-bolt-elements-textPrimary">
                <th className="py-2 pr-3">Organization</th>
                <th className="py-2 pr-3">Plan</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Stripe subscription</th>
                <th className="py-2 pr-3">Period end</th>
              </tr>
            </thead>
            <tbody>
              {data.subscriptions.map((subscription) => (
                <tr key={subscription.id} className="border-b border-bolt-elements-borderColor last:border-b-0">
                  <td className="py-2 pr-3">{subscription.organizationId}</td>
                  <td className="py-2 pr-3">{subscription.planKey}</td>
                  <td className="py-2 pr-3">
                    {subscription.status}
                    {subscription.cancelAtPeriodEnd ? ' - canceling' : ''}
                  </td>
                  <td className="py-2 pr-3">{subscription.externalId ?? 'manual'}</td>
                  <td className="py-2 pr-3">
                    {subscription.currentPeriodEnd
                      ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                      : 'not set'}
                  </td>
                </tr>
              ))}
              {data.subscriptions.length === 0 && (
                <tr>
                  <td className="py-3 text-bolt-elements-textSecondary" colSpan={5}>
                    No subscriptions recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </EnterpriseFormPage>
  );
}
