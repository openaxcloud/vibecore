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
  firstOrganizationOrNull,
  formObject,
  isForbiddenApiResponse,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  formatOrganizationMembersCopy,
  getOrganizationMembersCopy,
  organizationMemberRoleLabel,
  resolveOrganizationMembersLanguage,
} from '~/lib/i18n/catalogs/organization-members';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isReauthRedirect } from '~/lib/route-reauth';

export const meta: MetaFunction = ({ matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;

  return [{ title: getOrganizationMembersCopy(rootData?.language)['organizationMembers.metaTitle'] }];
};
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const language = resolveOrganizationMembersLanguage(resolveRequestLocale(request).language);
  const copy = getOrganizationMembersCopy(language);
  const orgIdParam = new URL(request.url).searchParams.get('orgId');
  const organization = orgIdParam ? { id: orgIdParam } : await firstOrganizationOrNull(request);

  if (!organization) {
    throw json({ error: copy['organizationMembers.errors.noOrganization'] }, { status: 400 });
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
      language,
      orgId: organization.id,
      orgName: orgResult.organization?.name ?? copy['organizationMembers.defaultOrganization'],
      memberships: membersResult.memberships,
      invitations: invitesResult.invitations,
      roles: [
        { key: 'viewer', name: copy['organizationMembers.role.viewer'] },
        { key: 'member', name: copy['organizationMembers.role.member'] },
        { key: 'admin', name: copy['organizationMembers.role.admin'] },
        { key: 'owner', name: copy['organizationMembers.role.owner'] },
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
        loadError: true,
        loadErrorKind: 'permission' as const,
        language,
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
      loadError: true,
      loadErrorKind: 'temporary' as const,
      language,
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
  const copy = getOrganizationMembersCopy(resolveRequestLocale(request).language);

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
      return json({ error: copy['organizationMembers.errors.emailRequired'] }, { status: 400 });
    }

    try {
      await apiRequest(request, `/orgs/${body.orgId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ email: body.email, roleKey: body.roleKey ?? 'member' }),
      });

      return json({
        status: formatOrganizationMembersCopy(copy['organizationMembers.success.invited'], { email: body.email }),
      });
    } catch (error) {
      if (isReauthRedirect(error)) {
        throw error;
      }

      if (error instanceof Response) {
        return json({ error: copy['organizationMembers.errors.invitationFailed'] }, { status: error.status });
      }

      throw error;
    }
  }

  // Invitation intents carry an inviteId (no userId) — handle them first.
  if (body.intent === 'invite-resend' || body.intent === 'invite-revoke') {
    if (!body.orgId || !body.inviteId) {
      return json({ error: copy['organizationMembers.errors.invitationRequired'] }, { status: 400 });
    }

    try {
      if (body.intent === 'invite-resend') {
        await apiRequest(request, `/orgs/${body.orgId}/invitations/${body.inviteId}/resend`, { method: 'POST' });

        return json({ status: copy['organizationMembers.success.inviteResent'] });
      }

      // Revoke = the API's expire endpoint: the invitation link stops working.
      await apiRequest(request, `/orgs/${body.orgId}/invitations/${body.inviteId}/expire`, { method: 'POST' });

      return json({ status: copy['organizationMembers.success.inviteRevoked'] });
    } catch (error) {
      if (isReauthRedirect(error)) {
        throw error;
      }

      // Surface API errors (403, the 429 resend throttle, 404…) as a banner.
      if (error instanceof Response) {
        return json({ error: copy['organizationMembers.errors.invitationAction'] }, { status: error.status });
      }

      throw error;
    }
  }

  if (!body.orgId || !body.userId) {
    return json({ error: copy['organizationMembers.errors.memberRequired'] }, { status: 400 });
  }

  try {
    if (body.intent === 'remove') {
      await apiRequest(request, `/orgs/${body.orgId}/memberships/${body.userId}`, { method: 'DELETE' });
      return json({ status: copy['organizationMembers.success.removed'] });
    }

    if (body.intent === 'update') {
      await apiRequest(request, `/orgs/${body.orgId}/memberships/${body.userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ roleKey: body.roleKey }),
      });
      return json({ status: copy['organizationMembers.success.updated'] });
    }

    if (body.intent === 'transfer') {
      // Atomic server-side hand-off: promotes the target, demotes the caller.
      await apiRequest(request, `/orgs/${body.orgId}/memberships/${body.userId}/transfer-ownership`, {
        method: 'POST',
      });
      return json({ status: copy['organizationMembers.success.transferred'] });
    }

    if (body.intent !== 'add') {
      return json({ error: copy['organizationMembers.errors.invalidAction'] }, { status: 400 });
    }

    await apiRequest(request, `/orgs/${body.orgId}/memberships`, {
      method: 'POST',
      body: JSON.stringify({ userId: body.userId, roleKey: body.roleKey }),
    });

    return json({ status: copy['organizationMembers.success.added'] });
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      return json({ error: copy['organizationMembers.errors.memberForbidden'] }, { status: 403 });
    }

    throw error;
  }
}

