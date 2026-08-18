import type { LucideIcon } from 'lucide-react';
import { ArrowRight, ArrowUpCircle, GitCommitHorizontal, Rocket, Sparkles, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import { resolveMarketingLanguage } from '~/lib/i18n/catalogs/marketing';
import {
  formatMarketingExactChangelogDate,
  getMarketingExactChangelogCopy,
} from '~/lib/i18n/catalogs/marketing-exact-changelog';
import { changelogReleases, type ReleaseType } from '~/lib/marketing/changelog-releases';

const PRODUCT = '/ecode-static/assets/product';

const CHANGELOG_ROUTES = {
  signup: '/signup',
  dashboard: '/dashboard',
} as const;

const typeStyles: Record<ReleaseType, { icon: LucideIcon; badgeClass: string }> = {
  New: {
    icon: Sparkles,
    badgeClass: 'bg-[var(--ecode-accent)] text-[var(--ecode-accent-contrast)]',
  },
  Improved: {
    icon: ArrowUpCircle,
    badgeClass:
      'bg-bolt-elements-background-depth-3 text-[var(--ecode-accent-text)] ring-1 ring-[var(--ecode-accent)]/30',
  },
  Fixed: {
    icon: Wrench,
    badgeClass:
      'bg-bolt-elements-background-depth-3 text-[var(--ecode-text-secondary)] ring-1 ring-[var(--ecode-border)]',
  },
};

function ChangelogActionLink({
  children,
  to,
  variant = 'primary',
}: {
  children: React.ReactNode;
  to: string;
  variant?: 'primary' | 'secondary';
}) {
  const className =
    variant === 'primary'
      ? 'group inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-normal rounded-md bg-[var(--ecode-accent)] px-6 py-3 text-center font-semibold text-[var(--ecode-accent-contrast)] transition-colors hover:bg-[var(--ecode-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ecode-background)] motion-reduce:transition-none sm:w-auto'
      : 'inline-flex min-h-11 w-full items-center justify-center whitespace-normal rounded-md border border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-6 py-3 text-center font-semibold text-[var(--ecode-text)] transition-colors hover:border-[var(--ecode-accent)] hover:bg-[var(--ecode-surface-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ecode-background)] motion-reduce:transition-none sm:w-auto';

  return (
    <Link to={to} className={className}>
      {children}
      {variant === 'primary' ? (
        <ArrowRight
          className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
          aria-hidden="true"
        />
      ) : null}
    </Link>
  );
}

export default function Changelog() {
  const { i18n } = useTranslation();
  const language = resolveMarketingLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getMarketingExactChangelogCopy(language).exactChangelog;

  return (
    <div
      className="flex min-h-screen min-w-0 flex-col bg-[var(--ecode-background)] text-[var(--ecode-text)]"
      data-testid="page-changelog"
    >
      <PublicNavbar />

      <main className="min-w-0 flex-1">
        <section
          className="bg-gradient-to-b from-background to-muted py-responsive"
          aria-labelledby="changelog-heading"
        >
          <div className="container-responsive">
            <div className="mx-auto min-w-0 max-w-3xl text-center">
              <span className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ecode-accent)] shadow-lg shadow-[var(--ecode-accent)]/30">
                <Rocket className="h-7 w-7 text-[var(--ecode-accent-contrast)]" aria-hidden="true" />
              </span>
              <h1
                id="changelog-heading"
                className="mkt-h1 mb-4 break-words font-bold [overflow-wrap:anywhere]"
                data-testid="heading-changelog"
              >
                {copy.hero.title}
              </h1>
              <p className="mkt-lead mb-8 break-words text-[var(--ecode-text-secondary)] [overflow-wrap:anywhere]">
                {copy.hero.description}
              </p>
              <Badge
                variant="secondary"
                className="whitespace-normal px-4 py-2 text-center text-[13px] ring-1 ring-[var(--ecode-accent)]/30"
              >
                {copy.hero.badge}
              </Badge>
            </div>

            <figure className="mx-auto mt-12 min-w-0 max-w-4xl">
              <div className="overflow-hidden rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)] shadow-2xl">
                <div className="flex min-h-10 min-w-0 items-center gap-2 border-b border-[var(--ecode-border)] bg-[var(--ecode-surface-secondary)] px-3 py-2 sm:px-4">
                  <span className="flex shrink-0 gap-1.5" aria-hidden="true">
                    <span className="h-3 w-3 rounded-full bg-red-500" />
                    <span className="h-3 w-3 rounded-full bg-amber-400" />
                    <span className="h-3 w-3 rounded-full bg-green-500" />
                  </span>
                  <span className="mkt-small mx-auto min-w-0 break-words px-2 text-center font-medium text-[var(--ecode-text-secondary)] [overflow-wrap:anywhere]">
                    {copy.product.windowTitle}
                  </span>
                  <span className="h-3 w-3 shrink-0" aria-hidden="true" />
                </div>
                <img
                  src={`${PRODUCT}/ide.png`}
                  alt={copy.product.imageAlt}
                  loading="eager"
                  decoding="async"
                  className="block h-auto w-full"
                />
              </div>
              <figcaption className="mkt-small mt-3 break-words text-center text-[var(--ecode-text-secondary)] [overflow-wrap:anywhere]">
                {copy.product.caption}
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="py-responsive" aria-labelledby="changelog-timeline-heading">
          <div className="container-responsive">
            <div className="mx-auto min-w-0 max-w-3xl">
              <h2 id="changelog-timeline-heading" className="sr-only">
                {copy.timeline.title}
              </h2>
              <ol className="relative ml-3 border-l border-[var(--ecode-border)] sm:ml-4">
                {changelogReleases.map((release) => {
                  const { badgeClass } = typeStyles[release.type];
                  const TypeIcon = typeStyles[release.type].icon;
                  const ReleaseIcon = release.icon;
                  const releaseCopy = copy.releases[release.id];

                  return (
                    <li
                      id={release.version}
                      key={release.id}
                      className="mb-10 ml-5 min-w-0 scroll-mt-24 last:mb-0 sm:ml-8"
                      data-testid={`changelog-release-${release.id}`}
                    >
                      <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ecode-accent)] ring-4 ring-[var(--ecode-background)] sm:-left-4 sm:h-8 sm:w-8">
                        <GitCommitHorizontal
                          className="h-3 w-3 text-[var(--ecode-accent-contrast)] sm:h-4 sm:w-4"
                          aria-hidden="true"
                        />
                      </span>

                      <Card aria-labelledby={`changelog-release-heading-${release.id}`} className="min-w-0">
                        <CardHeader className="min-w-0 p-4 sm:p-6">
                          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--ecode-surface-secondary)] text-[var(--ecode-accent-text)] ring-1 ring-[var(--ecode-border)]">
                              <ReleaseIcon className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <Badge variant="secondary" className="font-mono text-[13px]">
                              {release.version}
                            </Badge>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-medium ${badgeClass}`}
                            >
                              <TypeIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              {copy.timeline.types[release.type]}
                            </span>
                            <time
                              dateTime={release.publishedAt}
                              className="mkt-small break-words text-[var(--ecode-text-secondary)] [overflow-wrap:anywhere]"
                            >
                              {formatMarketingExactChangelogDate(release.publishedAt, language)}
                            </time>
                          </div>
                          <CardTitle
                            id={`changelog-release-heading-${release.id}`}
                            className="mt-3 break-words [overflow-wrap:anywhere]"
                          >
                            {releaseCopy.title}
                          </CardTitle>
                          <CardDescription className="break-words [overflow-wrap:anywhere]">
                            {copy.timeline.changedLabel}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="min-w-0 p-4 pt-0 sm:p-6 sm:pt-0">
                          <ul className="space-y-2">
                            {releaseCopy.changes.map((change, index) => (
                              <li
                                key={`${release.id}-${index}`}
                                className="mkt-body flex min-w-0 gap-3 text-[var(--ecode-text-secondary)]"
                              >
                                <span
                                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ecode-accent)]"
                                  aria-hidden="true"
                                />
                                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{change}</span>
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

        <section className="bg-[var(--ecode-surface-secondary)] py-responsive" aria-labelledby="changelog-cta-heading">
          <div className="container-responsive">
            <div className="mx-auto min-w-0 max-w-3xl text-center">
              <span className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ecode-accent)] shadow-lg shadow-[var(--ecode-accent)]/30">
                <Sparkles className="h-7 w-7 text-[var(--ecode-accent-contrast)]" aria-hidden="true" />
              </span>
              <h2 id="changelog-cta-heading" className="mkt-h2 mb-4 break-words font-bold [overflow-wrap:anywhere]">
                {copy.cta.title}
              </h2>
              <p className="mkt-body mx-auto mb-8 max-w-2xl break-words text-[var(--ecode-text-secondary)] [overflow-wrap:anywhere]">
                {copy.cta.description}
              </p>
              <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <ChangelogActionLink to={CHANGELOG_ROUTES.signup}>{copy.cta.signup}</ChangelogActionLink>
                <ChangelogActionLink to={CHANGELOG_ROUTES.dashboard} variant="secondary">
                  {copy.cta.dashboard}
                </ChangelogActionLink>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
