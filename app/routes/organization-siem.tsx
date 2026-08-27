import { CheckCircle2, Clock, Radio, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation, useRevalidator, useSubmit } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { EnterpriseFormPage, PrimaryButton, SelectField, TextField } from '~/components/enterprise/EnterpriseFormPage';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import {
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
import {
  formatOrganizationSiemCopy,
  getOrganizationSiemCopy,
  resolveOrganizationSiemLanguage,
  type OrganizationSiemCopy,
} from '~/lib/i18n/catalogs/organization-siem';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
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

export const meta: MetaFunction = ({ matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;

  return [{ title: getOrganizationSiemCopy(rootData?.language)['organizationSiem.metaTitle'] }];
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
  const language = resolveOrganizationSiemLanguage(resolveRequestLocale(request).language);
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  let webhooks: SiemWebhook[] = [];
  let loadError = false;
  let loadErrorKind: 'permission' | 'temporary' | null = null;

  try {
    const result = await apiRequest<{ webhooks: SiemWebhook[] }>(request, `/orgs/${organization.id}/siem-webhooks`);
    webhooks = result.webhooks;
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (isApiResponse(error, 403)) {
      loadError = true;
      loadErrorKind = 'permission';
    } else {
      loadError = true;
      loadErrorKind = 'temporary';
    }
  }

  return json({ orgId: organization.id, webhooks, loadError, loadErrorKind, language });
}

export async function action({ request }: EnterpriseActionArgs) {
  const copy = getOrganizationSiemCopy(resolveRequestLocale(request).language);

  const body = formObject(await request.formData()) as {
    intent?: string;
    orgId?: string;
    url?: string;
    secret?: string;
    enabled?: string;
    webhookId?: string;
  };

  if (!body.orgId) {
    return json({ error: copy['organizationSiem.errors.organizationUnavailable'] }, { status: 400 });
  }

  try {
    if (body.intent === 'delete') {
      if (!body.webhookId) {
        return json({ error: copy['organizationSiem.errors.missingWebhook'] }, { status: 400 });
      }

      await apiRequest(request, `/orgs/${body.orgId}/siem-webhooks/${encodeURIComponent(body.webhookId)}`, {
        method: 'DELETE',
      });

      return json({ status: copy['organizationSiem.success.removed'] });
    }

    if (body.intent === 'test') {
      if (!body.webhookId) {
        return json({ error: copy['organizationSiem.errors.missingWebhook'] }, { status: 400 });
      }

      // Real signed test delivery; the API returns the receiver's actual HTTP status.
      const result = await apiRequest<{ delivered: boolean; status: number; statusText: string }>(
        request,
        `/orgs/${body.orgId}/siem-webhooks/${encodeURIComponent(body.webhookId)}/test`,
        { method: 'POST' },
      );

      if (result.delivered) {
        return json({
          status: formatOrganizationSiemCopy(copy['organizationSiem.success.test'], { status: result.status }),
        });
      }

      return json({
        error: result.status
          ? formatOrganizationSiemCopy(copy['organizationSiem.errors.testStatus'], { status: result.status })
          : copy['organizationSiem.errors.testDelivery'],
      });
    }

    // Default intent: create/upsert a webhook.
    if (!body.url) {
      return json({ error: copy['organizationSiem.errors.urlRequired'] }, { status: 400 });
    }

    if (!body.secret || body.secret.length < 16) {
      return json({ error: copy['organizationSiem.errors.secretLength'] }, { status: 400 });
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

    return json({ status: copy['organizationSiem.success.saved'] });
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
        error: copy['organizationSiem.errors.reauth'],
      });
    }

    if (isApiResponse(error, 403)) {
      return json({
        error: copy['organizationSiem.errors.permissionConfigure'],
      });
    }

    return json({ error: copy['organizationSiem.errors.save'] });
  }
}

