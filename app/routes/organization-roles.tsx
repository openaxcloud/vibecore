import { Fragment } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData } from 'react-router';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiErrorMessage,
  apiRequest,
  firstOrganizationOrNull,
  formObject,
  isForbiddenApiResponse,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  BUILTIN_ROLE_LABELS,
  BUILTIN_ROLE_ORDER,
  BUILTIN_ROLE_PERMISSIONS,
  PERMISSION_CATALOG,
  permissionLabel,
  permissionsForRoleKey,
  type PermissionKey,
} from '~/lib/rbac-catalog';

export const meta: MetaFunction = () => [{ title: 'Organization roles - E-Code' }];

type CustomRole = { id: string; key: string; name: string; permissions: string[]; createdAt?: string };

// Default preselection for a new custom role: viewer-level permissions.
const DEFAULT_ROLE_PERMISSIONS = BUILTIN_ROLE_PERMISSIONS.viewer;

export async function loader({ request }: EnterpriseLoaderArgs) {
  const orgIdParam = new URL(request.url).searchParams.get('orgId');
  const organization = orgIdParam ? { id: orgIdParam } : await firstOrganizationOrNull(request);

  if (!organization) {
    throw json({ error: 'No organization found' }, { status: 400 });
  }

  try {
    /*
     * We need three things: the org's custom roles, the caller's membership row
     * (to resolve their own role → grantable permissions), and the current user
     * id to find that row. The membership + custom-role lists let us compute the
     * caller's effective permissions locally, so the matrix can disable
     * permissions the caller cannot grant. The server independently re-enforces
     * this (RBAC_PRIVILEGE_ESCALATION), so this is a UX hint, not the guard.
     */
    const [rolesResult, membersResult, meResult] = await Promise.all([
      apiRequest<{ roles: CustomRole[] }>(request, `/orgs/${organization.id}/roles`),
      apiRequest<{ memberships: Array<{ userId: string; roleKey: string }> }>(
        request,
        `/orgs/${organization.id}/memberships`,
      ),
      apiRequest<{ user?: { id: string } }>(request, '/auth/me', { redirectOn401: false }),
    ]);

    const callerId = meResult.user?.id;

    const callerMembership = callerId
      ? membersResult.memberships.find((member) => member.userId === callerId)
      : undefined;

    const callerRoleKey = callerMembership?.roleKey ?? 'viewer';
    const callerPermissions = permissionsForRoleKey(callerRoleKey, rolesResult.roles);

    return json({
      forbidden: false as const,
      orgId: organization.id,
      customRoles: rolesResult.roles,
      grantablePermissions: callerPermissions,
      callerRoleKey,
    });
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      return json({
        forbidden: true as const,
        orgId: organization.id,
        customRoles: [] as CustomRole[],
        grantablePermissions: [] as PermissionKey[],
        callerRoleKey: 'viewer',
      });
    }

    throw error;
  }
}

export async function action({ request }: EnterpriseActionArgs) {
  const formData = await request.formData();
  const body = formObject(formData) as { orgId?: string; key?: string; name?: string };

  // Checkboxes: all checked "permissions" fields.
  const permissions = formData.getAll('permissions').map(String);

  if (!body.orgId) {
    return json({ error: 'Your organization is unavailable. Reload the page and try again.' }, { status: 400 });
  }

  if (!body.key || !body.name) {
    return json({ error: 'Enter a name for the role.' }, { status: 400 });
  }

  if (permissions.length === 0) {
    return json({ error: 'Select at least one permission for the role.' }, { status: 400 });
  }

  try {
    const result = await apiRequest<{ role: CustomRole }>(request, `/orgs/${body.orgId}/roles`, {
      method: 'POST',
      body: JSON.stringify({ key: body.key, name: body.name, permissions }),
    });

    return json({ status: `Role "${result.role.name}" created.` });
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      // Includes the friendly RBAC_PRIVILEGE_ESCALATION message from the server.
      return json(
        {
          error: await apiErrorMessage(
            error,
            'You can only grant permissions you already hold, and you need the "Manage roles" permission.',
          ),
        },
        { status: 403 },
      );
    }

    if (error instanceof Response) {
      return json({ error: await apiErrorMessage(error, 'Could not create role.') }, { status: error.status });
    }

    throw error;
  }
}

