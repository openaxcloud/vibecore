import { Form, useActionData, useLoaderData } from '@remix-run/react';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  apiErrorMessage,
  firstOrganizationOrNull,
  formObject,
  isForbiddenApiResponse,
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

  const result = await apiRequest<{ roles: Array<{ key: string; name: string; permissions: string[] }> }>(
    request,
    `/orgs/${organization.id}/roles`,
  );

  return json({
    orgId: organization.id,
    roles: result.roles,
    permissions: [
      'org:read',
      'org:update',
      'members:manage',
      'projects:read',
      'projects:write',
      'workspaces:read',
      'workspaces:write',
      'billing:read',
      'billing:manage',
      'admin:read',
      'admin:write',
      'audit:export',
      'enterprise:read',
      'enterprise:write',
      'roles:manage',
      'scim:manage',
      'security:manage',
      'support:write',
      'usage:read',
    ],
  });
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

  try {
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
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      return json(
        { error: await apiErrorMessage(error, 'You cannot manage roles for this organization.') },
        { status: 403 },
      );
    }

    throw error;
  }

  return json({ status: 'Custom role created.' });
}

export default function RolesAndPermissionsPage() {
  const { orgId, roles, permissions } = useLoaderData<typeof loader>();
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
        <TextField label="Permissions" name="permissions" placeholder="projects:read,usage:read" required />
        <PrimaryButton>Create role</PrimaryButton>
      </Form>
      <div className="mt-6 rounded-md border border-bolt-elements-borderColor p-3 text-xs text-bolt-elements-textSecondary">
        <strong className="block text-bolt-elements-textPrimary">Available permissions</strong>
        <div className="mt-2 flex flex-wrap gap-2">
          {permissions.map((permission) => (
            <code key={permission} className="rounded border border-bolt-elements-borderColor px-2 py-1">
              {permission}
            </code>
          ))}
        </div>
      </div>
      <div className="mt-6 overflow-hidden rounded-md border border-bolt-elements-borderColor text-sm">
        {roles.map((role) => (
          <div key={role.key} className="border-b border-bolt-elements-borderColor p-3 last:border-b-0">
            <div className="font-medium text-bolt-elements-textPrimary">{role.name}</div>
            <div className="text-xs text-bolt-elements-textSecondary">{role.key}</div>
            <div className="mt-2 text-xs text-bolt-elements-textSecondary">{role.permissions.join(', ')}</div>
          </div>
        ))}
        {roles.length === 0 && <div className="p-3 text-bolt-elements-textSecondary">No custom roles created.</div>}
      </div>
    </EnterpriseFormPage>
  );
}
