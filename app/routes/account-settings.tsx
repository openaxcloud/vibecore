import type { MetaFunction } from '@remix-run/cloudflare';
import { useActionData } from '@remix-run/react';
import { AppShell, SettingsForm } from '~/components/dashboard/SaaSLayout';
import { apiRequest, formObject, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

export const meta: MetaFunction = () => [{ title: 'Account settings - VibeCore' }];

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as { name?: string; email?: string; timezone?: string };
  await apiRequest(request, '/auth/me', {
    method: 'PATCH',
    body: JSON.stringify({
      name: body.name,
      email: body.email,
      timezone: body.timezone,
    }),
  });

  return { status: 'Account settings saved.' };
}

export default function AccountSettingsPage() {
  const actionData = useActionData<typeof action>() as { status?: string } | undefined;

  return (
    <AppShell title="Account settings" description="Manage profile details, email, locale and notification defaults.">
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
        {actionData?.status ? (
          <p className="mb-4 rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm text-bolt-elements-textSecondary">
            {actionData.status}
          </p>
        ) : null}
        <SettingsForm
          fields={[
            { label: 'Name', name: 'name', placeholder: 'Ada Lovelace' },
            { label: 'Email', name: 'email', type: 'email', placeholder: 'ada@example.com' },
            { label: 'Timezone', name: 'timezone', placeholder: 'UTC' },
          ]}
        />
      </div>
    </AppShell>
  );
}
