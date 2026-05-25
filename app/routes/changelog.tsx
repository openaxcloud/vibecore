import type { MetaFunction } from '@remix-run/cloudflare';
import { GitBranch, Rocket, ShieldCheck } from 'lucide-react';
import { ActivityList, PublicShell } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [{ title: 'Changelog - E-Code' }];

export default function ChangelogPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-normal">Changelog</h1>
        <p className="mt-3 text-sm text-bolt-elements-textSecondary">
          Platform releases for the dashboard, runtime, billing and enterprise controls.
        </p>
        <div className="mt-8">
          <ActivityList
            items={[
              {
                title: 'v1 platform hardening',
                detail:
                  'GCP storage, deployer, creation flow, AI generator, mobile shipping kit, marketing and docs foundations imported from the E-Code release notes.',
                icon: ShieldCheck,
              },
              {
                title: 'Billing and quotas',
                detail: 'Stripe lifecycle, signed webhooks, quota ledgers and billing pages added.',
                icon: Rocket,
              },
              {
                title: 'Remote runtime integration',
                detail: 'IDE project routes connect through RuntimeAdapter and workspace provider.',
                icon: GitBranch,
              },
              {
                title: 'Enterprise readiness',
                detail: 'Identity, governance, audit export and security settings expanded.',
                icon: ShieldCheck,
              },
            ]}
          />
        </div>
      </section>
    </PublicShell>
  );
}
