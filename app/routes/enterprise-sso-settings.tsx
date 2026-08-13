import { Form, useActionData, useFetcher, useLoaderData, useNavigation } from 'react-router';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import { AlertBanner } from '~/components/ui/AlertBanner';
import { Button } from '~/components/ui/Button';
import { Switch } from '~/components/ui/Switch';
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
 * `PUT /orgs/:orgId/sso/oidc` handler (services/api/src/app.ts,
 * `oidcConfigSchema`) does NOT accept a `scopes` field — the provider's
 * authorization request is fixed to the standard OIDC scope set — so this is
 * shown as informational text, not a submitted form field.
 */
const OIDC_DEFAULT_SCOPES = 'openid profile email';

type SsoCheck = { name: string; ok: boolean; detail: string };
type EnforcementView = {
  enforced: boolean;
  enforcedAt: string | null;
  graceDays: number;
  graceDeadline: string | null;
  active: boolean;
};

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  /*
   * There is intentionally no admin-facing GET for the SSO *config*: the OIDC
   * client secret and SAML certificate are stored encrypted (encryptJson) and
   * are only ever read server-side, never round-tripped to the browser. The
   * forms therefore render without prefill. We DO read the enforcement state
   * (which contains no secret) so the toggle + grace deadline reflect reality.
   */
  let enforcement: EnforcementView | null = null;

  try {
    const result = await apiRequest<{ enforcement: EnforcementView }>(
      request,
      `/orgs/${organization.id}/sso/enforcement`,
      { redirectOn401: false },
    );
    enforcement = result.enforcement;
  } catch {
    // A caller without security:manage (or a transient error) still gets the page.
    enforcement = null;
  }

  return json({ orgId: organization.id, enforcement });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as Record<string, string>;

  if (!body.orgId) {
    return json({ error: 'Your organization is unavailable. Reload the page and try again.' }, { status: 400 });
  }

  const intent = body.intent ?? 'save';

  try {
    if (intent === 'test') {
      const type = body.type === 'saml' ? 'saml' : 'oidc';

      const result = await apiRequest<{ ok: boolean; checks: SsoCheck[] }>(
        request,
        `/orgs/${body.orgId}/sso/${type}/test`,
        { method: 'POST', body: JSON.stringify({}) },
      );

      return json({ test: { type, ok: result.ok, checks: result.checks } });
    }

    if (intent === 'enforce') {
      const enforced = body.enforced === 'true';

      const result = await apiRequest<{ enforcement: EnforcementView }>(
        request,
        `/orgs/${body.orgId}/sso/enforcement`,
        { method: 'PUT', body: JSON.stringify({ enforced }) },
      );

      return json({
        enforcement: result.enforcement,
        status: enforced ? 'SSO enforcement enabled.' : 'SSO enforcement disabled.',
      });
    }

    if (body.type === 'saml') {
      // Mirrors samlConfigSchema: entityId, ssoUrl, x509Certificate, enabled.
      await apiRequest(request, `/orgs/${body.orgId}/sso/saml`, {
        method: 'PUT',
        body: JSON.stringify({
          entityId: body.entityId,
          ssoUrl: body.ssoUrl,
          x509Certificate: body.x509Certificate,
          enabled: body.enabled === 'true',
        }),
      });

      return json({ status: 'SSO settings saved.' });
    }

    // Mirrors oidcConfigSchema: issuer, clientId, clientSecret, optional URLs, enabled.
    await apiRequest(request, `/orgs/${body.orgId}/sso/oidc`, {
      method: 'PUT',
      body: JSON.stringify({
        issuer: body.issuer,
        clientId: body.clientId,
        clientSecret: body.clientSecret,
        authorizationUrl: body.authorizationUrl || undefined,
        tokenUrl: body.tokenUrl || undefined,
        jwksUrl: body.jwksUrl || undefined,
        enabled: body.enabled === 'true',
      }),
    });

    return json({ status: 'SSO settings saved.' });
  } catch (error) {
    /*
     * apiRequest throws a real Response on any non-2xx upstream status. Re-auth
     * redirects (3xx) and server errors (5xx) are re-thrown so the framework /
     * error boundary handles them; validation (400) and authorization (403)
     * errors surface inline so the user keeps their form input.
     */
    if (shouldRethrowActionError(error)) {
      throw error;
    }

    const context = intent === 'test' ? 'Could not test the connection.' : 'Could not save SSO settings.';

    return json({ error: await apiErrorMessage(error, context) });
  }
}

type ActionData = {
  status?: string;
  error?: string;
  test?: { type: 'oidc' | 'saml'; ok: boolean; checks: SsoCheck[] };
  enforcement?: EnforcementView;
};

function formatDeadline(iso: string) {
  // toUTCString is deterministic across server + client so hydration never mismatches.
  return new Date(iso).toUTCString();
}

