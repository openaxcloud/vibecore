import { ArrowRight, BookOpen, Bot, Cloud, CreditCard, FolderKanban, LifeBuoy, Rocket, Search } from 'lucide-react';
import { useMemo, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { SiGithub } from 'react-icons/si';

import { filterHelpArticles, filterHelpTopics, getHelpSearchContent, normalizeHelpQuery } from './help-search';
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
import {
  getMarketingExactHelpCenterCopy,
  interpolateMarketingExactHelpCenterCopy,
  type HelpCenterTopicId,
} from '~/lib/i18n/catalogs/marketing-exact-help-center';

const TOPIC_ICONS: Readonly<Record<HelpCenterTopicId, ComponentType<{ className?: string }>>> = {
  gettingStarted: Rocket,
  workspaces: FolderKanban,
  deployments: Cloud,
  billing: CreditCard,
  agent: Bot,
  integrations: SiGithub,
};

export default function HelpCenter() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingExactHelpCenterCopy(language).exactHelpCenter;
  const searchContent = getHelpSearchContent(language);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');

  const topics = useMemo(
    () => searchContent.topics.map((topic) => ({ ...topic, icon: TOPIC_ICONS[topic.id] })),
    [searchContent.topics],
  );

  const popularArticles = useMemo(() => [...searchContent.popularArticles], [searchContent.popularArticles]);
  const hasActiveSearch = normalizeHelpQuery(submittedQuery) !== '';
  const visibleTopics = useMemo(() => filterHelpTopics(topics, submittedQuery), [submittedQuery, topics]);

  const visibleArticles = useMemo(
    () => filterHelpArticles(popularArticles, submittedQuery),
    [popularArticles, submittedQuery],
  );

  const hasNoResults = hasActiveSearch && visibleTopics.length === 0 && visibleArticles.length === 0;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground" data-testid="page-help-center">
      <PublicNavbar />

      <main className="min-w-0 flex-1">
        <section
          className="bg-gradient-to-b from-background to-muted py-responsive"
          aria-labelledby="help-center-heading"
        >
          <div className="container-responsive">
            <div className="mx-auto max-w-3xl min-w-0 text-center">
              <LifeBuoy className="mx-auto mb-4 h-12 w-12 text-primary" aria-hidden />
              <h1
                id="help-center-heading"
                className="mb-4 break-words font-bold mkt-h1 [overflow-wrap:anywhere]"
                data-testid="heading-help-center"
              >
                {copy.hero.title}
              </h1>
              <p className="mb-8 break-words text-muted-foreground mkt-lead">{copy.hero.description}</p>

              <form
                className="relative mx-auto max-w-xl"
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  setSubmittedQuery(query);
                }}
                data-testid="form-help-search"
              >
                <Search
                  className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  type="search"
                  placeholder={copy.search.placeholder}
                  aria-label={copy.search.label}
                  className="min-h-12 w-full rounded-md border border-border bg-background py-2 pr-4 pl-12 text-[16px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2 sm:text-[15px]"
                  value={query}
                  onChange={(event) => {
                    const next = event.target.value;
                    setQuery(next);

                    if (next === '') {
                      setSubmittedQuery('');
                    }
                  }}
                  data-testid="input-help-search"
                />
              </form>
            </div>
          </div>
        </section>

        {hasNoResults ? (
          <section className="py-responsive" data-testid="help-search-no-results">
            <div className="container-responsive min-w-0 text-center">
              <p className="break-words text-muted-foreground mkt-body" role="status" aria-live="polite">
                {interpolateMarketingExactHelpCenterCopy(copy.search.noResults, {
                  query: submittedQuery.trim(),
                })}
              </p>
            </div>
          </section>
        ) : null}

        {visibleTopics.length > 0 ? (
          <section className="py-responsive" aria-labelledby="help-topics-heading">
            <div className="container-responsive">
              <h2
                id="help-topics-heading"
                className="mb-12 break-words text-center font-bold mkt-h2 [overflow-wrap:anywhere]"
              >
                {hasActiveSearch ? copy.search.topicsMatching : copy.search.topicsDefault}
              </h2>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {visibleTopics.map((topic) => {
                  const Icon = topic.icon;

                  return (
                    <Card key={topic.id} className="h-full min-w-0">
                      <CardHeader className="min-w-0">
                        <div
                          className="mb-3 flex h-11 w-11 items-center justify-center rounded-md bg-primary/10 text-primary"
                          aria-hidden
                        >
                          <Icon className="h-6 w-6" />
                        </div>
                        <CardTitle className="break-words">{topic.title}</CardTitle>
                        <CardDescription className="break-words">{topic.description}</CardDescription>
                      </CardHeader>
                    </Card>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        {visibleArticles.length > 0 ? (
          <section className="bg-muted py-responsive" aria-labelledby="help-articles-heading">
            <div className="container-responsive">
              <h2
                id="help-articles-heading"
                className="mb-12 break-words text-center font-bold mkt-h2 [overflow-wrap:anywhere]"
              >
                {hasActiveSearch ? copy.search.articlesMatching : copy.search.articlesDefault}
              </h2>

              <div className="mx-auto max-w-3xl min-w-0">
                <Card className="min-w-0">
                  <CardContent className="p-0">
                    <ul className="divide-y divide-border">
                      {visibleArticles.map((article) => (
                        <li key={article}>
                          <div className="flex min-w-0 items-start gap-3 p-4 sm:items-center sm:gap-4 sm:p-5">
                            <BookOpen className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                            <span className="min-w-0 flex-1 break-words text-[15px]">{article}</span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>
        ) : null}

        {!hasActiveSearch ? (
          <section className="py-responsive" aria-labelledby="help-workspace-heading">
            <div className="container-responsive">
              <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
                <div className="min-w-0">
                  <h2
                    id="help-workspace-heading"
                    className="mb-4 break-words font-bold mkt-h2 [overflow-wrap:anywhere]"
                  >
                    {copy.workspace.title}
                  </h2>
                  <p className="mb-6 max-w-xl break-words text-muted-foreground mkt-body">
                    {copy.workspace.description}
                  </p>
                  <a
                    href="/ai-agent"
                    className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-sm text-[15px] font-medium text-primary whitespace-normal transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)]"
                    data-testid="link-help-tour-ide"
                  >
                    <span className="break-words">{copy.workspace.action}</span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                  </a>
                </div>

                <figure className="group relative min-w-0">
                  <div
                    className="pointer-events-none absolute -inset-2 rounded-2xl bg-gradient-to-r from-primary/20 to-primary/5 blur-2xl"
                    aria-hidden
                  />
                  <div className="relative overflow-hidden rounded-xl bg-bolt-elements-background-depth-3 shadow-2xl ring-1 ring-bolt-elements-borderColor">
                    <div className="flex min-w-0 items-center gap-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-3 py-2.5 sm:px-4">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary/70" aria-hidden />
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary/40" aria-hidden />
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full bg-bolt-elements-textTertiary/40"
                        aria-hidden
                      />
                      <span className="ml-2 min-w-0 break-words text-[11px] font-medium text-bolt-elements-textSecondary sm:text-[13px]">
                        {copy.workspace.windowLabel}
                      </span>
                    </div>
                    <img
                      src="/ecode-static/assets/product/ide.png"
                      alt={copy.workspace.imageAlt}
                      width={1440}
                      height={900}
                      loading="lazy"
                      className="block h-auto w-full"
                      data-testid="img-help-ide"
                    />
                  </div>
                  <figcaption className="mt-3 flex min-w-0 items-start gap-2 px-1 text-[11px] text-bolt-elements-textSecondary sm:text-[13px]">
                    <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary sm:h-4 sm:w-4" aria-hidden />
                    <span className="min-w-0 break-words">{copy.workspace.caption}</span>
                  </figcaption>
                </figure>
              </div>
            </div>
          </section>
        ) : null}

        <section className="bg-muted py-responsive" aria-labelledby="help-support-heading">
          <div className="container-responsive min-w-0 text-center">
            <LifeBuoy className="mx-auto mb-4 h-10 w-10 text-primary" aria-hidden />
            <h2 id="help-support-heading" className="mb-4 break-words font-bold mkt-h2 [overflow-wrap:anywhere]">
              {copy.support.title}
            </h2>
            <p className="mx-auto mb-8 max-w-2xl break-words text-muted-foreground mkt-body">
              {copy.support.description}
            </p>
            <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <a
                href="/contact"
                className="inline-flex min-h-[44px] w-full max-w-full items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-center text-primary-foreground whitespace-normal transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] sm:w-auto"
                data-testid="button-help-contact-support"
              >
                <span className="break-words">{copy.support.contact}</span>
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </a>
              <a
                href="/docs"
                className="inline-flex min-h-[44px] w-full max-w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-6 py-3 text-center text-[15px] text-foreground whitespace-normal transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] sm:w-auto"
                data-testid="button-help-read-docs"
              >
                <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
                <span className="break-words">{copy.support.documentation}</span>
              </a>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
