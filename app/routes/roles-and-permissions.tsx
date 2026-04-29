import { Form, useActionData, useLoaderData } from '@remix-run/react';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  firstOrganization,
  formObject,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganization(request);
  return json({ orgId: organization.id });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as {
    orgId?: string;
    key?: string;
    name?: string;
    permissions?: string;
  };

  if (!body.orgId) {
    return json({ error: 'Organization ID is required.' }, { status: 400 });
  }

  await apiRequest(request, `/orgs/${body.orgId}/roles`, {
    method: 'POST',
    body: JSON.stringify({
      key: body.key,
      name: body.name,
      permissions: body.permissions
        ?.split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    }),
  });

  return json({ status: 'Custom role created.' });
}

export default function RolesAndPermissionsPage() {
  const { orgId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="Roles and permissions"
      description="Create custom roles that map to backend permission checks."
      status={actionData?.status}
      error={actionData?.error}
    >
      <Form method="post" className="space-y-4">
        <TextField label="Organization ID" name="orgId" defaultValue={orgId} required />
        <TextField label="Role key" name="key" required />
        <TextField label="Role name" name="name" required />
        <TextField label="Permissions" name="permissions" placeholder="security:manage,audit:export" required />
        <PrimaryButton>Create role</PrimaryButton>
      </Form>
    </EnterpriseFormPage>
  );
}
