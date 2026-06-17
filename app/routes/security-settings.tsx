import { KeyRound, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';

import { ActivityList, AppShell, LinkButton } from '~/components/dashboard/SaaSLayout';
import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

export const meta: MetaFunction = () => [{ title: 'Security settings - VibeCore' }];

export async function loader({ request }: EnterpriseLoaderArgs) {
  const me = await apiRequest<{ user?: { mfaEnabled?: boolean } }>(request, '/auth/me').catch(() => ({
    user: undefined,
  }));

  return json({ mfaEnabled: me?.user?.mfaEnabled === true });
}

export default function SecuritySettingsPage() {
  const { mfaEnabled } = useLoaderData<typeof loader>();

  return (
    <AppShell
      title="Security settings"
      description="Manage two-factor authentication, sessions, recovery codes and connected identity providers."
    >
      <div
        className={
          mfaEnabled
            ? 'mb-5 flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm font-medium text-green-600 dark:text-green-400'
            : 'mb-5 flex items-center gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm font-medium text-bolt-elements-textSecondary'
        }
        data-testid="mfa-status-badge"
      >
        {mfaEnabled ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
        {mfaEnabled ? 'Two-factor authentication is enabled' : 'Two-factor authentication is off (optional)'}
      </div>

      <ActivityList
        items={[
          {
            title: 'Two-factor authentication',
            detail: mfaEnabled
              ? 'Your account is protected with an authenticator app.'
              : 'Add an authenticator app for an extra layer of protection. Optional.',
            icon: ShieldCheck,
          },
          { title: 'Recovery codes', detail: 'Generate and rotate backup access codes.', icon: KeyRound },
          { title: 'Active sessions', detail: 'Review devices and revoke stale sessions.', icon: ShieldCheck },
        ]}
      />
      <div className="mt-5 flex flex-wrap gap-2">
        <LinkButton to="/mfa-setup">{mfaEnabled ? 'Manage 2FA' : 'Set up 2FA'}</LinkButton>
        <LinkButton to="/recovery-codes" variant="outline">
          Recovery codes
        </LinkButton>
        <LinkButton to="/session-security" variant="outline">
          Sessions
        </LinkButton>
      </div>
    </AppShell>
  );
}
