import {
  ArrowRight,
  Bot,
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
  useMarketingNavigate,
  usePublicAuth,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import type { BlogListingPost } from '~/lib/marketing/blog-listing';

/*
 * BUG-MKT-011 — la liste vient désormais du registre qui sert `/blog/:slug`.
 * L'ancienne interface locale n'avait AUCUN champ `slug` : un lien vers un
 * article n'était pas seulement absent, il était inexprimable. Tous les
 * « Read more » portaient donc `href="/blog"` et renvoyaient à la page courante.
 */
interface BlogProps {
  featured: BlogListingPost | null;
  posts: BlogListingPost[];
  categories: string[];
}

/*
 * Le registre ne porte pas d'icône : on en dérive une de la catégorie, avec un
 * repli explicite pour qu'une catégorie inédite reste rendue plutôt que de
 * casser la carte.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Product: Bot,
  'AI Agent': Workflow,
  Engineering: Radio,
  Deployments: Rocket,
  Tutorial: Wrench,
  Pricing: CreditCard,
  Collaboration: Users,
};

const iconForCategory = (category: string): LucideIcon => CATEGORY_ICONS[category] ?? Newspaper;

export default function Blog({ featured, posts, categories }: BlogProps) {
  const navigate = useMarketingNavigate();
  const { user } = usePublicAuth();

  const [selectedCategory, setSelectedCategory] = useState('All');
  const visiblePosts = filterPostsByCategory(posts, selectedCategory);

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-blog">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <span className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-bolt-elements-background-depth-3 ring-1 ring-bolt-elements-borderColor mb-5">
                <Newspaper className="h-6 w-6 text-[#F26207]" />
              </span>
              <h1 className="mkt-h1 mb-4" data-testid="heading-blog">
                The E-Code Blog
              </h1>
              <p className="mkt-lead text-muted-foreground mb-8">
                Product updates, engineering deep-dives and the future of AI-native software development.
              </p>
              <Badge variant="secondary" className="text-[15px] px-4 py-2">
                Building in the open
              </Badge>
            </div>
          </div>
        </section>

        {/* Category Filters */}
        <section className="py-6 border-b border-border">
          <div className="container-responsive">
            <div className="flex flex-wrap justify-center gap-2">
              {categories.map((category) => {
                const isActive = category === selectedCategory;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                    aria-pressed={isActive}
                    className={`px-4 py-2 rounded-full text-[13px] font-medium min-h-[44px] inline-flex items-center cursor-pointer ${
                      isActive ? 'text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                    }`}
                    style={isActive ? { backgroundColor: '#F26207' } : undefined}
                    data-testid={`filter-${category.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Featured Post — masqué plutôt que rendu vide si le registre n'a rien. */}
        {featured && (
          <section className="py-responsive">
            <div className="container-responsive">
              <h2 className="mkt-h2 mb-8">Featured</h2>

              <Card className="overflow-hidden" data-testid="link-featured-post">
                <div className="grid md:grid-cols-2 gap-0">
                  {/* Real product capture, framed */}
                  <figure className="relative bg-bolt-elements-background-depth-2 border-b md:border-b-0 md:border-r border-bolt-elements-borderColor">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#F26207]/70" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#F99D25]/70" />
                      <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                      <span className="ml-2 mkt-small text-muted-foreground font-medium truncate">
                        E-Code Workspace
                      </span>
                    </div>
                    <img
                      src={featured.coverImage}
                      alt={`Cover image for the article “${featured.title}”`}
                      width={1440}
                      height={900}
                      loading="lazy"
                      className="block w-full h-full object-cover"
                      data-testid="img-featured-post"
                    />
                  </figure>
                  <div className="p-8 flex flex-col justify-center">
                    <Badge variant="secondary" className="w-fit mb-3">
                      {featured.category}
                    </Badge>
                    <h3 className="mkt-h3 mb-3">{featured.title}</h3>
                    <p className="mkt-body text-muted-foreground mb-6">{featured.excerpt}</p>
                    <div className="flex items-center justify-between">
                      <div className="mkt-small text-muted-foreground">
                        <span className="font-medium text-foreground">{featured.author}</span>
                        <span className="flex items-center gap-1 mt-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {featured.date} · {featured.readTime} min read
                        </span>
                      </div>
                      <a
                        href={featured.href}
                        className="flex items-center gap-1 text-[14px] font-medium text-[#F26207]"
                        data-testid="link-featured-read-more"
                      >
                        Read more
                        <ArrowRight className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </section>
        )}

        {/* Latest Posts */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <h2 className="mkt-h2 mb-12">Latest Posts</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visiblePosts.map((post) => {
                const Icon = iconForCategory(post.category);
                return (
                  <Card key={post.slug} className="flex flex-col hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="secondary">{post.category}</Badge>
                        <span className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-bolt-elements-background-depth-3 ring-1 ring-bolt-elements-borderColor">
                          <Icon className="h-4 w-4 text-[#F26207]" />
                        </span>
                      </div>
                      <CardTitle className="mkt-h3 leading-snug">{post.title}</CardTitle>
                      <CardDescription>{post.excerpt}</CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto">
                      <div className="flex items-center justify-between">
                        <div className="mkt-small text-muted-foreground">
                          <span className="font-medium text-foreground">{post.author}</span>
                          <span className="flex items-center gap-1 mt-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {post.date} · {post.readTime} min read
                          </span>
                        </div>
                        <a
                          href={post.href}
                          className="flex items-center gap-1 text-[14px] font-medium text-[#F26207] min-h-[44px]"
                          data-testid="link-read-more"
                        >
                          Read more
                          <ArrowRight className="h-4 w-4" />
                        </a>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {visiblePosts.length === 0 && (
              <p className="mkt-body text-muted-foreground text-center" data-testid="text-no-posts">
                No posts in this category yet.
              </p>
            )}
          </div>
        </section>

        {/* End-of-page CTA banner */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="relative overflow-hidden rounded-2xl bg-bolt-elements-background-depth-2 ring-1 ring-bolt-elements-borderColor px-6 sm:px-12 py-12 sm:py-16 text-center">
              <div className="absolute -inset-1 bg-gradient-to-r from-[#F26207]/10 to-[#F99D25]/10 blur-2xl pointer-events-none" />
              <div className="relative max-w-2xl mx-auto">
                <span className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-[#F26207] mb-5">
                  <Rocket className="h-6 w-6 text-white" />
                </span>
                <h2 className="mkt-h2 mb-4">Stop reading, start building</h2>
                <p className="mkt-body text-muted-foreground mb-8">
                  Describe your idea in plain language and let the E-Code Agent build, run and ship it for you.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button
                    size="lg"
                    onClick={() => navigate(user ? '/dashboard' : '/signup')}
                    data-testid="button-blog-get-started"
                  >
                    {user ? 'Open dashboard' : 'Get started free'}
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => navigate('/features')}
                    data-testid="button-blog-explore-features"
                  >
                    Explore features
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
