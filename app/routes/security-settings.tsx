import { Fingerprint, KeyRound, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { useLoaderData, useRevalidator } from 'react-router';

import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { ActivityList, AppShell, LinkButton } from '~/components/dashboard/SaaSLayout';
import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { getSecuritySettingsCopy } from '~/lib/i18n/catalogs/security-settings';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isReauthRedirect } from '~/lib/route-reauth';

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const copy = getSecuritySettingsCopy(data?.language);

  return [
    { title: copy['securitySettings.meta.title'] },
    { name: 'description', content: copy['securitySettings.meta.description'] },
  ];
};

export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const language = resolveRequestLocale(request).language;

  const result = await apiRequest<{ user?: { mfaEnabled?: boolean } }>(request, '/auth/me').then(
    (me) => ({ me, unavailable: false as const }),
    (error) => {
      /*
       * Authentication redirects must propagate so the framework can navigate
       * to login or MFA setup. All other failures become a recoverable state;
       * the raw API/network error is never serialized or rendered.
       */
      if (isReauthRedirect(error)) {
        throw error;
      }

      return { me: { user: undefined }, unavailable: true as const };
    },
  );

  return json({
    mfaEnabled: result.me.user?.mfaEnabled === true,
    mfaUnavailable: result.unavailable,
    language,
  });
}

export default function SecuritySettingsPage() {
  const { mfaEnabled, mfaUnavailable, language } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const retrying = revalidator.state !== 'idle';
  const copy = getSecuritySettingsCopy(language);

  /* Async safety contract: We will not guess whether protection is enabled. */
  return (
    <AppShell title={copy['securitySettings.page.title']} description={copy['securitySettings.page.description']}>
      <div className="min-w-0">
        {mfaUnavailable ? (
          retrying ? (
            <AsyncPanelSkeleton label={copy['securitySettings.mfa.loading']} rows={1} compact className="mb-5" />
          ) : (
            <AsyncPanelError
              title={copy['securitySettings.mfa.errorTitle']}
              description={copy['securitySettings.mfa.errorDescription']}
              retryLabel={copy['securitySettings.mfa.retry']}
              onRetry={revalidator.revalidate}
              compact
              className="mb-5"
            />
          )
        ) : (
          <div
            className={
              mfaEnabled
                ? 'mb-5 flex min-w-0 items-start gap-2 rounded-md border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-3 py-2 text-sm font-medium text-[var(--status-success-text)] sm:items-center'
                : 'mb-5 flex min-w-0 items-start gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm font-medium text-bolt-elements-textSecondary sm:items-center'
            }
            data-testid="mfa-status-badge"
          >
            {mfaEnabled ? (
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
            )}
            <span className="min-w-0 break-words">
              {copy[mfaEnabled ? 'securitySettings.mfa.status.enabled' : 'securitySettings.mfa.status.disabled']}
            </span>
          </div>
        )}

        <ActivityList
          items={[
            {
              title: copy['securitySettings.item.mfa.title'],
              detail: mfaUnavailable
                ? copy['securitySettings.item.mfa.unavailable']
                : copy[mfaEnabled ? 'securitySettings.item.mfa.enabled' : 'securitySettings.item.mfa.disabled'],
              icon: ShieldCheck,
            },
            {
              title: copy['securitySettings.item.passkeys.title'],
              detail: copy['securitySettings.item.passkeys.detail'],
              icon: Fingerprint,
            },
            {
              title: copy['securitySettings.item.recovery.title'],
              detail: copy['securitySettings.item.recovery.detail'],
              icon: KeyRound,
            },
            {
              title: copy['securitySettings.item.sessions.title'],
              detail: copy['securitySettings.item.sessions.detail'],
              icon: ShieldCheck,
            },
          ]}
        />

        <div className="mt-5 flex min-w-0 flex-col gap-2 [&_a]:max-w-full [&_a]:!whitespace-normal sm:flex-row sm:flex-wrap sm:[&_a]:w-auto">
          <LinkButton to="/mfa-setup">
            {
              copy[
                mfaUnavailable
                  ? 'securitySettings.action.mfa.open'
                  : mfaEnabled
                    ? 'securitySettings.action.mfa.manage'
                    : 'securitySettings.action.mfa.setup'
              ]
            }
          </LinkButton>
          <LinkButton to="/recovery-codes" variant="outline">
            {copy['securitySettings.action.recovery']}
          </LinkButton>
          <LinkButton to="/session-security" variant="outline">
            {copy['securitySettings.action.sessions']}
          </LinkButton>
        </div>

        <section className="mt-8 min-w-0">
          <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">
            {copy['securitySettings.enterprise.title']}
          </h2>
          <p className="mt-1 break-words text-sm leading-relaxed text-bolt-elements-textSecondary">
            {copy['securitySettings.enterprise.description']}
          </p>
          <div className="mt-3 flex min-w-0 flex-col gap-2 [&_a]:max-w-full [&_a]:!whitespace-normal sm:flex-row sm:flex-wrap sm:[&_a]:w-auto">
            <LinkButton to="/organization-security" variant="outline">
              {copy['securitySettings.enterprise.organizationSecurity']}
            </LinkButton>
            <LinkButton to="/organization-domains" variant="outline">
              {copy['securitySettings.enterprise.verifiedDomains']}
            </LinkButton>
            <LinkButton to="/enterprise-sso-settings" variant="outline">
              {copy['securitySettings.enterprise.sso']}
            </LinkButton>
            <LinkButton to="/scim-token-settings" variant="outline">
              {copy['securitySettings.enterprise.scim']}
            </LinkButton>
            <LinkButton to="/organization-roles" variant="outline">
              {copy['securitySettings.enterprise.roles']}
            </LinkButton>
            <LinkButton to="/invitations" variant="outline">
              {copy['securitySettings.enterprise.invitations']}
            </LinkButton>
            <LinkButton to="/audit-logs" variant="outline">
              {copy['securitySettings.enterprise.auditLogs']}
            </LinkButton>
            <LinkButton to="/organization-siem" variant="outline">
              {copy['securitySettings.enterprise.siem']}
            </LinkButton>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
