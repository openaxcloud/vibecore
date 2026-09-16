import { Mail } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import {
  Form,
  useActionData,
  useLoaderData,
  useLocation,
  useNavigation,
  useRevalidator,
  useRouteError,
  useRouteLoaderData,
  useSubmit,
} from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { AppShell, LinkButton } from '~/components/dashboard/SaaSLayout';
import { PrimaryButton, SelectField, TextField } from '~/components/enterprise/EnterpriseFormPage';
import { Badge } from '~/components/ui/Badge';
import { Dialog, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { EmptyState } from '~/components/ui/EmptyState';
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
  formatInvitationsDateTime,
  formatInvitationsPlural,
  getInvitationsCopy,
  interpolateInvitationsCopy,
  invitationActionErrorMessage,
  invitationActionStatusMessage,
  invitationRoleLabel,
  invitationsRouteErrorKind,
  resolveInvitationsLanguage,
  type InvitationActionErrorCode,
  type InvitationActionStatusCode,
  type InvitationRoleOption,
  type InvitationsCopy,
} from '~/lib/i18n/catalogs/invitations';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isReauthRedirect } from '~/lib/route-reauth';

type Invitation = {
  id: string;
  email: string;
  roleKey: string;
  acceptedAt?: string;
  expiresAt: string;
};

type InvitationsLoadErrorCode = 'permission' | 'unavailable' | null;

type InvitationsActionData = {
  statusCode?: InvitationActionStatusCode;
  errorCode?: InvitationActionErrorCode;
};

const SYSTEM_ROLE_KEYS = ['viewer', 'member', 'editor', 'admin', 'owner'] as const;

function systemRoleOptions(): InvitationRoleOption[] {
  return SYSTEM_ROLE_KEYS.map((key) => ({ key, name: key, system: true }));
}

function isAuthenticationResponse(error: unknown): error is Response {
  return isReauthRedirect(error) || (error instanceof Response && error.status === 401);
}

function normalizeCustomRoles(value: unknown): InvitationRoleOption[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const role = entry as { key?: unknown; name?: unknown };

    if (typeof role.key !== 'string' || typeof role.name !== 'string' || !role.key.trim() || !role.name.trim()) {
      return [];
    }

    return [{ key: role.key, name: role.name, system: false }];
  });
}

function normalizeInvitations(value: unknown): Invitation[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const invitation = entry as Record<string, unknown>;

    if (
      typeof invitation.id !== 'string' ||
      typeof invitation.email !== 'string' ||
      typeof invitation.roleKey !== 'string' ||
      typeof invitation.expiresAt !== 'string'
    ) {
      return [];
    }

    return [
      {
        id: invitation.id,
        email: invitation.email,
        roleKey: invitation.roleKey,
        expiresAt: invitation.expiresAt,
        ...(typeof invitation.acceptedAt === 'string' ? { acceptedAt: invitation.acceptedAt } : {}),
      },
    ];
  });
}

function loaderPayload({
  language,
  orgId,
  invitations = [],
  roles = systemRoleOptions(),
  loadErrorCode = null,
}: {
  language: 'en' | 'fr';
  orgId: string;
  invitations?: Invitation[];
  roles?: InvitationRoleOption[];
  loadErrorCode?: InvitationsLoadErrorCode;
}) {
  return {
    language,
    orgId,
    invitations,
    roles,
    canManageInvitations: loadErrorCode === null,
    loadErrorCode,
    nowMs: Date.now(),
  };
}

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const copy = getInvitationsCopy(data?.language ?? rootData?.language);
  const title = copy['invitations.meta.title'];
  const description = copy['invitations.meta.description'];

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
  ];
};

