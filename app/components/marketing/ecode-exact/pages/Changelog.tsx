import { Rocket, Sparkles, Wrench, ArrowUpCircle, GitCommitHorizontal, Bell } from 'lucide-react';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import { Badge } from '~/components/marketing/ecode-exact/EcodeExactUi';

type ReleaseType = 'New' | 'Improved' | 'Fixed';

type Release = {
  date: string;
  version: string;
  type: ReleaseType;
  title: string;
  changes: string[];
};

const typeStyles: Record<ReleaseType, { icon: typeof Sparkles; badgeClass: string }> = {
  New: { icon: Sparkles, badgeClass: 'bg-[var(--ecode-accent)]/15 text-[var(--ecode-accent)]' },
  Improved: { icon: ArrowUpCircle, badgeClass: 'bg-blue-500/15 text-blue-600' },
  Fixed: { icon: Wrench, badgeClass: 'bg-amber-500/15 text-amber-600' },
};

export default function Changelog() {
  const releases: Release[] = [
    {
      date: 'June 16, 2026',
      version: 'v3.8.0',
      type: 'New',
      title: 'Multi-agent consensus mode',
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
      changes: [
        'Static and full-stack builds now snapshot incrementally, cutting redeploy times by up to 40%',
        'Deployment logs stream live with searchable, color-coded output',
        'One-click rollback to any previous successful release from the deployments tab',
      ],
    },
    {
      date: 'June 2, 2026',
      version: 'v3.7.0',
      type: 'New',
      title: 'Usage-based credits and billing portal',
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
      changes: [
        'Expanded context window so the agent reasons over larger codebases before editing',
        'Automatic provider fallback keeps chat working when a model is unavailable',
        'Generated diffs now render with clearer before-and-after views in the IDE',
      ],
    },
  ];

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-changelog">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <Rocket className="h-12 w-12 mx-auto mb-4 text-primary" />
              <h1 className="text-4xl font-bold mb-4" data-testid="heading-changelog">
                Changelog
              </h1>
              <p className="text-[15px] text-muted-foreground mb-8">
                The latest features, improvements, and fixes shipping to E-Code
              </p>
              <Badge variant="secondary" className="text-[15px] px-4 py-2">
                Updated continuously
              </Badge>
            </div>
          </div>
        </section>

        {/* Release Timeline */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="max-w-3xl mx-auto">
              <ol className="relative border-l border-border ml-3 sm:ml-4">
                {releases.map((release) => {
                  const { icon: TypeIcon, badgeClass } = typeStyles[release.type];
                  return (
                    <li key={release.version} className="mb-10 ml-6 sm:ml-8">
                      <span className="absolute -left-3 sm:-left-4 flex h-6 w-6 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-[var(--ecode-accent)]/15 ring-4 ring-background">
                        <GitCommitHorizontal className="h-3 w-3 sm:h-4 sm:w-4 text-[var(--ecode-accent)]" />
                      </span>

                      <Card>
                        <CardHeader>
                          <div className="flex flex-wrap items-center gap-3">
                            <Badge variant="secondary" className="font-mono text-[13px]">
                              {release.version}
                            </Badge>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-medium ${badgeClass}`}
                            >
                              <TypeIcon className="h-3.5 w-3.5" />
                              {release.type}
                            </span>
                            <span className="text-[13px] text-muted-foreground">{release.date}</span>
                          </div>
                          <CardTitle className="mt-2">{release.title}</CardTitle>
                          <CardDescription>What changed in this release</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {release.changes.map((change) => (
                              <li key={change} className="flex gap-3 text-[15px] text-muted-foreground">
                                <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--ecode-accent)]" />
                                <span>{change}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </section>

        {/* Subscribe CTA */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive text-center">
            <Bell className="h-10 w-10 mx-auto mb-4 text-primary" />
            <h2 className="text-3xl font-bold mb-4">Never miss an update</h2>
            <p className="text-[15px] text-muted-foreground mb-8 max-w-2xl mx-auto">
              Follow along as we ship new AI agents, deployment tooling, and collaboration features every week
            </p>
            <button
              className="px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 min-h-[44px]"
              onClick={() => (window.location.href = '/blog')}
              data-testid="button-changelog-subscribe"
            >
              Read the Blog
            </button>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