function DeliveryStatus({
  webhook,
  copy,
  language,
}: {
  webhook: SiemWebhook;
  copy: OrganizationSiemCopy;
  language: 'en' | 'fr';
}) {
  if (webhook.lastDeliveredAt) {
    const date =
      formatAbsoluteTime(webhook.lastDeliveredAt, language) || copy['organizationSiem.delivery.dateUnavailable'];

    return (
      <span className="inline-flex items-center gap-1 text-xs text-bolt-elements-textSecondary">
        <CheckCircle2 className="h-3.5 w-3.5 text-[var(--status-success-text)]" aria-hidden />
        {formatOrganizationSiemCopy(copy['organizationSiem.delivery.last'], { date })}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-bolt-elements-textSecondary">
      <Clock className="h-3.5 w-3.5" aria-hidden />
      {copy['organizationSiem.delivery.none']}
    </span>
  );
}

export default function OrganizationSiemPage() {
  const { orgId, webhooks, loadError, loadErrorKind, language: loaderLanguage } = useLoaderData<typeof loader>();
  const language = resolveOrganizationSiemLanguage(loaderLanguage);
  const copy = getOrganizationSiemCopy(language);
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const submit = useSubmit();
  const busy = navigation.state !== 'idle';
  const retrying = revalidator.state !== 'idle';
  const [webhookPendingDelete, setWebhookPendingDelete] = useState<string | null>(null);

  if (loadError) {
    return (
      <EnterpriseFormPage title={copy['organizationSiem.title']} description={copy['organizationSiem.description']}>
        {retrying ? (
          <AsyncPanelSkeleton label={copy['organizationSiem.load.loading']} rows={4} />
        ) : (
          <AsyncPanelError
            title={
              loadErrorKind === 'permission'
                ? copy['organizationSiem.load.permissionTitle']
                : copy['organizationSiem.load.errorTitle']
            }
            description={
              loadErrorKind === 'permission'
                ? copy['organizationSiem.load.permissionDescription']
                : copy['organizationSiem.load.errorDescription']
            }
            onRetry={revalidator.revalidate}
            retryLabel={copy['organizationSiem.load.retry']}
            tone={loadErrorKind === 'permission' ? 'warning' : 'error'}
          />
        )}
      </EnterpriseFormPage>
    );
  }

  return (
    <EnterpriseFormPage
      title={copy['organizationSiem.title']}
      description={copy['organizationSiem.description']}
      status={actionData?.status}
      error={actionData?.error}
    >
      <div className="space-y-8">
        <section>
          <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
            {copy['organizationSiem.form.addTitle']}
          </h2>
          <Form method="post" className="mt-3 space-y-4">
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="intent" value="create" />
            <TextField
              label={copy['organizationSiem.form.url']}
              name="url"
              type="url"
              placeholder={copy['organizationSiem.form.urlPlaceholder']}
              required
            />
            <TextField
              label={copy['organizationSiem.form.secret']}
              name="secret"
              type="password"
              placeholder={copy['organizationSiem.form.secretPlaceholder']}
              required
            />
            <SelectField
              label={copy['organizationSiem.form.status']}
              name="enabled"
              defaultValue="true"
              options={[
                { value: 'true', label: copy['organizationSiem.status.enabled'] },
                { value: 'false', label: copy['organizationSiem.status.disabled'] },
              ]}
            />
            <PrimaryButton disabled={busy}>{copy['organizationSiem.form.save']}</PrimaryButton>
          </Form>
        </section>

        <section className="border-t border-bolt-elements-borderColor pt-8">
          <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
            {copy['organizationSiem.list.title']}
          </h2>

          {webhooks.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-6 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bolt-elements-background-depth-3">
                <Radio className="h-5 w-5 text-bolt-elements-textTertiary" aria-hidden />
              </span>
              <p className="text-sm text-bolt-elements-textSecondary">{copy['organizationSiem.list.empty']}</p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-bolt-elements-borderColor">
              <table className="w-full min-w-[36rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-left">
                    <th className="px-4 py-2.5 font-medium text-bolt-elements-textSecondary">
                      {copy['organizationSiem.list.endpoint']}
                    </th>
                    <th className="px-4 py-2.5 font-medium text-bolt-elements-textSecondary">
                      {copy['organizationSiem.list.status']}
                    </th>
                    <th className="px-4 py-2.5 font-medium text-bolt-elements-textSecondary">
                      {copy['organizationSiem.list.lastDelivered']}
                    </th>
                    <th className="px-4 py-2.5 font-medium text-bolt-elements-textSecondary">
                      <span className="sr-only">{copy['organizationSiem.list.actions']}</span>
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
                            {copy['organizationSiem.status.enabled']}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-2 py-0.5 text-xs font-medium text-bolt-elements-textSecondary">
                            {copy['organizationSiem.status.disabled']}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <DeliveryStatus webhook={webhook} copy={copy} language={language} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Form method="post">
                            <input type="hidden" name="orgId" value={orgId} />
                            <input type="hidden" name="intent" value="test" />
                            <input type="hidden" name="webhookId" value={webhook.id} />
                            <button
                              type="submit"
                              disabled={busy}
                              className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-normal rounded-md border border-bolt-elements-borderColor px-3 text-left text-xs font-medium text-bolt-elements-textPrimary hover:border-[var(--vc-ide-accent-action)] hover:text-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-60"
                              aria-label={formatOrganizationSiemCopy(copy['organizationSiem.actions.sendAria'], {
                                url: webhook.url,
                              })}
                            >
                              <Send className="h-3.5 w-3.5" aria-hidden />
                              {copy['organizationSiem.actions.send']}
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
                              className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-normal rounded-md border border-bolt-elements-borderColor px-3 text-left text-xs font-medium text-bolt-elements-textPrimary hover:border-[var(--status-error-border)] hover:text-[var(--status-error-text)] disabled:cursor-not-allowed disabled:opacity-60"
                              aria-label={formatOrganizationSiemCopy(copy['organizationSiem.actions.deleteAria'], {
                                url: webhook.url,
                              })}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              {copy['organizationSiem.actions.delete']}
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
          {copy['organizationSiem.auditLogs']}
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
        title={copy['organizationSiem.dialog.title']}
        description={copy['organizationSiem.dialog.description']}
        confirmLabel={copy['organizationSiem.dialog.confirm']}
        variant="destructive"
      />
    </EnterpriseFormPage>
  );
}
