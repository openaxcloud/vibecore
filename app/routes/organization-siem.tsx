import { Form, useActionData, useLoaderData } from 'react-router';
import { EnterpriseFormPage, PrimaryButton, SelectField, TextField } from '~/components/enterprise/EnterpriseFormPage';
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
import { shouldRethrowActionError } from '~/lib/route-reauth';

/*
 * SIEM webhook configuration.
 *
 * The API exposes exactly ONE endpoint for SIEM webhooks:
 *   POST /orgs/:orgId/siem-webhooks   (services/api/src/app.ts:14824)
 * gated on the `audit:export` permission plus a recent admin re-auth. It upserts
 * a webhook (url + secret + enabled) that the server later delivers abuse
 * signals to (`deliverSiemAbuseSignal`), tracking lastDeliveredAt/Id server-side.
 *
 * There is NO GET or DELETE for siem-webhooks, and the current org/enterprise
 * payloads do not surface the stored config, so we intentionally render the
 * config form WITHOUT a list of existing webhooks and note that listing needs a
 * GET endpoint — rather than fabricating a list the backend can't provide.
 */

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

  return json({ orgId: organization.id });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as Record<string, string>;

  if (!body.orgId) {
    return json({ error: 'Organization ID is required.' }, { status: 400 });
  }

  if (!body.url) {
    return json({ error: 'Webhook URL is required.' }, { status: 400 });
  }

  if (!body.secret || body.secret.length < 16) {
    return json({ error: 'Signing secret must be at least 16 characters.' }, { status: 400 });
  }

  try {
    await apiRequest(request, `/orgs/${body.orgId}/siem-webhooks`, {
      method: 'POST',
      body: JSON.stringify({
        url: body.url,
        secret: body.secret,

        // Default: newly configured webhooks are enabled unless explicitly disabled.
        enabled: body.enabled !== 'false',
      }),
    });
  } catch (error) {
    /*
     * Redirect (3xx re-auth) and 5xx errors are re-thrown for the framework /
     * error boundary. The POST handler additionally requires a recent admin
     * re-auth (403 ADMIN_REAUTH_REQUIRED) and the `audit:export` permission
     * (403); both surface inline so the user keeps their form input.
     */
    if (shouldRethrowActionError(error)) {
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
        error: 'You do not have permission to configure SIEM webhooks. This requires the audit:export permission.',
      });
    }

    return json({ error: await apiErrorMessage(error, 'Could not save the SIEM webhook.') });
  }

  return json({ status: 'SIEM webhook saved. Abuse and security events will now be delivered to this endpoint.' });
}

export default function OrganizationSiemPage() {
  const { orgId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { status?: string; error?: string } | undefined;

  return (
    <EnterpriseFormPage
      title="SIEM webhooks"
      description="Stream organization security and abuse events to your SIEM. Deliveries are signed with your secret so your receiver can verify authenticity."
      status={actionData?.status}
      error={actionData?.error}
    >
      <Form method="post" className="space-y-4">
        <TextField label="Organization ID" name="orgId" defaultValue={orgId} required />
        <TextField
          label="Webhook URL"
          name="url"
          type="url"
          placeholder="https://siem.example.com/ingest/vibecore"
          required
        />
        <TextField label="Signing secret" name="secret" type="password" placeholder="At least 16 characters" required />
        <SelectField
          label="Status"
          name="enabled"
          defaultValue="true"
          options={[
            { value: 'true', label: 'Enabled' },
            { value: 'false', label: 'Disabled' },
          ]}
        />
        <PrimaryButton>Save SIEM webhook</PrimaryButton>
      </Form>

      <p className="mt-6 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2 text-xs text-bolt-elements-textSecondary">
        Listing and removing existing webhooks is not shown here: the API currently exposes only a create/upsert
        endpoint for SIEM webhooks (no GET or DELETE). Once a read endpoint is available, configured webhooks and their
        last-delivery status will appear on this page.
      </p>

      <p className="mt-3 text-xs text-bolt-elements-textSecondary">
        Organization <span className="font-mono">{orgId}</span> ·{' '}
        <a className="underline hover:text-bolt-elements-textPrimary" href="/audit-logs">
          View and export audit logs
        </a>
      </p>
    </EnterpriseFormPage>
  );
}
