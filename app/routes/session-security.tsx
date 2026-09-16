import { Laptop, LogOut, Monitor, Smartphone, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation, useRevalidator, useSubmit } from 'react-router';
import { toast } from 'react-toastify';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { EmptyState } from '~/components/ui/EmptyState';
import {
  apiRequest,
  currentSessionTokenHash,
  firstOrganizationOrNull,
  formObject,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  describeSessionSecurityDevice,
  formatSessionSecurityCopy,
  formatSessionSecurityDateTime,
  getSessionSecurityCopy,
  resolveSessionSecurityLanguage,
  sessionSecurityErrorCodeForStatus,
  sessionSecurityErrorMessage,
  sessionSecurityStatusMessage,
  type SessionSecurityActionData,
} from '~/lib/i18n/catalogs/session-security';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isReauthRedirect, shouldRethrowActionError } from '~/lib/route-reauth';
import { classNames } from '~/utils/classNames';

/*
 * The API's GET /auth/sessions returns each row's `tokenHash` (the sha256 of
 * the opaque session token) but no per-row "current" flag. We compare it to the
 * caller's own token digest server-side to mark "This device", then strip the
 * hash so it never reaches the browser. This shape is what the client renders.
 */
type ApiSession = {
  id: string;
  tokenHash?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  expiresAt: string;
  lastReauthAt?: string;
};

type ClientSession = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  device: string;
  createdAt: string;
  current: boolean;
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const copy = getSessionSecurityCopy(data?.language);

  return [
    { title: copy['sessionSecurity.meta.title'] },
    { name: 'description', content: copy['sessionSecurity.meta.description'] },
  ];
};

export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const language = resolveSessionSecurityLanguage(resolveRequestLocale(request).language);
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  /*
   * The org-policy form must still render even if the per-user session list is
   * briefly unavailable (e.g. the api pod is draining); degrade to an empty list
   * rather than failing the whole page.
   */
  const sessionsResult = await apiRequest<{ sessions: ApiSession[] }>(request, '/auth/sessions').then(
    (result) => result,
    (error) => {
      if (isReauthRedirect(error)) {
        throw error;
      }

      return null;
    },
  );

  const currentHash = currentSessionTokenHash(request);

  const sessions: ClientSession[] = (sessionsResult?.sessions ?? []).map((session) => ({
    id: session.id,
    ipAddress: session.ipAddress ?? null,
    userAgent: session.userAgent ?? null,
    device: describeSessionSecurityDevice(session.userAgent, language),
    createdAt: session.createdAt,
    current: Boolean(currentHash && session.tokenHash && session.tokenHash === currentHash),
  }));

  return json({
    orgId: organization.id,
    sessions,
    sessionsUnavailable: sessionsResult === null,
    language,
  });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as {
    intent?: string;
    sessionId?: string;
    orgId?: string;
    sessionDurationMinutes?: string;
    ipAllowlist?: string;
  };

  try {
    if (body.intent === 'revoke') {
      if (!body.sessionId) {
        return json<SessionSecurityActionData>({ errorCode: 'sessionRequired' }, { status: 400 });
      }

      await apiRequest(request, `/auth/sessions/${encodeURIComponent(body.sessionId)}`, { method: 'DELETE' });

      return json<SessionSecurityActionData>({ statusCode: 'sessionRevoked' });
    }

    if (body.intent === 'revoke-all') {
      await apiRequest(request, '/auth/logout-all', { method: 'POST', body: JSON.stringify({}) });

      return json<SessionSecurityActionData>({ statusCode: 'otherSessionsRevoked' });
    }

    if (!body.orgId) {
      return json<SessionSecurityActionData>({ errorCode: 'organizationUnavailable' }, { status: 400 });
    }

    await apiRequest(request, `/orgs/${body.orgId}/enterprise-settings`, {
      method: 'PATCH',
      body: JSON.stringify({
        sessionDurationMinutes: body.sessionDurationMinutes ? Number(body.sessionDurationMinutes) : undefined,
        ipAllowlist: body.ipAllowlist
          ? body.ipAllowlist
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : undefined,
      }),
    });

    return json<SessionSecurityActionData>({ statusCode: 'policySaved' });
  } catch (error) {
    /*
     * An expired session / MFA-required state makes apiRequest throw a framework
     * redirect() (a 3xx Response to /login or /mfa-setup). Re-throw it so the
     * framework performs the navigation instead of swallowing it into a dead-end
     * inline error with a 3xx-status JSON body and no Location header.
     */
    if (isReauthRedirect(error) || shouldRethrowActionError(error)) {
      throw error;
    }

    if (isApiResponse(error)) {
      return json({ errorCode: sessionSecurityErrorCodeForStatus(error.status) } satisfies SessionSecurityActionData, {
        status: error.status,
      });
    }

    return json<SessionSecurityActionData>({ errorCode: 'unavailable' });
  }
}

