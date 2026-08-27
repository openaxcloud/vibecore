import {
  ArrowRight,
  Calendar,
  ChevronRight,
  CreditCard,
  Newspaper,
  Radio,
  Rocket,
  Users,
  Workflow,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { filterPostsByCategory } from './blog-filter';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Link,
  useMarketingNavigate,
  usePublicAuth,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  formatExactBlogDate,
  getMarketingExactLegalBlogCopy,
  type ExactBlogCategoryId,
  type ExactBlogPostId,
} from '~/lib/i18n/catalogs/marketing-exact-legal-blog';

interface BlogPost {
  id: ExactBlogPostId;
  category: ExactBlogCategoryId;
  categoryLabel: string;
  icon: LucideIcon;
  title: string;
  excerpt: string;
  date: string;
}

const PRODUCT = '/ecode-static/assets/product';
const FEATURED_DATE = '2026-06-16';

const BLOG_POST_META: Record<
  ExactBlogPostId,
  { categoryId: Exclude<ExactBlogCategoryId, 'All'>; icon: LucideIcon; date: string }
> = {
  'parallel-agents': { categoryId: 'AI Agent', icon: Workflow, date: '2026-06-10' },
  'zero-config-deployments': { categoryId: 'Deployments', icon: Rocket, date: '2026-06-04' },
  'effort-pricing': { categoryId: 'Pricing', icon: CreditCard, date: '2026-05-28' },
  'multiplayer-editing': { categoryId: 'Collaboration', icon: Users, date: '2026-05-20' },
  'agent-streaming': { categoryId: 'Engineering', icon: Radio, date: '2026-05-12' },
  'self-repair': { categoryId: 'Product', icon: Wrench, date: '2026-05-05' },
};

