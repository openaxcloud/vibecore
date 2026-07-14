import * as RadixDialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation, useRevalidator, useSubmit } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
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
import { isReauthRedirect } from '~/lib/route-reauth';
import { memberDisplayLabel, userFacingLabel } from '~/lib/user-facing-labels';

export const meta: MetaFunction = () => [{ title: 'Organization members - E-Code' }];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const orgIdParam = new URL(request.url).searchParams.get('orgId');
  const organization = orgIdParam ? { id: orgIdParam } : await firstOrganizationOrNull(request);

  if (!organization) {
    throw json({ error: 'No organization found' }, { status: 400 });
  }

  try {
    const [membersResult, rolesResult, orgResult, invitesResult] = await Promise.all([
      apiRequest<{
        memberships: Array<{ id: string; userId: string; roleKey: string; userName?: string; userEmail?: string }>;
      }>(request, `/orgs/${organization.id}/memberships`),
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
      loadError: null,
      loadErrorKind: null,
      orgId: organization.id,
      orgName: orgResult.organization?.name ?? 'Organization',
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
    if (isReauthRedirect(error)) {
      throw error;
    }

    /*
     * A member without manage permissions can still reach this route; show a
     * friendly read-only state instead of crashing the loader.
     */
    if (isForbiddenApiResponse(error)) {
      return json({
        forbidden: true as const,
        loadError: "You don't have permission to manage this organization's members.",
        loadErrorKind: 'permission' as const,
        orgId: organization.id,
        orgName: '',
        memberships: [] as Array<{
          id: string;
          userId: string;
          roleKey: string;
          userName?: string;
          userEmail?: string;
        }>,
        invitations: [] as PendingInvitation[],
        roles: [] as Array<{ key: string; name: string }>,
      });
    }

    return json({
      forbidden: false as const,
      loadError: 'Organization members are temporarily unavailable.',
      loadErrorKind: 'temporary' as const,
      orgId: organization.id,
      orgName: '',
      memberships: [] as Array<{
        id: string;
        userId: string;
        roleKey: string;
        userName?: string;
        userEmail?: string;
      }>,
      invitations: [] as PendingInvitation[],
      roles: [] as Array<{ key: string; name: string }>,
    });
  }
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as {
    intent?: string;
    orgId?: string;
    userId?: string;
    email?: string;
    roleKey?: string;
    inviteId?: string;
  };

  // Invite a new member by email — creates a pending invitation + sends the email.
  if (body.intent === 'invite') {
    if (!body.orgId || !body.email) {
      return json({ error: 'An email address is required to send an invitation.' }, { status: 400 });
    }

    try {
      await apiRequest(request, `/orgs/${body.orgId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ email: body.email, roleKey: body.roleKey ?? 'member' }),
      });

      return json({ status: `Invitation sent to ${body.email}.` });
    } catch (error) {
      if (error instanceof Response) {
        return json(
          { error: await apiErrorMessage(error, 'Could not send the invitation.') },
          { status: error.status },
        );
      }

      throw error;
    }
  }

  // Invitation intents carry an inviteId (no userId) — handle them first.
  if (body.intent === 'invite-resend' || body.intent === 'invite-revoke') {
    if (!body.orgId || !body.inviteId) {
      return json({ error: 'Choose an invitation and try again.' }, { status: 400 });
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
    return json({ error: 'Choose a member and try again.' }, { status: 400 });
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
  const { orgId, orgName, memberships, invitations, roles, loadError, loadErrorKind } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;
  const submit = useSubmit();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const busy = navigation.state !== 'idle';
  const retrying = revalidator.state !== 'idle';

  // userId of the member the transfer-ownership dialog is open for, or null.
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');

  // userId of the member the remove-member confirmation dialog is open for, or null.
  const [memberPendingRemove, setMemberPendingRemove] = useState<string | null>(null);

  const ownerCount = memberships.filter((member) => member.roleKey === 'owner').length;
  const confirmMatches = confirmText.trim() === orgName;

  // Friendly label for dialog copy without exposing the opaque member id.
  const memberLabel = (userId: string | null) => {
    const matchIndex = memberships.findIndex((member) => member.userId === userId);
    const match = matchIndex >= 0 ? memberships[matchIndex] : undefined;

    return match
      ? memberDisplayLabel({ name: match.userName, email: match.userEmail }, matchIndex)
      : 'Organization member';
  };

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

  if (loadError) {
    return (
      <AppShell
        title="Organization members"
        description="Invite members, assign roles and review access across your organization."
      >
        {retrying ? (
          <AsyncPanelSkeleton label="Loading organization members" rows={5} />
        ) : (
          <AsyncPanelError
            title={loadErrorKind === 'permission' ? 'Member management is restricted' : 'Members could not load'}
            description={
              loadErrorKind === 'permission'
                ? "Your role cannot manage this organization's members. Invitations and member controls are hidden."
                : 'Member and invitation controls are hidden because the latest request failed. No access was changed.'
            }
            onRetry={revalidator.revalidate}
            tone={loadErrorKind === 'permission' ? 'warning' : 'error'}
          />
        )}
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Organization members"
      description="Invite members, assign roles and review access across your organization."
    >
      <div className="grid gap-6">
        <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6">
          {actionData?.status ? (
            <p className="mb-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textSecondary">
              {actionData.status}
            </p>
          ) : null}
          {actionData?.error ? (
            <p className="mb-4 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-sm text-[var(--status-error-text)]">
              {actionData.error}
            </p>
          ) : null}
          <Form method="post" className="grid gap-4 lg:grid-cols-[1fr_220px_auto] lg:items-end">
            <input type="hidden" name="intent" value="invite" />
            <input type="hidden" name="orgId" value={orgId} />
            <TextField label="Invite by email" name="email" type="email" placeholder="teammate@company.com" required />
            <SelectField
              label="Role"
              name="roleKey"
              defaultValue="member"
              options={roles.map((role) => ({ value: role.key, label: role.name }))}
            />
            <PrimaryButton>Send invite</PrimaryButton>
          </Form>
          <p className="mt-2 text-xs text-bolt-elements-textSecondary">
            We&rsquo;ll email an invitation link. They join with the selected role once they accept.
          </p>
        </section>

        <section className="overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-sm shadow-sm">
          <div className="border-b border-bolt-elements-borderColor px-4 py-3">
            <h2 className="font-semibold text-bolt-elements-textPrimary">Members</h2>
            <p className="mt-1 text-xs text-bolt-elements-textSecondary">
              Role changes take effect as soon as you save them.
            </p>
          </div>
          {memberships.map((member, memberIndex) => {
            /*
             * Client-side mirror of the server's LAST_OWNER guard: the only
             * remaining owner cannot be demoted or removed — ownership must be
             * transferred first.
             */
            const isLastOwner = member.roleKey === 'owner' && ownerCount <= 1;

            const memberRoleLabel =
              roles.find((role) => role.key === member.roleKey)?.name ?? userFacingLabel(member.roleKey, 'Member');

            const displayName = memberDisplayLabel({ name: member.userName, email: member.userEmail }, memberIndex);
            const hasName = Boolean(member.userName);

            return (
              <div
                key={member.id}
                className="grid gap-3 border-b border-bolt-elements-borderColor p-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(180px,220px)_auto]"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-bolt-elements-textPrimary">{displayName}</div>
                  <div className="truncate text-xs text-bolt-elements-textSecondary">
                    {hasName && member.userEmail ? `${member.userEmail} · ` : ''}
                    {memberRoleLabel}
                  </div>
                </div>
                <Form method="post" className="flex flex-wrap gap-2" title={isLastOwner ? LAST_OWNER_HINT : undefined}>
                  <input type="hidden" name="intent" value="update" />
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="userId" value={member.userId} />
                  <select
                    name="roleKey"
                    aria-label={`Role for ${displayName}`}
                    defaultValue={member.roleKey}
                    disabled={isLastOwner}
                    title={isLastOwner ? LAST_OWNER_HINT : undefined}
                    className="min-h-[44px] min-w-0 flex-1 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {roles.map((role) => (
                      <option key={role.key} value={role.key}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="min-h-[44px] shrink-0 rounded-md border border-bolt-elements-borderColor px-3 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                    type="submit"
                    disabled={isLastOwner}
                    title={isLastOwner ? LAST_OWNER_HINT : undefined}
                    aria-label={`Update role for ${displayName}`}
                  >
                    Update
                  </button>
                </Form>
                <div className="flex flex-wrap gap-2">
                  {member.roleKey !== 'owner' && (
                    <button
                      type="button"
                      onClick={() => setTransferTarget(member.userId)}
                      className="min-h-[44px] rounded-md border border-bolt-elements-borderColor px-3 text-xs hover:bg-bolt-elements-background-depth-3"
                      title="Make this member the organization owner. You will be demoted to admin."
                      aria-label={`Transfer ownership to ${displayName}`}
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
                      className="min-h-[44px] rounded-md border border-bolt-elements-borderColor px-3 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                      type="submit"
                      disabled={isLastOwner}
                      title={isLastOwner ? 'The last owner cannot be removed. Transfer ownership first.' : undefined}
                      aria-label={`Remove ${displayName}`}
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
                <span className="font-medium text-bolt-elements-textPrimary">{memberLabel(transferTarget)}</span> will
                become the owner of <span className="font-medium text-bolt-elements-textPrimary">{orgName}</span> and
                you will be demoted to admin. This cannot be undone by you.
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
                  className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-bolt-elements-borderColor px-4 text-sm font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3"
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
                  className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-bolt-elements-borderColor px-4 text-sm font-medium transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-60"
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
