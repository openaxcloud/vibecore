import type { LucideIcon } from 'lucide-react';
import { Rocket, Sparkles, Wrench, ArrowUpCircle, GitCommitHorizontal, ArrowRight } from 'lucide-react';
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
import { changelogReleases, type ReleaseType } from '~/lib/marketing/changelog-releases';

const PRODUCT = '/ecode-static/assets/product';

/**
 * On-theme styling for each release type. We keep everything inside the E-Code
 * palette: the orange accent for "New", and neutral dark surfaces with an
 * orange glyph for the rest — no off-brand blue/amber/indigo.
 */
const typeStyles: Record<ReleaseType, { icon: LucideIcon; badgeClass: string }> = {
  New: {
    icon: Sparkles,
    badgeClass: 'bg-[var(--ecode-accent)] text-white',
  },
  Improved: {
    icon: ArrowUpCircle,
    badgeClass: 'bg-bolt-elements-background-depth-3 text-[var(--ecode-accent)] ring-1 ring-[var(--ecode-accent)]/30',
  },
  Fixed: {
    icon: Wrench,
    badgeClass: 'bg-bolt-elements-background-depth-3 text-muted-foreground ring-1 ring-bolt-elements-borderColor',
  },
};

export default function Changelog() {
  const releases = changelogReleases;

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-changelog">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ecode-accent)] shadow-lg shadow-[var(--ecode-accent)]/30 mb-5">
                <Rocket className="h-7 w-7 text-white" />
              </span>
              <h1 className="mkt-h1 font-bold mb-4" data-testid="heading-changelog">
                Changelog
              </h1>
              <p className="mkt-lead text-muted-foreground mb-8">
                Every feature, improvement, and fix shipping to E-Code — the AI software studio that turns a prompt into
                a deployed app.
              </p>
              <Badge
                variant="secondary"
                className="text-[13px] px-4 py-2 ring-1 ring-[var(--ecode-accent)]/30 text-[var(--ecode-accent)]"
              >
                Updated continuously
              </Badge>
            </div>

            {/* Real product capture: the workspace these releases ship to. */}
            <figure className="mt-12 max-w-4xl mx-auto">
              <div className="rounded-xl overflow-hidden border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-2xl">
                <div className="flex items-center gap-2 px-4 h-10 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                  <span className="flex gap-1.5" aria-hidden="true">
                    <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                    <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                    <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                  </span>
                  <span className="mx-auto mkt-small font-medium text-muted-foreground truncate px-3">
                    E-Code · Agent panel, editor, terminal & live preview
                  </span>
                  <span className="h-3 w-3" aria-hidden="true" />
                </div>
                <img
                  src={`${PRODUCT}/ide.png`}
                  alt="The E-Code IDE showing the AI agent panel, code editor, terminal, and a live app preview"
                  loading="eager"
                  decoding="async"
                  className="block w-full h-auto"
                />
              </div>
              <figcaption className="mt-3 text-center mkt-small text-muted-foreground">
                The workspace where each release below lands.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* Release Timeline */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="max-w-3xl mx-auto">
              <ol className="relative border-l border-border ml-3 sm:ml-4">
                {releases.map((release) => {
                  const { badgeClass } = typeStyles[release.type];
                  const TypeIcon = typeStyles[release.type].icon;
                  const ReleaseIcon = release.icon;

                  return (
                    <li key={release.version} className="mb-10 ml-6 sm:ml-8">
                      <span className="absolute -left-3 sm:-left-4 flex h-6 w-6 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-[var(--ecode-accent)] ring-4 ring-background">
                        <GitCommitHorizontal className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                      </span>

                      <Card>
                        <CardHeader>
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-bolt-elements-background-depth-3 text-[var(--ecode-accent)] ring-1 ring-bolt-elements-borderColor">
                              <ReleaseIcon className="h-5 w-5" />
                            </span>
                            <Badge variant="secondary" className="font-mono text-[13px]">
                              {release.version}
                            </Badge>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-medium ${badgeClass}`}
                            >
                              <TypeIcon className="h-3.5 w-3.5" />
                              {release.type}
                            </span>
                            <span className="mkt-small text-muted-foreground">{release.date}</span>
                          </div>
                          <CardTitle className="mt-3">{release.title}</CardTitle>
                          <CardDescription>What changed in this release</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {release.changes.map((change) => (
                              <li key={change} className="flex gap-3 mkt-body text-muted-foreground">
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

        {/* End-of-page CTA */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <div className="max-w-3xl mx-auto text-center">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ecode-accent)] shadow-lg shadow-[var(--ecode-accent)]/30 mb-5">
                <Sparkles className="h-7 w-7 text-white" />
              </span>
              <h2 className="mkt-h2 font-bold mb-4">Start building with the latest E-Code</h2>
              <p className="mkt-body text-muted-foreground mb-8 max-w-2xl mx-auto">
                Every release above is live in your workspace the moment you sign in. Describe what you want to build
                and let the agents ship it.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <a
                  href="/signup"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[var(--ecode-accent)] text-white font-medium rounded-md hover:opacity-90 transition-opacity min-h-[44px]"
                  data-testid="button-changelog-signup"
                >
                  Get started free
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="/dashboard"
                  className="inline-flex items-center justify-center px-6 py-3 font-medium rounded-md border border-bolt-elements-borderColor text-foreground hover:bg-bolt-elements-background-depth-3 transition-colors min-h-[44px]"
                  data-testid="button-changelog-dashboard"
                >
                  Open dashboard
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
