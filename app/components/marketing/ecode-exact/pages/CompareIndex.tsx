import { ArrowRight, Bot, Cloud, GitBranch, Rocket, Shield, Sparkles, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { comparePages } from '~/components/marketing/EcodeMarketingPages';
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
import {
  getMarketingExactCompareIndexCopy,
  interpolateMarketingExactCompareIndexCopy,
  type CompareIndexCompetitorId,
  type CompareIndexReasonId,
} from '~/lib/i18n/catalogs/marketing-exact-compare-index';

const COMPARISON_ICONS: Record<CompareIndexCompetitorId, LucideIcon> = {
  'github-codespaces': Cloud,
  glitch: Sparkles,
  heroku: Zap,
  codesandbox: Bot,
  'aws-cloud9': Cloud,
};

const REASON_ICONS: Record<CompareIndexReasonId, LucideIcon> = {
  production: Rocket,
  ai: Bot,
  collaboration: GitBranch,
  enterprise: Shield,
};

export default function CompareIndex() {
  const { i18n } = useTranslation();
  const copy = getMarketingExactCompareIndexCopy(i18n.resolvedLanguage ?? i18n.language).exactCompareIndex;

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--ecode-background)] text-[var(--ecode-text)]"
      data-testid="page-compare-index"
    >
      <PublicNavbar />
      <main className="min-w-0 flex-1">
        <section
          className="border-b border-[var(--ecode-border)] bg-gradient-to-b from-background to-muted"
          aria-labelledby="compare-index-heading"
        >
          <div className="container-responsive max-w-5xl py-16 text-center sm:py-20 lg:py-24">
            <Badge
              variant="outline"
              className="border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-3 py-1 text-[var(--ecode-accent-text)]"
            >
              {copy.hero.badge}
            </Badge>
            <h1
              id="compare-index-heading"
              className="mkt-h1 mx-auto mt-6 max-w-4xl break-words text-[var(--ecode-text)] [overflow-wrap:anywhere]"
            >
              {copy.hero.title}
            </h1>
            <p className="mkt-lead mx-auto mt-4 max-w-3xl break-words text-[var(--ecode-text-secondary)] [overflow-wrap:anywhere]">
              {copy.hero.description}
            </p>
          </div>
        </section>

        <section
          className="py-12 sm:py-16"
          aria-labelledby="compare-index-comparisons-heading"
          data-testid="section-compare-index-comparisons"
        >
          <div className="container-responsive max-w-6xl">
            <h2 id="compare-index-comparisons-heading" className="sr-only">
              {copy.comparisons.title}
            </h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {copy.comparisons.items.map((item) => {
                const Icon = COMPARISON_ICONS[item.id];

                const href = `/compare/${comparePages[item.id].slug}`;

                return (
                  <Card
                    key={item.id}
                    className="group flex h-full min-w-0 flex-col transition-colors hover:border-[var(--ecode-accent)] motion-reduce:transition-none"
                    data-testid={`card-compare-${item.id}`}
                  >
                    <CardHeader className="min-w-0 flex-1">
                      <div
                        className="mb-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--ecode-surface-secondary)] text-[var(--ecode-accent-text)]"
                        aria-hidden="true"
                        data-testid={`icon-compare-${item.id}`}
                      >
                        <Icon className="h-6 w-6" aria-hidden="true" />
                      </div>
                      <CardTitle className="break-words text-xl leading-snug [overflow-wrap:anywhere]">
                        {item.title}
                      </CardTitle>
                      <CardDescription className="break-words text-[var(--ecode-text-secondary)] [overflow-wrap:anywhere]">
                        {item.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="min-w-0">
                      <a
                        href={href}
                        className="-mx-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-semibold text-[var(--ecode-accent-text)] underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ecode-surface)] motion-reduce:transition-none"
                        aria-label={interpolateMarketingExactCompareIndexCopy(copy.comparisons.actionAria, {
                          comparison: item.title,
                        })}
                      >
                        {copy.comparisons.action}
                        <ArrowRight
                          className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
                          aria-hidden="true"
                        />
                      </a>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section
          className="border-y border-[var(--ecode-border)] bg-[var(--ecode-surface-secondary)] py-12 sm:py-16"
          aria-labelledby="compare-index-reasons-heading"
          data-testid="section-compare-index-reasons"
        >
          <div className="container-responsive max-w-6xl">
            <h2
              id="compare-index-reasons-heading"
              className="break-words text-center text-2xl font-bold text-[var(--ecode-text)] [overflow-wrap:anywhere] sm:text-3xl"
            >
              {copy.reasons.title}
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {copy.reasons.items.map((reason) => {
                const Icon = REASON_ICONS[reason.id];

                return (
                  <div
                    key={reason.id}
                    className="h-full min-w-0 rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-5"
                    data-testid={`card-compare-reason-${reason.id}`}
                  >
                    <Icon
                      className="h-6 w-6 text-[var(--ecode-accent-text)]"
                      aria-hidden="true"
                      data-testid={`icon-compare-reason-${reason.id}`}
                    />
                    <h3 className="mt-3 break-words font-semibold text-[var(--ecode-text)] [overflow-wrap:anywhere]">
                      {reason.title}
                    </h3>
                    <p className="mt-1 break-words text-sm text-[var(--ecode-text-secondary)] [overflow-wrap:anywhere]">
                      {reason.description}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="mt-10 text-center">
              <a
                href="/"
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-normal rounded-lg bg-[var(--ecode-accent)] px-6 py-3 text-center font-semibold text-[var(--ecode-accent-contrast)] transition-colors hover:bg-[var(--ecode-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ecode-surface-secondary)] motion-reduce:transition-none sm:w-auto"
              >
                {copy.cta.label}
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
