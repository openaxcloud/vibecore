import { Form, useActionData, useLoaderData } from 'react-router';
import { EnterpriseFormPage, PrimaryButton, SelectField, TextField } from '~/components/enterprise/EnterpriseFormPage';
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

  const rolesResult = await apiRequest<{ roles: Array<{ key: string; name: string; permissions: string[] }> }>(
    request,
    `/orgs/${organization.id}/roles`,
  );

  let canManageInvitations = true;

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
      ...rolesResult.roles.map((role) => ({ key: role.key, name: role.name })),
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
    return json({ error: 'Organization ID is required.' }, { status: 400 });
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

  return (
    <EnterpriseFormPage
      title="Invitations"
      description="Prepare enterprise member invitations with explicit organization roles."
      status={actionData?.status}
      error={actionData?.error}
    >
      {canManageInvitations ? (
        <Form method="post" className="space-y-4">
          <TextField label="Organization ID" name="orgId" defaultValue={orgId} required />
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
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
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

                  if (
                    submitter?.value === 'expire' &&
                    !window.confirm('Expire this invitation? The recipient will no longer be able to use the link.')
                  ) {
                    event.preventDefault();
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
    </EnterpriseFormPage>
  );
}
