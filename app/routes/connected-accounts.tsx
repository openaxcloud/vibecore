import type { MetaFunction } from '@remix-run/cloudflare';
import { Github, Link2, Mail } from 'lucide-react';
import { ActivityList, AppShell } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [{ title: 'Connected accounts - VibeCore' }];

export default function ConnectedAccountsPage() {
  return (
    <AppShell
      title="Connected accounts"
      description="Manage OAuth connections for source control, identity and deployment providers."
    >
      <ActivityList
        items={[
          { title: 'GitHub', detail: 'Connected for repository import, push and pull request creation.', icon: Github },
          { title: 'Google', detail: 'Available for OAuth sign-in and enterprise domain verification.', icon: Mail },
          {
            title: 'Microsoft Entra ID',
            detail: 'OIDC configuration can be enabled from enterprise SSO settings.',
            icon: Link2,
          },
        ]}
      />
    </AppShell>
  );
}
