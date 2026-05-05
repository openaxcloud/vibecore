import type { MetaFunction } from '@remix-run/cloudflare';
import { KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { ActivityList, PublicShell } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [{ title: 'Security - VibeCore' }];

export default function SecurityPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-normal">Security</h1>
        <p className="mt-3 max-w-3xl text-sm text-bolt-elements-textSecondary">
          Controls for identity, runtime isolation, secrets, audit trails and responsible AI tool execution.
        </p>
        <div className="mt-8">
          <ActivityList
            items={[
              {
                title: 'Identity and access',
                detail: 'MFA, SSO-ready configuration, SCIM provisioning and backend RBAC.',
                icon: KeyRound,
              },
              {
                title: 'Runtime isolation',
                detail: 'Remote workspaces are designed around per-project pods, PVCs and network policy boundaries.',
                icon: ShieldCheck,
              },
              {
                title: 'Secrets protection',
                detail: 'Project secrets stay encrypted and are never rendered in logs or snapshots.',
                icon: Lock,
              },
            ]}
          />
        </div>
      </section>
    </PublicShell>
  );
}
