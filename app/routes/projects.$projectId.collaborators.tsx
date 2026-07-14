import { Users } from 'lucide-react';
import { useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { ProjectShell } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import { RelativeTime } from '~/components/ui/RelativeTime';
import { handleCollaboratorActionError } from '~/lib/collaborator-action-error';
import {
  apiRequest,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { collaboratorDetail, collaboratorTitle, type ProjectCollaborator } from '~/lib/project-collaborator-display';
import { projectAction, projectPageLoader } from '~/lib/project-route.server';
import { classNames } from '~/utils/classNames';

/** A project invite (share) link, minus its secret token hash. */
type InviteLink = {
  id: string;
  roleKey: string;
  expiresAt?: string;
  createdAt?: string;
  revokedAt?: string | null;
};

type CollaboratorsData = { collaborators: ProjectCollaborator[]; shareLinks?: InviteLink[] };
type ActionResult = { error?: string; invite?: { url: string; roleKey: string; expiresAt?: string } };

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'viewer', label: 'Viewer — read only' },
  { value: 'editor', label: 'Editor — edit files & run' },
  { value: 'owner', label: 'Admin — full project control' },
];

const EXPIRY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 60, label: '1 hour' },
  { value: 60 * 24, label: '24 hours' },
  { value: 60 * 24 * 7, label: '7 days' },
  { value: 60 * 24 * 30, label: '30 days' },
];

export const meta: MetaFunction = () => [{ title: 'Project collaborators - E-Code' }];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

/*
 * Load collaborators AND the project's invite (share) links from the existing
 * /collaboration state endpoint, which already returns both (the token hash is
 * stripped server-side). No new backend surface is introduced.
 */
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<CollaboratorsData>(args, (projectId) => `/projects/${projectId}/collaboration`);

export const action = (args: EnterpriseActionArgs) =>
  projectAction(args, {
    default: async ({ request, projectId, body }) => {
      try {
        await apiRequest(request, `/projects/${projectId}/collaborators`, {
          method: 'POST',
          body: JSON.stringify({ email: body.email, roleKey: body.roleKey ?? 'editor' }),
        });
      } catch (error) {
        return handleCollaboratorActionError(error);
      }

      return redirect(`/projects/${projectId}/collaborators`);
    },
    remove: async ({ request, projectId, body }) => {
      if (!body.userId) {
        return handleCollaboratorActionError(new Error('Missing collaborator to remove.'));
      }

      try {
        await apiRequest(request, `/projects/${projectId}/collaborators/${encodeURIComponent(body.userId)}`, {
          method: 'DELETE',
        });
      } catch (error) {
        return handleCollaboratorActionError(error);
      }

      return redirect(`/projects/${projectId}/collaborators`);
    },

    // Mint an expirable invite link (reuses POST /collaboration/share-links).
    'create-invite': async ({ request, projectId, body }) => {
      try {
        const result = await apiRequest<{ shareLink: InviteLink; token: string }>(
          request,
          `/projects/${projectId}/collaboration/share-links`,
          {
            method: 'POST',
            body: JSON.stringify({
              roleKey: body.roleKey ?? 'viewer',
              expiresInMinutes: Number(body.expiresInMinutes ?? 60 * 24),
            }),
          },
        );

        // The token is a capability shown exactly once — build the redeem URL now.
        const url = `${new URL(request.url).origin}/projects/share/${result.token}`;

        return json({
          invite: { url, roleKey: result.shareLink.roleKey, expiresAt: result.shareLink.expiresAt },
        });
      } catch (error) {
        return handleCollaboratorActionError(error);
      }
    },

    // Revoke an invite link (reuses DELETE /collaboration/share-links/:id).
    'revoke-invite': async ({ request, projectId, body }) => {
      if (!body.linkId) {
        return handleCollaboratorActionError(new Error('Missing invite link to revoke.'));
      }

      try {
        await apiRequest(
          request,
          `/projects/${projectId}/collaboration/share-links/${encodeURIComponent(body.linkId)}`,
          {
            method: 'DELETE',
          },
        );
      } catch (error) {
        return handleCollaboratorActionError(error);
      }

      return redirect(`/projects/${projectId}/collaborators`);
    },
  });

