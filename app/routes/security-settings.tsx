import { KeyRound, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { useLoaderData, useRevalidator } from 'react-router';

import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { ActivityList, AppShell, LinkButton } from '~/components/dashboard/SaaSLayout';
import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { isReauthRedirect } from '~/lib/route-reauth';

export const meta: MetaFunction = () => [{ title: 'Security settings - E-Code' }];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const result = await apiRequest<{ user?: { mfaEnabled?: boolean } }>(request, '/auth/me').then(
    (me) => ({ me, unavailable: false as const }),
    (error) => {
      /*
       * A 3xx re-auth redirect (expired session → /login, or 403 MFA_REQUIRED →
       * /mfa-setup) must propagate so the framework performs the navigation.
       * Swallowing it would strand a logged-out user on this page with a
       * misleading "2FA is off" badge and links that each 401 in a redirect loop.
       */
      if (isReauthRedirect(error)) {
        throw error;
      }

      return { me: { user: undefined }, unavailable: true as const };
    },
  );

  return json({ mfaEnabled: result.me.user?.mfaEnabled === true, mfaUnavailable: result.unavailable });
}

export default function SecuritySettingsPage() {
  const { mfaEnabled, mfaUnavailable } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const retrying = revalidator.state !== 'idle';

  return (
    <AppShell
      title="Security settings"
      description="Manage two-factor authentication, sessions, recovery codes and connected identity providers."
    >
      {mfaUnavailable ? (
        retrying ? (
          <AsyncPanelSkeleton label="Loading two-factor authentication status" rows={1} compact className="mb-5" />
        ) : (
          <AsyncPanelError
            title="Two-factor status could not load"
            description="We will not guess whether protection is enabled. Your security settings are unchanged."
            onRetry={revalidator.revalidate}
            compact
            className="mb-5"
          />
        )
      ) : (
        <div
          className={
            mfaEnabled
              ? 'mb-5 flex items-center gap-2 rounded-md border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-3 py-2 text-sm font-medium text-[var(--status-success-text)]'
              : 'mb-5 flex items-center gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm font-medium text-bolt-elements-textSecondary'
          }
          data-testid="mfa-status-badge"
        >
          {mfaEnabled ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
          {mfaEnabled ? 'Two-factor authentication is enabled' : 'Two-factor authentication is off (optional)'}
        </div>
      )}

      <ActivityList
        items={[
          {
            title: 'Two-factor authentication',
            detail: mfaUnavailable
              ? 'Status unavailable. Retry the security check above before making a decision.'
              : mfaEnabled
                ? 'Your account is protected with an authenticator app.'
                : 'Add an authenticator app for an extra layer of protection. Optional.',
            icon: ShieldCheck,
          },
          { title: 'Recovery codes', detail: 'Generate and rotate backup access codes.', icon: KeyRound },
          { title: 'Active sessions', detail: 'Review devices and revoke stale sessions.', icon: ShieldCheck },
        ]}
      />
      <div className="mt-5 flex flex-wrap gap-2">
        <LinkButton to="/mfa-setup">
          {mfaUnavailable ? 'Open 2FA settings' : mfaEnabled ? 'Manage 2FA' : 'Set up 2FA'}
        </LinkButton>
        <LinkButton to="/recovery-codes" variant="outline">
          Recovery codes
        </LinkButton>
        <LinkButton to="/session-security" variant="outline">
          Sessions
        </LinkButton>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">Enterprise</h2>
        <p className="mt-1 text-sm text-bolt-elements-textSecondary">
          Organization security policy, verified domains, SSO (SAML/OIDC), SCIM provisioning, roles &amp; permissions,
          member invitations, audit-log export and SIEM streaming.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <LinkButton to="/organization-security" variant="outline">
            Organization security
          </LinkButton>
          <LinkButton to="/organization-domains" variant="outline">
            Verified domains
          </LinkButton>
          <LinkButton to="/enterprise-sso-settings" variant="outline">
            SSO settings
          </LinkButton>
          <LinkButton to="/scim-token-settings" variant="outline">
            SCIM provisioning
          </LinkButton>
          <LinkButton to="/organization-roles" variant="outline">
            Roles &amp; permissions
          </LinkButton>
          <LinkButton to="/organization-invitations" variant="outline">
            Invitations
          </LinkButton>
          <LinkButton to="/audit-logs" variant="outline">
            Audit logs
          </LinkButton>
          <LinkButton to="/organization-siem" variant="outline">
            SIEM webhooks
          </LinkButton>
        </div>
      </div>
    </AppShell>
  );
}
