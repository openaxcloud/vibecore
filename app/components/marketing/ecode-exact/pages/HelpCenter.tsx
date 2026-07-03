import { Search, Rocket, FolderKanban, Cloud, CreditCard, Bot, ArrowRight, LifeBuoy, BookOpen } from 'lucide-react';
import { useMemo, useState, type ComponentType, type CSSProperties } from 'react';
import { SiGithub } from 'react-icons/si';
import {
  filterHelpArticles,
  filterHelpTopics,
  normalizeHelpQuery,
  HELP_POPULAR_ARTICLES,
  HELP_TOPICS,
} from './help-search';
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

/*
 * Presentation-only icon per canonical topic title; the topic corpus itself
 * lives in help-search.ts so the public /search route can search the exact
 * same data server-side.
 */
const TOPIC_ICONS: Record<string, ComponentType<{ className?: string; style?: CSSProperties }>> = {
  'Getting started': Rocket,
  Workspaces: FolderKanban,
  Deployments: Cloud,
  Billing: CreditCard,
  'AI agent': Bot,
  Integrations: SiGithub,
};

const topics = HELP_TOPICS.map((topic) => ({ ...topic, icon: TOPIC_ICONS[topic.title] ?? BookOpen }));

const popularArticles = HELP_POPULAR_ARTICLES;

