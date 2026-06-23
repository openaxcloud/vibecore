import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowRight,
  Brain,
  CheckCircle,
  Code2,
  Eye,
  FileSearch,
  Globe,
  Languages,
  MessageSquare,
  Package,
  Pause,
  Play,
  Rocket,
  Search,
  Shield,
  Sparkles,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import { useRef, useState } from 'react';
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
  LazyMotionDiv,
  Link,
  Spinner,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import { resolveSeekTime } from '~/components/marketing/ecode-exact/pages/ai-demo-seek';

type FeatureKey = 'autonomous' | 'multilingual' | 'intelligent' | 'realtime';

interface AIData {
  features?: Record<
    FeatureKey,
    {
      title?: string;
      description?: string;
      icon?: string;
      details?: string[];
    }
  >;
  useCases?: Array<{
    title?: string;
    description?: string;
    icon?: string;
    example?: string;
  }>;
  aiTools?: Array<{
    name?: string;
    icon?: string;
    description?: string;
  }>;
}

export default function AI() {
  const [selectedFeature, setSelectedFeature] = useState<FeatureKey>('autonomous');

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleVideoToggle = () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (video.paused) {
      void video.play();
      setIsVideoPlaying(true);
    } else {
      video.pause();
      setIsVideoPlaying(false);
    }
  };

  const handleVideoPause = () => setIsVideoPlaying(false);
  const handleVideoPlay = () => setIsVideoPlaying(true);

  const handleSeekTo = (position: number) => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (video.scrollIntoView) {
      video.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    const seekAndPlay = () => {
      // Clamp against the real, loaded duration so cues never overshoot the clip.
      video.currentTime = resolveSeekTime(position, video.duration);
      void video.play();
      setIsVideoPlaying(true);
    };

    /*
     * HAVE_METADATA (1) or greater means duration is known and seeking will
     * actually take effect. Before that, setting currentTime is silently
     * ignored, so defer the seek to a one-time loadedmetadata handler — that
     * makes the very first click jump instead of just playing from 0.
     */
    if (video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) {
      seekAndPlay();
    } else {
      video.addEventListener('loadedmetadata', seekAndPlay, { once: true });

      // Kick off loading so metadata arrives even though the element has no preload.
      video.load();
    }
  };

  const [aiData] = useState<AIData | undefined>(undefined);
  const isLoading = false;

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <PublicNavbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Spinner size="lg" className="mb-4" />
            <p className="text-muted-foreground">Loading AI features...</p>
          </div>
        </div>
        <PublicFooter />
      </div>
    );
  }

  // Icon mapping for features
  const featureIconMap: Record<string, LucideIcon> = {
    Brain,
    Languages,
    Code2,
    Zap,
  };

  // Icon mapping for use cases
  const useCaseIconMap: Record<string, LucideIcon> = {
    Users,
    Rocket,
    Brain,
    Shield,
  };

  // Icon mapping for AI tools
  const toolIconMap: Record<string, LucideIcon> = {
    Search,
    Eye,
    FileSearch,
    Activity,
    Package,
    Wrench,
  };

  // Use fallback data if API fails
  const features: Record<
    FeatureKey,
    {
      title: string;
      description: string;
      icon: LucideIcon;
      details: string[];
    }
  > = {
    autonomous: {
      title: 'Autonomous Building',
      description: 'Just describe what you want. Our AI agent builds complete applications from scratch.',
      icon: Brain,
      details: [
        'Understands natural language in any language',
        'Generates entire project structures automatically',
        'Creates all necessary files and configurations',
        'Installs dependencies and sets up environments',
        'Deploys instantly with one click',
      ],
    },
    multilingual: {
      title: 'Any Language Support',
      description: 'Communicate in your native language. Our AI understands and responds in over 100 languages.',
      icon: Languages,
      details: [
        'Describe your ideas in any language',
        'Get responses in your preferred language',
        'Code comments in your language',
        'Documentation automatically translated',
        'Global accessibility for all developers',
      ],
    },
    intelligent: {
      title: 'Intelligent Code Generation',
      description: 'AI that writes production-ready code following best practices and modern standards.',
      icon: Code2,
      details: [
        'Clean, maintainable code structure',
        'Follows language-specific conventions',
        'Implements error handling automatically',
        'Optimizes for performance',
        'Adds helpful comments and documentation',
      ],
    },
    realtime: {
      title: 'Real-time Assistance',
      description: 'Get instant help while coding. AI watches your code and provides suggestions as you type.',
      icon: Zap,
      details: [
        'Live code suggestions and completions',
        'Instant error detection and fixes',
        'Real-time optimization recommendations',
        'Context-aware assistance',
        'Learn as you code with explanations',
      ],
    },
  };

  // Transform API data with proper icons
  const transformedFeatures = aiData?.features
    ? Object.entries(aiData.features).reduce(
        (acc, [key, feature]) => {
          if (!feature || typeof feature !== 'object') {
            return acc;
          }

          const iconName = typeof feature.icon === 'string' ? feature.icon : '';
          const IconComponent = featureIconMap[iconName] || Brain;
          const details = Array.isArray(feature.details) ? feature.details : [];

          if (!(key in acc)) {
            return acc;
          }

          return {
            ...acc,
            [key]: {
              ...feature,
              icon: IconComponent,
              details,
            },
          };
        },
        { ...features },
      )
    : features;

  const useCases =
    Array.isArray(aiData?.useCases) && aiData.useCases.length
      ? aiData.useCases
          .filter((useCase) => useCase && typeof useCase === 'object')
          .map((useCase) => {
            const iconName = typeof useCase.icon === 'string' ? useCase.icon : '';
            return {
              ...useCase,
              icon: useCaseIconMap[iconName] || Users,
            };
          })
      : [
          {
            title: 'Complete Beginners',
            description: 'Never coded before? Describe your app idea and watch it come to life.',
            icon: Users,
            example: '"I want a website to track my daily habits with graphs"',
          },
          {
            title: 'Rapid Prototyping',
            description: 'Build MVPs and prototypes in minutes instead of days.',
            icon: Rocket,
            example: '"Create a marketplace for selling handmade crafts"',
          },
          {
            title: 'Learning Projects',
            description: 'Learn by building. AI explains every line of code it generates.',
            icon: Brain,
            example: '"Build a game like Tetris and explain how it works"',
          },
          {
            title: 'Business Solutions',
            description: 'Create internal tools and business applications without a dev team.',
            icon: Shield,
            example: '"Make a dashboard to track our sales and inventory"',
          },
        ];

  const aiTools =
    Array.isArray(aiData?.aiTools) && aiData.aiTools.length
      ? aiData.aiTools
          .filter((tool) => tool && typeof tool === 'object')
          .map((tool) => {
            const iconName = typeof tool.icon === 'string' ? tool.icon : '';
            return {
              ...tool,
              icon: toolIconMap[iconName] || Wrench,
            };
          })
      : [
          { name: 'Web Search', icon: Search, description: 'Find real-time information' },
          { name: 'Visual Editor', icon: Eye, description: 'Draw designs to convert to code' },
          { name: 'Code Analysis', icon: FileSearch, description: 'Understand existing code' },
          { name: 'Performance', icon: Activity, description: 'Optimize for speed' },
          { name: 'Package Manager', icon: Package, description: 'Install any dependency' },
          { name: 'Debug Assistant', icon: Wrench, description: 'Fix issues instantly' },
        ];

  const stats = [
    { value: '100K+', label: 'Apps Built' },
    { value: '<60s', label: 'Average Build Time' },
    { value: '100+', label: 'Languages Supported' },
    { value: '99.9%', label: 'Success Rate' },
  ];

  /*
   * All three cards jump into the SAME shared platform demo clip, so each one
   * is a chapter expressed as a fraction (0..1) of the real video. The concrete
   * timestamp is resolved from the loaded video duration at click time, which
   * keeps cues in-bounds regardless of the asset's actual length.
   */
  const demoHighlights = [
    {
      title: 'Scaffolding the app',
      description: 'Watch the AI agent plan the build and generate a production-ready project structure',
      icon: Rocket,
      position: 0,
    },
    {
      title: 'Wiring the dashboard',
      description: 'The agent assembles a full analytics dashboard with real-time data visualization',
      icon: Users,
      position: 1 / 3,
    },
    {
      title: 'Shipping to the cloud',
      description: 'Infrastructure is configured and the app is deployed with a single click',
      icon: Globe,
      position: 2 / 3,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar />

      {/* Hero Section - Fortune 500 Style */}
      <section className="relative min-h-[60vh] md:min-h-[80vh] flex items-center overflow-hidden bg-gradient-to-b from-background to-muted/20 py-16 md:py-0">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
          <div className="absolute inset-0 bg-grid-pattern opacity-5" />
        </div>

        <div className="container-responsive relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <LazyMotionDiv
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <Badge variant="default" className="mb-6 text-[13px] px-4 py-1.5 bg-primary/90">
                <Sparkles className="h-4 w-4 mr-1" />
                POWERED BY E-CODE.AI
              </Badge>

              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 tracking-tight">
                Enterprise AI That
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-primary via-primary/80 to-primary/60">
                  Builds Applications
                </span>
              </h1>

              <p className="text-xl md:text-2xl text-muted-foreground mb-8 leading-relaxed max-w-2xl">
                Transform ideas into production-ready applications in minutes. Our AI understands 100+ languages and
                writes professional code automatically.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-12">
                <Button
                  size="lg"
                  asChild
                  className="text-[15px] px-8 h-14 shadow-lg hover:shadow-xl transition-shadow"
                  data-testid="button-start-building"
                >
                  <Link href="/ai-agent">
                    Start Building Now
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="text-[15px] px-8 h-14"
                  data-testid="button-watch-demo"
                >
                  <a href="#demo-video" className="scroll-smooth">
                    Watch Demo
                  </a>
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {stats.map((stat) => (
                  <div key={stat.label} className="text-center">
                    <div className="text-3xl md:text-4xl font-bold text-primary">{stat.value}</div>
                    <div className="text-[13px] text-muted-foreground font-medium">{stat.label}</div>
                  </div>
                ))}
              </div>
            </LazyMotionDiv>

            <LazyMotionDiv
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative hidden md:block"
            >
              <div className="relative aspect-[4/3] md:aspect-video rounded-3xl overflow-hidden shadow-2xl border bg-background">
                <video
                  className="h-full w-full object-cover"
                  muted
                  loop
                  autoPlay
                  playsInline
                  poster="/assets/hero-image.svg"
                >
                  <source src="/assets/platform-demo.mp4" type="video/mp4" />
                </video>
                <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-transparent to-transparent" />
                <div className="absolute inset-0 flex flex-col justify-end bg-black/20 p-6 text-white">
                  <p className="text-[13px] font-medium uppercase tracking-widest text-white/70">Live preview</p>
                  <p className="text-xl font-semibold">AI agent assembling a production-ready dashboard</p>
                </div>
              </div>
              <div className="absolute -bottom-6 -right-6 w-48 h-48 bg-primary/10 rounded-full blur-3xl" />
              <div className="absolute -top-6 -left-6 w-48 h-48 bg-primary/10 rounded-full blur-3xl" />
            </LazyMotionDiv>
          </div>
        </div>
      </section>

      {/* Video Demo Section */}
      <section id="demo-video" className="py-20 bg-gradient-to-b from-muted/20 to-background">
        <div className="container-responsive">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">See AI in Action</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Watch how Fortune 500 companies are building applications 10x faster with our AI technology
            </p>
          </div>

          <div className="max-w-6xl mx-auto">
            <LazyMotionDiv
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="relative aspect-video rounded-3xl overflow-hidden shadow-2xl border bg-muted"
            >
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                controls
                playsInline
                poster="/assets/hero-image.svg"
                onPlay={handleVideoPlay}
                onPause={handleVideoPause}
                onEnded={handleVideoPause}
              >
                <source src="/assets/platform-demo.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/60 pointer-events-none" />
              <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-6 lg:p-10 pointer-events-none text-white">
                <div className="space-y-3 max-w-xl">
                  <Badge
                    variant="secondary"
                    className="w-fit bg-white/20 text-white backdrop-blur border border-white/30"
                  >
                    Live Platform Demo
                  </Badge>
                  <h3 className="text-2xl sm:text-3xl font-semibold leading-snug">
                    From prompt to production in under two minutes
                  </h3>
                  <p className="text-[13px] sm:text-base text-white/80">
                    Follow along as the AI agent scaffolds a SaaS dashboard, configures infrastructure, and ships to the
                    cloud.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-[13px] font-medium">
                  <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-3 py-2">
                    <CheckCircle className="h-4 w-4 text-emerald-300 flex-shrink-0" />
                    <span>Multi-step planning</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-3 py-2">
                    <CheckCircle className="h-4 w-4 text-emerald-300 flex-shrink-0" />
                    <span>Automated code reviews</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-3 py-2 sm:col-span-2 lg:col-span-1">
                    <CheckCircle className="h-4 w-4 text-emerald-300 flex-shrink-0" />
                    <span>1-click deployment</span>
                  </div>
                </div>
              </div>
              <div
                className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
                  isVideoPlaying ? 'pointer-events-none opacity-0' : 'opacity-100'
                }`}
              >
                <Button
                  variant="secondary"
                  size="lg"
                  className={`pointer-events-auto gap-2 px-6 py-3 font-semibold shadow-xl transition hover:shadow-2xl ${
                    isVideoPlaying
                      ? 'bg-white/20 text-white hover:bg-white/30'
                      : 'bg-white text-primary hover:bg-white/90'
                  }`}
                  onClick={handleVideoToggle}
                  aria-label={isVideoPlaying ? 'Pause demo video' : 'Play demo video'}
                  data-testid="button-video-toggle"
                >
                  {isVideoPlaying ? (
                    <>
                      <Pause className="h-5 w-5" />
                      Pause Demo
                    </>
                  ) : (
                    <>
                      <Play className="h-5 w-5" />
                      Play Demo
                    </>
                  )}
                </Button>
              </div>
            </LazyMotionDiv>

            <div className="grid gap-4 mt-12 sm:grid-cols-2 xl:grid-cols-3">
              {demoHighlights.map((highlight) => {
                const Icon = highlight.icon;
                return (
                  <Card
                    key={highlight.title}
                    className="group hover:shadow-xl transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={() => handleSeekTo(highlight.position)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Jump to ${highlight.title} in the demo`}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleSeekTo(highlight.position);
                      }
                    }}
                  >
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <CardTitle className="text-[15px]">{highlight.title}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground text-[13px]">{highlight.description}</p>
                      <div className="mt-3 text-[11px] text-muted-foreground">Jump to this chapter</div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-muted/30">
        <div className="container-responsive">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How Our AI Agent Works</h2>
            <p className="text-[15px] text-muted-foreground max-w-2xl mx-auto">
              From idea to deployed app in three simple steps
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center text-white">
                <MessageSquare className="h-10 w-10" />
              </div>
              <h3 className="text-xl font-semibold mb-2">1. Describe Your Idea</h3>
              <p className="text-muted-foreground">
                Tell our AI what you want to build in plain language - any language you prefer.
              </p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-fuchsia-500 to-orange-500 rounded-2xl flex items-center justify-center text-white">
                <Brain className="h-10 w-10" />
              </div>
              <h3 className="text-xl font-semibold mb-2">2. AI Builds Everything</h3>
              <p className="text-muted-foreground">
                Watch as AI creates files, writes code, and sets up your entire project automatically.
              </p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl flex items-center justify-center text-white">
                <Globe className="h-10 w-10" />
              </div>
              <h3 className="text-xl font-semibold mb-2">3. Deploy Instantly</h3>
              <p className="text-muted-foreground">
                Your app is live and shareable immediately. No configuration or setup needed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Deep Dive */}
      <section className="py-20">
        <div className="container-responsive">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">AI Agent Capabilities</h2>
            <p className="text-[15px] text-muted-foreground">Powerful features that make building effortless</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-start max-w-6xl mx-auto">
            <div className="space-y-4">
              {Object.entries(transformedFeatures).map(([key, feature]) => {
                const Icon = feature.icon;
                return (
                  <Card
                    key={key}
                    className={`cursor-pointer transition-all ${
                      selectedFeature === key ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-md'
                    }`}
                    onClick={() => setSelectedFeature(key as FeatureKey)}
                    data-testid={`card-feature-${key}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-[15px]">{feature.title}</CardTitle>
                          <CardDescription className="mt-1">{feature.description}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>

            <div className="sticky top-8">
              <Card className="bg-muted/50">
                <CardHeader>
                  <CardTitle>{transformedFeatures[selectedFeature].title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {transformedFeatures[selectedFeature].details.map((detail, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* AI Tools */}
      <section className="py-20 bg-muted/30">
        <div className="container-responsive">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">AI-Powered Tools</h2>
            <p className="text-[15px] text-muted-foreground max-w-2xl mx-auto">
              Advanced capabilities that help AI build better applications
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {aiTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Card
                  key={tool.name}
                  className="text-center hover:shadow-lg transition-all"
                  data-testid={`card-tool-${tool.name?.replace(/\s+/g, '-').toLowerCase()}`}
                >
                  <CardContent className="pt-6">
                    <div className="w-12 h-12 mx-auto mb-3 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-1">{tool.name}</h3>
                    <p className="text-[13px] text-muted-foreground">{tool.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-20">
        <div className="container-responsive">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Who Uses Our AI Agent?</h2>
            <p className="text-[15px] text-muted-foreground">From complete beginners to experienced developers</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {useCases.map((useCase) => {
              const Icon = useCase.icon;
              return (
                <Card
                  key={useCase.title}
                  className="hover:shadow-lg transition-all"
                  data-testid={`card-usecase-${useCase.title?.replace(/\s+/g, '-').toLowerCase()}`}
                >
                  <CardHeader>
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-primary/10 rounded-lg">
                        <Icon className="h-8 w-8 text-primary" />
                      </div>
                      <div className="flex-1">
                        <CardTitle>{useCase.title}</CardTitle>
                        <CardDescription className="mt-2">{useCase.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted rounded-lg p-4">
                      <p className="text-[13px] font-mono">{useCase.example}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Live Demo */}
      <section className="py-20 bg-gradient-to-b from-muted/30 to-background">
        <div className="container-responsive">
          <Card className="max-w-4xl mx-auto overflow-hidden">
            <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold mb-2">Try AI Agent Now</h2>
                  <p className="opacity-90">See how easy it is to build your first app</p>
                </div>
                <Sparkles className="h-12 w-12 opacity-20" />
              </div>
            </div>
            <CardContent className="p-8">
              <div className="space-y-6">
                <div className="bg-muted rounded-lg p-4">
                  <p className="text-[13px] text-muted-foreground mb-2">Example prompts to try:</p>
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      asChild
                      data-testid="button-prompt-portfolio"
                    >
                      <Link href="/agent?prompt=Build a personal portfolio website with dark mode">
                        "Build a personal portfolio website with dark mode"
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      asChild
                      data-testid="button-prompt-quiz"
                    >
                      <Link href="/agent?prompt=Create a quiz app with score tracking">
                        "Create a quiz app with score tracking"
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      asChild
                      data-testid="button-prompt-chinese"
                    >
                      <Link href="/agent?prompt=做一个待办事项应用">"做一个待办事项应用" (Chinese)</Link>
                    </Button>
                  </div>
                </div>
                <Button size="lg" className="w-full" asChild data-testid="button-open-agent">
                  <Link href="/agent">
                    Open AI Agent
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container-responsive">
          <div className="text-center max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Start Building Today</h2>
            <p className="text-[15px] text-muted-foreground mb-8">
              No credit card required. Build unlimited apps with our free tier.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild data-testid="button-get-started-free">
                <Link href="/signup">Get Started Free</Link>
              </Button>
              <Button size="lg" variant="outline" asChild data-testid="button-view-pricing">
                <Link href="/pricing">View Pricing</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