function ConnectionTestResult({ result }: { result: { ok: boolean; checks: SsoCheck[] } }) {
  return (
    <div className="mt-3 space-y-2" role="status">
      <AlertBanner variant={result.ok ? 'success' : 'error'}>
        {result.ok
          ? 'Connection test passed. The stored configuration looks reachable and valid.'
          : 'Connection test found problems with the stored configuration.'}
      </AlertBanner>
      <ul className="space-y-1.5">
        {result.checks.map((check) => (
          <li key={check.name} className="flex items-start gap-2 text-sm">
            <span
              aria-hidden
              className={
                check.ok
                  ? 'i-ph:check-circle-fill mt-0.5 shrink-0 text-base'
                  : 'i-ph:x-circle-fill mt-0.5 shrink-0 text-base'
              }
              style={{ color: check.ok ? 'var(--status-success-text)' : 'var(--status-error-text)' }}
            />
            <span className="min-w-0">
              <span className="font-medium text-bolt-elements-textPrimary">{check.name}:</span>{' '}
              <span className="text-bolt-elements-textSecondary">{check.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function EnterpriseSsoSettingsPage() {
  const { orgId, enforcement } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';

  const oidcTest = useFetcher<ActionData>();
  const samlTest = useFetcher<ActionData>();
  const enforceFetcher = useFetcher<ActionData>();

  const oidcTestResult = oidcTest.data?.test?.type === 'oidc' ? oidcTest.data.test : undefined;
  const oidcTestError = oidcTest.data?.error;
  const samlTestResult = samlTest.data?.test?.type === 'saml' ? samlTest.data.test : undefined;
  const samlTestError = samlTest.data?.error;

  /*
   * Optimistic enforcement state: prefer the in-flight submit, then the latest
   * fetcher result, then the loader value.
   */
  const inFlightEnforced = enforceFetcher.formData?.get('enforced');
  const currentEnforcement = enforceFetcher.data?.enforcement ?? enforcement;

  const enforced = inFlightEnforced != null ? inFlightEnforced === 'true' : (currentEnforcement?.enforced ?? false);

  const graceDays = currentEnforcement?.graceDays ?? 7;

  return (
    <EnterpriseFormPage
      title="Enterprise SSO settings"
      description="Configure an OIDC (including Microsoft Entra ID) or SAML identity provider for your organization. Each provider is saved independently and can be enabled or disabled on its own."
      status={actionData?.status}
      error={actionData?.error}
    >
      <p className="mb-6 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-xs text-bolt-elements-textTertiary">
        For your organization&apos;s security, provider secrets are stored encrypted and are never displayed after
        saving, so these forms start blank. Saving a provider replaces its entire configuration. Use{' '}
        <span className="font-medium">Test connection</span> to validate a saved provider without re-entering any
        secret.
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
        <oidcTest.Form method="post">
          <input type="hidden" name="intent" value="test" />
          <input type="hidden" name="type" value="oidc" />
          <input type="hidden" name="orgId" value={orgId} />
          <Button type="submit" variant="secondary" size="sm" disabled={oidcTest.state !== 'idle'}>
            {oidcTest.state !== 'idle' ? 'Testing…' : 'Test connection'}
          </Button>
        </oidcTest.Form>
        {oidcTestError ? (
          <AlertBanner variant="error" className="mt-2">
            {oidcTestError}
          </AlertBanner>
        ) : null}
        {oidcTestResult ? <ConnectionTestResult result={oidcTestResult} /> : null}
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
        <samlTest.Form method="post">
          <input type="hidden" name="intent" value="test" />
          <input type="hidden" name="type" value="saml" />
          <input type="hidden" name="orgId" value={orgId} />
          <Button type="submit" variant="secondary" size="sm" disabled={samlTest.state !== 'idle'}>
            {samlTest.state !== 'idle' ? 'Testing…' : 'Test connection'}
          </Button>
        </samlTest.Form>
        {samlTestError ? (
          <AlertBanner variant="error" className="mt-2">
            {samlTestError}
          </AlertBanner>
        ) : null}
        {samlTestResult ? <ConnectionTestResult result={samlTestResult} /> : null}
      </section>

      <hr className="my-8 border-bolt-elements-borderColor" />

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Enforce SSO</h2>
          <p className="mt-1 text-sm text-bolt-elements-textSecondary">
            Require members to sign in through your identity provider. Enforcement begins after a {graceDays}-day grace
            period so members have time to migrate. Organization owners are always exempt to prevent an IdP
            misconfiguration from locking your team out.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-bolt-elements-textPrimary" id="sso-enforce-label">
              Require SSO for all members
            </div>
            {enforceFetcher.data?.status ? (
              <p className="mt-0.5 text-xs text-bolt-elements-textTertiary">{enforceFetcher.data.status}</p>
            ) : null}
          </div>
          <Switch
            aria-labelledby="sso-enforce-label"
            checked={enforced}
            disabled={enforceFetcher.state !== 'idle'}
            onCheckedChange={(next) =>
              enforceFetcher.submit({ intent: 'enforce', orgId, enforced: String(next) }, { method: 'post' })
            }
          />
        </div>

        {enforceFetcher.data?.error ? <AlertBanner variant="error">{enforceFetcher.data.error}</AlertBanner> : null}

        {enforced && currentEnforcement?.graceDeadline ? (
          <AlertBanner variant={currentEnforcement.active ? 'warning' : 'info'}>
            {currentEnforcement.active
              ? 'SSO is now enforced. Non-owner members must sign in through your identity provider; password sign-in is blocked for them.'
              : `Members must switch to SSO by ${formatDeadline(currentEnforcement.graceDeadline)}. Until then, password sign-in still works. Owners remain exempt.`}
          </AlertBanner>
        ) : null}
      </section>
    </EnterpriseFormPage>
  );
}
