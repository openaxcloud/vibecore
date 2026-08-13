import { CheckCircle2, Clock, Radio, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Form, useActionData, useLoaderData, useNavigation, useRevalidator, useSubmit } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { EnterpriseFormPage, PrimaryButton, SelectField, TextField } from '~/components/enterprise/EnterpriseFormPage';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import {
  apiErrorMessage,
  apiRequest,
  firstOrganizationOrNull,
  formObject,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { formatAbsoluteTime } from '~/lib/format-relative';
import { isReauthRedirect, shouldRethrowActionError } from '~/lib/route-reauth';

/*
 * SIEM webhook configuration, backed by the org-scoped endpoints:
 *   GET    /orgs/:orgId/siem-webhooks              (app.ts, list — never returns the secret)
 *   POST   /orgs/:orgId/siem-webhooks              (create/upsert; audit:export + admin re-auth)
 *   DELETE /orgs/:orgId/siem-webhooks/:webhookId   (delete; audit:export + admin re-auth)
 * The server signs deliveries with the stored secret and delivers abuse signals
 * (`deliverSiemAbuseSignal`), tracking lastDeliveredAt/Id server-side. The list
 * endpoint intentionally omits the secret/hash/ciphertext.
 */

type SiemWebhook = {
  id: string;
  url: string;
  enabled: boolean;
  lastDeliveredAt?: string;
  lastDeliveredId?: string;
  createdAt: string;
};

async function readErrorCode(error: unknown): Promise<string | undefined> {
  if (!(error instanceof Response)) {
    return undefined;
  }

  try {
    const payload = (await error.clone().json()) as { code?: string };
    return payload.code;
  } catch {
    return undefined;
  }
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  let webhooks: SiemWebhook[] = [];
  let loadError: string | null = null;
  let loadErrorKind: 'permission' | 'temporary' | null = null;

  try {
    const result = await apiRequest<{ webhooks: SiemWebhook[] }>(request, `/orgs/${organization.id}/siem-webhooks`);
    webhooks = result.webhooks;
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (isApiResponse(error, 403)) {
      loadError =
        'You do not have permission to view SIEM webhooks. Ask an organization admin for audit export access.';
      loadErrorKind = 'permission';
    } else {
      loadError = 'Configured SIEM webhooks are temporarily unavailable.';
      loadErrorKind = 'temporary';
    }
  }

  return json({ orgId: organization.id, webhooks, loadError, loadErrorKind });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as {
    intent?: string;
    orgId?: string;
    url?: string;
    secret?: string;
    enabled?: string;
    webhookId?: string;
  };

  if (!body.orgId) {
    return json({ error: 'Your organization is unavailable. Reload the page and try again.' }, { status: 400 });
  }

  try {
    if (body.intent === 'delete') {
      if (!body.webhookId) {
        return json({ error: 'Missing webhook.' }, { status: 400 });
      }

      await apiRequest(request, `/orgs/${body.orgId}/siem-webhooks/${encodeURIComponent(body.webhookId)}`, {
        method: 'DELETE',
      });

      return json({ status: 'SIEM webhook removed. Events will no longer be delivered to that endpoint.' });
    }

    if (body.intent === 'test') {
      if (!body.webhookId) {
        return json({ error: 'Missing webhook.' }, { status: 400 });
      }

      // Real signed test delivery; the API returns the receiver's actual HTTP status.
      const result = await apiRequest<{ delivered: boolean; status: number; statusText: string }>(
        request,
        `/orgs/${body.orgId}/siem-webhooks/${encodeURIComponent(body.webhookId)}/test`,
        { method: 'POST' },
      );

      if (result.delivered) {
        return json({ status: `Test event delivered — your endpoint responded HTTP ${result.status}.` });
      }

      return json({
        error: result.status
          ? `Test event was signed and sent, but your endpoint responded HTTP ${result.status} ${result.statusText}.`
          : `Test event could not be delivered — ${result.statusText}.`,
      });
    }

    // Default intent: create/upsert a webhook.
    if (!body.url) {
      return json({ error: 'Webhook URL is required.' }, { status: 400 });
    }

    if (!body.secret || body.secret.length < 16) {
      return json({ error: 'Signing secret must be at least 16 characters.' }, { status: 400 });
    }

    await apiRequest(request, `/orgs/${body.orgId}/siem-webhooks`, {
      method: 'POST',
      body: JSON.stringify({
        url: body.url,
        secret: body.secret,

        // Default: newly configured webhooks are enabled unless explicitly disabled.
        enabled: body.enabled !== 'false',
      }),
    });

    return json({ status: 'SIEM webhook saved. Abuse and security events will now be delivered to this endpoint.' });
  } catch (error) {
    /*
     * Redirect (3xx re-auth) and 5xx errors are re-thrown for the framework /
     * error boundary. The POST and DELETE handlers additionally require a recent
     * admin re-auth (403 ADMIN_REAUTH_REQUIRED) and the `audit:export`
     * permission (403); both surface inline so the user keeps their form input.
     */
    if (isReauthRedirect(error) || shouldRethrowActionError(error)) {
      throw error;
    }

    const code = await readErrorCode(error);

    if (code === 'ADMIN_REAUTH_REQUIRED') {
      return json({
        error: 'For security, confirm your password on the Security page and try again within 5 minutes.',
      });
    }

    if (isApiResponse(error, 403)) {
      return json({
        error:
          'You do not have permission to configure SIEM webhooks. Ask an organization admin for audit export access.',
      });
    }

    return json({ error: await apiErrorMessage(error, 'Could not save the SIEM webhook.') });
  }
}

function DeliveryStatus({ webhook }: { webhook: SiemWebhook }) {
  if (webhook.lastDeliveredAt) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-bolt-elements-textSecondary">
        <CheckCircle2 className="h-3.5 w-3.5 text-[var(--status-success-text)]" aria-hidden />
        Last delivered {formatAbsoluteTime(webhook.lastDeliveredAt)}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-bolt-elements-textSecondary">
      <Clock className="h-3.5 w-3.5" aria-hidden />
      No deliveries yet
    </span>
  );
}

