import { Gauge } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { MarketingStaticPage, type MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';

export const meta: MetaFunction = () => [
  { title: 'Usage quota & limits - E-Code' },
  {
    name: 'description',
    content:
      'What E-Code meters and limits — AI, compute, storage, workspaces, deployments — how plans differ, and what happens when you reach a limit.',
  },
];

/*
 * Public usage-quota policy, written from E-Code's real metering/quota model
 * (packages/billing, packages/quota, the /usage dashboard and quota-exceeded flow).
 * Distinct from the signed-in /usage dashboard, which shows a customer's own numbers.
 */
const page = {
  slug: 'usage-limits',
  title: 'Usage quota & limits',
  eyebrow: 'Legal',
  description:
    'E-Code meters the resources your projects consume so limits are fair and predictable. This page explains what is measured, how plans differ, and what happens at a limit.',
  kind: 'legal',
  icon: Gauge,
  primaryAction: ['Compare plans', '/pricing'],
  secondaryAction: ['View your usage', '/usage'],
  highlights: ['AI credits', 'Compute & storage', 'Workspaces', 'Fair-use'],
  sections: [
    {
      title: 'What we meter',
      body: 'Usage is tracked per organization against quota keys so you always know where you stand. Your live numbers are on the in-app Usage dashboard.',
      items: [
        'AI usage — input/output tokens and agent checkpoints',
        'Compute — active workspace runtime',
        'Storage — project files and object storage (GiB-months)',
        'Deployments and public previews',
        'Projects and collaborators',
      ],
    },
    {
      title: 'Plans and limits',
      body: 'Each plan (Starter, Core, Pro, Enterprise) includes a monthly allotment of credits and higher ceilings for workspaces, storage, collaborators and parallel agents. Higher plans raise the included limits; Enterprise adds custom quotas and overrides.',
      items: [
        'Starter — entry limits for trying E-Code',
        'Core / Pro — higher included credits and ceilings',
        'Enterprise — custom quotas and admin overrides',
        'Admins can request quota overrides for a genuine need',
      ],
    },
    {
      title: 'Credits, pay-as-you-go and budget caps',
      body: 'AI and billable services draw from your monthly credit wallet. When credits run out you can opt into pay-as-you-go up to a budget cap you set, so spend never surprises you. Spend alerts fire at 50%, 80% and 100% of your cap.',
      items: ['Monthly credit wallet', 'Optional pay-as-you-go', 'You set a budget cap', 'Alerts at 50 / 80 / 100%'],
    },
    {
      title: 'What happens at a limit',
      body: 'When a quota is reached, the specific action is paused before any cost is incurred and we point you to upgrade or adjust your cap — your existing projects and data are not deleted for hitting a usage limit.',
      items: [
        'Action paused before cost',
        'Clear upgrade / adjust path',
        'Existing data preserved',
        'No silent overage',
      ],
    },
    {
      title: 'Fair use',
      body: 'Limits exist so one workload cannot degrade the platform for everyone. We may decline workloads whose primary purpose is to consume compute (crypto-mining, distributed brute-forcing, traffic generation) rather than to build or run a genuine application. See the Acceptable Use Policy.',
      items: ['No compute-only / mining workloads', 'No traffic or load generation', 'Genuine applications only'],
    },
  ],
} satisfies MarketingPageDefinition;

export default function UsageLimitsPage() {
  return <MarketingStaticPage page={page} />;
}
