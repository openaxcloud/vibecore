import * as RadixDialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation, useSubmit } from 'react-router';
import { PendingInvitationsSection, type PendingInvitation } from '~/components/dashboard/PendingInvitationsSection';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { PrimaryButton, SelectField, TextField } from '~/components/enterprise/EnterpriseFormPage';
import { ConfirmationDialog, Dialog, DialogTitle } from '~/components/ui/Dialog';
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
    const [membersResult, rolesResult, orgResult, invitesResult] = await Promise.all([
      apiRequest<{ memberships: Array<{ id: string; userId: string; roleKey: string }> }>(
        request,
        `/orgs/${organization.id}/memberships`,
      ),
      apiRequest<{ roles: Array<{ key: string; name: string; permissions: string[] }> }>(
        request,
        `/orgs/${organization.id}/roles`,
      ),

      // Org name feeds the type-to-confirm check in the transfer-ownership dialog.
      apiRequest<{ organization: { id: string; name: string } | null }>(request, `/orgs/${organization.id}`),
      apiRequest<{ invitations: PendingInvitation[] }>(request, `/orgs/${organization.id}/invitations`),
    ]);

    return json({
      forbidden: false as const,
      orgId: organization.id,
      orgName: orgResult.organization?.name ?? organization.id,
      memberships: membersResult.memberships,
      invitations: invitesResult.invitations,
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
        orgName: '',
        memberships: [] as Array<{ id: string; userId: string; roleKey: string }>,
        invitations: [] as PendingInvitation[],
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
    inviteId?: string;
  };

  // Invitation intents carry an inviteId (no userId) — handle them first.
  if (body.intent === 'invite-resend' || body.intent === 'invite-revoke') {
    if (!body.orgId || !body.inviteId) {
      return json({ error: 'Organization ID and invitation are required.' }, { status: 400 });
    }

    try {
      if (body.intent === 'invite-resend') {
        await apiRequest(request, `/orgs/${body.orgId}/invitations/${body.inviteId}/resend`, { method: 'POST' });

        return json({ status: 'Invitation resent.' });
      }

      // Revoke = the API's expire endpoint: the invitation link stops working.
      await apiRequest(request, `/orgs/${body.orgId}/invitations/${body.inviteId}/expire`, { method: 'POST' });

      return json({ status: 'Invitation revoked.' });
    } catch (error) {
      // Surface API errors (403, the 429 resend throttle, 404…) as a banner.
      if (error instanceof Response) {
        return json(
          { error: await apiErrorMessage(error, 'Could not complete the invitation action.') },
          { status: error.status },
        );
      }

      throw error;
    }
  }

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

    if (body.intent === 'transfer') {
      // Atomic server-side hand-off: promotes the target, demotes the caller.
      await apiRequest(request, `/orgs/${body.orgId}/memberships/${body.userId}/transfer-ownership`, {
        method: 'POST',
      });
      return json({ status: 'Ownership transferred. You are now an admin of this organization.' });
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

const LAST_OWNER_HINT = 'The last owner cannot be demoted. Transfer ownership to another member first.';

export default function OrganizationMembersPage() {
  const { forbidden, orgId, orgName, memberships, invitations, roles } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;
  const submit = useSubmit();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';

  // userId of the member the transfer-ownership dialog is open for, or null.
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');

  // userId of the member the remove-member confirmation dialog is open for, or null.
  const [memberPendingRemove, setMemberPendingRemove] = useState<string | null>(null);

  const ownerCount = memberships.filter((member) => member.roleKey === 'owner').length;
  const confirmMatches = confirmText.trim() === orgName;

  const closeTransferDialog = () => {
    setTransferTarget(null);
    setConfirmText('');
  };

  const confirmTransfer = () => {
    if (!transferTarget || !confirmMatches) {
      return;
    }

    submit({ intent: 'transfer', orgId, userId: transferTarget }, { method: 'post' });
    closeTransferDialog();
  };

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
          {memberships.map((member) => {
            /*
             * Client-side mirror of the server's LAST_OWNER guard: the only
             * remaining owner cannot be demoted or removed — ownership must be
             * transferred first.
             */
            const isLastOwner = member.roleKey === 'owner' && ownerCount <= 1;

            return (
              <div
                key={member.id}
                className="grid gap-3 border-b border-bolt-elements-borderColor p-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(180px,220px)_auto]"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-bolt-elements-textPrimary">{member.userId}</div>
                  <div className="text-xs text-bolt-elements-textSecondary">{member.roleKey}</div>
                </div>
                <Form method="post" className="flex flex-wrap gap-2" title={isLastOwner ? LAST_OWNER_HINT : undefined}>
                  <input type="hidden" name="intent" value="update" />
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="userId" value={member.userId} />
                  <select
                    name="roleKey"
                    aria-label={`Role for ${member.userId}`}
                    defaultValue={member.roleKey}
                    disabled={isLastOwner}
                    title={isLastOwner ? LAST_OWNER_HINT : undefined}
                    className="h-9 min-w-0 flex-1 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {roles.map((role) => (
                      <option key={role.key} value={role.key}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="h-9 shrink-0 rounded-md border border-bolt-elements-borderColor px-3 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                    type="submit"
                    disabled={isLastOwner}
                    title={isLastOwner ? LAST_OWNER_HINT : undefined}
                    aria-label={`Update role for ${member.userId}`}
                  >
                    Update
                  </button>
                </Form>
                <div className="flex flex-wrap gap-2">
                  {member.roleKey !== 'owner' && (
                    <button
                      type="button"
                      onClick={() => setTransferTarget(member.userId)}
                      className="h-9 rounded-md border border-bolt-elements-borderColor px-3 text-xs hover:bg-bolt-elements-background-depth-3"
                      title="Make this member the organization owner. You will be demoted to admin."
                      aria-label={`Transfer ownership to ${member.userId}`}
                    >
                      Transfer ownership
                    </button>
                  )}
                  <Form
                    method="post"
                    onSubmit={(event) => {
                      // Destructive: confirm before removing a member from the org.
                      event.preventDefault();
                      setMemberPendingRemove(member.userId);
                    }}
                  >
                    <input type="hidden" name="intent" value="remove" />
                    <input type="hidden" name="orgId" value={orgId} />
                    <input type="hidden" name="userId" value={member.userId} />
                    <button
                      className="h-9 rounded-md border border-bolt-elements-borderColor px-3 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                      type="submit"
                      disabled={isLastOwner}
                      title={isLastOwner ? 'The last owner cannot be removed. Transfer ownership first.' : undefined}
                      aria-label={`Remove ${member.userId}`}
                    >
                      Remove
                    </button>
                  </Form>
                </div>
              </div>
            );
          })}
          {memberships.length === 0 && <div className="p-4 text-bolt-elements-textSecondary">No members found.</div>}
        </section>

        <PendingInvitationsSection orgId={orgId} invitations={invitations} />
      </div>

      <RadixDialog.Root open={transferTarget !== null} onOpenChange={(open) => !open && closeTransferDialog()}>
        {transferTarget !== null ? (
          <Dialog onClose={closeTransferDialog} onBackdrop={closeTransferDialog}>
            <div className="p-6">
              <DialogTitle asChild>
                <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Transfer ownership</h2>
              </DialogTitle>
              <p className="mt-1 text-sm text-bolt-elements-textSecondary">
                <span className="font-medium text-bolt-elements-textPrimary">{transferTarget}</span> will become the
                owner of <span className="font-medium text-bolt-elements-textPrimary">{orgName}</span> and you will be
                demoted to admin. This cannot be undone by you.
              </p>

              <div className="mt-4">
                <label
                  htmlFor="transfer-confirm-name"
                  className="block text-sm font-medium text-bolt-elements-textPrimary"
                >
                  Type <span className="font-semibold">{orgName}</span> to confirm
                </label>
                <input
                  id="transfer-confirm-name"
                  type="text"
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={orgName}
                  className="mt-1 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:border-bolt-elements-focus focus:outline-none"
                />
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeTransferDialog}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-bolt-elements-borderColor px-4 text-sm font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmTransfer}
                  disabled={!confirmMatches || busy}
                  aria-busy={busy}
                  style={{ color: 'var(--status-error-text)' }}
                  title={confirmMatches ? undefined : 'Type the organization name exactly to enable the transfer.'}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-bolt-elements-borderColor px-4 text-sm font-medium transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? 'Transferring…' : 'Transfer ownership'}
                </button>
              </div>
            </div>
          </Dialog>
        ) : null}
      </RadixDialog.Root>
      <ConfirmationDialog
        isOpen={memberPendingRemove !== null}
        onClose={() => setMemberPendingRemove(null)}
        onConfirm={() => {
          const pending = memberPendingRemove;
          setMemberPendingRemove(null);

          if (pending) {
            submit({ intent: 'remove', orgId: orgId ?? '', userId: pending }, { method: 'post' });
          }
        }}
        title="Remove this member from the organization?"
        description="They will immediately lose access to the organization."
        confirmLabel="Remove member"
        variant="destructive"
      />
    </AppShell>
  );
}
