import { Form, useActionData, useLoaderData } from 'react-router';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiErrorMessage,
  apiRequest,
  firstOrganizationOrNull,
  formObject,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  return json({ orgId: organization.id });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as { orgId?: string; name?: string };

  if (!body.orgId) {
    return json({ error: 'Organization ID is required.' }, { status: 400 });
  }

  try {
    const result = await apiRequest<{ token: string }>(request, `/orgs/${body.orgId}/scim/tokens`, {
      method: 'POST',
      body: JSON.stringify({ name: body.name }),
    });

    return json({ status: 'SCIM token created. Copy it now; it is shown once.', token: result.token });
  } catch (error) {
    if (isApiResponse(error)) {
      return json({ error: await apiErrorMessage(error, 'Failed to create SCIM token.') }, { status: error.status });
    }

    return json({ error: 'Creating SCIM tokens is temporarily unavailable. Please try again in a moment.' });
  }
}

export default function ScimTokenSettingsPage() {
  const { orgId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string; token?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="SCIM token settings"
      description="Create hashed SCIM bearer tokens for identity provider provisioning."
      status={actionData?.status}
      error={actionData?.error}
    >
      <Form method="post" className="space-y-4">
        <TextField label="Organization ID" name="orgId" defaultValue={orgId} required />
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