export default function ProjectCollaboratorsPage() {
  const { project, data } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const submittedIntent = navigation.formData?.get('intent');
  const saving = navigation.state === 'submitting' && submittedIntent == null;
  const creatingInvite = navigation.state === 'submitting' && submittedIntent === 'create-invite';

  const removingUserId =
    navigation.state === 'submitting' && submittedIntent === 'remove'
      ? (navigation.formData?.get('userId') as string | null)
      : null;

  const actionData = useActionData<typeof action>() as ActionResult | undefined;

  const shareLinks = data.shareLinks ?? [];

  return (
    <ProjectShell
      projectId={project.id}
      title="Collaborators"
      description="Manage project-level access with organization RBAC enforcement."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="grid gap-6">
          <CollaboratorList collaborators={data.collaborators ?? []} removing={removingUserId} />
          <InviteLinkList links={shareLinks} />
        </div>
        <div className="grid gap-6">
          <Form
            method="post"
            className="grid gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6"
          >
            <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">Add a member by email</h2>
            <Field label="Email" name="email" type="email" required />
            <label className="grid gap-2 text-sm font-medium">
              Role
              <select
                className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-focus"
                name="roleKey"
                defaultValue="editor"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={saving} aria-busy={saving}>
              {saving ? 'Adding…' : 'Add collaborator'}
            </Button>
            {actionData?.error ? (
              <p
                className="rounded-md border border-bolt-elements-icon-error bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-icon-error"
                role="alert"
              >
                {actionData.error}
              </p>
            ) : null}
          </Form>

          <Form
            method="post"
            className="grid gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6"
          >
            <input type="hidden" name="intent" value="create-invite" />
            <div>
              <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">Create an invite link</h2>
              <p className="mt-1 text-xs text-bolt-elements-textSecondary">
                Anyone with the link can join with the role you choose, until it expires or is revoked.
              </p>
            </div>
            <label className="grid gap-2 text-sm font-medium">
              Role
              <select
                className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-focus"
                name="roleKey"
                defaultValue="viewer"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Expires after
              <select
                className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-focus"
                name="expiresInMinutes"
                defaultValue={String(60 * 24)}
              >
                {EXPIRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="outline" disabled={creatingInvite} aria-busy={creatingInvite}>
              {creatingInvite ? 'Creating…' : 'Create invite link'}
            </Button>
            {actionData?.invite ? <InviteResult invite={actionData.invite} /> : null}
          </Form>
        </div>
      </div>
    </ProjectShell>
  );
}

/** Shows the freshly minted invite URL once, with copy-to-clipboard. */
function InviteResult({ invite }: { invite: NonNullable<ActionResult['invite']> }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="grid gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3">
      <p className="text-xs font-medium text-[var(--status-success-text)]">
        Invite link created — copy it now, it won&apos;t be shown again.
      </p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={invite.url}
          aria-label="Invite link"
          className="h-9 min-w-0 flex-1 select-all rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 font-mono text-xs outline-none"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          type="button"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard?.writeText(invite.url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Clipboard can reject without focus/permission; the field is select-all as a fallback.
            }
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="text-xs text-bolt-elements-textTertiary">
        Role: {roleLabel(invite.roleKey)}
        {invite.expiresAt ? (
          <>
            {' · expires '}
            <RelativeTime value={invite.expiresAt} />
          </>
        ) : null}
      </p>
    </div>
  );
}

function InviteLinkList({ links }: { links: InviteLink[] }) {
  if (links.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
      <div className="border-b border-bolt-elements-borderColor px-4 py-3">
        <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">Invite links</h2>
      </div>
      {links.map((link, index) => {
        const status = inviteStatus(link);
        return (
          <div
            key={link.id}
            className={classNames(
              'flex items-center gap-3 p-4',
              index > 0 && 'border-t border-bolt-elements-borderColor',
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-bolt-elements-textPrimary">{roleLabel(link.roleKey)} access</p>
              <p className="mt-0.5 text-xs text-bolt-elements-textSecondary">
                {status.label}
                {link.expiresAt && status.tone === 'active' ? (
                  <>
                    {' '}
                    <RelativeTime value={link.expiresAt} />
                  </>
                ) : null}
              </p>
            </div>
            <span
              className={classNames(
                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                status.tone === 'active'
                  ? 'text-[var(--status-success-text)]'
                  : status.tone === 'expired'
                    ? 'text-[var(--status-warning-text)]'
                    : 'text-bolt-elements-textTertiary',
              )}
            >
              {status.badge}
            </span>
            {status.tone === 'active' ? (
              <Form method="post" className="shrink-0">
                <input type="hidden" name="intent" value="revoke-invite" />
                <input type="hidden" name="linkId" value={link.id} />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  aria-label={`Revoke ${roleLabel(link.roleKey)} invite link`}
                >
                  Revoke
                </Button>
              </Form>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function roleLabel(roleKey: string): string {
  if (roleKey === 'owner') {
    return 'Admin';
  }

  if (roleKey === 'editor') {
    return 'Editor';
  }

  if (roleKey === 'viewer') {
    return 'Viewer';
  }

  return roleKey;
}

function inviteStatus(link: InviteLink): { label: string; badge: string; tone: 'active' | 'expired' | 'revoked' } {
  if (link.revokedAt) {
    return { label: 'Revoked', badge: 'Revoked', tone: 'revoked' };
  }

  if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) {
    return { label: 'Expired', badge: 'Expired', tone: 'expired' };
  }

  return { label: 'Expires', badge: 'Active', tone: 'active' };
}

function CollaboratorList({
  collaborators,
  removing,
}: {
  collaborators: ProjectCollaborator[];
  removing: string | null;
}) {
  if (collaborators.length === 0) {
    return (
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        <div className="flex gap-3 p-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
            <Users className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-medium">No project collaborators</p>
            <p className="mt-1 text-sm text-bolt-elements-textSecondary">
              Add an organization member by email, or share an invite link, to grant project access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
      {collaborators.map((collaborator, index) => {
        const isRemoving = removing === collaborator.userId;
        return (
          <div
            key={collaborator.id}
            className={classNames(
              'flex items-start gap-3 p-4',
              index > 0 && 'border-t border-bolt-elements-borderColor',
            )}
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
              <Users className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{collaboratorTitle(collaborator)}</p>
              <p className="mt-1 text-sm text-bolt-elements-textSecondary">{collaboratorDetail(collaborator)}</p>
            </div>
            <Form method="post" className="shrink-0">
              <input type="hidden" name="intent" value="remove" />
              <input type="hidden" name="userId" value={collaborator.userId} />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={isRemoving}
                aria-busy={isRemoving}
                aria-label={`Remove ${collaboratorTitle(collaborator)}`}
              >
                {isRemoving ? 'Removing…' : 'Remove'}
              </Button>
            </Form>
          </div>
        );
      })}
    </div>
  );
}

function Field(props: { label: string; name: string; type?: string; required?: boolean }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {props.label}
      <input
        className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-focus"
        name={props.name}
        type={props.type ?? 'text'}
        required={props.required}
      />
    </label>
  );
}
