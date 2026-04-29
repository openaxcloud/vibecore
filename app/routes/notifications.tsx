import type { MetaFunction } from '@remix-run/cloudflare';
import { Bell, CreditCard, Rocket } from 'lucide-react';
import { ActivityList, AppShell } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [{ title: 'Notifications - VibeCore' }];

export default function NotificationsPage() {
  return (
    <AppShell title="Notifications" description="Configure product, billing, deployment and security notifications.">
      <ActivityList
        items={[
          {
            title: 'Billing alerts',
            detail: 'Send quota and payment failed events to organization admins.',
            icon: CreditCard,
          },
          {
            title: 'Deployment updates',
            detail: 'Notify collaborators when previews and production releases change state.',
            icon: Rocket,
          },
          { title: 'Security events', detail: 'Send MFA, API key and suspicious login events.', icon: Bell },
        ]}
      />
    </AppShell>
  );
}
