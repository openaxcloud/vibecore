import type { MetaFunction } from '@remix-run/cloudflare';
import { PublicShell } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [{ title: 'Terms - VibeCore' }];

export default function TermsPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-normal">Terms of service</h1>
        <div className="mt-8 space-y-4 text-sm leading-7 text-bolt-elements-textSecondary">
          <p>
            Use of the platform requires respecting organization policies, quota limits, provider terms and workspace
            security boundaries.
          </p>
          <p>
            Subscriptions, trials, upgrades, downgrades and cancellations are governed by the active billing plan and
            Stripe lifecycle events.
          </p>
          <p>
            Enterprise agreements may add custom terms for private deployments, support, retention and audit export
            requirements.
          </p>
        </div>
      </section>
    </PublicShell>
  );
}
