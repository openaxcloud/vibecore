import {
  Search,
  Rocket,
  FolderKanban,
  Cloud,
  CreditCard,
  Bot,
  Plug,
  ArrowRight,
  LifeBuoy,
  BookOpen,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { filterHelpArticles, filterHelpTopics, normalizeHelpQuery } from './help-search';
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

export default function HelpCenter() {
  const topics = [
    {
      icon: Rocket,
      title: 'Getting started',
      description: 'Set up your account, create your first project, and ship in minutes.',
      articleCount: 14,
    },
    {
      icon: FolderKanban,
      title: 'Workspaces',
      description: 'Manage files, terminals, ports, and live previews in the E-Code IDE.',
      articleCount: 22,
    },
    {
      icon: Cloud,
      title: 'Deployments',
      description: 'Publish static sites and full-stack apps with custom domains.',
      articleCount: 18,
    },
    {
      icon: CreditCard,
      title: 'Billing',
      description: 'Plans, invoices, usage limits, and how to upgrade or cancel.',
      articleCount: 11,
    },
    {
      icon: Bot,
      title: 'AI agent',
      description: 'Prompt the agent, review proposed edits, and iterate on your code.',
      articleCount: 16,
    },
    {
      icon: Plug,
      title: 'Integrations',
      description: 'Connect GitHub, MCP servers, and third-party services to your projects.',
      articleCount: 9,
    },
  ];

  const popularArticles = [
    'How do I create a new project from a prompt?',
    'Connecting a GitHub repository to your workspace',
    'Adding a custom domain to a deployment',
    'Understanding usage limits on the Free plan',
    'Why is my preview stuck on "Starting"?',
    'Accepting and reverting AI agent edits',
    'Inviting teammates to an organization',
    'Configuring an MCP integration',
  ];

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
              <h1 className="text-4xl font-bold mb-4" data-testid="heading-help-center">
                How can we help?
              </h1>
              <p className="text-[15px] text-muted-foreground mb-8">
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
              <p className="text-[15px] text-muted-foreground">
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
              <h2 className="text-3xl font-bold text-center mb-12">
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
                        <CardTitle className="flex items-center justify-between">
                          <span>{topic.title}</span>
                          <Badge variant="secondary" className="text-[12px]">
                            {topic.articleCount} articles
                          </Badge>
                        </CardTitle>
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
              <h2 className="text-3xl font-bold text-center mb-12">
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

        {/* Contact Support CTA */}
        <section className="py-responsive">
          <div className="container-responsive text-center">
            <LifeBuoy className="h-10 w-10 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
            <h2 className="text-3xl font-bold mb-4">Still need help?</h2>
            <p className="text-[15px] text-muted-foreground mb-8 max-w-2xl mx-auto">
              Can&apos;t find what you&apos;re looking for? Our support team is here to help you get unblocked.
            </p>
            <a
              href="/contact"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-primary-foreground rounded-md min-h-[44px] hover:opacity-90 transition-opacity"
              style={{ backgroundColor: 'var(--ecode-accent)' }}
              data-testid="button-help-contact-support"
            >
              Contact Support
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