export default function OrganizationRolesPage() {
  const { forbidden, orgId, customRoles, grantablePermissions, callerRoleKey } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;

  const grantable = new Set<string>(grantablePermissions);

  if (forbidden) {
    return (
      <AppShell title="Organization roles" description="Define custom roles and see exactly what each role can do.">
        <p className="rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2 text-sm text-[var(--status-warning-text)]">
          Role management is available only to organization owners or role managers.
        </p>
      </AppShell>
    );
  }

  const builtinRows = BUILTIN_ROLE_ORDER.map((key) => ({
    key,
    name: BUILTIN_ROLE_LABELS[key] ?? key,
    permissions: BUILTIN_ROLE_PERMISSIONS[key] ?? [],
    builtin: true as const,
  }));

  const customRows = customRoles.map((role) => ({
    key: role.key,
    name: role.name,
    permissions: role.permissions,
    builtin: false as const,
  }));

  const allRows = [...builtinRows, ...customRows];

  return (
    <AppShell title="Organization roles" description="Define custom roles and see exactly what each role can do.">
      <div className="grid gap-6">
        {actionData?.status ? (
          <p
            role="status"
            className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm text-bolt-elements-textSecondary"
          >
            {actionData.status}
          </p>
        ) : null}
        {actionData?.error ? (
          <p
            role="alert"
            className="rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-sm text-[var(--status-error-text)]"
          >
            {actionData.error}
          </p>
        ) : null}

        {/* Permission matrix: roles as columns, permissions as rows. */}
        <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
          <div className="border-b border-bolt-elements-borderColor px-4 py-3 sm:px-6">
            <h2 className="font-semibold text-bolt-elements-textPrimary">Permission matrix</h2>
            <p className="mt-1 text-xs text-bolt-elements-textSecondary">
              Built-in roles are read-only. Your role ({BUILTIN_ROLE_LABELS[callerRoleKey] ?? 'Custom role'}) determines
              which permissions you can grant to a new custom role.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-bolt-elements-borderColor">
                  <th className="sticky left-0 z-10 bg-bolt-elements-background-depth-2 px-4 py-2 font-medium text-bolt-elements-textSecondary sm:px-6">
                    Permission
                  </th>
                  {allRows.map((role) => (
                    <th
                      key={role.key}
                      className="whitespace-nowrap px-3 py-2 text-center font-medium text-bolt-elements-textPrimary"
                    >
                      {role.name}
                      <span className="ml-1 text-[10px] font-normal text-bolt-elements-textSecondary">
                        {role.builtin ? 'built-in' : 'custom'}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_CATALOG.map((group) => (
                  <Fragment key={`grp-${group.group}`}>
                    <tr className="border-b border-bolt-elements-borderColor">
                      <td
                        colSpan={allRows.length + 1}
                        className="bg-bolt-elements-background-depth-1 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary sm:px-6"
                      >
                        {group.group}
                      </td>
                    </tr>
                    {group.permissions.map((permission) => (
                      <tr key={permission.key} className="border-b border-bolt-elements-borderColor last:border-b-0">
                        <td
                          className="sticky left-0 z-10 bg-bolt-elements-background-depth-2 px-4 py-2 sm:px-6"
                          title={permission.description}
                        >
                          <span className="font-medium text-bolt-elements-textPrimary">{permission.label}</span>
                        </td>
                        {allRows.map((role) => {
                          const held = role.permissions.includes(permission.key);

                          return (
                            <td key={role.key} className="px-3 py-2 text-center">
                              {held ? (
                                <span
                                  className="text-bolt-elements-icon-success"
                                  aria-label={`${role.name} has ${permission.label}`}
                                >
                                  ●
                                </span>
                              ) : (
                                <span
                                  className="text-bolt-elements-textTertiary"
                                  aria-label={`${role.name} lacks ${permission.label}`}
                                >
                                  ·
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Create custom role. */}
        <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6">
          <h2 className="mb-1 font-semibold text-bolt-elements-textPrimary">Create custom role</h2>
          <p className="mb-4 text-xs text-bolt-elements-textSecondary">
            Permissions outside your own role are unavailable and cannot be added when you save.
          </p>
          <Form method="post" className="grid gap-5">
            <input type="hidden" name="orgId" value={orgId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Role identifier" name="key" placeholder="e.g. release-manager" required />
              <TextField label="Display name" name="name" placeholder="e.g. Release Manager" required />
            </div>

            <fieldset className="grid gap-4">
              <legend className="text-sm font-medium text-bolt-elements-textPrimary">Permissions</legend>
              {PERMISSION_CATALOG.map((group) => (
                <div key={group.group} className="grid gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textSecondary">
                    {group.group}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.permissions.map((permission) => {
                      const canGrant = grantable.has(permission.key);
                      const defaultChecked = canGrant && DEFAULT_ROLE_PERMISSIONS.includes(permission.key);

                      return (
                        <label
                          key={permission.key}
                          className={`flex items-start gap-2 rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm ${
                            canGrant
                              ? 'bg-bolt-elements-background-depth-1'
                              : 'cursor-not-allowed bg-bolt-elements-background-depth-3 opacity-60'
                          }`}
                          title={canGrant ? permission.description : 'You cannot grant a permission you do not hold.'}
                        >
                          <input
                            type="checkbox"
                            name="permissions"
                            value={permission.key}
                            defaultChecked={defaultChecked}
                            disabled={!canGrant}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="block font-medium text-bolt-elements-textPrimary">{permission.label}</span>
                            <span className="block text-xs text-bolt-elements-textSecondary">
                              {permission.description}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </fieldset>

            <div>
              <PrimaryButton type="submit">Create role</PrimaryButton>
            </div>
          </Form>
        </section>

        {/* Existing custom roles. */}
        <section className="overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-sm shadow-sm">
          <div className="border-b border-bolt-elements-borderColor px-4 py-3 sm:px-6">
            <h2 className="font-semibold text-bolt-elements-textPrimary">Custom roles</h2>
          </div>
          {customRoles.length === 0 ? (
            <div className="px-4 py-4 text-bolt-elements-textSecondary sm:px-6">No custom roles yet.</div>
          ) : (
            customRoles.map((role) => (
              <div
                key={role.id}
                className="border-b border-bolt-elements-borderColor px-4 py-3 last:border-b-0 sm:px-6"
              >
                <div className="font-medium text-bolt-elements-textPrimary">{role.name}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {role.permissions.map((permission) => (
                    <span
                      key={permission}
                      className="rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-0.5 text-xs text-bolt-elements-textSecondary"
                    >
                      {permissionLabel(permission)}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </AppShell>
  );
}
