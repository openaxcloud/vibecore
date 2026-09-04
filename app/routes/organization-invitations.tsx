import { Mail } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useSubmit } from 'react-router';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { PrimaryButton, SelectField, TextField } from '~/components/enterprise/EnterpriseFormPage';
import { Badge } from '~/components/ui/Badge';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { EmptyState } from '~/components/ui/EmptyState';
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
import {
  formatOrganizationAccessCopy,
  formatOrganizationAccessDateTime,
  getOrganizationAccessCopy,
} from '~/lib/i18n/catalogs/organization-access';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { BUILTIN_ROLE_ORDER, getBuiltinRoleLabels } from '~/lib/rbac-catalog';
import { userFacingLabel } from '~/lib/user-facing-labels';

export const meta: MetaFunction = ({ matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;

  return [{ title: getOrganizationAccessCopy(rootData?.language)['organizationAccess.invitations.metaTitle'] }];
};

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
  const language = resolveRequestLocale(request).language;
  const copy = getOrganizationAccessCopy(language);
  const builtinRoleLabels = getBuiltinRoleLabels(language);
  const orgIdParam = new URL(request.url).searchParams.get('orgId');
  const organization = orgIdParam ? { id: orgIdParam } : await firstOrganizationOrNull(request);

  if (!organization) {
    throw json({ error: copy['organizationAccess.common.organizationMissing'] }, { status: 400 });
  }

  try {
    // Roles power the invite role select: built-ins + the org's custom roles.
    const [invitesResult, rolesResult] = await Promise.all([
      apiRequest<{ invitations: Invitation[] }>(request, `/orgs/${organization.id}/invitations`),
      apiRequest<{ roles: Array<{ key: string; name: string }> }>(request, `/orgs/${organization.id}/roles`),
    ]);

    const roles: RoleOption[] = [
      ...BUILTIN_ROLE_ORDER.map((key) => ({ value: key, label: builtinRoleLabels[key] ?? key })),
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
  const language = resolveRequestLocale(request).language;
  const copy = getOrganizationAccessCopy(language);

  const body = formObject(await request.formData()) as {
    intent?: string;
    orgId?: string;
    inviteId?: string;
    email?: string;
    roleKey?: string;
  };

  if (!body.orgId) {
    return json({ error: copy['organizationAccess.common.organizationUnavailable'] }, { status: 400 });
  }

  try {
    if (body.intent === 'resend') {
      if (!body.inviteId) {
        return json({ error: copy['organizationAccess.invitations.required'] }, { status: 400 });
      }

      await apiRequest(request, `/orgs/${body.orgId}/invitations/${body.inviteId}/resend`, { method: 'POST' });

      return json({ status: copy['organizationAccess.invitations.resent'] });
    }

    if (body.intent === 'expire') {
      if (!body.inviteId) {
        return json({ error: copy['organizationAccess.invitations.required'] }, { status: 400 });
      }

      await apiRequest(request, `/orgs/${body.orgId}/invitations/${body.inviteId}/expire`, { method: 'POST' });

      return json({ status: copy['organizationAccess.invitations.expiredStatus'] });
    }

    // Default intent: create a new invitation.
    if (!body.email) {
      return json({ error: copy['organizationAccess.invitations.emailRequired'] }, { status: 400 });
    }

    await apiRequest(request, `/orgs/${body.orgId}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ email: body.email, roleKey: body.roleKey ?? 'member' }),
    });

    return json({
      status: formatOrganizationAccessCopy(copy['organizationAccess.invitations.sent'], { email: body.email }),
    });
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      return json(
        {
          error:
            language === 'fr'
              ? copy['organizationAccess.invitations.actionForbidden']
              : await apiErrorMessage(error, copy['organizationAccess.invitations.actionForbidden']),
        },
        { status: 403 },
      );
    }

    if (error instanceof Response) {
      return json(
        {
          error:
            language === 'fr'
              ? copy['organizationAccess.invitations.actionFailed']
              : await apiErrorMessage(error, copy['organizationAccess.invitations.actionFailed']),
        },
        {
          status: error.status,
        },
      );
    }

    throw error;
  }
}

export default function OrganizationInvitationsPage() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getOrganizationAccessCopy(language);

  const text = (template: string, values: Readonly<Record<string, string | number>> = {}) =>
    formatOrganizationAccessCopy(template, values);

  const { forbidden, orgId, invitations, roles } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;
  const submit = useSubmit();
  const [invitePendingExpire, setInvitePendingExpire] = useState<{ id: string; email: string } | null>(null);

  const roleLabel = (roleKey: string) =>
    roles.find((role) => role.value === roleKey)?.label ??
    (language === 'fr'
      ? copy['organizationAccess.role.member']
      : userFacingLabel(roleKey, copy['organizationAccess.role.member']));

  if (forbidden) {
    return (
      <AppShell
        title={copy['organizationAccess.invitations.title']}
        description={copy['organizationAccess.invitations.description']}
      >
        <p className="rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2 text-sm text-[var(--status-warning-text)]">
          {copy['organizationAccess.invitations.forbidden']}
        </p>
      </AppShell>
    );
  }

  const now = Date.now();

  return (
    <AppShell
      title={copy['organizationAccess.invitations.title']}
      description={copy['organizationAccess.invitations.description']}
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
          <h2 className="mb-4 font-semibold text-bolt-elements-textPrimary">
            {copy['organizationAccess.invitations.inviteTitle']}
          </h2>
          <Form method="post" className="grid gap-4 lg:grid-cols-[1fr_220px_auto] lg:items-end">
            <input type="hidden" name="orgId" value={orgId} />
            <TextField
              label={copy['organizationAccess.invitations.email']}
              name="email"
              type="email"
              placeholder={copy['organizationAccess.invitations.emailPlaceholder']}
              required
            />
            <SelectField
              label={copy['organizationAccess.invitations.role']}
              name="roleKey"
              defaultValue="member"
              options={roles}
            />
            <PrimaryButton type="submit">{copy['organizationAccess.invitations.send']}</PrimaryButton>
          </Form>
        </section>

        {/* Pending invitations. */}
        <section className="overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-sm shadow-sm">
          <div className="border-b border-bolt-elements-borderColor px-4 py-3 sm:px-6">
            <h2 className="font-semibold text-bolt-elements-textPrimary">
              {copy['organizationAccess.invitations.pendingTitle']}
            </h2>
            <p className="mt-1 text-xs text-bolt-elements-textSecondary">
              {copy['organizationAccess.invitations.pendingDescription']}
            </p>
          </div>
          {invitations.length === 0 ? (
            <div role="status" aria-live="polite" className="p-4 sm:p-6">
              <EmptyState variant="compact" icon={Mail} title={copy['organizationAccess.invitations.empty']} />
            </div>
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
                      <div className="break-all font-medium text-bolt-elements-textPrimary">{invite.email}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-bolt-elements-textSecondary">
                        <span className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5">
                          {roleLabel(invite.roleKey)}
                        </span>
                        <span>
                          {text(copy['organizationAccess.invitations.expires'], {
                            date: formatOrganizationAccessDateTime(invite.expiresAt, language),
                          })}
                        </span>
                        {accepted ? (
                          <Badge variant="success">{copy['organizationAccess.invitations.accepted']}</Badge>
                        ) : expired ? (
                          <Badge variant="warning">{copy['organizationAccess.invitations.expired']}</Badge>
                        ) : (
                          <Badge variant="secondary">{copy['organizationAccess.invitations.pending']}</Badge>
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
                          className="inline-flex min-h-[44px] items-center justify-center whitespace-normal rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-1"
                          aria-label={text(copy['organizationAccess.invitations.resendAria'], {
                            email: invite.email,
                          })}
                        >
                          {copy['organizationAccess.invitations.resend']}
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
                          className="inline-flex min-h-[44px] items-center justify-center whitespace-normal rounded-md border border-[var(--status-error-border)] px-3 py-1.5 text-xs text-[var(--status-error-text)] hover:bg-[var(--status-error-bg)]"
                          aria-label={text(copy['organizationAccess.invitations.expireAria'], {
                            email: invite.email,
                          })}
                        >
                          {copy['organizationAccess.invitations.expire']}
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
        title={text(copy['organizationAccess.invitations.expireTitle'], {
          email: invitePendingExpire?.email ?? '',
        })}
        description={copy['organizationAccess.invitations.expireDescription']}
        confirmLabel={copy['organizationAccess.invitations.expireConfirm']}
        variant="destructive"
      />
    </AppShell>
  );
}
