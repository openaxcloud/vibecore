import type { MetaFunction } from '@remix-run/cloudflare';
import { AppShell, SettingsForm } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [{ title: 'Account settings - VibeCore' }];

export default function AccountSettingsPage() {
  return (
    <AppShell title="Account settings" description="Manage profile details, email, locale and notification defaults.">
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
        <SettingsForm
          fields={[
            { label: 'Name', name: 'name', placeholder: 'Ada Lovelace' },
            { label: 'Email', name: 'email', type: 'email', placeholder: 'ada@example.com' },
            { label: 'Timezone', name: 'timezone', placeholder: 'UTC' },
          ]}
        />
      </div>
    </AppShell>
  );
}