export default function Blog() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingExactLegalBlogCopy(language).exactBlog;
  const navigate = useMarketingNavigate();
  const { user } = usePublicAuth();
  const [selectedCategory, setSelectedCategory] = useState<ExactBlogCategoryId>('All');

  const posts: BlogPost[] = copy.articles.posts.map((post) => {
    const metadata = BLOG_POST_META[post.id];

    return {
      ...post,
      category: metadata.categoryId,
      categoryLabel: post.category,
      icon: metadata.icon,
      date: metadata.date,
    };
  });

  const visiblePosts = filterPostsByCategory(posts, selectedCategory);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground" data-testid="page-blog">
      <PublicNavbar />

      <main className="min-w-0 flex-1">
        <section className="bg-gradient-to-b from-background to-muted py-responsive">
          <div className="container-responsive">
            <div className="mx-auto max-w-3xl text-center">
              <span className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-bolt-elements-background-depth-3 ring-1 ring-bolt-elements-borderColor">
                <Newspaper className="h-6 w-6 text-ecode-accent" aria-hidden="true" />
              </span>
              <h1 className="mb-4 break-words mkt-h1" data-testid="heading-blog">
                {copy.hero.title}
              </h1>
              <p className="mb-8 break-words mkt-lead text-muted-foreground">{copy.hero.description}</p>
              <Badge
                variant="secondary"
                className="max-w-full whitespace-normal px-4 py-2 text-center text-[15px] leading-snug"
              >
                {copy.hero.badge}
              </Badge>
            </div>
          </div>
        </section>

        <nav className="border-b border-border py-6" aria-label={copy.categoryNavigationLabel}>
          <div className="container-responsive">
            <div className="vc-no-scrollbar flex flex-nowrap justify-start gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:justify-center sm:overflow-visible sm:pb-0">
              {copy.categories.map((category) => {
                const isActive = category.id === selectedCategory;

                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setSelectedCategory(category.id)}
                    aria-pressed={isActive}
                    className={`inline-flex min-h-[44px] shrink-0 cursor-pointer items-center rounded-full px-4 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ecode-accent focus-visible:ring-offset-2 ${
                      isActive
                        ? 'bg-[var(--vc-action-primary-strong)] text-white hover:brightness-90'
                        : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                    }`}
                    data-testid={`filter-${category.id.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {category.label}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="mb-8 break-words mkt-h2">{copy.featured.heading}</h2>

            <Card className="min-w-0 overflow-hidden" data-testid="link-featured-post">
              <div className="grid min-w-0 gap-0 md:grid-cols-2">
                <figure className="relative min-w-0 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 md:border-b-0 md:border-r">
                  <div className="flex min-w-0 items-center gap-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-4 py-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#F26207]/70" aria-hidden="true" />
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#F99D25]/70" aria-hidden="true" />
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true" />
                    <span className="ml-2 min-w-0 truncate font-medium mkt-small text-muted-foreground">
                      {copy.featured.windowLabel}
                    </span>
                  </div>
                  <img
                    src={`${PRODUCT}/ide.png`}
                    alt={copy.featured.imageAlt}
                    width={1440}
                    height={900}
                    loading="lazy"
                    className="block h-auto w-full object-cover md:h-full"
                    data-testid="img-featured-post"
                  />
                </figure>
                <div className="flex min-w-0 flex-col justify-center p-5 sm:p-8">
                  <Badge variant="secondary" className="mb-3 max-w-full whitespace-normal self-start leading-snug">
                    {copy.featured.category}
                  </Badge>
                  <h3 className="mb-3 break-words mkt-h3 leading-snug">{copy.featured.title}</h3>
                  <p className="mb-6 break-words mkt-body text-muted-foreground">{copy.featured.excerpt}</p>
                  <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0 mkt-small text-muted-foreground">
                      <span className="break-words font-medium text-foreground">{copy.articles.author}</span>
                      <span className="mt-1 flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <time dateTime={FEATURED_DATE}>{formatExactBlogDate(FEATURED_DATE, language)}</time>
                      </span>
                    </div>
                    <Link
                      href="/blog"
                      className="inline-flex min-h-[44px] w-full items-center justify-center gap-1 whitespace-normal rounded-md text-center text-[14px] font-medium leading-snug text-ecode-accent hover:text-ecode-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ecode-accent sm:w-auto"
                      data-testid="link-featured-read-more"
                    >
                      <span className="min-w-0 break-words">{copy.articles.readMore}</span>
                      <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section className="bg-muted py-responsive">
          <div className="container-responsive">
            <h2 className="mb-12 break-words mkt-h2">{copy.articles.heading}</h2>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {visiblePosts.map((post) => {
                const Icon = post.icon;

                return (
                  <Card key={post.id} className="flex h-full min-w-0 flex-col transition-shadow hover:shadow-lg">
                    <CardHeader className="min-w-0">
                      <div className="mb-2 flex min-w-0 items-start justify-between gap-3">
                        <Badge variant="secondary" className="max-w-full whitespace-normal leading-snug">
                          {post.categoryLabel}
                        </Badge>
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bolt-elements-background-depth-3 ring-1 ring-bolt-elements-borderColor">
                          <Icon className="h-4 w-4 text-ecode-accent" aria-hidden="true" />
                        </span>
                      </div>
                      <CardTitle className="break-words mkt-h3 leading-snug">{post.title}</CardTitle>
                      <CardDescription className="break-words leading-relaxed">{post.excerpt}</CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto min-w-0">
                      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                        <div className="min-w-0 mkt-small text-muted-foreground">
                          <span className="break-words font-medium text-foreground">{copy.articles.author}</span>
                          <span className="mt-1 flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <time dateTime={post.date}>{formatExactBlogDate(post.date, language)}</time>
                          </span>
                        </div>
                        <Link
                          href="/blog"
                          className="inline-flex min-h-[44px] w-full items-center justify-center gap-1 whitespace-normal rounded-md text-center text-[14px] font-medium leading-snug text-ecode-accent hover:text-ecode-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ecode-accent sm:w-auto"
                          data-testid="link-read-more"
                        >
                          <span className="min-w-0 break-words">{copy.articles.readMore}</span>
                          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {visiblePosts.length === 0 ? (
              <p className="break-words text-center mkt-body text-muted-foreground" data-testid="text-no-posts">
                {copy.articles.empty}
              </p>
            ) : null}
          </div>
        </section>

        <section className="py-responsive">
          <div className="container-responsive">
            <div className="relative overflow-hidden rounded-2xl bg-bolt-elements-background-depth-2 px-6 py-12 text-center ring-1 ring-bolt-elements-borderColor sm:px-12 sm:py-16">
              <div className="pointer-events-none absolute -inset-1 bg-gradient-to-r from-[#F26207]/10 to-[#F99D25]/10 blur-2xl" />
              <div className="relative mx-auto max-w-2xl">
                <span className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-ecode-accent">
                  <Rocket className="h-6 w-6 text-white" aria-hidden="true" />
                </span>
                <h2 className="mb-4 break-words mkt-h2">{copy.cta.title}</h2>
                <p className="mb-8 break-words mkt-body text-muted-foreground">{copy.cta.description}</p>
                <div className="flex flex-col justify-center gap-4 sm:flex-row">
                  <Button
                    size="lg"
                    className="w-full whitespace-normal sm:w-auto"
                    onClick={() => navigate(user ? '/dashboard' : '/signup')}
                    data-testid="button-blog-get-started"
                  >
                    <span className="min-w-0 break-words">{user ? copy.cta.dashboard : copy.cta.getStarted}</span>
                    <ChevronRight className="ml-2 h-4 w-4 shrink-0" aria-hidden="true" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full whitespace-normal sm:w-auto"
                    onClick={() => navigate('/features')}
                    data-testid="button-blog-explore-features"
                  >
                    {copy.cta.exploreFeatures}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
