import type { MetaFunction } from 'react-router';
import { Form, useActionData, useFetcher, useLoaderData, useNavigation } from 'react-router';
import { EnterpriseFormPage, PrimaryButton, TextField } from '~/components/enterprise/EnterpriseFormPage';
import { AlertBanner } from '~/components/ui/AlertBanner';
import { Button } from '~/components/ui/Button';
import { Switch } from '~/components/ui/Switch';
import {
  apiRequest,
  firstOrganizationOrNull,
  formObject,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  formatEnterpriseSsoCopy,
  formatEnterpriseSsoDateTime,
  formatEnterpriseSsoGracePeriod,
  getEnterpriseSsoSettingsCopy,
  localizeEnterpriseSsoCheck,
  normalizeEnterpriseSsoChecks,
  resolveEnterpriseSsoActionErrorCode,
  type EnterpriseSsoActionIntent,
  type EnterpriseSsoCheck,
  type EnterpriseSsoErrorCode,
  type EnterpriseSsoStatusCode,
} from '~/lib/i18n/catalogs/enterprise-sso-settings';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { shouldRethrowActionError } from '~/lib/route-reauth';

/*
 * Default OIDC scopes surfaced to the admin for reference. The upstream
 * `PUT /orgs/:orgId/sso/oidc` handler (services/api/src/app.ts,
 * `oidcConfigSchema`) does NOT accept a `scopes` field — the provider's
 * authorization request is fixed to the standard OIDC scope set — so this is
 * shown as informational text, not a submitted form field.
 */
const OIDC_DEFAULT_SCOPES = 'openid profile email';

type EnforcementView = {
  enforced: boolean;
  enforcedAt: string | null;
  graceDays: number;
  graceDeadline: string | null;
  active: boolean;
};

type ActionData = {
  statusCode?: EnterpriseSsoStatusCode;
  errorCode?: EnterpriseSsoErrorCode;
  test?: { type: 'oidc' | 'saml'; ok: boolean; checks: EnterpriseSsoCheck[] };
  enforcement?: EnforcementView;
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const copy = getEnterpriseSsoSettingsCopy(data?.language);

  return [
    { title: copy['enterpriseSso.meta.title'] },
    { name: 'description', content: copy['enterpriseSso.meta.description'] },
  ];
};

export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const language = resolveRequestLocale(request).language;
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
  let enforcementUnavailable = false;

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
    enforcementUnavailable = true;
  }

  return json({ orgId: organization.id, enforcement, enforcementUnavailable, language });
}

