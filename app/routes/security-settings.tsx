import type { MetaFunction } from '@remix-run/cloudflare';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { ActivityList, AppShell, LinkButton } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [{ title: 'Security settings - VibeCore' }];

export default function SecuritySettingsPage() {
  return (
    <AppShell
      title="Security settings"
      description="Manage MFA, sessions, recovery codes and connected identity providers."
    >
      <ActivityList
        items={[
          {
            title: 'Multi-factor authentication',
            detail: 'TOTP setup is available for administrator-grade account protection.',
            icon: ShieldCheck,
          },
          { title: 'Recovery codes', detail: 'Generate and rotate backup access codes.', icon: KeyRound },
          { title: 'Active sessions', detail: 'Review devices and revoke stale sessions.', icon: ShieldCheck },
        ]}
      />
      <div className="mt-5 flex flex-wrap gap-2">
        <LinkButton to="/mfa-setup">Set up MFA</LinkButton>
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
