import { Laptop, LogOut, Monitor, Smartphone, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Form, useActionData, useLoaderData, useNavigation, useRevalidator, useSubmit } from 'react-router';
import { toast } from 'react-toastify';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import {
  apiErrorMessage,
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
import { formatUserAreaDateTime } from '~/lib/i18n/user-area-locale';
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

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  /*
   * The org-policy form must still render even if the per-user session list is
   * briefly unavailable (e.g. the api pod is draining); degrade to an empty list
   * rather than failing the whole page.
   */
  const sessionsResult = await apiRequest<{ sessions: ApiSession[] }>(request, '/auth/sessions').catch(() => null);

  const currentHash = currentSessionTokenHash(request);

  const sessions: ClientSession[] = (sessionsResult?.sessions ?? []).map((session) => ({
    id: session.id,
    ipAddress: session.ipAddress ?? null,
    userAgent: session.userAgent ?? null,
    device: describeUserAgent(session.userAgent),
    createdAt: session.createdAt,
    current: Boolean(currentHash && session.tokenHash && session.tokenHash === currentHash),
  }));

  return json({
    orgId: organization.id,
    sessions,
    sessionsUnavailable: sessionsResult === null,
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
        return json({ error: 'Missing session id.' }, { status: 400 });
      }

      await apiRequest(request, `/auth/sessions/${encodeURIComponent(body.sessionId)}`, { method: 'DELETE' });

      return json({ status: 'Session revoked. That device has been signed out.' });
    }

    if (body.intent === 'revoke-all') {
      await apiRequest(request, '/auth/logout-all', { method: 'POST', body: JSON.stringify({}) });

      return json({ status: 'All other sessions have been signed out.' });
    }

    if (!body.orgId) {
      return json({ error: 'Your organization is unavailable. Reload the page and try again.' }, { status: 400 });
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

    return json({ status: 'Session security policy saved.' });
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
      return json(
        { error: await apiErrorMessage(error, 'Action failed. Please try again.') },
        { status: error.status },
      );
    }

    return json({ error: 'This action is temporarily unavailable. Please try again in a moment.' });
  }
}

const dateTimeFormat: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

function formatDateTime(value: string) {
  const date = new Date(value);

  return formatUserAreaDateTime(date, dateTimeFormat) ?? value;
}

/*
 * Best-effort human label from a User-Agent string — enough to recognise a
 * device at a glance without pulling in a parsing dependency. Browser + OS only.
 */
function describeUserAgent(userAgent: string | undefined): string {
  if (!userAgent) {
    return 'Unknown device';
  }

  const browser = userAgent.includes('Edg')
    ? 'Edge'
    : userAgent.includes('OPR') || userAgent.includes('Opera')
      ? 'Opera'
      : userAgent.includes('Firefox')
        ? 'Firefox'
        : userAgent.includes('Chrome')
          ? 'Chrome'
          : userAgent.includes('Safari')
            ? 'Safari'
            : 'Browser';

  const os = /iPhone|iPad|iPod/.test(userAgent)
    ? 'iOS'
    : userAgent.includes('Android')
      ? 'Android'
      : userAgent.includes('Mac OS X') || userAgent.includes('Macintosh')
        ? 'macOS'
        : userAgent.includes('Windows')
          ? 'Windows'
          : userAgent.includes('Linux')
            ? 'Linux'
            : 'Unknown OS';

  return `${browser} on ${os}`;
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
  const { orgId, sessions, sessionsUnavailable } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const submit = useSubmit();
  const busy = navigation.state !== 'idle';
  const retryingSessions = revalidator.state !== 'idle';
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);
  const [sessionPendingRevoke, setSessionPendingRevoke] = useState<{ id: string; device: string } | null>(null);

  /* Surface the sign-out-all result as a toast on top of the inline banner. */
  useEffect(() => {
    if (actionData?.status?.includes('signed out')) {
      toast.success(actionData.status);
    }
  }, [actionData]);

  const otherSessions = sessions.filter((session) => !session.current);

  return (
    <EnterpriseFormPage
      title="Session security"
      description="Inspect active devices, revoke sessions and manage organization session duration policy."
      status={actionData?.status}
      error={actionData?.error}
    >
      <div className="space-y-8">
        <section>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Active sessions</h2>
              <p className="mt-1 text-sm text-bolt-elements-textSecondary">
                Devices currently signed in to your account. Revoke any you don&apos;t recognise.
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
                className="mt-3 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-[var(--status-error-bg)] disabled:cursor-not-allowed disabled:opacity-60 sm:mt-0"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                Sign out all other sessions
              </button>
            ) : null}
          </div>

          {sessionsUnavailable ? (
            retryingSessions ? (
              <AsyncPanelSkeleton label="Loading active sessions" rows={3} compact className="mt-4" />
            ) : (
              <AsyncPanelError
                title="Active sessions could not load"
                description="No session was revoked. The organization policy below remains available."
                onRetry={revalidator.revalidate}
                compact
                className="mt-4"
              />
            )
          ) : sessions.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-6 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bolt-elements-background-depth-3">
                <Monitor className="h-5 w-5 text-bolt-elements-textTertiary" aria-hidden />
              </span>
              <p className="text-sm text-bolt-elements-textSecondary">No active sessions found.</p>
            </div>
          ) : (
            <ul className="mt-4 overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
              {sessions.map((session, index) => {
                const Icon = deviceIcon(session.userAgent);

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
                              This device
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 break-all text-xs text-bolt-elements-textTertiary">
                          {session.ipAddress ? `IP ${session.ipAddress}` : 'IP unknown'}
                          {' · '}
                          Signed in {formatDateTime(session.createdAt)}
                        </p>
                      </div>
                    </div>

                    {session.current ? (
                      <span className="text-xs text-bolt-elements-textTertiary sm:shrink-0">Current session</span>
                    ) : (
                      <Form
                        method="post"
                        className="sm:shrink-0"
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
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-[var(--status-error-text)] hover:bg-[var(--status-error-bg)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          Revoke
                        </button>
                      </Form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="border-t border-bolt-elements-borderColor pt-8">
          <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Organization session policy</h2>
          <p className="mt-1 text-sm text-bolt-elements-textSecondary">
            Applies to everyone in the organization: session lifetime and the IP ranges allowed to sign in.
          </p>
          <Form method="post" className="mt-4 space-y-4">
            <input type="hidden" name="orgId" value={orgId} />
            <TextField label="Session duration minutes" name="sessionDurationMinutes" type="number" />
            <TextField label="IP allowlist" name="ipAllowlist" placeholder="203.0.113.10,198.51.100.0/24" />
            <PrimaryButton disabled={busy}>Save policy</PrimaryButton>
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
        title={`Revoke this session (${sessionPendingRevoke?.device ?? 'unknown device'})?`}
        description="That device will be signed out immediately."
        confirmLabel="Revoke session"
        variant="destructive"
      />
      <ConfirmationDialog
        isOpen={confirmRevokeAll}
        onClose={() => setConfirmRevokeAll(false)}
        onConfirm={() => {
          setConfirmRevokeAll(false);
          submit({ intent: 'revoke-all' }, { method: 'post' });
        }}
        title="Sign out all other sessions?"
        description="Every device except this one will be signed out immediately. Your current session stays active."
        confirmLabel="Sign out all"
        variant="destructive"
      />
    </EnterpriseFormPage>
  );
}
