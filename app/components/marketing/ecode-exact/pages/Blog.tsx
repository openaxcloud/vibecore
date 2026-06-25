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

interface BlogPost {
  category: string;
  icon: LucideIcon;
  title: string;
  excerpt: string;
  date: string;
}

const PRODUCT = '/ecode-static/assets/product';

export default function Blog() {
  const navigate = useMarketingNavigate();
  const { user } = usePublicAuth();

  const categories = ['All', 'Product', 'AI Agent', 'Deployments', 'Pricing', 'Collaboration', 'Engineering'];

  const featured = {
    category: 'Product',
    title: 'Introducing the E-Code Agent: from prompt to production in one flow',
    excerpt:
      'Our autonomous coding agent plans, writes, runs and previews your app end to end. Describe what you want in plain language and watch a full-stack project come to life in the IDE — then ship it to a live URL with a single click.',
    date: 'June 16, 2026',
    icon: Bot,
    image: `${PRODUCT}/ide.png`,
  };

  const posts: BlogPost[] = [
    {
      category: 'AI Agent',
      icon: Workflow,
      title: 'How parallel sub-agents reach consensus on your code',
      excerpt:
        'A look under the hood at how E-Code fans a task out to multiple sub-agents, compares their proposals, and merges them into a single high-confidence change.',
      date: 'June 10, 2026',
    },
    {
      category: 'Deployments',
      icon: Rocket,
      title: 'Zero-config deployments: static and full-stack, instantly',
      excerpt:
        'Push from chat to a live URL with no YAML. We walk through how E-Code snapshots your build and serves it on managed infrastructure.',
      date: 'June 4, 2026',
    },
    {
      category: 'Pricing',
      icon: CreditCard,
      title: 'Effort-based pricing: pay for outcomes, not idle seats',
      excerpt:
        'Why we moved away from flat per-seat plans toward billing that tracks the real compute and agent effort your projects actually use.',
      date: 'May 28, 2026',
    },
    {
      category: 'Collaboration',
      icon: Users,
      title: 'Real-time multiplayer editing comes to the E-Code IDE',
      excerpt:
        'Presence, shared cursors and live agent activity let your whole team build in the same workspace without stepping on each other.',
      date: 'May 20, 2026',
    },
    {
      category: 'Engineering',
      icon: Radio,
      title: 'Streaming the agent: how we render thinking in real time',
      excerpt:
        'The SSE pipeline that powers per-lane streaming output, the backpressure tricks we use, and how we keep the editor responsive under load.',
      date: 'May 12, 2026',
    },
    {
      category: 'Product',
      icon: Wrench,
      title: 'Self-repair: when the agent fixes its own mistakes',
      excerpt:
        'E-Code now detects failed builds and broken previews, then retries with a corrected plan — turning dead ends into shipped features.',
      date: 'May 5, 2026',
    },
  ];

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

        {/* Featured Post */}
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
                    <span className="ml-2 mkt-small text-muted-foreground font-medium truncate">E-Code Workspace</span>
                  </div>
                  <img
                    src={featured.image}
                    alt="The E-Code IDE showing the AI Agent panel, code editor, file tree and live preview together in one workspace"
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
                      <span className="font-medium text-foreground">E-Code Team</span>
                      <span className="flex items-center gap-1 mt-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {featured.date}
                      </span>
                    </div>
                    <a
                      href="/blog"
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

        {/* Latest Posts */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <h2 className="mkt-h2 mb-12">Latest Posts</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visiblePosts.map((post) => {
                const Icon = post.icon;
                return (
                  <Card key={post.title} className="flex flex-col hover:shadow-lg transition-shadow">
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
                          <span className="font-medium text-foreground">E-Code Team</span>
                          <span className="flex items-center gap-1 mt-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {post.date}
                          </span>
                        </div>
                        <a
                          href="/blog"
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
