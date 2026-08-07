import type { LucideIcon } from 'lucide-react';
import { Rocket, Sparkles, Users, CreditCard, Bug, Cpu } from 'lucide-react';

/*
 * Single source of truth for the public changelog entries — consumed by the
 * Changelog page AND the /changelog.xml RSS feed (F27). Icons are decorative
 * (page only); the RSS route ignores them.
 */
export type ReleaseType = 'New' | 'Improved' | 'Fixed';

export type ChangelogReleaseId =
  | 'multi-agent-consensus'
  | 'faster-deployments'
  | 'usage-billing'
  | 'workspace-stability'
  | 'realtime-collaboration'
  | 'smarter-code-generation';

export interface Release {
  id: ChangelogReleaseId;
  publishedAt: string;
  version: string;
  type: ReleaseType;
  icon: LucideIcon;
}

export const changelogReleases: readonly Release[] = [
  {
    id: 'multi-agent-consensus',
    publishedAt: '2026-06-16',
    version: 'v3.8.0',
    type: 'New',
    icon: Cpu,
  },
  {
    id: 'faster-deployments',
    publishedAt: '2026-06-09',
    version: 'v3.7.2',
    type: 'Improved',
    icon: Rocket,
  },
  {
    id: 'usage-billing',
    publishedAt: '2026-06-02',
    version: 'v3.7.0',
    type: 'New',
    icon: CreditCard,
  },
  {
    id: 'workspace-stability',
    publishedAt: '2026-05-26',
    version: 'v3.6.1',
    type: 'Fixed',
    icon: Bug,
  },
  {
    id: 'realtime-collaboration',
    publishedAt: '2026-05-18',
    version: 'v3.6.0',
    type: 'New',
    icon: Users,
  },
  {
    id: 'smarter-code-generation',
    publishedAt: '2026-05-11',
    version: 'v3.5.3',
    type: 'Improved',
    icon: Sparkles,
  },
];
