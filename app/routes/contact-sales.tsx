import type { MetaFunction } from '@remix-run/cloudflare';
import { useActionData } from '@remix-run/react';
import { MailPlus, ShieldCheck, Users } from 'lucide-react';
import { PublicShell, SettingsForm, StatGrid } from '~/components/dashboard/SaaSLayout';
import { apiBaseUrl, formObject, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

export const meta: MetaFunction = () => [{ title: 'Contact sales - E-Code' }];

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData());

  const response = await fetch(`${apiBaseUrl()}/contact-sales`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return { error: 'Sales request could not be sent.' };
  }

  return { status: 'Sales request sent.' };
}

export default function ContactSalesPage() {
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;

  return (
    <PublicShell>
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_420px]">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Contact sales</h1>
          <p className="mt-3 max-w-2xl text-sm text-bolt-elements-textSecondary">
            Plan enterprise deployment, custom quotas, SSO, SCIM, private runtime pools and support requirements.
          </p>
          <div className="mt-8">
            <StatGrid
              stats={[
                { label: 'Enterprise SSO', value: 'Ready', detail: 'OIDC, SAML and SCIM paths', icon: ShieldCheck },
                { label: 'Team rollout', value: 'Guided', detail: 'Org migration and governance', icon: Users },
                { label: 'Response', value: '1 day', detail: 'Premium support planning', icon: MailPlus },
                { label: 'Deployment', value: 'Private', detail: 'Cloud or self-host options', icon: ShieldCheck },
              ]}
            />
          </div>
        </div>
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
          {actionData?.status ? (
            <p className="mb-4 rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm text-bolt-elements-textSecondary">
              {actionData.status}
            </p>
          ) : null}
          {actionData?.error ? <p className="mb-4 text-sm text-red-500">{actionData.error}</p> : null}
          <SettingsForm
            submitLabel="Send request"
            fields={[
              { label: 'Work email', name: 'email', type: 'email', placeholder: 'you@company.com' },
              { label: 'Company', name: 'company' },
              { label: 'Team size', name: 'teamSize' },
              { label: 'Requirements', name: 'requirements', placeholder: 'SSO, private deployment, quotas' },
            ]}
          />
        </div>
      </section>
    </PublicShell>
  );
}