export default function HelpCenter() {
  // Live query bound to the search input.
  const [query, setQuery] = useState('');

  /*
   * Submitted query: only updated on Enter / form submit, so typing does not
   * re-filter the page until the user actually searches.
   */
  const [submittedQuery, setSubmittedQuery] = useState('');

  const hasActiveSearch = normalizeHelpQuery(submittedQuery) !== '';
  const visibleTopics = useMemo(() => filterHelpTopics(topics, submittedQuery), [submittedQuery]);

  const visibleArticles = useMemo(() => filterHelpArticles(popularArticles, submittedQuery), [submittedQuery]);

  const hasNoResults = hasActiveSearch && visibleTopics.length === 0 && visibleArticles.length === 0;

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-help-center">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <LifeBuoy className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
              <h1 className="mkt-h1 font-bold mb-4" data-testid="heading-help-center">
                How can we help?
              </h1>
              <p className="mkt-lead text-muted-foreground mb-8">
                Search our guides or browse by topic to get the most out of E-Code.
              </p>

              <form
                className="relative max-w-xl mx-auto"
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  setSubmittedQuery(query);
                }}
                data-testid="form-help-search"
              >
                <Search className="h-5 w-5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="search"
                  placeholder="Search the Help Center..."
                  aria-label="Search the Help Center"
                  className="w-full min-h-[48px] pl-12 pr-4 rounded-md border border-border bg-background text-[15px] focus:outline-none focus:ring-2 focus:ring-offset-2"
                  style={{ ['--tw-ring-color' as string]: 'var(--ecode-accent)' }}
                  value={query}
                  onChange={(event) => {
                    const next = event.target.value;
                    setQuery(next);

                    // Clearing the field restores the full unfiltered page.
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

        {hasNoResults && (
          <section className="py-responsive" data-testid="help-search-no-results">
            <div className="container-responsive text-center">
              <p className="mkt-body text-muted-foreground">
                No results found for &ldquo;{submittedQuery.trim()}&rdquo;. Try a different search or browse the topics
                below.
              </p>
            </div>
          </section>
        )}

        {/* Help Topics */}
        {visibleTopics.length > 0 && (
          <section className="py-responsive">
            <div className="container-responsive">
              <h2 className="mkt-h2 font-bold text-center mb-12">
                {hasActiveSearch ? 'Matching topics' : 'Browse by topic'}
              </h2>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {visibleTopics.map((topic) => {
                  const Icon = topic.icon;
                  return (
                    <Card key={topic.title} className="h-full">
                      <CardHeader>
                        <div
                          className="h-11 w-11 rounded-md flex items-center justify-center mb-3"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--ecode-accent) 12%, transparent)' }}
                        >
                          <Icon className="h-6 w-6" style={{ color: 'var(--ecode-accent)' }} />
                        </div>
                        <CardTitle>{topic.title}</CardTitle>
                        <CardDescription>{topic.description}</CardDescription>
                      </CardHeader>
                    </Card>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Popular Articles */}
        {visibleArticles.length > 0 && (
          <section className="py-responsive bg-muted">
            <div className="container-responsive">
              <h2 className="mkt-h2 font-bold text-center mb-12">
                {hasActiveSearch ? 'Matching articles' : 'Popular articles'}
              </h2>

              <div className="max-w-3xl mx-auto">
                <Card>
                  <CardContent className="p-0">
                    <ul className="divide-y divide-border">
                      {visibleArticles.map((article) => (
                        <li key={article}>
                          <div className="flex items-center gap-4 p-4 sm:p-5">
                            <BookOpen className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--ecode-accent)' }} />
                            <span className="flex-1 text-[15px]">{article}</span>
                            <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>
        )}

        {/* Get oriented in the workspace — real product capture */}
        {!hasActiveSearch && (
          <section className="py-responsive">
            <div className="container-responsive">
              <div className="grid lg:grid-cols-2 gap-10 items-center">
                <div>
                  <h2 className="mkt-h2 font-bold mb-4">Get oriented in the workspace</h2>
                  <p className="mkt-body text-muted-foreground mb-6 max-w-xl">
                    Most questions answer themselves once you know where things live. The E-Code IDE puts the AI agent,
                    code editor, file tree and live preview together in a single workspace — exactly what you see below.
                  </p>
                  <a
                    href="/ai-agent"
                    className="inline-flex items-center gap-2 text-[15px] font-medium hover:opacity-80 transition-opacity"
                    style={{ color: 'var(--ecode-accent)' }}
                    data-testid="link-help-tour-ide"
                  >
                    Explore the AI agent
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </div>

                <figure className="group relative">
                  <div className="absolute -inset-2 bg-gradient-to-r from-[#F26207]/20 to-[#F99D25]/20 blur-2xl rounded-2xl pointer-events-none" />
                  <div className="relative rounded-xl overflow-hidden ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-3 shadow-2xl">
                    <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#F26207]/70" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#F99D25]/70" />
                      <span className="h-2.5 w-2.5 rounded-full bg-bolt-elements-textTertiary/40" />
                      <span className="ml-2 text-[11px] sm:text-[13px] text-bolt-elements-textSecondary font-medium truncate">
                        E-Code Workspace
                      </span>
                    </div>
                    <img
                      src="/ecode-static/assets/product/ide.png"
                      alt="The E-Code IDE showing the AI agent panel, code editor, file tree and live preview together in one workspace"
                      width={1440}
                      height={900}
                      loading="lazy"
                      className="block w-full h-auto"
                      data-testid="img-help-ide"
                    />
                  </div>
                  <figcaption className="mt-3 flex items-start gap-2 text-[11px] sm:text-[13px] text-bolt-elements-textSecondary px-1">
                    <BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#F26207] flex-shrink-0 mt-0.5" />
                    <span>The E-Code IDE: agent, editor, files and live preview in one workspace.</span>
                  </figcaption>
                </figure>
              </div>
            </div>
          </section>
        )}

        {/* Contact Support CTA */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive text-center">
            <LifeBuoy className="h-10 w-10 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
            <h2 className="mkt-h2 font-bold mb-4">Still need help?</h2>
            <p className="mkt-body text-muted-foreground mb-8 max-w-2xl mx-auto">
              Can&apos;t find what you&apos;re looking for? Our support team is here to help you get unblocked.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="/contact"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 text-primary-foreground rounded-md min-h-[44px] hover:opacity-90 transition-opacity"
                style={{ backgroundColor: 'var(--ecode-accent)' }}
                data-testid="button-help-contact-support"
              >
                Contact Support
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="/docs"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md min-h-[44px] border border-border hover:bg-background transition-colors text-[15px]"
                data-testid="button-help-read-docs"
              >
                <BookOpen className="h-4 w-4" />
                Read the docs
              </a>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
