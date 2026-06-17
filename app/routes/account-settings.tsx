import type { MetaFunction } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { useActionData, useLoaderData } from '@remix-run/react';
import { AppShell, SettingsForm } from '~/components/dashboard/SaaSLayout';
import {
  apiErrorMessage,
  apiRequest,
  formObject,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

export const meta: MetaFunction = () => [{ title: 'Account settings - E-Code' }];

interface CurrentUser {
  name?: string;
  email?: string;
  timezone?: string;
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  const { user } = await apiRequest<{ user?: CurrentUser }>(request, '/auth/me');

  return json({
    user: { name: user?.name ?? '', email: user?.email ?? '', timezone: user?.timezone ?? '' },
  });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as { name?: string; email?: string; timezone?: string };

  /*
   * Only send fields the user actually filled in. The API's userProfileSchema
   * treats each field as `.optional()` but rejects empty strings (`name` is
   * `.min(1)`, `email` must be a valid address), so submitting a blank field as
   * "" previously 400'd and bubbled to the route error boundary.
   */
  const payload: Record<string, string> = {};

  for (const key of ['name', 'email', 'timezone'] as const) {
    const value = body[key]?.trim();

    if (value) {
      payload[key] = value;
    }
  }

  if (Object.keys(payload).length === 0) {
    return json({ error: 'Enter at least one value to update.' });
  }

  try {
    await apiRequest(request, '/auth/me', { method: 'PATCH', body: JSON.stringify(payload) });
  } catch (error) {
    if (error instanceof Response && error.status >= 500) {
      throw error;
    }

    return json({ error: await apiErrorMessage(error, 'Could not save account settings.') });
  }

  return json({ status: 'Account settings saved.' });
}

export default function AccountSettingsPage() {
  const { user } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;

  return (
    <AppShell title="Account settings" description="Manage profile details, email, locale and notification defaults.">
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
        {actionData?.status ? (
          <p className="mb-4 rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm text-bolt-elements-textSecondary">
            {actionData.status}
          </p>
        ) : null}
        {actionData?.error ? (
          <p
            className="mb-4 rounded-md border border-bolt-elements-icon-error px-3 py-2 text-sm text-bolt-elements-icon-error"
            role="alert"
          >
            {actionData.error}
          </p>
        ) : null}
        <SettingsForm
          fields={[
            { label: 'Name', name: 'name', placeholder: 'Ada Lovelace', defaultValue: user.name },
            { label: 'Email', name: 'email', type: 'email', placeholder: 'ada@example.com', defaultValue: user.email },
            { label: 'Timezone', name: 'timezone', placeholder: 'UTC', defaultValue: user.timezone },
          ]}
        />
      </div>
    </AppShell>
  );
}
