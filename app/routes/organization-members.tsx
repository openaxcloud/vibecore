import { Form, useActionData, useLoaderData } from '@remix-run/react';
import { EnterpriseFormPage, PrimaryButton, SelectField, TextField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  apiErrorMessage,
  firstOrganization,
  formObject,
  isForbiddenApiResponse,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = new URL(request.url).searchParams.get('orgId')
    ? { id: new URL(request.url).searchParams.get('orgId')! }
    : await firstOrganization(request);

  const [membersResult, rolesResult] = await Promise.all([
    apiRequest<{ memberships: Array<{ id: string; userId: string; roleKey: string }> }>(
      request,
      `/orgs/${organization.id}/memberships`,
    ),
    apiRequest<{ roles: Array<{ key: string; name: string; permissions: string[] }> }>(
      request,
      `/orgs/${organization.id}/roles`,
    ),
  ]);

  return json({
    orgId: organization.id,
    memberships: membersResult.memberships,
    roles: [
      { key: 'viewer', name: 'Viewer' },
      { key: 'member', name: 'Member' },
      { key: 'admin', name: 'Admin' },
      { key: 'owner', name: 'Owner' },
      ...rolesResult.roles.map((role) => ({ key: role.key, name: role.name })),
    ],
  });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as {
    intent?: string;
    orgId?: string;
    userId?: string;
    roleKey?: string;
  };

  if (!body.orgId || !body.userId) {
    return json({ error: 'Organization ID is required.' }, { status: 400 });
  }

  try {
    if (body.intent === 'remove') {
      await apiRequest(request, `/orgs/${body.orgId}/memberships/${body.userId}`, { method: 'DELETE' });
      return json({ status: 'Member removed.' });
    }

    if (body.intent === 'update') {
      await apiRequest(request, `/orgs/${body.orgId}/memberships/${body.userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ roleKey: body.roleKey }),
      });
      return json({ status: 'Member role updated.' });
    }

    await apiRequest(request, `/orgs/${body.orgId}/memberships`, {
      method: 'POST',
      body: JSON.stringify({ userId: body.userId, roleKey: body.roleKey }),
    });

    return json({ status: 'Member added.' });
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      return json(
        { error: await apiErrorMessage(error, 'You cannot manage members for this organization.') },
        { status: 403 },
      );
    }

    throw error;
  }
}

export default function OrganizationMembersPage() {
  const { orgId, memberships, roles } = useLoaderData<typeof loader>();
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
          options={roles.map((role) => ({ value: role.key, label: role.name }))}
        />
        <PrimaryButton>Add member</PrimaryButton>
      </Form>
      <div className="mt-6 overflow-hidden rounded-md border border-bolt-elements-borderColor text-sm">
        {memberships.map((member) => (
          <div
            key={member.id}
            className="grid gap-3 border-b border-bolt-elements-borderColor p-3 last:border-b-0 md:grid-cols-[1fr_220px_auto]"
          >
            <div>
              <div className="font-medium text-bolt-elements-textPrimary">{member.userId}</div>
              <div className="text-xs text-bolt-elements-textSecondary">{member.roleKey}</div>
            </div>
            <Form method="post" className="flex gap-2">
              <input type="hidden" name="intent" value="update" />
              <input type="hidden" name="orgId" value={orgId} />
              <input type="hidden" name="userId" value={member.userId} />
              <select
                name="roleKey"
                defaultValue={member.roleKey}
                className="h-9 min-w-0 flex-1 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2"
              >
                {roles.map((role) => (
                  <option key={role.key} value={role.key}>
                    {role.name}
                  </option>
                ))}
              </select>
              <button className="rounded-md border border-bolt-elements-borderColor px-3 text-xs" type="submit">
                Update
              </button>
            </Form>
            <Form method="post">
              <input type="hidden" name="intent" value="remove" />
              <input type="hidden" name="orgId" value={orgId} />
              <input type="hidden" name="userId" value={member.userId} />
              <button className="h-9 rounded-md border border-bolt-elements-borderColor px-3 text-xs" type="submit">
                Remove
              </button>
            </Form>
          </div>
        ))}
        {memberships.length === 0 && <div className="p-3 text-bolt-elements-textSecondary">No members found.</div>}
      </div>
    </EnterpriseFormPage>
  );
}
