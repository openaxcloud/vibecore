import type { MetaFunction } from '@remix-run/cloudflare';
import { KeyRound } from 'lucide-react';
import { AppShell, StatusPill } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [{ title: 'API keys - VibeCore' }];

/*
 * Scoped API-key management is not yet backed by a real token store (the
 * `ApiKey` model exists in the schema but has no issue/list/revoke endpoints
 * and is not wired into request authentication). Rather than display fabricated
 * keys that mislead users into thinking automation credentials exist, this page
 * presents an honest "Coming soon" state until the backend is implemented.
 */
export default function ApiKeysPage() {
  return (
    <AppShell title="API keys" description="Create, rotate and revoke scoped API keys for automation.">
      <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bolt-elements-background-depth-3">
          <KeyRound className="h-5 w-5 text-bolt-elements-textTertiary" aria-hidden />
        </span>
        <StatusPill label="Coming soon" />
        <div className="max-w-md space-y-2">
          <h2 className="text-base font-semibold">Scoped API keys aren&apos;t available yet</h2>
          <p className="text-sm text-bolt-elements-textSecondary">
            Programmatic, least-privilege tokens for automation are on the roadmap but not yet issued. When this ships
            you&apos;ll be able to create, scope, rotate and revoke keys here.
          </p>
          <p className="text-sm text-bolt-elements-textSecondary">
            In the meantime, integrate through your authenticated session or a connected account under{' '}
            <span className="font-medium text-bolt-elements-textPrimary">Connected accounts</span>.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
