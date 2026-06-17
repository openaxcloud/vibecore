import { ArrowRight, Calendar, Rocket, Bot, Users, CreditCard, Sparkles, Newspaper } from 'lucide-react';
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

export default function Blog() {
  const categories = ['All', 'Product', 'AI Agent', 'Deployments', 'Pricing', 'Collaboration', 'Engineering'];

  const featured = {
    category: 'Product',
    title: 'Introducing the VibeCore Agent: from prompt to production in one flow',
    excerpt:
      'Our new autonomous coding agent plans, writes, runs and previews your app end to end. Describe what you want in plain language and watch a full-stack project come to life in the IDE — then ship it with a single click.',
    author: 'Avi Cohen',
    date: 'June 16, 2026',
    icon: Sparkles,
  };

  const posts = [
    {
      category: 'AI Agent',
      icon: Bot,
      title: 'How parallel sub-agents reach consensus on your code',
      excerpt:
        'A look under the hood at how VibeCore fans work out to multiple sub-agents, then merges their proposals into a single high-confidence change.',
      author: 'Maya Rossi',
      date: 'June 10, 2026',
    },
    {
      category: 'Deployments',
      icon: Rocket,
      title: 'Zero-config deployments: static and full-stack, instantly',
      excerpt:
        'Push from chat to a live URL with no YAML. We walk through how VibeCore snapshots your build and serves it on managed infrastructure.',
      author: 'Diego Fernández',
      date: 'June 4, 2026',
    },
    {
      category: 'Pricing',
      icon: CreditCard,
      title: 'Effort-based pricing: pay for outcomes, not idle seats',
      excerpt:
        'Why we moved away from flat per-seat plans toward billing that tracks the real compute and agent effort your projects use.',
      author: 'Sara Lindqvist',
      date: 'May 28, 2026',
    },
    {
      category: 'Collaboration',
      icon: Users,
      title: 'Real-time multiplayer editing comes to the VibeCore IDE',
      excerpt:
        'Presence, shared cursors and live agent activity let your whole team build in the same workspace without stepping on each other.',
      author: 'Tom Becker',
      date: 'May 20, 2026',
    },
    {
      category: 'Engineering',
      icon: Newspaper,
      title: 'Streaming the agent: how we render thinking in real time',
      excerpt:
        'The SSE pipeline that powers per-lane streaming output, the backpressure tricks we use, and how we keep the editor responsive under load.',
      author: 'Priya Nair',
      date: 'May 12, 2026',
    },
    {
      category: 'Product',
      icon: Sparkles,
      title: 'Self-repair: when the agent fixes its own mistakes',
      excerpt:
        'VibeCore now detects failed builds and broken previews, then retries with a corrected plan — turning dead ends into shipped features.',
      author: 'Avi Cohen',
      date: 'May 5, 2026',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-blog">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <Newspaper className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
              <h1 className="text-4xl font-bold mb-4" data-testid="heading-blog">
                The VibeCore Blog
              </h1>
              <p className="text-[15px] text-muted-foreground mb-8">
                Product updates, engineering deep-dives and the future of AI-native software development
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
              {categories.map((category, index) => (
                <span
                  key={category}
                  className={`px-4 py-2 rounded-full text-[13px] font-medium min-h-[44px] inline-flex items-center cursor-pointer ${
                    index === 0 ? 'text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                  }`}
                  style={index === 0 ? { backgroundColor: 'var(--ecode-accent)' } : undefined}
                  data-testid={`filter-${category.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {category}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Featured Post */}
        <section className="py-responsive">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold mb-8">Featured</h2>

            <a href="/blog" className="block" data-testid="link-featured-post">
              <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                <div className="grid md:grid-cols-2 gap-0">
                  <div
                    className="flex items-center justify-center p-12 bg-muted min-h-[220px]"
                    style={{ borderColor: 'var(--ecode-accent)' }}
                  >
                    <featured.icon className="h-20 w-20" style={{ color: 'var(--ecode-accent)' }} />
                  </div>
                  <div className="p-8 flex flex-col justify-center">
                    <Badge variant="secondary" className="w-fit mb-3">
                      {featured.category}
                    </Badge>
                    <h3 className="text-2xl font-bold mb-3">{featured.title}</h3>
                    <p className="text-[15px] text-muted-foreground mb-6">{featured.excerpt}</p>
                    <div className="flex items-center justify-between">
                      <div className="text-[13px] text-muted-foreground">
                        <span className="font-medium text-foreground">{featured.author}</span>
                        <span className="flex items-center gap-1 mt-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {featured.date}
                        </span>
                      </div>
                      <span
                        className="flex items-center gap-1 text-[14px] font-medium"
                        style={{ color: 'var(--ecode-accent)' }}
                      >
                        Read more
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </a>
          </div>
        </section>

        {/* Latest Posts */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold mb-12">Latest Posts</h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((post) => {
                const Icon = post.icon;
                return (
                  <Card key={post.title} className="flex flex-col hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="secondary">{post.category}</Badge>
                        <Icon className="h-5 w-5" style={{ color: 'var(--ecode-accent)' }} />
                      </div>
                      <CardTitle className="text-lg leading-snug">{post.title}</CardTitle>
                      <CardDescription>{post.excerpt}</CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto">
                      <div className="flex items-center justify-between">
                        <div className="text-[13px] text-muted-foreground">
                          <span className="font-medium text-foreground">{post.author}</span>
                          <span className="flex items-center gap-1 mt-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {post.date}
                          </span>
                        </div>
                        <a
                          href="/blog"
                          className="flex items-center gap-1 text-[14px] font-medium min-h-[44px]"
                          style={{ color: 'var(--ecode-accent)' }}
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
          </div>
        </section>

        {/* Newsletter CTA */}
        <section className="py-responsive">
          <div className="container-responsive text-center">
            <h2 className="text-3xl font-bold mb-4">Never miss an update</h2>
            <p className="text-[15px] text-muted-foreground mb-8 max-w-2xl mx-auto">
              Get the latest VibeCore product news, engineering posts and AI development tips delivered to your inbox
            </p>
            <button
              className="px-6 py-3 text-primary-foreground rounded-md hover:opacity-90 min-h-[44px]"
              style={{ backgroundColor: 'var(--ecode-accent)' }}
              onClick={() => (window.location.href = '/blog')}
              data-testid="button-blog-subscribe"
            >
              Subscribe to the newsletter
            </button>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
