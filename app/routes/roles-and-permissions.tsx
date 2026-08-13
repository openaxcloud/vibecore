import { useState } from 'react';
import { Form, useActionData, useLoaderData } from 'react-router';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  apiErrorMessage,
  firstOrganizationOrNull,
  formObject,
  isApiResponse,
  isForbiddenApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { permissionLabel } from '~/lib/rbac-catalog';
import { isReauthRedirect } from '~/lib/route-reauth';

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
    return json({ error: 'Your organization is unavailable. Reload the page and try again.' }, { status: 400 });
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
    // Re-auth (login/MFA) redirects must reach the framework, never the inline UI.
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (isForbiddenApiResponse(error)) {
      return json(
        { error: await apiErrorMessage(error, 'You cannot manage roles for this organization.') },
        { status: 403 },
      );
    }

    /*
     * Any other API error (400/409 validation, 5xx api-down, etc.) is rendered
     * inline so the user keeps their form instead of being thrown to the full
     * page root error boundary.
     */
    if (isApiResponse(error)) {
      return json({ error: await apiErrorMessage(error, 'Could not create role.') }, { status: error.status });
    }

    throw error;
  }

  return json({ status: 'Custom role created.' });
}

export default function RolesAndPermissionsPage() {
  const { orgId, roles, permissions } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const setPermission = (permission: string, checked: boolean) => {
    setSelectedPermissions((current) =>
      checked ? [...new Set([...current, permission])] : current.filter((candidate) => candidate !== permission),
    );
  };

  return (
    <EnterpriseFormPage
      title="Roles and permissions"
      description="Create custom roles and choose exactly what each role can do."
      status={actionData?.status}
      error={actionData?.error}
    >
      <Form method="post" className="space-y-4">
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="permissions" value={selectedPermissions.join(',')} />
        <TextField label="Role identifier" name="key" placeholder="e.g. release-manager" required />
        <TextField label="Role name" name="name" required />
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium text-bolt-elements-textPrimary">Permissions</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {permissions.map((permission) => (
              <label
                key={permission}
                className="flex min-h-11 items-center gap-3 rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm text-bolt-elements-textPrimary"
              >
                <input
                  type="checkbox"
                  checked={selectedPermissions.includes(permission)}
                  onChange={(event) => setPermission(permission, event.currentTarget.checked)}
                />
                <span>{permissionLabel(permission)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <PrimaryButton disabled={selectedPermissions.length === 0}>Create role</PrimaryButton>
      </Form>
      <div className="mt-6 overflow-hidden rounded-md border border-bolt-elements-borderColor text-sm">
        {roles.map((role) => (
          <div key={role.key} className="border-b border-bolt-elements-borderColor p-3 last:border-b-0">
            <div className="font-medium text-bolt-elements-textPrimary">{role.name}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-bolt-elements-textSecondary">
              {role.permissions.map((permission) => (
                <span key={permission} className="rounded border border-bolt-elements-borderColor px-2 py-1">
                  {permissionLabel(permission)}
                </span>
              ))}
            </div>
          </div>
        ))}
        {roles.length === 0 && <div className="p-3 text-bolt-elements-textSecondary">No custom roles created.</div>}
      </div>
    </EnterpriseFormPage>
  );
}
