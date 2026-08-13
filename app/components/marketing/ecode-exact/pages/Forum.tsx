import { Megaphone, LifeBuoy, Sparkles, Lightbulb, MessageSquare, Users, Heart, ArrowRight } from 'lucide-react';
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

export default function Forum() {
  const categories = [
    {
      icon: Megaphone,
      title: 'Announcements',
      description: 'Product updates, release notes and news straight from the E-Code team.',
      topics: '128 topics',
      posts: '1.2k posts',
    },
    {
      icon: LifeBuoy,
      title: 'Help & Support',
      description: 'Stuck on a build? Ask a question and get answers from the community.',
      topics: '3.4k topics',
      posts: '12.8k posts',
    },
    {
      icon: Sparkles,
      title: 'Showcase',
      description: 'Share the apps you built with E-Code and get feedback from your peers.',
      topics: '960 topics',
      posts: '5.1k posts',
    },
    {
      icon: Lightbulb,
      title: 'Feature Requests',
      description: 'Tell us what to build next and vote on ideas from the community.',
      topics: '742 topics',
      posts: '4.3k posts',
    },
  ];

  const guidelines = [
    {
      title: 'Be kind and respectful',
      description: 'Treat everyone with respect. No harassment, hate speech or personal attacks.',
    },
    {
      title: 'Stay on topic',
      description: 'Post in the right category and keep threads focused so others can find answers.',
    },
    {
      title: 'Search before posting',
      description: 'Your question may already be answered. A quick search keeps the forum tidy.',
    },
    {
      title: 'Share what you learn',
      description: 'Mark helpful replies as solutions and pay it forward to the next builder.',
    },
  ];

  const stats = [
    { icon: Users, label: 'Members', value: '48,200+' },
    { icon: MessageSquare, label: 'Posts', value: '210k+' },
    { icon: Heart, label: 'Solutions', value: '36k+' },
  ];

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-forum">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-responsive bg-gradient-to-b from-background to-muted">
          <div className="container-responsive">
            <div className="text-center max-w-3xl mx-auto">
              <Users className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--ecode-accent)' }} />
              <h1 className="text-4xl font-bold mb-4" data-testid="heading-forum">
                Join the E-Code community
              </h1>
              <p className="text-[15px] text-muted-foreground mb-8">
                Get help, share what you build and shape the future of E-Code with thousands of developers around the
                world.
              </p>
              <Badge variant="secondary" className="text-[15px] px-4 py-2">
                48,200+ members and growing
              </Badge>
            </div>
          </div>
        </section>

        {/* Community Stats */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <Card key={stat.label}>
                    <CardContent className="pt-6 text-center">
                      <Icon className="h-8 w-8 mx-auto mb-3" style={{ color: 'var(--ecode-accent)' }} />
                      <div className="text-2xl font-bold">{stat.value}</div>
                      <p className="text-[13px] text-muted-foreground">{stat.label}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Categories */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive">
            <h2 className="text-3xl font-bold text-center mb-12">Browse categories</h2>

            <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {categories.map((category) => {
                const Icon = category.icon;
                return (
                  <Card key={category.title}>
                    <CardHeader>
                      <div className="flex items-start gap-4">
                        <div
                          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--ecode-accent) 12%, transparent)' }}
                        >
                          <Icon className="h-6 w-6" style={{ color: 'var(--ecode-accent)' }} />
                        </div>
                        <div>
                          <CardTitle>{category.title}</CardTitle>
                          <CardDescription>{category.description}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex items-center gap-4 text-[13px] text-muted-foreground">
                      <span>{category.topics}</span>
                      <span aria-hidden="true">·</span>
                      <span>{category.posts}</span>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Community Guidelines */}
        <section className="py-responsive">
          <div className="container-responsive">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-4">Community guidelines</h2>
              <p className="text-[15px] text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
                The forum works best when everyone helps keep it welcoming. A few simple rules keep conversations useful
                for every builder.
              </p>

              <div className="grid md:grid-cols-2 gap-8">
                {guidelines.map((guideline) => (
                  <div key={guideline.title} className="flex gap-4">
                    <Heart className="h-6 w-6 flex-shrink-0 mt-1" style={{ color: 'var(--ecode-accent)' }} />
                    <div>
                      <h3 className="font-semibold mb-2">{guideline.title}</h3>
                      <p className="text-muted-foreground">{guideline.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-responsive bg-muted">
          <div className="container-responsive text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to jump in?</h2>
            <p className="text-[15px] text-muted-foreground mb-8 max-w-2xl mx-auto">
              Create an account, introduce yourself and start your first thread. The community is waiting to help you
              ship.
            </p>
            <button
              className="inline-flex items-center gap-2 px-6 py-3 text-primary-foreground rounded-md min-h-[44px]"
              style={{ backgroundColor: 'var(--ecode-accent)' }}
              onClick={() => (window.location.href = '/signup')}
              data-testid="button-forum-join"
            >
              Join the forum
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
