import { useState } from 'react';
import { Form, useActionData, useLoaderData, useSubmit } from 'react-router';
import { EnterpriseFormPage, PrimaryButton, SelectField, TextField } from '~/components/enterprise/EnterpriseFormPage';
import { ConfirmationDialog } from '~/components/ui/Dialog';
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

export async function loader({ request }: EnterpriseLoaderArgs) {
  const url = new URL(request.url);
  const orgIdParam = url.searchParams.get('orgId');
  const organization = orgIdParam ? { id: orgIdParam } : await firstOrganizationOrNull(request);

  if (!organization) {
    throw json({ error: 'No organization found' }, { status: 400 });
  }

  let canManageInvitations = true;

  /*
   * The roles fetch hits GET /orgs/:id/roles, which requires
   * org:read / roles:manage / members:manage. A member lacking those perms — or
   * any caller who passed an ?orgId for an org they cannot read — would otherwise
   * get a 403 thrown here, collapsing the whole page into the error boundary
   * before the invitations fallback can degrade it to the read-only owner-only
   * state. Treat a 403 the same way as the invitations 403 below: no custom
   * roles, no invitation management. Re-auth redirects (3xx/401) and server
   * errors (5xx) still propagate so the framework / error boundary handles them.
   */
  let customRoles: Array<{ key: string; name: string }> = [];

  try {
    const rolesResult = await apiRequest<{ roles: Array<{ key: string; name: string; permissions: string[] }> }>(
      request,
      `/orgs/${organization.id}/roles`,
    );
    customRoles = rolesResult.roles.map((role) => ({ key: role.key, name: role.name }));
  } catch (error) {
    if (!isForbiddenApiResponse(error)) {
      throw error;
    }

    canManageInvitations = false;
  }

  let invitationsResult: {
    invitations: Array<{ id: string; email: string; roleKey: string; acceptedAt?: string; expiresAt: string }>;
  } = { invitations: [] };

  try {
    invitationsResult = await apiRequest<{
      invitations: Array<{ id: string; email: string; roleKey: string; acceptedAt?: string; expiresAt: string }>;
    }>(request, `/orgs/${organization.id}/invitations`);
  } catch (error) {
    if (!isForbiddenApiResponse(error)) {
      throw error;
    }

    canManageInvitations = false;
  }

  return json({
    orgId: organization.id,
    invitations: invitationsResult.invitations,
    canManageInvitations,
    roles: [
      { key: 'viewer', name: 'Viewer' },
      { key: 'member', name: 'Member' },
      { key: 'admin', name: 'Admin' },
      { key: 'owner', name: 'Owner' },
      ...customRoles,
    ],
  });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as {
    orgId?: string;
    email?: string;
    roleKey?: string;
    intent?: string;
    inviteId?: string;
  };

  if (!body.orgId) {
    return json({ error: 'Your organization is unavailable. Reload the page and try again.' }, { status: 400 });
  }

  try {
    if (body.intent === 'resend' && body.inviteId) {
      await apiRequest(request, `/orgs/${body.orgId}/invitations/${body.inviteId}/resend`, { method: 'POST' });
      return json({ status: 'Invitation resent.' });
    }

    if (body.intent === 'expire' && body.inviteId) {
      await apiRequest(request, `/orgs/${body.orgId}/invitations/${body.inviteId}/expire`, { method: 'POST' });
      return json({ status: 'Invitation expired.' });
    }

    await apiRequest(request, `/orgs/${body.orgId}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ email: body.email, roleKey: body.roleKey }),
    });

    return json({ status: 'Invitation created.' });
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      return json(
        { error: await apiErrorMessage(error, 'You cannot manage invitations for this organization.') },
        { status: 403 },
      );
    }

    throw error;
  }
}

export default function InvitationsPage() {
  const { orgId, invitations, roles, canManageInvitations } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;
  const submit = useSubmit();
  const [invitePendingExpire, setInvitePendingExpire] = useState<string | null>(null);

  return (
    <EnterpriseFormPage
      title="Invitations"
      description="Invite teammates and assign the right level of access."
      status={actionData?.status}
      error={actionData?.error}
    >
      {canManageInvitations ? (
        <Form method="post" className="space-y-4">
          <input type="hidden" name="orgId" value={orgId} />
          <TextField label="Email" name="email" type="email" required />
          <SelectField
            label="Role"
            name="roleKey"
            defaultValue="member"
            options={roles.map((role) => ({ value: role.key, label: role.name }))}
          />
          <PrimaryButton>Create invitation</PrimaryButton>
        </Form>
      ) : (
        <p className="rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2 text-sm text-[var(--status-warning-text)]">
          Invitations are available only to organization owners or member managers.
        </p>
      )}
      {invitations.length ? (
        <div className="mt-6 space-y-3">
          {invitations.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between gap-3 rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate" title={invite.email}>
                {invite.email}
              </span>
              <Form
                method="post"
                className="flex shrink-0 gap-2"
                onSubmit={(event) => {
                  const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;

                  if (submitter?.value === 'expire') {
                    event.preventDefault();
                    setInvitePendingExpire(invite.id);
                  }
                }}
              >
                <input type="hidden" name="orgId" value={orgId} />
                <input type="hidden" name="inviteId" value={invite.id} />
                <button name="intent" value="resend" className="text-bolt-elements-textSecondary">
                  Resend
                </button>
                <button name="intent" value="expire" className="text-bolt-elements-textSecondary">
                  Expire
                </button>
              </Form>
            </div>
          ))}
        </div>
      ) : null}
      <ConfirmationDialog
        isOpen={invitePendingExpire !== null}
        onClose={() => setInvitePendingExpire(null)}
        onConfirm={() => {
          const pending = invitePendingExpire;
          setInvitePendingExpire(null);

          if (pending) {
            submit({ intent: 'expire', orgId: orgId ?? '', inviteId: pending }, { method: 'post' });
          }
        }}
        title="Expire this invitation?"
        description="The recipient will no longer be able to use the link."
        confirmLabel="Expire invitation"
        variant="destructive"
      />
    </EnterpriseFormPage>
  );
}
