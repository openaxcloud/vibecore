import { Form, useActionData } from '@remix-run/react';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import { apiRequest, formObject, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as { orgId?: string; name?: string };

  if (!body.orgId) {
    return json({ error: 'Organization ID is required.' }, { status: 400 });
  }

  const result = await apiRequest<{ token: string }>(request, `/orgs/${body.orgId}/scim/tokens`, {
    method: 'POST',
    body: JSON.stringify({ name: body.name }),
  });

  return json({ status: 'SCIM token created. Copy it now; it is shown once.', token: result.token });
}

export default function ScimTokenSettingsPage() {
  const actionData = useActionData<typeof action>() as { status?: string; error?: string; token?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="SCIM token settings"
      description="Create hashed SCIM bearer tokens for identity provider provisioning."
      status={actionData?.status}
      error={actionData?.error}
    >
      <Form method="post" className="space-y-4">
        <TextField label="Organization ID" name="orgId" required />
        <TextField label="Token name" name="name" required />
        <PrimaryButton>Create SCIM token</PrimaryButton>
      </Form>
      {actionData?.token ? (
        <pre className="mt-6 overflow-auto rounded-md border border-bolt-elements-borderColor p-3 text-xs">
          {actionData.token}
        </pre>
      ) : null}
    </EnterpriseFormPage>
  );
}