export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as Record<string, string>;

  if (!body.orgId) {
    return json<ActionData>({ errorCode: 'organizationUnavailable' }, { status: 400 });
  }

  const intent: EnterpriseSsoActionIntent =
    body.intent === 'test' ? 'test' : body.intent === 'enforce' ? 'enforce' : 'save';

  try {
    if (intent === 'test') {
      const type = body.type === 'saml' ? 'saml' : 'oidc';

      const result = await apiRequest<{ ok: boolean; checks: unknown }>(
        request,
        `/orgs/${body.orgId}/sso/${type}/test`,
        { method: 'POST', body: JSON.stringify({}) },
      );

      return json<ActionData>({
        test: { type, ok: result.ok, checks: normalizeEnterpriseSsoChecks(result.checks) },
      });
    }

    if (intent === 'enforce') {
      const enforced = body.enforced === 'true';

      const result = await apiRequest<{ enforcement: EnforcementView }>(
        request,
        `/orgs/${body.orgId}/sso/enforcement`,
        { method: 'PUT', body: JSON.stringify({ enforced }) },
      );

      return json<ActionData>({
        enforcement: result.enforcement,
        statusCode: enforced ? 'enforcementEnabled' : 'enforcementDisabled',
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

      return json<ActionData>({ statusCode: 'settingsSaved' });
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

    return json<ActionData>({ statusCode: 'settingsSaved' });
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

    const status = error instanceof Response ? error.status : 400;

    return json<ActionData>({ errorCode: resolveEnterpriseSsoActionErrorCode(status, intent) }, { status });
  }
}

function ConnectionTestResult({
  result,
  language,
}: {
  result: { ok: boolean; checks: EnterpriseSsoCheck[] };
  language: string;
}) {
  const copy = getEnterpriseSsoSettingsCopy(language);

  return (
    <div className="mt-3 min-w-0 space-y-2 break-words" role="status">
      <AlertBanner variant={result.ok ? 'success' : 'error'}>
        {result.ok ? copy['enterpriseSso.connection.passed'] : copy['enterpriseSso.connection.failed']}
      </AlertBanner>
      <ul className="space-y-1.5">
        {result.checks.map((check, index) => {
          const localized = localizeEnterpriseSsoCheck(check, language);

          return (
            <li key={`${check.nameCode}-${index}`} className="flex min-w-0 items-start gap-2 text-sm">
              <span
                aria-hidden
                className={
                  check.ok
                    ? 'i-ph:check-circle-fill mt-0.5 shrink-0 text-base'
                    : 'i-ph:x-circle-fill mt-0.5 shrink-0 text-base'
                }
                style={{ color: check.ok ? 'var(--status-success-text)' : 'var(--status-error-text)' }}
              />
              <span className="min-w-0 break-words">
                <span className="font-medium text-bolt-elements-textPrimary">{localized.name}:</span>{' '}
                <span className="text-bolt-elements-textSecondary">{localized.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function EnterpriseSsoSettingsPage() {
  const { orgId, enforcement, enforcementUnavailable, language } = useLoaderData<typeof loader>();
  const copy = getEnterpriseSsoSettingsCopy(language);
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';

  const oidcTest = useFetcher<ActionData>();
  const samlTest = useFetcher<ActionData>();
  const enforceFetcher = useFetcher<ActionData>();

  const oidcTestResult = oidcTest.data?.test?.type === 'oidc' ? oidcTest.data.test : undefined;
  const oidcTestError = oidcTest.data?.errorCode;
  const samlTestResult = samlTest.data?.test?.type === 'saml' ? samlTest.data.test : undefined;
  const samlTestError = samlTest.data?.errorCode;

  /*
   * Optimistic enforcement state: prefer the in-flight submit, then the latest
   * fetcher result, then the loader value.
   */
  const inFlightEnforced = enforceFetcher.formData?.get('enforced');
  const currentEnforcement = enforceFetcher.data?.enforcement ?? enforcement;
  const currentEnforcementUnavailable = enforcementUnavailable && !enforceFetcher.data?.enforcement;

  const enforced = inFlightEnforced != null ? inFlightEnforced === 'true' : (currentEnforcement?.enforced ?? false);

  const graceDays = currentEnforcement?.graceDays ?? 7;
  const actionStatus = actionData?.statusCode ? copy[`enterpriseSso.status.${actionData.statusCode}`] : undefined;
  const actionError = actionData?.errorCode ? copy[`enterpriseSso.error.${actionData.errorCode}`] : undefined;

  const enforcementStatus = enforceFetcher.data?.statusCode
    ? copy[`enterpriseSso.status.${enforceFetcher.data.statusCode}`]
    : undefined;
  const enforcementError = enforceFetcher.data?.errorCode
    ? copy[`enterpriseSso.error.${enforceFetcher.data.errorCode}`]
    : undefined;
  const deadline = currentEnforcement?.graceDeadline
    ? (formatEnterpriseSsoDateTime(currentEnforcement.graceDeadline, language) ??
      copy['enterpriseSso.common.dateUnavailable'])
    : null;

  return (
    <EnterpriseFormPage
      title={copy['enterpriseSso.page.title']}
      description={copy['enterpriseSso.page.description']}
      status={actionStatus}
      error={actionError}
    >
      <p className="mb-6 min-w-0 break-words rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-xs text-bolt-elements-textTertiary">
        {copy['enterpriseSso.security.prefix']}{' '}
        <span className="font-medium">{copy['enterpriseSso.security.action']}</span>{' '}
        {copy['enterpriseSso.security.suffix']}
      </p>

      <section className="min-w-0 space-y-4" aria-labelledby="enterprise-sso-oidc-title">
        <div className="min-w-0">
          <h2
            className="break-words text-base font-semibold text-bolt-elements-textPrimary"
            id="enterprise-sso-oidc-title"
          >
            {copy['enterpriseSso.oidc.title']}
          </h2>
          <p className="mt-1 min-w-0 break-words text-sm text-bolt-elements-textSecondary">
            {copy['enterpriseSso.oidc.description']}{' '}
            <code className="rounded bg-bolt-elements-background-depth-3 px-1 py-0.5 font-mono text-xs">
              {OIDC_DEFAULT_SCOPES}
            </code>
          </p>
        </div>
        <Form method="post" className="min-w-0 space-y-4">
          <input type="hidden" name="type" value="oidc" />
          <input type="hidden" name="orgId" value={orgId} />
          <TextField
            label={copy['enterpriseSso.oidc.issuer']}
            name="issuer"
            type="url"
            placeholder={copy['enterpriseSso.oidc.issuerPlaceholder']}
            required
          />
          <TextField label={copy['enterpriseSso.oidc.clientId']} name="clientId" required />
          <TextField
            label={copy['enterpriseSso.oidc.clientSecret']}
            name="clientSecret"
            type="password"
            required
            autoComplete="off"
          />
          <TextField
            label={copy['enterpriseSso.oidc.authorizationUrl']}
            name="authorizationUrl"
            type="url"
            placeholder={copy['enterpriseSso.oidc.discoveryPlaceholder']}
          />
          <TextField
            label={copy['enterpriseSso.oidc.tokenUrl']}
            name="tokenUrl"
            type="url"
            placeholder={copy['enterpriseSso.oidc.discoveryPlaceholder']}
          />
          <TextField
            label={copy['enterpriseSso.oidc.jwksUrl']}
            name="jwksUrl"
            type="url"
            placeholder={copy['enterpriseSso.oidc.discoveryPlaceholder']}
          />
          <label className="flex min-w-0 items-start gap-2 text-sm font-medium text-bolt-elements-textPrimary">
            <input
              type="checkbox"
              name="enabled"
              value="true"
              defaultChecked
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-bolt-elements-borderColor"
            />
            <span className="min-w-0 break-words">{copy['enterpriseSso.oidc.enabled']}</span>
          </label>
          <div className="grid min-w-0 sm:inline-grid [&_button]:!h-auto [&_button]:min-h-[44px] [&_button]:max-w-full [&_button]:!whitespace-normal [&_button]:break-words [&_button]:text-center [&_button]:leading-tight">
            <PrimaryButton disabled={busy} aria-busy={busy}>
              {busy ? copy['enterpriseSso.oidc.saving'] : copy['enterpriseSso.oidc.save']}
            </PrimaryButton>
          </div>
        </Form>
        <oidcTest.Form method="post" className="min-w-0">
          <input type="hidden" name="intent" value="test" />
          <input type="hidden" name="type" value="oidc" />
          <input type="hidden" name="orgId" value={orgId} />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            className="!h-auto min-h-[44px] w-full max-w-full !whitespace-normal break-words py-2 text-center leading-tight sm:w-auto"
            disabled={oidcTest.state !== 'idle'}
          >
            {oidcTest.state !== 'idle'
              ? copy['enterpriseSso.connection.testing']
              : copy['enterpriseSso.connection.test']}
          </Button>
        </oidcTest.Form>
        {oidcTestError ? (
          <AlertBanner variant="error" className="mt-2">
            {copy[`enterpriseSso.error.${oidcTestError}`]}
          </AlertBanner>
        ) : null}
        {oidcTestResult ? <ConnectionTestResult result={oidcTestResult} language={language} /> : null}
      </section>

      <hr className="my-8 border-bolt-elements-borderColor" />

      <section className="min-w-0 space-y-4" aria-labelledby="enterprise-sso-saml-title">
        <div className="min-w-0">
          <h2
            className="break-words text-base font-semibold text-bolt-elements-textPrimary"
            id="enterprise-sso-saml-title"
          >
            {copy['enterpriseSso.saml.title']}
          </h2>
          <p className="mt-1 min-w-0 break-words text-sm text-bolt-elements-textSecondary">
            {copy['enterpriseSso.saml.description']}
          </p>
        </div>
        <Form method="post" className="min-w-0 space-y-4">
          <input type="hidden" name="type" value="saml" />
          <input type="hidden" name="orgId" value={orgId} />
          <TextField
            label={copy['enterpriseSso.saml.entityId']}
            name="entityId"
            placeholder={copy['enterpriseSso.saml.entityIdPlaceholder']}
            required
          />
          <TextField
            label={copy['enterpriseSso.saml.ssoUrl']}
            name="ssoUrl"
            type="url"
            placeholder={copy['enterpriseSso.saml.ssoUrlPlaceholder']}
            required
          />
          <label className="block min-w-0 break-words text-sm font-medium text-bolt-elements-textPrimary">
            {copy['enterpriseSso.saml.certificate']}
            <textarea
              name="x509Certificate"
              required
              rows={5}
              placeholder={copy['enterpriseSso.saml.certificatePlaceholder']}
              className="mt-2 min-h-[120px] w-full max-w-full resize-y rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 font-mono text-xs outline-none focus:border-bolt-elements-focus"
            />
          </label>
          <label className="flex min-w-0 items-start gap-2 text-sm font-medium text-bolt-elements-textPrimary">
            <input
              type="checkbox"
              name="enabled"
              value="true"
              defaultChecked
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-bolt-elements-borderColor"
            />
            <span className="min-w-0 break-words">{copy['enterpriseSso.saml.enabled']}</span>
          </label>
          <div className="grid min-w-0 sm:inline-grid [&_button]:!h-auto [&_button]:min-h-[44px] [&_button]:max-w-full [&_button]:!whitespace-normal [&_button]:break-words [&_button]:text-center [&_button]:leading-tight">
            <PrimaryButton disabled={busy} aria-busy={busy}>
              {busy ? copy['enterpriseSso.saml.saving'] : copy['enterpriseSso.saml.save']}
            </PrimaryButton>
          </div>
        </Form>
        <samlTest.Form method="post" className="min-w-0">
          <input type="hidden" name="intent" value="test" />
          <input type="hidden" name="type" value="saml" />
          <input type="hidden" name="orgId" value={orgId} />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            className="!h-auto min-h-[44px] w-full max-w-full !whitespace-normal break-words py-2 text-center leading-tight sm:w-auto"
            disabled={samlTest.state !== 'idle'}
          >
            {samlTest.state !== 'idle'
              ? copy['enterpriseSso.connection.testing']
              : copy['enterpriseSso.connection.test']}
          </Button>
        </samlTest.Form>
        {samlTestError ? (
          <AlertBanner variant="error" className="mt-2">
            {copy[`enterpriseSso.error.${samlTestError}`]}
          </AlertBanner>
        ) : null}
        {samlTestResult ? <ConnectionTestResult result={samlTestResult} language={language} /> : null}
      </section>

      <hr className="my-8 border-bolt-elements-borderColor" />

      <section className="min-w-0 space-y-4" aria-labelledby="enterprise-sso-enforcement-title">
        <div className="min-w-0">
          <h2
            className="break-words text-base font-semibold text-bolt-elements-textPrimary"
            id="enterprise-sso-enforcement-title"
          >
            {copy['enterpriseSso.enforcement.title']}
          </h2>
          <p className="mt-1 min-w-0 break-words text-sm text-bolt-elements-textSecondary">
            {formatEnterpriseSsoGracePeriod(graceDays, language)}
          </p>
        </div>

        {currentEnforcementUnavailable ? (
          <AlertBanner variant="warning">{copy['enterpriseSso.enforcement.loadError']}</AlertBanner>
        ) : null}

        <div className="flex min-w-0 flex-col items-stretch gap-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 break-words">
            <div className="break-words text-sm font-medium text-bolt-elements-textPrimary" id="sso-enforce-label">
              {copy['enterpriseSso.enforcement.label']}
            </div>
            {enforcementStatus ? (
              <p className="mt-0.5 break-words text-xs text-bolt-elements-textTertiary">{enforcementStatus}</p>
            ) : null}
          </div>
          <Switch
            aria-labelledby="sso-enforce-label"
            className="shrink-0 self-end sm:self-auto"
            checked={enforced}
            disabled={currentEnforcementUnavailable || enforceFetcher.state !== 'idle'}
            onCheckedChange={(next) =>
              enforceFetcher.submit({ intent: 'enforce', orgId, enforced: String(next) }, { method: 'post' })
            }
          />
        </div>

        {enforcementError ? <AlertBanner variant="error">{enforcementError}</AlertBanner> : null}

        {enforced && deadline ? (
          <AlertBanner variant={currentEnforcement?.active ? 'warning' : 'info'}>
            {currentEnforcement?.active
              ? copy['enterpriseSso.enforcement.active']
              : formatEnterpriseSsoCopy(copy['enterpriseSso.enforcement.grace'], { date: deadline })}
          </AlertBanner>
        ) : null}
      </section>
    </EnterpriseFormPage>
  );
}
