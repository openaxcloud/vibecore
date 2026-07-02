import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData } from 'react-router';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { PrimaryButton, SelectField, TextField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  apiErrorMessage,
  firstOrganizationOrNull,
  formObject,
  isForbiddenApiResponse,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

export const meta: MetaFunction = () => [{ title: 'Organization members - E-Code' }];

export async function loader({ request }: EnterpriseLoaderArgs) {
  const orgIdParam = new URL(request.url).searchParams.get('orgId');
  const organization = orgIdParam ? { id: orgIdParam } : await firstOrganizationOrNull(request);

  if (!organization) {
    throw json({ error: 'No organization found' }, { status: 400 });
  }

  try {
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
      forbidden: false as const,
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
  } catch (error) {
    /*
     * A member without manage permissions can still reach this route; show a
     * friendly read-only state instead of crashing the loader.
     */
    if (isForbiddenApiResponse(error)) {
      return json({
        forbidden: true as const,
        orgId: organization.id,
        memberships: [] as Array<{ id: string; userId: string; roleKey: string }>,
        roles: [] as Array<{ key: string; name: string }>,
      });
    }

    throw error;
  }
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
  const { forbidden, orgId, memberships, roles } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;

  if (forbidden) {
    return (
      <AppShell
        title="Organization members"
        description="Manage members with backend-enforced roles and audit coverage."
      >
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Member management is available only to organization owners or member managers.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Organization members" description="Manage members with backend-enforced roles and audit coverage.">
      <div className="grid gap-6">
        <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6">
          {actionData?.status ? (
            <p className="mb-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textSecondary">
              {actionData.status}
            </p>
          ) : null}
          {actionData?.error ? (
            <p className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              {actionData.error}
            </p>
          ) : null}
          <Form method="post" className="grid gap-4 lg:grid-cols-[1fr_1fr_220px_auto] lg:items-end">
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
        </section>

        <section className="overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-sm shadow-sm">
          <div className="border-b border-bolt-elements-borderColor px-4 py-3">
            <h2 className="font-semibold text-bolt-elements-textPrimary">Members</h2>
            <p className="mt-1 text-xs text-bolt-elements-textSecondary">
              Role changes are persisted through the organization membership API.
            </p>
          </div>
          {memberships.map((member) => (
            <div
              key={member.id}
              className="grid gap-3 border-b border-bolt-elements-borderColor p-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(180px,220px)_auto]"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-bolt-elements-textPrimary">{member.userId}</div>
                <div className="text-xs text-bolt-elements-textSecondary">{member.roleKey}</div>
              </div>
              <Form method="post" className="flex gap-2">
                <input type="hidden" name="intent" value="update" />
                <input type="hidden" name="orgId" value={orgId} />
                <input type="hidden" name="userId" value={member.userId} />
                <select
                  name="roleKey"
                  aria-label={`Role for ${member.userId}`}
                  defaultValue={member.roleKey}
                  className="h-9 min-w-0 flex-1 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2"
                >
                  {roles.map((role) => (
                    <option key={role.key} value={role.key}>
                      {role.name}
                    </option>
                  ))}
                </select>
                <button
                  className="rounded-md border border-bolt-elements-borderColor px-3 text-xs"
                  type="submit"
                  aria-label={`Update role for ${member.userId}`}
                >
                  Update
                </button>
              </Form>
              <Form
                method="post"
                onSubmit={(event) => {
                  // Destructive: confirm before removing a member from the org.
                  if (!window.confirm('Remove this member from the organization? They will lose access.')) {
                    event.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="intent" value="remove" />
                <input type="hidden" name="orgId" value={orgId} />
                <input type="hidden" name="userId" value={member.userId} />
                <button
                  className="h-9 rounded-md border border-bolt-elements-borderColor px-3 text-xs"
                  type="submit"
                  aria-label={`Remove ${member.userId}`}
                >
                  Remove
                </button>
              </Form>
            </div>
          ))}
          {memberships.length === 0 && <div className="p-4 text-bolt-elements-textSecondary">No members found.</div>}
        </section>
      </div>
    </AppShell>
  );
}
