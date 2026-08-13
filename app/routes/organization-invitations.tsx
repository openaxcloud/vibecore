import { useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useSubmit } from 'react-router';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { PrimaryButton, SelectField, TextField } from '~/components/enterprise/EnterpriseFormPage';
import { Badge } from '~/components/ui/Badge';
import { ConfirmationDialog } from '~/components/ui/Dialog';
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
import { formatUserAreaDateTime } from '~/lib/i18n/user-area-locale';
import { BUILTIN_ROLE_LABELS, BUILTIN_ROLE_ORDER } from '~/lib/rbac-catalog';
import { userFacingLabel } from '~/lib/user-facing-labels';

export const meta: MetaFunction = () => [{ title: 'Organization invitations - E-Code' }];

type Invitation = {
  id: string;
  email: string;
  roleKey: string;
  expiresAt: string;
  acceptedAt?: string;
  createdAt: string;
};

type RoleOption = { value: string; label: string };

export async function loader({ request }: EnterpriseLoaderArgs) {
  const orgIdParam = new URL(request.url).searchParams.get('orgId');
  const organization = orgIdParam ? { id: orgIdParam } : await firstOrganizationOrNull(request);

  if (!organization) {
    throw json({ error: 'No organization found' }, { status: 400 });
  }

  try {
    // Roles power the invite role select: built-ins + the org's custom roles.
    const [invitesResult, rolesResult] = await Promise.all([
      apiRequest<{ invitations: Invitation[] }>(request, `/orgs/${organization.id}/invitations`),
      apiRequest<{ roles: Array<{ key: string; name: string }> }>(request, `/orgs/${organization.id}/roles`),
    ]);

    const roles: RoleOption[] = [
      ...BUILTIN_ROLE_ORDER.map((key) => ({ value: key, label: BUILTIN_ROLE_LABELS[key] ?? key })),
      ...rolesResult.roles.map((role) => ({ value: role.key, label: role.name })),
    ];

    return json({
      forbidden: false as const,
      orgId: organization.id,
      invitations: invitesResult.invitations,
      roles,
    });
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      return json({
        forbidden: true as const,
        orgId: organization.id,
        invitations: [] as Invitation[],
        roles: [] as RoleOption[],
      });
    }

    throw error;
  }
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as {
    intent?: string;
    orgId?: string;
    inviteId?: string;
    email?: string;
    roleKey?: string;
  };

  if (!body.orgId) {
    return json({ error: 'Your organization is unavailable. Reload the page and try again.' }, { status: 400 });
  }

  try {
    if (body.intent === 'resend') {
      if (!body.inviteId) {
        return json({ error: 'Invitation is required.' }, { status: 400 });
      }

      await apiRequest(request, `/orgs/${body.orgId}/invitations/${body.inviteId}/resend`, { method: 'POST' });

      return json({ status: 'Invitation resent.' });
    }

    if (body.intent === 'expire') {
      if (!body.inviteId) {
        return json({ error: 'Invitation is required.' }, { status: 400 });
      }

      await apiRequest(request, `/orgs/${body.orgId}/invitations/${body.inviteId}/expire`, { method: 'POST' });

      return json({ status: 'Invitation expired.' });
    }

    // Default intent: create a new invitation.
    if (!body.email) {
      return json({ error: 'An email address is required.' }, { status: 400 });
    }

    await apiRequest(request, `/orgs/${body.orgId}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ email: body.email, roleKey: body.roleKey ?? 'member' }),
    });

    return json({ status: `Invitation sent to ${body.email}.` });
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      return json(
        {
          error: await apiErrorMessage(
            error,
            'You need the "Manage members" permission, and can only invite roles you are allowed to assign.',
          ),
        },
        { status: 403 },
      );
    }

    if (error instanceof Response) {
      return json(
        { error: await apiErrorMessage(error, 'Could not complete the invitation action.') },
        {
          status: error.status,
        },
      );
    }

    throw error;
  }
}

function formatDate(value: string) {
  const parsed = new Date(value);

  return formatUserAreaDateTime(parsed) ?? value;
}

export default function OrganizationInvitationsPage() {
  const { forbidden, orgId, invitations, roles } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;
  const submit = useSubmit();
  const [invitePendingExpire, setInvitePendingExpire] = useState<{ id: string; email: string } | null>(null);

  const roleLabel = (roleKey: string) =>
    roles.find((role) => role.value === roleKey)?.label ?? userFacingLabel(roleKey, 'Member');

  if (forbidden) {
    return (
      <AppShell
        title="Organization invitations"
        description="Invite people to your organization and manage pending invites."
      >
        <p className="rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2 text-sm text-[var(--status-warning-text)]">
          Invitation management is available only to organization owners or member managers.
        </p>
      </AppShell>
    );
  }

  const now = Date.now();

  return (
    <AppShell
      title="Organization invitations"
      description="Invite people to your organization and manage pending invites."
    >
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

        {/* Invite form. */}
        <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6">
          <h2 className="mb-4 font-semibold text-bolt-elements-textPrimary">Invite a member</h2>
          <Form method="post" className="grid gap-4 lg:grid-cols-[1fr_220px_auto] lg:items-end">
            <input type="hidden" name="orgId" value={orgId} />
            <TextField label="Email" name="email" type="email" placeholder="person@company.com" required />
            <SelectField label="Role" name="roleKey" defaultValue="member" options={roles} />
            <PrimaryButton type="submit">Send invitation</PrimaryButton>
          </Form>
        </section>

        {/* Pending invitations. */}
        <section className="overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-sm shadow-sm">
          <div className="border-b border-bolt-elements-borderColor px-4 py-3 sm:px-6">
            <h2 className="font-semibold text-bolt-elements-textPrimary">Pending invitations</h2>
            <p className="mt-1 text-xs text-bolt-elements-textSecondary">
              Resend rotates the invitation link; expire revokes it immediately.
            </p>
          </div>
          {invitations.length === 0 ? (
            <div className="px-4 py-4 text-bolt-elements-textSecondary sm:px-6">No pending invitations.</div>
          ) : (
            [...invitations]

              // Expired invitations sink to the bottom; active ones keep their order.
              .sort(
                (a, b) => Number(new Date(a.expiresAt).getTime() < now) - Number(new Date(b.expiresAt).getTime() < now),
              )
              .map((invite) => {
                const expired = new Date(invite.expiresAt).getTime() < now;
                const accepted = Boolean(invite.acceptedAt);

                return (
                  <div
                    key={invite.id}
                    className="grid gap-3 border-b border-bolt-elements-borderColor px-4 py-4 last:border-b-0 sm:px-6 md:grid-cols-[1fr_auto] md:items-center"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-bolt-elements-textPrimary">{invite.email}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-bolt-elements-textSecondary">
                        <span className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5">
                          {roleLabel(invite.roleKey)}
                        </span>
                        <span>Expires {formatDate(invite.expiresAt)}</span>
                        {accepted ? (
                          <Badge variant="success">Accepted</Badge>
                        ) : expired ? (
                          <Badge variant="warning">Expired</Badge>
                        ) : (
                          <Badge variant="secondary">Pending</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Form method="post">
                        <input type="hidden" name="intent" value="resend" />
                        <input type="hidden" name="orgId" value={orgId} />
                        <input type="hidden" name="inviteId" value={invite.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-1"
                          aria-label={`Resend invitation to ${invite.email}`}
                        >
                          Resend
                        </button>
                      </Form>
                      <Form
                        method="post"
                        onSubmit={(event) => {
                          // Destructive: confirm before revoking the invite link.
                          event.preventDefault();
                          setInvitePendingExpire({ id: invite.id, email: invite.email });
                        }}
                      >
                        <input type="hidden" name="intent" value="expire" />
                        <input type="hidden" name="orgId" value={orgId} />
                        <input type="hidden" name="inviteId" value={invite.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-[var(--status-error-border)] px-3 py-1.5 text-xs text-[var(--status-error-text)] hover:bg-[var(--status-error-bg)]"
                          aria-label={`Expire invitation to ${invite.email}`}
                        >
                          Expire
                        </button>
                      </Form>
                    </div>
                  </div>
                );
              })
          )}
        </section>
      </div>
      <ConfirmationDialog
        isOpen={invitePendingExpire !== null}
        onClose={() => setInvitePendingExpire(null)}
        onConfirm={() => {
          const pending = invitePendingExpire;
          setInvitePendingExpire(null);

          if (pending) {
            submit({ intent: 'expire', orgId: orgId ?? '', inviteId: pending.id }, { method: 'post' });
          }
        }}
        title={`Expire the invitation for ${invitePendingExpire?.email ?? ''}?`}
        description="The invite link stops working immediately."
        confirmLabel="Expire invitation"
        variant="destructive"
      />
    </AppShell>
  );
}