function deviceIcon(userAgent: string | null) {
  if (userAgent && /iPhone|iPad|iPod|Android|Mobile/.test(userAgent)) {
    return Smartphone;
  }

  if (userAgent && /Mac OS X|Macintosh|Windows|Linux/.test(userAgent)) {
    return Laptop;
  }

  return Monitor;
}

export default function SessionSecurityPage() {
  const { orgId, sessions, sessionsUnavailable, language } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as SessionSecurityActionData | undefined;
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const submit = useSubmit();
  const busy = navigation.state !== 'idle';
  const pendingIntent = navigation.formData?.get('intent')?.toString();
  const pendingSessionId = navigation.formData?.get('sessionId')?.toString();
  const revokingAll = busy && pendingIntent === 'revoke-all';
  const savingPolicy = busy && navigation.formData !== undefined && !pendingIntent;
  const retryingSessions = revalidator.state !== 'idle';
  const copy = getSessionSecurityCopy(language);
  const status = sessionSecurityStatusMessage(actionData?.statusCode, language);
  const error = sessionSecurityErrorMessage(actionData?.errorCode, language);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);
  const [sessionPendingRevoke, setSessionPendingRevoke] = useState<{ id: string; device: string } | null>(null);

  /* Surface the sign-out-all result as a toast on top of the inline banner. */
  useEffect(() => {
    if (actionData?.statusCode === 'otherSessionsRevoked' && status) {
      toast.success(status);
    }
  }, [actionData?.statusCode, status]);

  const otherSessions = sessions.filter((session) => !session.current);

  return (
    <EnterpriseFormPage
      title={copy['sessionSecurity.page.title']}
      description={copy['sessionSecurity.page.description']}
      status={status}
      error={error}
    >
      <div className="min-w-0 space-y-8">
        <section className="min-w-0">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
                {copy['sessionSecurity.sessions.title']}
              </h2>
              <p className="mt-1 break-words text-sm leading-relaxed text-bolt-elements-textSecondary">
                {copy['sessionSecurity.sessions.description']}
              </p>
            </div>
            {otherSessions.length > 0 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmRevokeAll(true)}
                style={{
                  color: 'var(--status-error-text)',
                  borderColor: 'color-mix(in srgb, var(--vc-ide-accent-error) 40%, transparent)',
                }}
                className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 whitespace-normal rounded-md border px-3 py-1.5 text-center text-xs font-medium leading-snug transition-colors hover:bg-[var(--status-error-bg)] disabled:cursor-not-allowed disabled:opacity-60 sm:mt-0 sm:w-auto sm:shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                {copy[revokingAll ? 'sessionSecurity.sessions.signingOutAll' : 'sessionSecurity.sessions.signOutAll']}
              </button>
            ) : null}
          </div>

          {/* Recovery invariant: Active sessions could not load without exposing a raw API error. */}
          {sessionsUnavailable ? (
            retryingSessions ? (
              <AsyncPanelSkeleton label={copy['sessionSecurity.sessions.loading']} rows={3} compact className="mt-4" />
            ) : (
              <AsyncPanelError
                title={copy['sessionSecurity.sessions.errorTitle']}
                description={copy['sessionSecurity.sessions.errorDescription']}
                retryLabel={copy['sessionSecurity.sessions.retry']}
                onRetry={revalidator.revalidate}
                compact
                className="mt-4"
              />
            )
          ) : sessions.length === 0 ? (
            <EmptyState
              variant="compact"
              icon={Monitor}
              title={copy['sessionSecurity.sessions.empty']}
              className="mt-4"
            />
          ) : (
            <ul className="mt-4 overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
              {sessions.map((session, index) => {
                const Icon = deviceIcon(session.userAgent);
                const revokingSession = busy && pendingIntent === 'revoke' && pendingSessionId === session.id;

                const ipAddress = session.ipAddress
                  ? formatSessionSecurityCopy(copy['sessionSecurity.sessions.ipAddress'], {
                      address: session.ipAddress,
                    })
                  : copy['sessionSecurity.sessions.ipUnknown'];
                const signedIn = formatSessionSecurityCopy(copy['sessionSecurity.sessions.signedIn'], {
                  date: formatSessionSecurityDateTime(session.createdAt, language),
                });

                return (
                  <li
                    key={session.id}
                    className={classNames(
                      'flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between',
                      index > 0 && 'border-t border-bolt-elements-borderColor',
                    )}
                  >
                    <div className="flex min-w-0 gap-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
                        <Icon className="h-4 w-4 text-bolt-elements-textSecondary" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-bolt-elements-textPrimary">
                          <span className="break-words">{session.device}</span>
                          {session.current ? (
                            <span className="rounded-full border border-bolt-elements-borderColorActive bg-bolt-elements-background-depth-3 px-2 py-0.5 text-xs font-medium text-bolt-elements-textPrimary">
                              {copy['sessionSecurity.sessions.thisDevice']}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 flex min-w-0 flex-wrap gap-x-1.5 gap-y-0.5 text-xs text-bolt-elements-textTertiary">
                          <span className="max-w-full break-all">{ipAddress}</span>
                          <span aria-hidden>·</span>
                          <span className="break-words">{signedIn}</span>
                        </p>
                      </div>
                    </div>

                    {session.current ? (
                      <span className="break-words text-xs text-bolt-elements-textTertiary sm:shrink-0">
                        {copy['sessionSecurity.sessions.current']}
                      </span>
                    ) : (
                      <Form
                        method="post"
                        className="w-full sm:w-auto sm:shrink-0"
                        onSubmit={(event) => {
                          event.preventDefault();
                          setSessionPendingRevoke({ id: session.id, device: session.device });
                        }}
                      >
                        <input type="hidden" name="intent" value="revoke" />
                        <input type="hidden" name="sessionId" value={session.id} />
                        <button
                          type="submit"
                          disabled={busy}
                          className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 whitespace-normal rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-center text-xs font-medium leading-snug text-[var(--status-error-text)] hover:bg-[var(--status-error-bg)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          {
                            copy[
                              revokingSession ? 'sessionSecurity.sessions.revoking' : 'sessionSecurity.sessions.revoke'
                            ]
                          }
                        </button>
                      </Form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="min-w-0 border-t border-bolt-elements-borderColor pt-8">
          <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
            {copy['sessionSecurity.policy.title']}
          </h2>
          <p className="mt-1 break-words text-sm leading-relaxed text-bolt-elements-textSecondary">
            {copy['sessionSecurity.policy.description']}
          </p>
          <Form method="post" className="mt-4 min-w-0 space-y-4">
            <input type="hidden" name="orgId" value={orgId} />
            <TextField label={copy['sessionSecurity.policy.duration']} name="sessionDurationMinutes" type="number" />
            <TextField
              label={copy['sessionSecurity.policy.ipAllowlist']}
              name="ipAllowlist"
              placeholder={copy['sessionSecurity.policy.ipPlaceholder']}
            />
            <PrimaryButton disabled={busy}>
              {copy[savingPolicy ? 'sessionSecurity.policy.saving' : 'sessionSecurity.policy.save']}
            </PrimaryButton>
          </Form>
        </section>
      </div>
      <ConfirmationDialog
        isOpen={sessionPendingRevoke !== null}
        onClose={() => setSessionPendingRevoke(null)}
        onConfirm={() => {
          const pending = sessionPendingRevoke;
          setSessionPendingRevoke(null);

          if (pending) {
            submit({ intent: 'revoke', sessionId: pending.id }, { method: 'post' });
          }
        }}
        title={formatSessionSecurityCopy(copy['sessionSecurity.dialog.revoke.title'], {
          device: sessionPendingRevoke?.device ?? copy['sessionSecurity.device.unknown'],
        })}
        description={copy['sessionSecurity.dialog.revoke.description']}
        confirmLabel={copy['sessionSecurity.dialog.revoke.confirm']}
        variant="destructive"
      />
      <ConfirmationDialog
        isOpen={confirmRevokeAll}
        onClose={() => setConfirmRevokeAll(false)}
        onConfirm={() => {
          setConfirmRevokeAll(false);
          submit({ intent: 'revoke-all' }, { method: 'post' });
        }}
        title={copy['sessionSecurity.dialog.revokeAll.title']}
        description={copy['sessionSecurity.dialog.revokeAll.description']}
        confirmLabel={copy['sessionSecurity.dialog.revokeAll.confirm']}
        variant="destructive"
      />
    </EnterpriseFormPage>
  );
}
