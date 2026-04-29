import type { MetaFunction } from '@remix-run/cloudflare';
import { KeyRound, Plus, RefreshCw } from 'lucide-react';
import { ActivityList, AppShell, LinkButton } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [{ title: 'API keys - VibeCore' }];

export default function ApiKeysPage() {
  return (
    <AppShell
      title="API keys"
      description="Create, rotate and revoke scoped API keys for automation."
      actions={
        <LinkButton to="/api-keys" variant="outline">
          Create key
        </LinkButton>
      }
    >
      <ActivityList
        items={[
          {
            title: 'Production deploy key',
            detail: 'Scoped to deployments and usage read. Last used 4 hours ago.',
            icon: KeyRound,
          },
          {
            title: 'CI workspace key',
            detail: 'Scoped to project read and runtime start. Rotation due in 18 days.',
            icon: RefreshCw,
          },
          {
            title: 'Create a scoped token',
            detail: 'Use least privilege scopes and rotate automatically.',
            icon: Plus,
          },
        ]}
      />
    </AppShell>
  );
}