export async function loader({ request }: EnterpriseLoaderArgs) {
  const language = resolveInvitationsLanguage(resolveRequestLocale(request).language);
  const orgIdParam = new URL(request.url).searchParams.get('orgId')?.trim();

  let organization: { id: string } | null;

  try {
    organization = orgIdParam ? { id: orgIdParam } : await firstOrganizationOrNull(request);
  } catch (error) {
    if (isAuthenticationResponse(error)) {
      throw error;
    }

    return json(loaderPayload({ language, orgId: '', loadErrorCode: 'unavailable' }));
  }

  if (!organization) {
    throw json({ errorCode: 'organizationUnavailable' as const }, { status: 400 });
  }

  const organizationPath = encodeURIComponent(organization.id);

  let roles = systemRoleOptions();
  let loadErrorCode: InvitationsLoadErrorCode = null;

  try {
    const rolesResult = await apiRequest<{ roles?: unknown }>(request, `/orgs/${organizationPath}/roles`);
    const customRoles = normalizeCustomRoles(rolesResult.roles);

    if (!customRoles) {
      return json(loaderPayload({ language, orgId: organization.id, loadErrorCode: 'unavailable' }));
    }

    roles = [...roles, ...customRoles];
  } catch (error) {
    if (isAuthenticationResponse(error)) {
      throw error;
    }

    if (isForbiddenApiResponse(error)) {
      loadErrorCode = 'permission';
    } else {
      return json(loaderPayload({ language, orgId: organization.id, loadErrorCode: 'unavailable' }));
    }
  }

  try {
    const invitationsResult = await apiRequest<{ invitations?: unknown }>(
      request,
      `/orgs/${organizationPath}/invitations`,
    );

    const invitations = normalizeInvitations(invitationsResult.invitations);

    if (!invitations) {
      return json(loaderPayload({ language, orgId: organization.id, roles, loadErrorCode: 'unavailable' }));
    }

    return json(loaderPayload({ language, orgId: organization.id, invitations, roles, loadErrorCode }));
  } catch (error) {
    if (isAuthenticationResponse(error)) {
      throw error;
    }

    return json(
      loaderPayload({
        language,
        orgId: organization.id,
        roles,
        loadErrorCode: isForbiddenApiResponse(error) ? 'permission' : 'unavailable',
      }),
    );
  }
}

function actionError(errorCode: InvitationActionErrorCode, status: number) {
  return json<InvitationsActionData>({ errorCode }, { status });
}

function invitationApiError(error: unknown) {
  if (isForbiddenApiResponse(error)) {
    return actionError('permission', 403);
  }

  if (error instanceof Response) {
    if (error.status === 404) {
      return actionError('notFound', 404);
    }

    if (error.status === 409) {
      return actionError('conflict', 409);
    }

    if (error.status === 429) {
      return actionError('rateLimited', 429);
    }

    if (error.status >= 500) {
      return actionError('unavailable', error.status);
    }

    return actionError('rejected', error.status);
  }

  return actionError('unavailable', 503);
}