export default function OrganizationMembersPage() {
  const {
    orgId,
    orgName,
    memberships,
    invitations,
    roles,
    loadError,
    loadErrorKind,
    language: loaderLanguage,
  } = useLoaderData<typeof loader>();

  const language = resolveOrganizationMembersLanguage(loaderLanguage);
  const copy = getOrganizationMembersCopy(language);
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

    if (!match) {
      return copy['organizationMembers.members.fallback'];
    }

    return (
      match.userName?.trim() ||
      match.userEmail?.trim() ||
      formatOrganizationMembersCopy(copy['organizationMembers.members.fallbackIndexed'], {
        index: new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-US').format(matchIndex + 1),
      })
    );
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
      <AppShell title={copy['organizationMembers.title']} description={copy['organizationMembers.description']}>
        {retrying ? (
          <AsyncPanelSkeleton label={copy['organizationMembers.load.loading']} rows={5} />
        ) : (
          <AsyncPanelError
            title={
              loadErrorKind === 'permission'
                ? copy['organizationMembers.load.permissionTitle']
                : copy['organizationMembers.load.errorTitle']
            }
            description={
              loadErrorKind === 'permission'
                ? copy['organizationMembers.load.permissionDescription']
                : copy['organizationMembers.load.errorDescription']
            }
            onRetry={revalidator.revalidate}
            tone={loadErrorKind === 'permission' ? 'warning' : 'error'}
          />
        )}
      </AppShell>
    );
  }

  return (
    <AppShell title={copy['organizationMembers.title']} description={copy['organizationMembers.description']}>
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
            <TextField
              label={copy['organizationMembers.invite.email']}
              name="email"
              type="email"
              placeholder={copy['organizationMembers.invite.emailPlaceholder']}
              required
            />
            <SelectField
              label={copy['organizationMembers.invite.role']}
              name="roleKey"
              defaultValue="member"
              options={roles.map((role) => ({ value: role.key, label: role.name }))}
            />
            <PrimaryButton>{copy['organizationMembers.invite.send']}</PrimaryButton>
          </Form>
          <p className="mt-2 text-xs text-bolt-elements-textSecondary">{copy['organizationMembers.invite.help']}</p>
        </section>

        <section className="overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-sm shadow-sm">
          <div className="border-b border-bolt-elements-borderColor px-4 py-3">
            <h2 className="font-semibold text-bolt-elements-textPrimary">
              {copy['organizationMembers.members.title']}
            </h2>
            <p className="mt-1 text-xs text-bolt-elements-textSecondary">
              {copy['organizationMembers.members.description']}
            </p>
          </div>
          {memberships.map((member, memberIndex) => {
            /*
             * Client-side mirror of the server's LAST_OWNER guard: the only
             * remaining owner cannot be demoted or removed — ownership must be
             * transferred first.
             */
            const isLastOwner = member.roleKey === 'owner' && ownerCount <= 1;

            const memberRoleLabel = organizationMemberRoleLabel(
              member.roleKey,
              roles.find((role) => role.key === member.roleKey)?.name,
              copy,
            );

            const displayName =
              member.userName?.trim() ||
              member.userEmail?.trim() ||
              formatOrganizationMembersCopy(copy['organizationMembers.members.fallbackIndexed'], {
                index: new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-US').format(memberIndex + 1),
              });

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
                <Form
                  method="post"
                  className="flex flex-wrap gap-2"
                  title={isLastOwner ? copy['organizationMembers.members.lastOwnerRole'] : undefined}
                >
                  <input type="hidden" name="intent" value="update" />
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="userId" value={member.userId} />
                  <select
                    name="roleKey"
                    aria-label={formatOrganizationMembersCopy(copy['organizationMembers.members.roleAria'], {
                      member: displayName,
                    })}
                    defaultValue={member.roleKey}
                    disabled={isLastOwner}
                    title={isLastOwner ? copy['organizationMembers.members.lastOwnerRole'] : undefined}
                    className="min-h-[44px] min-w-0 flex-1 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {roles.map((role) => (
                      <option key={role.key} value={role.key}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="min-h-[44px] shrink-0 whitespace-normal rounded-md border border-bolt-elements-borderColor px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                    type="submit"
                    disabled={isLastOwner}
                    title={isLastOwner ? copy['organizationMembers.members.lastOwnerRole'] : undefined}
                    aria-label={formatOrganizationMembersCopy(copy['organizationMembers.members.updateAria'], {
                      member: displayName,
                    })}
                  >
                    {copy['organizationMembers.members.update']}
                  </button>
                </Form>
                <div className="flex flex-wrap gap-2">
                  {member.roleKey !== 'owner' && (
                    <button
                      type="button"
                      onClick={() => setTransferTarget(member.userId)}
                      className="min-h-[44px] whitespace-normal rounded-md border border-bolt-elements-borderColor px-3 py-2 text-xs hover:bg-bolt-elements-background-depth-3"
                      title={copy['organizationMembers.members.transferTitle']}
                      aria-label={formatOrganizationMembersCopy(copy['organizationMembers.members.transferAria'], {
                        member: displayName,
                      })}
                    >
                      {copy['organizationMembers.members.transfer']}
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
                      className="min-h-[44px] whitespace-normal rounded-md border border-bolt-elements-borderColor px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                      type="submit"
                      disabled={isLastOwner}
                      title={isLastOwner ? copy['organizationMembers.members.lastOwnerRemove'] : undefined}
                      aria-label={formatOrganizationMembersCopy(copy['organizationMembers.members.removeAria'], {
                        member: displayName,
                      })}
                    >
                      {copy['organizationMembers.members.remove']}
                    </button>
                  </Form>
                </div>
              </div>
            );
          })}
          {memberships.length === 0 && (
            <div className="p-4 text-bolt-elements-textSecondary">{copy['organizationMembers.members.empty']}</div>
          )}
        </section>

        <PendingInvitationsSection orgId={orgId} invitations={invitations} />
      </div>

      <RadixDialog.Root open={transferTarget !== null} onOpenChange={(open) => !open && closeTransferDialog()}>
        {transferTarget !== null ? (
          <Dialog onClose={closeTransferDialog} onBackdrop={closeTransferDialog}>
            <div className="p-6">
              <DialogTitle asChild>
                <h2 className="text-base font-semibold text-bolt-elements-textPrimary">
                  {copy['organizationMembers.transfer.title']}
                </h2>
              </DialogTitle>
              <p className="mt-1 break-words text-sm text-bolt-elements-textSecondary">
                {formatOrganizationMembersCopy(copy['organizationMembers.transfer.description'], {
                  member: memberLabel(transferTarget),
                  organization: orgName,
                })}
              </p>

              <div className="mt-4">
                <label
                  htmlFor="transfer-confirm-name"
                  className="block text-sm font-medium text-bolt-elements-textPrimary"
                >
                  {formatOrganizationMembersCopy(copy['organizationMembers.transfer.confirmInstruction'], {
                    organization: orgName,
                  })}
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

              <div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={closeTransferDialog}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-bolt-elements-borderColor px-4 text-sm font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3"
                >
                  {copy['organizationMembers.transfer.cancel']}
                </button>
                <button
                  type="button"
                  onClick={confirmTransfer}
                  disabled={!confirmMatches || busy}
                  aria-busy={busy}
                  style={{ color: 'var(--status-error-text)' }}
                  title={confirmMatches ? undefined : copy['organizationMembers.transfer.disabledTitle']}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-bolt-elements-borderColor px-4 text-sm font-medium transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? copy['organizationMembers.transfer.busy'] : copy['organizationMembers.transfer.confirm']}
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
        title={copy['organizationMembers.remove.title']}
        description={copy['organizationMembers.remove.description']}
        confirmLabel={copy['organizationMembers.remove.confirm']}
        variant="destructive"
      />
    </AppShell>
  );
}
