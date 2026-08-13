import {
  Activity,
  ArrowRight,
  Blocks,
  CheckCircle2,
  ChevronRight,
  Code,
  Code2,
  Cpu,
  Database,
  FolderTree,
  GitBranch,
  Globe2,
  KeyRound,
  Layers,
  LayoutDashboard,
  Network,
  Rocket,
  Settings2,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Users,
  Users2,
  Zap,
} from 'lucide-react';
import type React from 'react';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useMarketingNavigate,
  usePublicAuth,
} from '~/components/marketing/ecode-exact/EcodeExactUi';

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
  details: string[];
  category: string;
  id?: string;
}

/**
 * Filters the feature list for a given category tab. The special `'All'` tab
 * returns every feature; any other value returns only the features whose
 * `category` matches exactly. Kept as a pure function so the tab/data alignment
 * is unit-testable independently of the React tree.
 */
export function filterFeaturesByCategory<T extends { category: string }>(items: T[], category: string): T[] {
  return items.filter((item) => category === 'All' || item.category === category);
}

export default function Features() {
  const navigate = useMarketingNavigate();
  const { user } = usePublicAuth();

  const features: Feature[] = [
    // AI Agent
    {
      icon: <Sparkles className="h-6 w-6" />,
      title: 'AI Agent - Your Personal Developer',
      description: 'Build complete apps just by describing what you want in any language',
      details: [
        'Build entire apps from scratch automatically',
        'No coding knowledge required at all',
        'Creates all files and folders for you',
        'Installs needed tools automatically',
        'Works like having an expert helper',
        'Updates code based on your feedback',
      ],
      category: 'AI-Powered',
      id: 'ai-agent',
    },

    // Development Environment
    {
      icon: <Code2 className="h-6 w-6" />,
      title: 'Friendly Code Editor',
      description: 'Write code easily with helpful suggestions and colorful highlighting',
      details: [
        'Colors that make code easy to read',
        'Helpful suggestions as you type',
        'Multiple ways to edit faster',
        'Easy navigation through your code',
        'Automatic error detection',
        'Choose colors that feel comfortable',
      ],
      category: 'Creating',
    },
    {
      icon: <TerminalSquare className="h-6 w-6" />,
      title: 'Command Center',
      description: 'Run your code and see results instantly, just like magic',
      details: [
        'Run your programs with one click',
        'See results immediately',
        'Try multiple things at once',
        'Install tools you need easily',
        'Everything stays running',
        'Share your screen with helpers',
      ],
      category: 'Creating',
    },
    {
      icon: <FolderTree className="h-6 w-6" />,
      title: 'Your Project Files',
      description: 'Organize your work just like folders on your computer',
      details: [
        'See all your files clearly',
        'Move files by dragging them',
        'Find any file quickly',
        'Track your changes easily',
        'Preview without opening',
        'Work with many files at once',
      ],
      category: 'Creating',
    },
    {
      icon: <Blocks className="h-6 w-6" />,
      title: 'Add Cool Features',
      description: 'Easily add pre-made tools to make your projects awesome',
      details: [
        'We find what you need automatically',
        'Browse thousands of helpful tools',
        'Always use the right version',
        'Everything stays organized',
        'Access special tools',
        'Stay safe from bad code',
      ],
      category: 'Creating',
    },

    // Collaboration
    {
      icon: <Users2 className="h-6 w-6" />,
      title: 'Learn Together',
      description: 'Get help from friends or mentors in real-time',
      details: [
        'See where others are working',
        'Fix problems together',
        'Talk while you code',
        'Leave helpful notes',
        "Know who's online",
        'Share your screen easily',
      ],
      category: 'Learning Together',
      id: 'multiplayer',
    },
    {
      icon: <GitBranch className="h-6 w-6" />,
      title: 'Save Your Progress',
      description: 'Never lose your work with automatic saving and history',
      details: [
        'See what changed visually',
        'Try different ideas safely',
        'Fix mistakes easily',
        'Connect to GitHub simply',
        'Share your work',
        'See your journey over time',
      ],
      category: 'Learning Together',
    },

    // Infrastructure
    {
      icon: <Globe2 className="h-6 w-6" />,
      title: 'Always Available',
      description: 'Your projects work from anywhere, anytime',
      details: [
        'Grows with your needs',
        'Fast loading everywhere',
        'Protected from attacks',
        'Almost never goes down',
        'Works worldwide',
        'Load balancing',
      ],
      category: 'Infrastructure',
    },
    {
      icon: <Database className="h-6 w-6" />,
      title: 'Built-in Database',
      description: 'PostgreSQL and key-value databases included',
      details: [
        'PostgreSQL with full SQL support',
        'Key-value store for caching',
        'Automatic backups',
        'Database migrations',
        'Query performance insights',
        'Connection pooling',
      ],
      category: 'Infrastructure',
      id: 'database',
    },
    {
      icon: <Rocket className="h-6 w-6" />,
      title: 'One-Click Deploy',
      description: 'Deploy to production instantly with automatic SSL',
      details: [
        'Zero-config deployments',
        'Automatic SSL certificates',
        'Custom domain support',
        'Rolling updates',
        'Deployment previews',
        'Rollback capabilities',
      ],
      category: 'Infrastructure',
      id: 'deployment',
    },

    // Security
    {
      icon: <ShieldCheck className="h-6 w-6" />,
      title: 'Enterprise Security',
      description: 'Bank-level security for your code and data',
      details: [
        'End-to-end encryption',
        'SOC 2 Type II certified',
        'GDPR compliant',
        'Two-factor authentication',
        'SSO integration',
        'Audit logs',
      ],
      category: 'Security',
      id: 'security',
    },
    {
      icon: <KeyRound className="h-6 w-6" />,
      title: 'Secret Management',
      description: 'Secure storage for API keys and credentials',
      details: [
        'Encrypted secret storage',
        'Environment variables',
        'Secret sharing with team',
        'Automatic rotation',
        'Access control',
        'Audit trail',
      ],
      category: 'Security',
    },

    // Analytics
    {
      icon: <Activity className="h-6 w-6" />,
      title: 'Performance Monitoring',
      description: 'Real-time metrics and application monitoring',
      details: [
        'CPU and memory usage',
        'Request analytics',
        'Error tracking',
        'Custom metrics',
        'Performance alerts',
        'Historical data',
      ],
      category: 'Analytics',
    },
  ];

  /*
   * These must match the `category` strings used in the feature data above,
   * otherwise a tab would filter to an empty grid (and its features would be
   * unreachable outside the 'All' tab).
   */
  const categories = ['All', 'AI-Powered', 'Creating', 'Learning Together', 'Infrastructure', 'Security', 'Analytics'];

  return (
    <div className="min-h-screen flex flex-col">
      <PublicNavbar />

      {/* Hero Section */}
      <section className="py-12 sm:py-16 md:py-20 px-4 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center space-y-4 sm:space-y-6">
            <Badge variant="secondary" className="mb-2 sm:mb-4 text-[11px] sm:text-[13px]">
              <Zap className="h-3 w-3 mr-1" />
              Everything you need in one place
            </Badge>
            <h1 className="mkt-h1 font-bold">Features that empower developers</h1>
            <p className="mkt-lead text-muted-foreground max-w-3xl mx-auto px-4 sm:px-0">
              From writing your first line of code to deploying at scale, E-Code provides all the tools you need in a
              single platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4 sm:px-0">
              <Button
                size="lg"
                onClick={() => navigate(user ? '/dashboard' : '/login')}
                className="min-h-[44px]"
                data-testid="button-features-start-building"
              >
                Start building
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate('/docs')}
                className="min-h-[44px]"
                data-testid="button-features-docs"
              >
                View documentation
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Product Screenshot Showcase — real captures of the live E-Code app */}
      <section className="px-4 pb-4 sm:pb-8 md:pb-12">
        <div className="container mx-auto max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 sm:gap-8 items-stretch">
            {/* Primary shot: the full IDE */}
            <figure className="lg:col-span-3 group relative">
              <div className="absolute -inset-2 bg-gradient-to-r from-[#F26207]/20 to-[#F99D25]/20 blur-2xl rounded-2xl pointer-events-none" />
              <div className="relative rounded-xl overflow-hidden ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-2xl">
                <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#F26207]/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#F99D25]/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                  <span className="ml-2 text-[11px] sm:text-[13px] text-muted-foreground font-medium truncate">
                    E-Code Workspace
                  </span>
                </div>
                <img
                  src="/ecode-static/assets/product/ide.png"
                  alt="The E-Code IDE showing the AI Agent panel, code editor, file tree and live preview together in one workspace"
                  width={1440}
                  height={900}
                  loading="lazy"
                  className="block w-full h-auto"
                  data-testid="img-features-ide"
                />
              </div>
              <figcaption className="mt-3 flex items-start gap-2 text-[11px] sm:text-[13px] text-muted-foreground px-1">
                <LayoutDashboard className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#F26207] flex-shrink-0 mt-0.5" />
                <span>The E-Code IDE: agent, editor, files and preview in one workspace.</span>
              </figcaption>
            </figure>

            {/* Secondary shot: in-IDE deployments */}
            <figure className="lg:col-span-2 group relative">
              <div className="absolute -inset-2 bg-gradient-to-l from-[#F26207]/15 to-[#F99D25]/15 blur-2xl rounded-2xl pointer-events-none" />
              <div className="relative rounded-xl overflow-hidden ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-2xl">
                <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                  <Rocket className="h-3.5 w-3.5 text-[#F26207]" />
                  <span className="text-[11px] sm:text-[13px] text-muted-foreground font-medium truncate">
                    Deployments
                  </span>
                </div>
                <img
                  src="/ecode-static/assets/product/ide-deploy.png"
                  alt="The in-IDE Deployments panel where E-Code ships your project to production"
                  width={1440}
                  height={900}
                  loading="lazy"
                  className="block w-full h-auto"
                  data-testid="img-features-ide-deploy"
                />
              </div>
              <figcaption className="mt-3 flex items-start gap-2 text-[11px] sm:text-[13px] text-muted-foreground px-1">
                <Rocket className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#F26207] flex-shrink-0 mt-0.5" />
                <span>Ship to production without leaving the editor.</span>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-12 sm:py-16 md:py-20 px-4">
        <div className="container mx-auto max-w-7xl">
          <Tabs defaultValue="All" className="w-full">
            <TabsList className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 w-full max-w-3xl mx-auto gap-1 h-auto flex-wrap">
              {categories.map((category) => (
                <TabsTrigger
                  key={category}
                  value={category}
                  className="text-[11px] sm:text-[13px] min-h-[44px]"
                  data-testid={`tab-features-${category.toLowerCase()}`}
                >
                  {category}
                </TabsTrigger>
              ))}
            </TabsList>

            {categories.map((category) => {
              const visibleFeatures = filterFeaturesByCategory(features, category);

              return (
                <TabsContent key={category} value={category} className="mt-8 sm:mt-12">
                  {visibleFeatures.length === 0 ? (
                    <div
                      className="text-center py-12 sm:py-16 text-muted-foreground text-[13px] sm:text-[15px]"
                      data-testid="text-features-empty"
                    >
                      No features in this category yet. Check back soon.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
                      {visibleFeatures.map((feature, index) => (
                        <Card
                          key={index}
                          id={feature.id}
                          className="hover:shadow-lg transition-shadow"
                          data-testid={`card-feature-${feature.id || index}`}
                        >
                          <CardHeader className="p-4 sm:p-6">
                            <div className="flex items-center justify-center p-2 sm:p-3 bg-bolt-elements-background-depth-3 text-[#F26207] ring-1 ring-[#F26207]/30 rounded-lg w-fit mb-3 sm:mb-4">
                              {feature.icon}
                            </div>
                            <CardTitle className="mkt-h3">{feature.title}</CardTitle>
                            <CardDescription className="mkt-small">{feature.description}</CardDescription>
                          </CardHeader>
                          <CardContent className="p-4 sm:p-6 pt-0">
                            <ul className="space-y-1.5 sm:space-y-2">
                              {feature.details.map((detail, i) => (
                                <li key={i} className="flex items-start gap-2 text-[11px] sm:text-[13px]">
                                  <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 text-[#F26207] flex-shrink-0 mt-0.5" />
                                  <span>{detail}</span>
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      </section>

      {/* Platform Overview */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="secondary" className="mb-4">
                <Layers className="h-3 w-3 mr-1" />
                Complete Platform
              </Badge>
              <h2 className="mkt-h2 font-bold mb-4">Everything works together seamlessly</h2>
              <p className="mkt-body text-muted-foreground mb-6">
                Our integrated platform means you spend less time configuring and more time building. Everything from
                development to deployment is designed to work together perfectly.
              </p>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-bolt-elements-background-depth-3 ring-1 ring-[#F26207]/30 rounded">
                    <Cpu className="h-5 w-5 text-[#F26207]" />
                  </div>
                  <div>
                    <h3 className="mkt-h3 font-semibold" data-testid="text-feature-overview-environments">
                      Instant Environments
                    </h3>
                    <p className="mkt-small text-muted-foreground">
                      Spin up development environments in seconds, not hours
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-bolt-elements-background-depth-3 ring-1 ring-[#F26207]/30 rounded">
                    <Network className="h-5 w-5 text-[#F26207]" />
                  </div>
                  <div>
                    <h3 className="mkt-h3 font-semibold" data-testid="text-feature-overview-ecosystem">
                      Connected Ecosystem
                    </h3>
                    <p className="mkt-small text-muted-foreground">
                      All tools and services work together out of the box
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-bolt-elements-background-depth-3 ring-1 ring-[#F26207]/30 rounded">
                    <Settings2 className="h-5 w-5 text-[#F26207]" />
                  </div>
                  <div>
                    <h3 className="mkt-h3 font-semibold" data-testid="text-feature-overview-config">
                      Zero Configuration
                    </h3>
                    <p className="mkt-small text-muted-foreground">Focus on coding, we handle the infrastructure</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-[#F26207]/20 to-[#F99D25]/20 blur-3xl" />
              <Card className="relative">
                <CardContent className="p-8">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                      <Code className="h-8 w-8 text-primary" />
                      <div>
                        <p className="font-semibold">Write Code</p>
                        <p className="mkt-small text-muted-foreground">In any language</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                      <Users className="h-8 w-8 text-primary" />
                      <div>
                        <p className="font-semibold">Collaborate</p>
                        <p className="mkt-small text-muted-foreground">In real-time</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                      <Rocket className="h-8 w-8 text-primary" />
                      <div>
                        <p className="font-semibold">Deploy</p>
                        <p className="mkt-small text-muted-foreground">With one click</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="mkt-h2 font-bold mb-4">Experience the future of development</h2>
          <p className="mkt-body text-muted-foreground mb-8">
            Join developers worldwide who are building faster with E-Code
          </p>
          <div className="flex gap-4 justify-center">
            <Button
              size="lg"
              onClick={() => navigate(user ? '/dashboard' : '/login')}
              data-testid="button-features-get-started"
            >
              Get started free
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate('/contact-sales')}
              data-testid="button-features-contact-sales"
            >
              Contact sales
            </Button>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
