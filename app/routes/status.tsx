import type { MetaFunction } from '@remix-run/cloudflare';
import { Activity, CheckCircle2, Clock3 } from 'lucide-react';
import { PublicShell, StatGrid } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [{ title: 'Status - VibeCore' }];

export default function StatusPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-normal">Platform status</h1>
        <p className="mt-3 text-sm text-bolt-elements-textSecondary">
          Public operational status for dashboard, API, runtime and AI gateway.
        </p>
        <div className="mt-8">
          <StatGrid
            stats={[
              {
                label: 'Dashboard',
                value: 'Operational',
                detail: 'User interface and routing available',
                icon: CheckCircle2,
              },
              {
                label: 'API',
                value: 'Operational',
                detail: 'Auth, projects and billing responding',
                icon: CheckCircle2,
              },
              { label: 'Runtime', value: 'Operational', detail: 'Workspace manager readiness healthy', icon: Activity },
              { label: 'AI Gateway', value: 'Monitored', detail: 'Provider fallback health checked', icon: Clock3 },
            ]}
          />
        </div>
      </section>
    </PublicShell>
  );
}
