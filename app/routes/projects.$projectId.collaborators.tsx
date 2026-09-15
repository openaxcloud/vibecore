import { Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import {
  formatProjectCollaboratorsCopy,
  getProjectCollaboratorsCopy,
  type ProjectCollaboratorsKey,
} from '~/lib/i18n/catalogs/project-collaborators';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
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

const ROLE_OPTIONS: Array<{ value: string; labelKey: ProjectCollaboratorsKey }> = [
  { value: 'viewer', labelKey: 'projectCollaborators.role.viewer' },
  { value: 'editor', labelKey: 'projectCollaborators.role.editor' },
  { value: 'owner', labelKey: 'projectCollaborators.role.owner' },
];

const EXPIRY_OPTIONS: Array<{ value: number; labelKey: ProjectCollaboratorsKey }> = [
  { value: 60, labelKey: 'projectCollaborators.expiry.oneHour' },
  { value: 60 * 24, labelKey: 'projectCollaborators.expiry.twentyFourHours' },
  { value: 60 * 24 * 7, labelKey: 'projectCollaborators.expiry.sevenDays' },
  { value: 60 * 24 * 30, labelKey: 'projectCollaborators.expiry.thirtyDays' },
];

export const meta: MetaFunction = ({ matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;

  return [{ title: getProjectCollaboratorsCopy(rootData?.language)['projectCollaborators.metaTitle'] }];
};
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

/*
 * Load collaborators AND the project's invite (share) links from the existing
 * /collaboration state endpoint, which already returns both (the token hash is
 * stripped server-side). No new backend surface is introduced.
 */
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<CollaboratorsData>(args, (projectId) => `/projects/${projectId}/collaboration`);

export const action = (args: EnterpriseActionArgs) => {
  const language = resolveRequestLocale(args.request).language;
  const copy = getProjectCollaboratorsCopy(language);

  return projectAction(args, {
    default: async ({ request, projectId, body }) => {
      try {
        await apiRequest(request, `/projects/${projectId}/collaborators`, {
          method: 'POST',
          body: JSON.stringify({ email: body.email, roleKey: body.roleKey ?? 'editor' }),
        });
      } catch (error) {
        return handleCollaboratorActionError(error, language);
      }

      return redirect(`/projects/${projectId}/collaborators`);
    },
    remove: async ({ request, projectId, body }) => {
      if (!body.userId) {
        return json({ error: copy['projectCollaborators.error.removeRequired'] }, { status: 400 });
      }

      try {
        await apiRequest(request, `/projects/${projectId}/collaborators/${encodeURIComponent(body.userId)}`, {
          method: 'DELETE',
        });
      } catch (error) {
        return handleCollaboratorActionError(error, language);
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
        return handleCollaboratorActionError(error, language);
      }
    },

    // Revoke an invite link (reuses DELETE /collaboration/share-links/:id).
    'revoke-invite': async ({ request, projectId, body }) => {
      if (!body.linkId) {
        return json({ error: copy['projectCollaborators.error.linkRequired'] }, { status: 400 });
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
        return handleCollaboratorActionError(error, language);
      }

      return redirect(`/projects/${projectId}/collaborators`);
    },
  });
};

export default function ProjectCollaboratorsPage() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getProjectCollaboratorsCopy(language);
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
      title={copy['projectCollaborators.title']}
      description={copy['projectCollaborators.description']}
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
            <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">
              {copy['projectCollaborators.add.title']}
            </h2>
            <Field label={copy['projectCollaborators.email']} name="email" type="email" required />
            <label className="grid gap-2 text-sm font-medium">
              {copy['projectCollaborators.role']}
              <select
                className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-focus"
                name="roleKey"
                defaultValue="editor"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>
                    {copy[role.labelKey]}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={saving} aria-busy={saving}>
              {saving ? copy['projectCollaborators.add.adding'] : copy['projectCollaborators.add.submit']}
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
              <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">
                {copy['projectCollaborators.invite.createTitle']}
              </h2>
              <p className="mt-1 text-xs text-bolt-elements-textSecondary">
                {copy['projectCollaborators.invite.createDescription']}
              </p>
            </div>
            <label className="grid gap-2 text-sm font-medium">
              {copy['projectCollaborators.role']}
              <select
                className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-focus"
                name="roleKey"
                defaultValue="viewer"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>
                    {copy[role.labelKey]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {copy['projectCollaborators.invite.expiresAfter']}
              <select
                className="h-10 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-focus"
                name="expiresInMinutes"
                defaultValue={String(60 * 24)}
              >
                {EXPIRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {copy[option.labelKey]}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="outline" disabled={creatingInvite} aria-busy={creatingInvite}>
              {creatingInvite
                ? copy['projectCollaborators.invite.creating']
                : copy['projectCollaborators.invite.create']}
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
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getProjectCollaboratorsCopy(language);

  const text = (template: string, values: Readonly<Record<string, string | number>> = {}) =>
    formatProjectCollaboratorsCopy(template, values);

  const [copied, setCopied] = useState(false);

  return (
    <div className="grid gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3">
      <p className="text-xs font-medium text-[var(--status-success-text)]">
        {copy['projectCollaborators.invite.created']}
      </p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={invite.url}
          aria-label={copy['projectCollaborators.invite.link']}
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
          {copied ? copy['projectCollaborators.invite.copied'] : copy['projectCollaborators.invite.copy']}
        </Button>
      </div>
      <p className="text-xs text-bolt-elements-textTertiary">
        {text(copy['projectCollaborators.invite.resultRole'], { role: roleLabel(invite.roleKey, language) })}
        {invite.expiresAt ? (
          <>
            {copy['projectCollaborators.invite.resultExpires']}
            <RelativeTime value={invite.expiresAt} />
          </>
        ) : null}
      </p>
    </div>
  );
}

function InviteLinkList({ links }: { links: InviteLink[] }) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getProjectCollaboratorsCopy(language);

  const text = (template: string, values: Readonly<Record<string, string | number>> = {}) =>
    formatProjectCollaboratorsCopy(template, values);

  if (links.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
      <div className="border-b border-bolt-elements-borderColor px-4 py-3">
        <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">
          {copy['projectCollaborators.invite.linksTitle']}
        </h2>
      </div>
      {links.map((link, index) => {
        const status = inviteStatus(link, language);
        const localizedRole = roleLabel(link.roleKey, language);

        return (
          <div
            key={link.id}
            className={classNames(
              'flex items-center gap-3 p-4',
              index > 0 && 'border-t border-bolt-elements-borderColor',
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-bolt-elements-textPrimary">
                {text(copy['projectCollaborators.invite.access'], { role: localizedRole })}
              </p>
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
                'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
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
                  aria-label={text(copy['projectCollaborators.invite.revokeAria'], { role: localizedRole })}
                >
                  {copy['projectCollaborators.invite.revoke']}
                </Button>
              </Form>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function roleLabel(roleKey: string, language?: string | null): string {
  const copy = getProjectCollaboratorsCopy(language);

  if (roleKey === 'owner') {
    return copy['projectCollaborators.role.ownerShort'];
  }

  if (roleKey === 'editor') {
    return copy['projectCollaborators.role.editorShort'];
  }

  if (roleKey === 'viewer') {
    return copy['projectCollaborators.role.viewerShort'];
  }

  return roleKey;
}

function inviteStatus(
  link: InviteLink,
  language?: string | null,
): { label: string; badge: string; tone: 'active' | 'expired' | 'revoked' } {
  const copy = getProjectCollaboratorsCopy(language);

  if (link.revokedAt) {
    return {
      label: copy['projectCollaborators.invite.status.revoked'],
      badge: copy['projectCollaborators.invite.status.revoked'],
      tone: 'revoked',
    };
  }

  if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) {
    return {
      label: copy['projectCollaborators.invite.status.expired'],
      badge: copy['projectCollaborators.invite.status.expired'],
      tone: 'expired',
    };
  }

  return {
    label: copy['projectCollaborators.invite.status.expires'],
    badge: copy['projectCollaborators.invite.status.active'],
    tone: 'active',
  };
}

function CollaboratorList({
  collaborators,
  removing,
}: {
  collaborators: ProjectCollaborator[];
  removing: string | null;
}) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getProjectCollaboratorsCopy(language);

  const text = (template: string, values: Readonly<Record<string, string | number>> = {}) =>
    formatProjectCollaboratorsCopy(template, values);

  if (collaborators.length === 0) {
    return (
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        <div className="flex gap-3 p-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
            <Users className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-medium">{copy['projectCollaborators.empty.title']}</p>
            <p className="mt-1 text-sm text-bolt-elements-textSecondary">
              {copy['projectCollaborators.empty.description']}
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
              <p className="truncate text-sm font-medium">{collaboratorTitle(collaborator, language)}</p>
              <p className="mt-1 text-sm text-bolt-elements-textSecondary">
                {collaboratorDetail(collaborator, language)}
              </p>
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
                aria-label={text(copy['projectCollaborators.removeAria'], {
                  member: collaboratorTitle(collaborator, language),
                })}
              >
                {isRemoving ? copy['projectCollaborators.removing'] : copy['projectCollaborators.remove']}
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
