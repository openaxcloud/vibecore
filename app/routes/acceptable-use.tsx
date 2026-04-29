import type { MetaFunction } from '@remix-run/cloudflare';
import { PublicShell } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [{ title: 'Acceptable use - VibeCore' }];

export default function AcceptableUsePage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-normal">Acceptable use policy</h1>
        <div className="mt-8 space-y-4 text-sm leading-7 text-bolt-elements-textSecondary">
          <p>
            Do not use workspaces to attack systems, evade rate limits, mine cryptocurrency, exfiltrate secrets or run
            unapproved background services.
          </p>
          <p>
            AI tools must stay within authorized projects and may not be used to bypass access controls or leak provider
            credentials.
          </p>
          <p>Abuse events can result in workspace suspension, organization restrictions and audit escalation.</p>
        </div>
      </section>
    </PublicShell>
  );
}
