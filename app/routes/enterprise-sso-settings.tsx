import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiErrorMessage,
  apiRequest,
  firstOrganizationOrNull,
  formObject,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { shouldRethrowActionError } from '~/lib/route-reauth';

/*
 * Default OIDC scopes surfaced to the admin for reference. The upstream
 * `PUT /orgs/:orgId/sso/oidc` handler (services/api/src/app.ts:14671,
 * `oidcConfigSchema` app.ts:974) does NOT accept a `scopes` field — the
 * provider's authorization request is fixed to the standard OIDC scope set —
 * so this is shown as informational text, not a submitted form field.
 */
const OIDC_DEFAULT_SCOPES = 'openid profile email';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  /*
   * There is intentionally no admin-facing GET for the SSO config: the OIDC
   * client secret and SAML certificate are stored encrypted (encryptJson) and
   * are only ever read server-side during the auth handshake, never round-
   * tripped to the browser. The forms therefore render without prefill; each
   * PUT is a full upsert (store.upsertSsoConfig) so re-submitting replaces the
   * whole config for that protocol.
   */
  return json({ orgId: organization.id });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as Record<string, string>;

  if (!body.orgId) {
    return json({ error: 'Organization ID is required.' }, { status: 400 });
  }

  const enabled = body.enabled === 'true';

  try {
    if (body.type === 'saml') {
      // Mirrors samlConfigSchema (app.ts:983): entityId, ssoUrl, x509Certificate, enabled.
      await apiRequest(request, `/orgs/${body.orgId}/sso/saml`, {
        method: 'PUT',
        body: JSON.stringify({
          entityId: body.entityId,
          ssoUrl: body.ssoUrl,
          x509Certificate: body.x509Certificate,
          enabled,
        }),
      });

      return json({ status: 'SSO settings saved.' });
    }

    // Mirrors oidcConfigSchema (app.ts:974): issuer, clientId, clientSecret, optional URLs, enabled.
    await apiRequest(request, `/orgs/${body.orgId}/sso/oidc`, {
      method: 'PUT',
      body: JSON.stringify({
        issuer: body.issuer,
        clientId: body.clientId,
        clientSecret: body.clientSecret,
        authorizationUrl: body.authorizationUrl || undefined,
        tokenUrl: body.tokenUrl || undefined,
        jwksUrl: body.jwksUrl || undefined,
        enabled,
      }),
    });

    return json({ status: 'SSO settings saved.' });
  } catch (error) {
    /*
     * apiRequest throws a real Response on any non-2xx upstream status. A 401/403-MFA page
     * navigation is thrown as a react-router redirect() (3xx) — re-throw so the browser follows
     * the re-auth redirect (requireRecentAdminReauth on the PUT routes) instead of swallowing it
     * into a body-less inline error. Server errors (5xx) go to the route error boundary.
     * Validation (400, e.g. bad X.509 cert / missing entityId/ssoUrl) and plan/authorization
     * (403) errors surface inline so the user keeps their form input.
     */
    if (shouldRethrowActionError(error)) {
      throw error;
    }

    return json({ error: await apiErrorMessage(error, 'Could not save SSO settings.') });
  }
}

type ActionData = { status?: string; error?: string };

export default function EnterpriseSsoSettingsPage() {
  const { orgId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';

  return (
    <EnterpriseFormPage
      title="Enterprise SSO settings"
      description="Configure an OIDC (including Microsoft Entra ID) or SAML identity provider for your organization. Each provider is saved independently and can be enabled or disabled on its own."
      status={actionData?.status}
      error={actionData?.error}
    >
      <p className="mb-6 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-xs text-bolt-elements-textTertiary">
        For your organization&apos;s security, provider secrets are stored encrypted and are never displayed after
        saving, so these forms start blank. Saving a provider replaces its entire configuration.
      </p>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-bolt-elements-textPrimary">OIDC / Entra ID</h2>
          <p className="mt-1 text-sm text-bolt-elements-textSecondary">
            OpenID Connect discovery. Requested scopes are{' '}
            <code className="rounded bg-bolt-elements-background-depth-3 px-1 py-0.5 font-mono text-xs">
              {OIDC_DEFAULT_SCOPES}
            </code>
            .
          </p>
        </div>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="type" value="oidc" />
          <input type="hidden" name="orgId" value={orgId} />
          <TextField label="Issuer" name="issuer" type="url" placeholder="https://login.example.com" required />
          <TextField label="Client ID" name="clientId" required />
          <TextField label="Client secret" name="clientSecret" type="password" required autoComplete="off" />
          <TextField
            label="Authorization URL (optional)"
            name="authorizationUrl"
            type="url"
            placeholder="Discovered from issuer if omitted"
          />
          <TextField
            label="Token URL (optional)"
            name="tokenUrl"
            type="url"
            placeholder="Discovered from issuer if omitted"
          />
          <TextField
            label="JWKS URL (optional)"
            name="jwksUrl"
            type="url"
            placeholder="Discovered from issuer if omitted"
          />
          <label className="flex items-center gap-2 text-sm font-medium text-bolt-elements-textPrimary">
            <input
              type="checkbox"
              name="enabled"
              value="true"
              defaultChecked
              className="h-4 w-4 rounded border-bolt-elements-borderColor"
            />
            Enable OIDC sign-in
          </label>
          <PrimaryButton disabled={busy} aria-busy={busy}>
            {busy ? 'Saving…' : 'Save OIDC provider'}
          </PrimaryButton>
        </Form>
      </section>

      <hr className="my-8 border-bolt-elements-borderColor" />

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-bolt-elements-textPrimary">SAML 2.0</h2>
          <p className="mt-1 text-sm text-bolt-elements-textSecondary">
            Paste the identity provider&apos;s entity ID, single sign-on URL and X.509 signing certificate.
          </p>
        </div>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="type" value="saml" />
          <input type="hidden" name="orgId" value={orgId} />
          <TextField label="Entity ID" name="entityId" placeholder="urn:example:idp" required />
          <TextField label="SSO URL" name="ssoUrl" type="url" placeholder="https://idp.example.com/sso" required />
          <label className="block text-sm font-medium text-bolt-elements-textPrimary">
            X.509 certificate
            <textarea
              name="x509Certificate"
              required
              rows={5}
              placeholder="-----BEGIN CERTIFICATE-----"
              className="mt-2 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 font-mono text-xs outline-none focus:border-bolt-elements-focus"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-bolt-elements-textPrimary">
            <input
              type="checkbox"
              name="enabled"
              value="true"
              defaultChecked
              className="h-4 w-4 rounded border-bolt-elements-borderColor"
            />
            Enable SAML sign-in
          </label>
          <PrimaryButton disabled={busy} aria-busy={busy}>
            {busy ? 'Saving…' : 'Save SAML provider'}
          </PrimaryButton>
        </Form>
      </section>
    </EnterpriseFormPage>
  );
}