export default function OrganizationSiemPage() {
  const { orgId, webhooks, loadError, loadErrorKind } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const submit = useSubmit();
  const busy = navigation.state !== 'idle';
  const retrying = revalidator.state !== 'idle';
  const [webhookPendingDelete, setWebhookPendingDelete] = useState<string | null>(null);

  if (loadError) {
    return (
      <EnterpriseFormPage
        title="SIEM webhooks"
        description="Stream organization security and abuse events to your SIEM. Deliveries are signed so your receiver can verify authenticity."
      >
        {retrying ? (
          <AsyncPanelSkeleton label="Loading SIEM webhooks" rows={4} />
        ) : (
          <AsyncPanelError
            title={loadErrorKind === 'permission' ? 'SIEM settings are restricted' : 'SIEM webhooks could not load'}
            description={
              loadErrorKind === 'permission'
                ? 'Ask an organization administrator for access to security event exports.'
                : 'Webhook controls are hidden because the latest request failed. No endpoint was changed.'
            }
            onRetry={revalidator.revalidate}
            retryLabel="Reload webhooks"
            tone={loadErrorKind === 'permission' ? 'warning' : 'error'}
          />
        )}
      </EnterpriseFormPage>
    );
  }

  return (
    <EnterpriseFormPage
      title="SIEM webhooks"
      description="Stream organization security and abuse events to your SIEM. Deliveries are signed with your secret so your receiver can verify authenticity."
      status={actionData?.status}
      error={actionData?.error}
    >
      <div className="space-y-8">
        <section>
          <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Add a webhook</h2>
          <Form method="post" className="mt-3 space-y-4">
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="intent" value="create" />
            <TextField
              label="Webhook URL"
              name="url"
              type="url"
              placeholder="https://siem.example.com/ingest/vibecore"
              required
            />
            <TextField
              label="Signing secret"
              name="secret"
              type="password"
              placeholder="At least 16 characters"
              required
            />
            <SelectField
              label="Status"
              name="enabled"
              defaultValue="true"
              options={[
                { value: 'true', label: 'Enabled' },
                { value: 'false', label: 'Disabled' },
              ]}
            />
            <PrimaryButton disabled={busy}>Save SIEM webhook</PrimaryButton>
          </Form>
        </section>

        <section className="border-t border-bolt-elements-borderColor pt-8">
          <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Configured webhooks</h2>

          {webhooks.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-6 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bolt-elements-background-depth-3">
                <Radio className="h-5 w-5 text-bolt-elements-textTertiary" aria-hidden />
              </span>
              <p className="text-sm text-bolt-elements-textSecondary">
                No SIEM webhooks configured yet. Add one above to start streaming events.
              </p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-bolt-elements-borderColor">
              <table className="w-full min-w-[36rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-left">
                    <th className="px-4 py-2.5 font-medium text-bolt-elements-textSecondary">Endpoint</th>
                    <th className="px-4 py-2.5 font-medium text-bolt-elements-textSecondary">Status</th>
                    <th className="px-4 py-2.5 font-medium text-bolt-elements-textSecondary">Last delivered</th>
                    <th className="px-4 py-2.5 font-medium text-bolt-elements-textSecondary">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {webhooks.map((webhook) => (
                    <tr key={webhook.id} className="border-b border-bolt-elements-borderColor last:border-b-0">
                      <td className="max-w-[16rem] break-all px-4 py-3 font-mono text-xs text-bolt-elements-textPrimary">
                        {webhook.url}
                      </td>
                      <td className="px-4 py-3">
                        {webhook.enabled ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-2 py-0.5 text-xs font-medium text-[var(--status-success-text)]">
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-2 py-0.5 text-xs font-medium text-bolt-elements-textSecondary">
                            Disabled
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <DeliveryStatus webhook={webhook} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Form method="post">
                            <input type="hidden" name="orgId" value={orgId} />
                            <input type="hidden" name="intent" value="test" />
                            <input type="hidden" name="webhookId" value={webhook.id} />
                            <button
                              type="submit"
                              disabled={busy}
                              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textPrimary hover:border-[var(--vc-ide-accent-action)] hover:text-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-60"
                              aria-label={`Send a test event to SIEM webhook ${webhook.url}`}
                            >
                              <Send className="h-3.5 w-3.5" aria-hidden />
                              Send test event
                            </button>
                          </Form>
                          <Form
                            method="post"
                            onSubmit={(event) => {
                              event.preventDefault();
                              setWebhookPendingDelete(webhook.id);
                            }}
                          >
                            <input type="hidden" name="orgId" value={orgId} />
                            <input type="hidden" name="intent" value="delete" />
                            <input type="hidden" name="webhookId" value={webhook.id} />
                            <button
                              type="submit"
                              disabled={busy}
                              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textPrimary hover:border-[var(--status-error-border)] hover:text-[var(--status-error-text)] disabled:cursor-not-allowed disabled:opacity-60"
                              aria-label={`Delete SIEM webhook ${webhook.url}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              Delete
                            </button>
                          </Form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <p className="mt-6 text-xs text-bolt-elements-textSecondary">
        <a className="underline hover:text-bolt-elements-textPrimary" href="/audit-logs">
          View and export audit logs
        </a>
      </p>
      <ConfirmationDialog
        isOpen={webhookPendingDelete !== null}
        onClose={() => setWebhookPendingDelete(null)}
        onConfirm={() => {
          const pending = webhookPendingDelete;
          setWebhookPendingDelete(null);

          if (pending) {
            submit({ orgId: orgId ?? '', intent: 'delete', webhookId: pending }, { method: 'post' });
          }
        }}
        title="Remove this SIEM webhook?"
        description="Events will stop being delivered to it."
        confirmLabel="Remove webhook"
        variant="destructive"
      />
    </EnterpriseFormPage>
  );
}
