import { Form, useActionData, useLoaderData } from '@remix-run/react';
import { EnterpriseFormPage, PrimaryButton, SelectField, TextField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  firstOrganization,
  formObject,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const url = new URL(request.url);
  const organization = url.searchParams.get('orgId')
    ? { id: url.searchParams.get('orgId')! }
    : await firstOrganization(request);

  const result = await apiRequest<{
    invitations: Array<{ id: string; email: string; roleKey: string; acceptedAt?: string; expiresAt: string }>;
  }>(request, `/orgs/${organization.id}/invitations`);

  return json({ orgId: organization.id, invitations: result.invitations });
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
}

export default function InvitationsPage() {
  const { orgId, invitations } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="Invitations"
      description="Prepare enterprise member invitations with explicit organization roles."
      status={actionData?.status}
      error={actionData?.error}
    >
      <Form method="post" className="space-y-4">
        <TextField label="Organization ID" name="orgId" defaultValue={orgId} required />
        <TextField label="Email" name="email" type="email" required />
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
        <PrimaryButton>Create invitation</PrimaryButton>
      </Form>
      {invitations.length ? (
        <div className="mt-6 space-y-3">
          {invitations.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between gap-3 rounded-md border border-bolt-elements-borderColor px-3 py-2 text-sm"
            >
              <span>{invite.email}</span>
              <Form method="post" className="flex gap-2">
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
