import type { MetaFunction } from '@remix-run/cloudflare';
import { BookOpen, Boxes, CreditCard, ShieldCheck, Sparkles } from 'lucide-react';
import { ActivityList, PublicShell, LinkButton } from '~/components/dashboard/SaaSLayout';
import { AgentWalkthrough } from '~/components/docs/AgentWalkthrough';

export const meta: MetaFunction = () => [
  { title: 'Docs - E-Code' },
  {
    name: 'description',
    content:
      'Implementation guides for the E-Code platform plus a feature-by-feature walkthrough of the IDE agent panel (@ mentions, / commands, plan checklist, patch review, branches, share, presence, FR/EN).',
  },
];

export default function DocsLandingPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="mb-8 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-normal">Documentation</h1>
          <p className="mt-3 text-sm text-bolt-elements-textSecondary">
            Implementation guides for projects, runtimes, billing, identity and keeping the Bolt IDE intact. The Agent
            panel walkthrough is embedded below — jump to any feature using the in-page anchors.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <ActivityList
            items={[
              {
                title: 'Agent panel walkthrough',
                detail:
                  '@ mentions, / commands, plan-first checklist, per-hunk patch review, branches, share links, presence, FR/EN i18n — scroll to the section below for the full guide.',
                icon: Sparkles,
              },
              {
                title: 'RuntimeAdapter',
                detail: 'Switch between WebContainer and Remote Kubernetes without changing the editor.',
                icon: Boxes,
              },
              {
                title: 'Billing and quotas',
                detail: 'Stripe lifecycle, quota enforcement and usage ledgers.',
                icon: CreditCard,
              },
              {
                title: 'Enterprise security',
                detail: 'SSO, SCIM, MFA, audit logs and governance controls.',
                icon: ShieldCheck,
              },
              {
                title: 'Project storage',
                detail: 'Persistent workspaces, snapshots, imports and Git integrations.',
                icon: BookOpen,
              },
            ]}
          />
          <div className="flex flex-col gap-6">
            <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
              <h2 className="font-semibold">Agent panel walkthrough</h2>
              <p className="mt-2 text-sm text-bolt-elements-textSecondary">
                Visual guide to every IDE agent feature with prerequisites and exact keystrokes.
              </p>
              <div className="mt-5">
                <LinkButton to="#agent-walkthrough">Jump to the walkthrough</LinkButton>
              </div>
            </div>
            <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-6">
              <h2 className="font-semibold">Need an implementation review?</h2>
              <p className="mt-2 text-sm text-bolt-elements-textSecondary">
                Use the sales channel for deployment architecture and security requirements.
              </p>
              <div className="mt-5">
                <LinkButton to="/contact-sales">Contact sales</LinkButton>
              </div>
            </div>
          </div>
        </div>

        <AgentWalkthrough />
      </section>
    </PublicShell>
  );
}
