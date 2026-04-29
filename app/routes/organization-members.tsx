import { Form, useActionData, useLoaderData } from '@remix-run/react';
import { EnterpriseFormPage, PrimaryButton, SelectField, TextField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  formObject,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const orgId = new URL(request.url).searchParams.get('orgId');

  if (!orgId) {
    return json({ orgId: '', memberships: [] });
  }

  const result = await apiRequest<{ memberships: Array<{ id: string; userId: string; roleKey: string }> }>(
    request,
    `/orgs/${orgId}/memberships`,
  );

  return json({ orgId, memberships: result.memberships });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as { orgId?: string; userId?: string; roleKey?: string };

  if (!body.orgId) {
    return json({ error: 'Organization ID is required.' }, { status: 400 });
  }

  await apiRequest(request, `/orgs/${body.orgId}/memberships`, {
    method: 'POST',
    body: JSON.stringify({ userId: body.userId, roleKey: body.roleKey }),
  });

  return json({ status: 'Member added.' });
}

export default function OrganizationMembersPage() {
  const { orgId, memberships } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="Organization members"
      description="Manage members with backend-enforced roles and audit coverage."
      status={actionData?.status}
      error={actionData?.error}
    >
      <Form method="post" className="space-y-4">
        <TextField label="Organization ID" name="orgId" defaultValue={orgId} required />
        <TextField label="User ID" name="userId" required />
        <SelectField
          label="Role"
          name="roleKey"
          defaultValue="member"
          options={[
            { value: 'member', label: 'Member' },
            { value: 'admin', label: 'Admin' },
            { value: 'viewer', label: 'Viewer' },
          ]}
        />
        <PrimaryButton>Add member</PrimaryButton>
      </Form>
      {memberships.length ? (
        <pre className="mt-6 rounded-md border border-bolt-elements-borderColor p-3 text-xs">
          {JSON.stringify(memberships, null, 2)}
        </pre>
      ) : null}
    </EnterpriseFormPage>
  );
}
