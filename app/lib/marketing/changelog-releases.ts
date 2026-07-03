import type { LucideIcon } from 'lucide-react';
import { Rocket, Sparkles, Users, CreditCard, Bug, Cpu } from 'lucide-react';

/*
 * Single source of truth for the public changelog entries — consumed by the
 * Changelog page AND the /changelog.xml RSS feed (F27). Icons are decorative
 * (page only); the RSS route ignores them.
 */
export type ReleaseType = 'New' | 'Improved' | 'Fixed';

export interface Release {
  date: string;
  version: string;
  type: ReleaseType;
  title: string;
  icon: LucideIcon;
  changes: string[];
}

export const changelogReleases: Release[] = [
  {
    date: 'June 16, 2026',
    version: 'v3.8.0',
    type: 'New',
    title: 'Multi-agent consensus mode',
    icon: Cpu,
    changes: [
      'Run several AI agents in parallel lanes and merge their best work with live consensus voting',
      'Per-lane streaming so you can watch each agent reason and edit in real time',
      'New agent panel timeline with accept, reject, and rewind controls for every proposed patch',
    ],
  },
  {
    date: 'June 9, 2026',
    version: 'v3.7.2',
    type: 'Improved',
    title: 'Faster, smarter deployments',
    icon: Rocket,
    changes: [
      'Static and full-stack builds now snapshot incrementally to shorten redeploy times',
      'Deployment logs stream live with searchable, color-coded output',
      'One-click rollback to any previous successful release from the deployments tab',
    ],
  },
  {
    date: 'June 2, 2026',
    version: 'v3.7.0',
    type: 'New',
    title: 'Usage-based credits and billing portal',
    icon: CreditCard,
    changes: [
      'Transparent per-run credit metering for AI agents, builds, and workspace hours',
      'Self-serve billing portal to upgrade, downgrade, or manage your team plan',
      'Spend alerts and soft caps to keep surprise charges off your invoice',
    ],
  },
  {
    date: 'May 26, 2026',
    version: 'v3.6.1',
    type: 'Fixed',
    title: 'Workspace and preview stability',
    icon: Bug,
    changes: [
      'Resolved an issue where reopening a project could leave the live preview stuck on "Starting"',
      'Fixed dependency sync occasionally being skipped after a cold-start, breaking the editor',
      'Hardened terminal reconnection so remote shells survive idle timeouts without flapping',
    ],
  },
  {
    date: 'May 18, 2026',
    version: 'v3.6.0',
    type: 'New',
    title: 'Real-time collaboration',
    icon: Users,
    changes: [
      'Live multiplayer editing with shared cursors, presence avatars, and per-file activity',
      'Shareable read-only and edit links for projects, with granular access controls',
      'Inline comments and patch proposals that persist across reloads',
    ],
  },
  {
    date: 'May 11, 2026',
    version: 'v3.5.3',
    type: 'Improved',
    title: 'Smarter AI code generation',
    icon: Sparkles,
    changes: [
      'Expanded context window so the agent reasons over larger codebases before editing',
      'Automatic provider fallback keeps chat working when a model is unavailable',
      'Generated diffs now render with clearer before-and-after views in the IDE',
    ],
  },
];