export async function action({ request }: EnterpriseActionArgs) {
  let body: {
    orgId?: string;
    email?: string;
    roleKey?: string;
    intent?: string;
    inviteId?: string;
  };

  try {
    body = formObject(await request.formData()) as typeof body;
  } catch {
    return actionError('invalidAction', 400);
  }

  const orgId = body.orgId?.trim() ?? '';
  const intent = body.intent?.trim() || 'create';

  if (!orgId) {
    return actionError('organizationUnavailable', 400);
  }

  const organizationPath = encodeURIComponent(orgId);

  try {
    if (intent === 'resend' || intent === 'expire') {
      const inviteId = body.inviteId?.trim() ?? '';

      if (!inviteId) {
        return actionError('invitationRequired', 400);
      }

      await apiRequest(request, `/orgs/${organizationPath}/invitations/${encodeURIComponent(inviteId)}/${intent}`, {
        method: 'POST',
      });

      return json<InvitationsActionData>({ statusCode: intent === 'resend' ? 'resent' : 'expired' });
    }

    if (intent !== 'create') {
      return actionError('invalidAction', 400);
    }

    const email = body.email?.trim() ?? '';

    if (!email) {
      return actionError('emailRequired', 400);
    }

    await apiRequest(request, `/orgs/${organizationPath}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ email, roleKey: body.roleKey?.trim() || 'member' }),
    });

    return json<InvitationsActionData>({ statusCode: 'created' });
  } catch (error) {
    if (isAuthenticationResponse(error)) {
      throw error;
    }

    return invitationApiError(error);
  }
}

function ExpireInvitationDialog({
  invitation,
  copy,
  expiring,
  onClose,
  onConfirm,
}: {
  invitation: { id: string; email: string } | null;
  copy: InvitationsCopy;
  expiring: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <DialogRoot
      open={invitation !== null}
      onOpenChange={(open) => {
        if (!open && !expiring) {
          onClose();
        }
      }}
    >
      <Dialog showCloseButton={false} onBackdrop={expiring ? undefined : onClose}>
        <div className="relative z-10 p-5 sm:p-6">
          <DialogTitle>
            {interpolateInvitationsCopy(copy['invitations.dialog.title'], { email: invitation?.email ?? '' })}
          </DialogTitle>
          <DialogDescription className="mb-5 break-words leading-6 [overflow-wrap:anywhere]">
            {copy['invitations.dialog.description']}
          </DialogDescription>
          <div className="flex min-w-0 flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={expiring}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-2 text-sm font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {copy['invitations.dialog.cancel']}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={expiring || !invitation}
              aria-busy={expiring}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-4 py-2 text-sm font-medium text-[var(--status-error-text)] transition-colors hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive disabled:cursor-wait disabled:opacity-60 sm:w-auto"
            >
              {expiring ? copy['invitations.dialog.confirming'] : copy['invitations.dialog.confirm']}
            </button>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}

export default function InvitationsPage() {
  const loaderData = useLoaderData<typeof loader>();
  const { i18n } = useTranslation();
  const language = resolveInvitationsLanguage(i18n.resolvedLanguage ?? i18n.language ?? loaderData.language);
  const copy = getInvitationsCopy(language);
  const { orgId, invitations, roles, loadErrorCode, nowMs } = loaderData;
  const actionData = useActionData<typeof action>() as InvitationsActionData | undefined;
  const actionStatus = invitationActionStatusMessage(actionData?.statusCode, language);
  const actionErrorMessage = invitationActionErrorMessage(actionData?.errorCode, language);
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const submit = useSubmit();
  const [invitePendingExpire, setInvitePendingExpire] = useState<{ id: string; email: string } | null>(null);
  const navigationIntent = String(navigation.formData?.get('intent') ?? '');
  const navigationInviteId = String(navigation.formData?.get('inviteId') ?? '');
  const mutating = navigation.state !== 'idle' && Boolean(navigation.formData);
  const creating = mutating && navigationIntent === 'create';

  const routeLoading =
    revalidator.state !== 'idle' || (navigation.state === 'loading' && navigation.formData === undefined);

  if (routeLoading) {
    return (
      <AppShell title={copy['invitations.page.title']} description={copy['invitations.page.description']}>
        <AsyncPanelSkeleton label={copy['invitations.load.loading']} rows={5} className="max-w-4xl" />
      </AppShell>
    );
  }

  if (loadErrorCode) {
    const permission = loadErrorCode === 'permission';

    return (
      <AppShell title={copy['invitations.page.title']} description={copy['invitations.page.description']}>
        <AsyncPanelError
          title={permission ? copy['invitations.load.permission.title'] : copy['invitations.load.error.title']}
          description={
            permission ? copy['invitations.load.permission.description'] : copy['invitations.load.error.description']
          }
          tone={permission ? 'warning' : 'error'}
          onRetry={permission ? undefined : revalidator.revalidate}
          retryLabel={copy['invitations.load.retry']}
          className="max-w-4xl"
        />
      </AppShell>
    );
  }

  const countLabel = formatInvitationsPlural(invitations.length, language, {
    one: copy['invitations.list.count_one'],
    other: copy['invitations.list.count_other'],
  });

  return (
    <AppShell title={copy['invitations.page.title']} description={copy['invitations.page.description']}>
      <div className="grid min-w-0 max-w-4xl gap-6">
        {actionStatus ? (
          <p
            role="status"
            aria-live="polite"
            className="min-w-0 break-words rounded-md border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-4 py-3 text-sm text-[var(--status-success-text)] [overflow-wrap:anywhere]"
          >
            {actionStatus}
          </p>
        ) : null}
        {actionErrorMessage ? (
          <p
            role="alert"
            aria-live="assertive"
            className="min-w-0 break-words rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-4 py-3 text-sm text-[var(--status-error-text)] [overflow-wrap:anywhere]"
          >
            {actionErrorMessage}
          </p>
        ) : null}

        <section className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6">
          <h2 className="break-words font-semibold text-bolt-elements-textPrimary [overflow-wrap:anywhere]">
            {copy['invitations.form.title']}
          </h2>
          <p className="mt-1 break-words text-sm leading-6 text-bolt-elements-textSecondary [overflow-wrap:anywhere]">
            {copy['invitations.form.description']}
          </p>
          <Form method="post" className="mt-4 min-w-0" aria-busy={creating}>
            <fieldset
              disabled={creating}
              className="grid min-w-0 gap-4 border-0 p-0 lg:grid-cols-[minmax(0,1fr)_minmax(180px,220px)_auto] lg:items-end"
            >
              <input type="hidden" name="intent" value="create" />
              <input type="hidden" name="orgId" value={orgId} />
              {/* BUG-USR-012: this is the invitee's email, NOT the current user's — autoComplete="off"
                  so the browser doesn't autofill the signed-in user's own address here. */}
              <TextField
                label={copy['invitations.form.email']}
                name="email"
                type="email"
                placeholder={copy['invitations.form.emailPlaceholder']}
                autoComplete="off"
                required
              />
              <SelectField
                label={copy['invitations.form.role']}
                name="roleKey"
                defaultValue="member"
                options={roles.map((role) => ({
                  value: role.key,
                  label: invitationRoleLabel(role.key, roles, language),
                }))}
              />
              <PrimaryButton type="submit" className="w-full whitespace-normal lg:w-auto">
                {creating ? copy['invitations.form.creating'] : copy['invitations.form.create']}
              </PrimaryButton>
            </fieldset>
          </Form>
        </section>

        <section className="min-w-0 overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-sm shadow-sm">
          <div className="flex min-w-0 flex-col gap-2 border-b border-bolt-elements-borderColor px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <div className="min-w-0">
              <h2 className="break-words font-semibold text-bolt-elements-textPrimary [overflow-wrap:anywhere]">
                {copy['invitations.list.title']}
              </h2>
              <p className="mt-1 max-w-2xl break-words text-xs leading-5 text-bolt-elements-textSecondary [overflow-wrap:anywhere]">
                {copy['invitations.list.description']}
              </p>
            </div>
            <Badge variant="secondary" size="md" className="shrink-0 self-start whitespace-normal">
              {countLabel}
            </Badge>
          </div>

          {invitations.length === 0 ? (
            <div className="p-4 sm:p-6" role="status" aria-live="polite">
              <EmptyState
                variant="compact"
                icon={Mail}
                title={copy['invitations.list.empty.title']}
                description={copy['invitations.list.empty.description']}
              />
            </div>
          ) : (
            <div role="list">
              {invitations.map((invite) => {
                const expiresAtMs = new Date(invite.expiresAt).getTime();
                const expired = Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
                const accepted = Boolean(invite.acceptedAt);
                const resendable = !accepted;
                const expirable = !accepted && !expired;
                const resending = mutating && navigationIntent === 'resend' && navigationInviteId === invite.id;
                const expiring = mutating && navigationIntent === 'expire' && navigationInviteId === invite.id;

                return (
                  <div
                    key={invite.id}
                    role="listitem"
                    className="grid min-w-0 gap-4 border-b border-bolt-elements-borderColor px-4 py-4 last:border-b-0 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                  >
                    <div className="min-w-0">
                      <p className="break-all font-medium text-bolt-elements-textPrimary">{invite.email}</p>
                      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-bolt-elements-textSecondary">
                        <Badge variant="outline" size="md" className="max-w-full whitespace-normal break-words">
                          {invitationRoleLabel(invite.roleKey, roles, language)}
                        </Badge>
                        <span className="break-words [overflow-wrap:anywhere]">
                          {interpolateInvitationsCopy(copy['invitations.invitation.expires'], {
                            date: formatInvitationsDateTime(invite.expiresAt, language),
                          })}
                        </span>
                        {accepted ? (
                          <Badge variant="success" size="md">
                            {copy['invitations.invitation.status.accepted']}
                          </Badge>
                        ) : expired ? (
                          <Badge variant="warning" size="md">
                            {copy['invitations.invitation.status.expired']}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" size="md">
                            {copy['invitations.invitation.status.pending']}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap md:justify-end">
                      <Form method="post" className="w-full sm:w-auto" aria-busy={resending}>
                        <input type="hidden" name="intent" value="resend" />
                        <input type="hidden" name="orgId" value={orgId} />
                        <input type="hidden" name="inviteId" value={invite.id} />
                        <button
                          type="submit"
                          disabled={mutating || !resendable}
                          aria-label={interpolateInvitationsCopy(copy['invitations.action.resendAria'], {
                            email: invite.email,
                          })}
                          className="inline-flex min-h-11 w-full items-center justify-center whitespace-normal rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-center text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                        >
                          {resending ? copy['invitations.action.resending'] : copy['invitations.action.resend']}
                        </button>
                      </Form>
                      <button
                        type="button"
                        disabled={mutating || !expirable}
                        aria-busy={expiring}
                        aria-label={interpolateInvitationsCopy(copy['invitations.action.expireAria'], {
                          email: invite.email,
                        })}
                        onClick={() => setInvitePendingExpire({ id: invite.id, email: invite.email })}
                        className="inline-flex min-h-11 w-full items-center justify-center whitespace-normal rounded-md border border-[var(--status-error-border)] bg-bolt-elements-background-depth-1 px-3 py-2 text-center text-xs font-medium text-[var(--status-error-text)] transition-colors hover:bg-[var(--status-error-bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                      >
                        {expiring ? copy['invitations.action.expiring'] : copy['invitations.action.expire']}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <ExpireInvitationDialog
        invitation={invitePendingExpire}
        copy={copy}
        expiring={mutating && navigationIntent === 'expire'}
        onClose={() => setInvitePendingExpire(null)}
        onConfirm={() => {
          const pending = invitePendingExpire;

          if (!pending) {
            return;
          }

          setInvitePendingExpire(null);
          submit({ intent: 'expire', orgId, inviteId: pending.id }, { method: 'post' });
        }}
      />
    </AppShell>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();
  const rootData = useRouteLoaderData('root') as { language?: string } | undefined;
  const { i18n } = useTranslation();
  const language = resolveInvitationsLanguage(rootData?.language ?? i18n.resolvedLanguage ?? i18n.language);
  const copy = getInvitationsCopy(language);
  const kind = invitationsRouteErrorKind(error);
  const title = copy[`invitations.routeError.${kind}.title`];
  const description = copy[`invitations.routeError.${kind}.description`];
  const authentication = kind === 'authentication';
  const retryable = kind === 'unavailable' || kind === 'organization';

  const destination = authentication
    ? `/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`
    : '/dashboard';

  return (
    <AppShell
      title={copy['invitations.page.title']}
      description={copy['invitations.page.description']}
      actions={
        <LinkButton to={destination} variant="outline">
          {authentication ? copy['invitations.routeError.signIn'] : copy['invitations.routeError.backDashboard']}
        </LinkButton>
      }
    >
      <AsyncPanelError
        title={title}
        description={description}
        tone={kind === 'unavailable' ? 'error' : 'warning'}
        onRetry={
          retryable
            ? () => {
                window.location.reload();
              }
            : undefined
        }
        retryLabel={copy['invitations.load.retry']}
        className="max-w-4xl"
      />
    </AppShell>
  );
}
