import {
  ArrowRight,
  Brain,
  CheckCircle,
  Code,
  Cpu,
  Database,
  FileCode,
  Globe,
  MessageSquare,
  Package,
  PlayCircle,
  Rocket,
  Settings,
  Shield,
  Sparkles,
  Star,
  Timer,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  Badge,
  BRAND,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LazyMotionDiv,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useMarketingNavigate,
  usePublicAuth,
} from '~/components/marketing/ecode-exact/EcodeExactUi';

export default function AiAgent() {
  const navigate = useMarketingNavigate();
  const { user } = usePublicAuth();

  // Rediriger les utilisateurs connectés vers le dashboard
  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const handleGetStarted = () => {
    if (!user) {
      navigate('/login?redirect=/dashboard');
    } else {
      navigate('/dashboard');
    }
  };

  const trailerSegments = [
    {
      id: 'idea-to-app',
      title: 'Idea to App in 60 Seconds',
      description: 'Follow the E-Code Agent 2.0 as it transforms a plain-text idea into a production-ready interface.',
      timestamp: '00:00',
      videoSrc: '/assets/platform-demo.mp4',
      poster: BRAND.assets.heroImage,
    },
    {
      id: 'api-integrations',
      title: 'Instant API Integrations',
      description: 'See how the agent wires databases and APIs without manual setup or configuration.',
      timestamp: '00:28',
      videoSrc: '/assets/platform-demo.mp4#t=28',
      poster: BRAND.assets.heroImage,
    },
    {
      id: 'responsive-design',
      title: 'Responsive UI Autodesign',
      description: 'Watch responsive breakpoints, theming, and accessibility come together automatically.',
      timestamp: '00:46',
      videoSrc: '/assets/platform-demo.mp4#t=46',
      poster: BRAND.assets.heroImage,
    },
  ];

  const [selectedSegment, setSelectedSegment] = useState(trailerSegments[0]);

  const heroMedia = {
    videoSrc: '/assets/platform-demo.mp4',
    poster: BRAND.assets.heroImage,
  };

  const quickReels = [
    {
      id: 'multilingual',
      title: 'Multilingual Demo',
      description: 'Prompting and building entirely in Japanese.',
      icon: Globe,
      timestamp: '00:12',
      videoSrc: '/assets/platform-demo.mp4#t=12',
      poster: heroMedia.poster,
    },
    {
      id: 'database',
      title: 'Database Integration',
      description: 'Automatic PostgreSQL schema and seed data.',
      icon: Database,
      timestamp: '00:32',
      videoSrc: '/assets/platform-demo.mp4#t=32',
      poster: heroMedia.poster,
    },
    {
      id: 'security',
      title: 'Auth & Security',
      description: 'Passwordless login and audit logging in seconds.',
      icon: Shield,
      timestamp: '00:44',
      videoSrc: '/assets/platform-demo.mp4#t=44',
      poster: heroMedia.poster,
    },
    {
      id: 'deployment',
      title: 'Instant Deploy',
      description: 'Pushes live to the cloud with monitoring.',
      icon: Rocket,
      timestamp: '00:58',
      videoSrc: '/assets/platform-demo.mp4#t=58',
      poster: heroMedia.poster,
    },
  ];

  const capabilities = [
    {
      title: 'Natural Language Understanding',
      description: 'Just tell it what you want in any language',
      examples: [
        '"Build a todo app with dark mode"',
        '"Create a portfolio website with animations"',
        '"Make a chat app with real-time messages"',
        '"Build an e-commerce store with cart"',
      ],
    },
    {
      title: 'Complete Project Generation',
      description: 'Creates entire project structures automatically',
      examples: [
        'Generates all necessary files and folders',
        'Sets up proper project configuration',
        'Installs required dependencies',
        'Creates responsive layouts',
      ],
    },
    {
      title: 'Smart Code Decisions',
      description: 'Makes intelligent architectural choices',
      examples: [
        'Chooses the right framework for your needs',
        'Implements best practices automatically',
        'Adds error handling and validation',
        'Optimizes for performance',
      ],
    },
    {
      title: 'Continuous Improvement',
      description: 'Refines and updates based on feedback',
      examples: [
        '"Add a search feature to the app"',
        '"Make the design more colorful"',
        '"Add user authentication"',
        '"Connect it to a database"',
      ],
    },
  ];

  const useCases = [
    {
      category: 'Business',
      apps: [
        { name: 'Landing Pages', time: '30s', icon: <Globe className="h-4 w-4" /> },
        { name: 'Contact Forms', time: '20s', icon: <MessageSquare className="h-4 w-4" /> },
        { name: 'Admin Dashboards', time: '45s', icon: <Settings className="h-4 w-4" /> },
        { name: 'Analytics Tools', time: '40s', icon: <TrendingUp className="h-4 w-4" /> },
      ],
    },
    {
      category: 'Personal',
      apps: [
        { name: 'Portfolio Sites', time: '35s', icon: <Star className="h-4 w-4" /> },
        { name: 'Blogs', time: '25s', icon: <FileCode className="h-4 w-4" /> },
        { name: 'Task Managers', time: '30s', icon: <CheckCircle className="h-4 w-4" /> },
        { name: 'Budget Trackers', time: '35s', icon: <Database className="h-4 w-4" /> },
      ],
    },
    {
      category: 'Education',
      apps: [
        { name: 'Quiz Apps', time: '40s', icon: <Brain className="h-4 w-4" /> },
        { name: 'Flashcards', time: '25s', icon: <Package className="h-4 w-4" /> },
        { name: 'Study Timers', time: '20s', icon: <Timer className="h-4 w-4" /> },
        { name: 'Note Takers', time: '30s', icon: <FileCode className="h-4 w-4" /> },
      ],
    },
    {
      category: 'Games',
      apps: [
        { name: 'Memory Games', time: '35s', icon: <Brain className="h-4 w-4" /> },
        { name: 'Puzzle Games', time: '40s', icon: <Cpu className="h-4 w-4" /> },
        { name: 'Word Games', time: '30s', icon: <MessageSquare className="h-4 w-4" /> },
        { name: 'Drawing Apps', time: '45s', icon: <Star className="h-4 w-4" /> },
      ],
    },
  ];

  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="min-h-screen flex flex-col">
      <PublicNavbar />

      <main className="flex-1">
        {/* Hero Section - Fortune 500 Style */}
        <section className="relative min-h-[85vh] flex items-center overflow-hidden bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950 dark:to-gray-950">
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
            <div className="absolute inset-0 bg-grid-pattern opacity-[0.02]" />
          </div>

          <div className="container-responsive max-w-7xl relative">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div className="text-center lg:text-left">
                <Badge
                  variant="default"
                  className="mb-6 text-[13px] px-5 py-2 bg-gradient-to-r from-primary to-primary/80 text-white"
                >
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  E-CODE AGENT 2.0 POWERED
                </Badge>

                <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
                  AI Agent v2
                  <span className="block text-4xl md:text-5xl lg:text-6xl mt-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                    Build Apps with Natural Language
                  </span>
                </h1>

                <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-2xl mx-auto lg:mx-0">
                  Describe your idea. Watch it build. Deploy instantly. No coding required—our AI handles everything.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-8">
                  <Button
                    size="lg"
                    onClick={handleGetStarted}
                    className="text-[15px] px-8 h-14 shadow-lg hover:shadow-xl transition-all bg-gradient-to-r from-primary to-primary/90"
                  >
                    Launch Agent Studio
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                  <Button size="lg" variant="outline" className="text-[15px] px-8 h-14" asChild>
                    <a href="#agent-demo">
                      Watch Live Demo
                      <PlayCircle className="ml-2 h-5 w-5" />
                    </a>
                  </Button>
                </div>

                <div className="flex flex-wrap gap-6 justify-center lg:justify-start text-[13px] text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>No credit card required</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>100+ languages supported</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Deploy in one click</span>
                  </div>
                </div>
              </div>

              <div className="relative">
                <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl border bg-slate-900">
                  <video
                    key={heroMedia.videoSrc}
                    className="absolute inset-0 h-full w-full object-cover"
                    src={heroMedia.videoSrc}
                    poster={heroMedia.poster}
                    autoPlay
                    loop
                    muted
                    playsInline
                    aria-label="E-Code Agent 2.0 building an application from an idea"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-900/40 to-transparent" />
                  <div className="absolute bottom-6 left-6 right-6 flex flex-col gap-3 text-left">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-[11px] font-semibold text-white backdrop-blur">
                      <PlayCircle className="h-4 w-4" />
                      Trailer: E-Code Agent 2.0 builds a marketplace in minutes
                    </div>
                    <p className="text-[15px] font-semibold text-white drop-shadow">
                      Witness idea-to-deployment in a single take—captured directly from the live platform.
                    </p>
                    <div className="flex flex-wrap gap-3 text-[13px] text-white/80">
                      <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-3 py-1">
                        <Timer className="h-4 w-4" />
                        1:12 total runtime
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-3 py-1">
                        <Sparkles className="h-4 w-4" />
                        Full-stack build with UI + API
                      </span>
                    </div>
                  </div>
                </div>
                <div className="absolute -z-10 -top-10 -right-10 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
                <div className="absolute -z-10 -bottom-10 -left-10 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 bg-muted/30">
          <div className="container-responsive max-w-6xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Building apps is now as easy as having a conversation
              </h2>
              <p className="text-[15px] text-muted-foreground">Just describe what you want. Watch it come to life.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 mb-12">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                  <MessageSquare className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">1. Describe Your Idea</h3>
                <p className="text-muted-foreground">
                  Describe what you want in any language. "Build me a recipe app with search and favorites"
                </p>
              </div>

              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">2. AI Builds Everything</h3>
                <p className="text-muted-foreground">
                  Watch as the AI creates files, writes code, and sets up your entire project
                </p>
              </div>

              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                  <Rocket className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">3. Your App is Ready</h3>
                <p className="text-muted-foreground">
                  In under a minute, your app is running and ready to share with the world
                </p>
              </div>
            </div>

            {/* Live Demo */}
            <Card className="overflow-hidden max-w-4xl mx-auto">
              <CardHeader className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3 text-left">
                    <Sparkles className="mt-1 h-6 w-6" />
                    <div>
                      <CardTitle>E-Code Agent 2.0: Idea-to-App Trailer</CardTitle>
                      <CardDescription className="text-white/80">
                        Experience the full build of a customer feedback portal from prompt to deployment.
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary" className="self-start bg-white/20 text-white md:self-center">
                    <Timer className="h-3 w-3 mr-1" />
                    1:12
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 bg-black">
                <div className="relative aspect-video w-full">
                  <video
                    key="primary-trailer"
                    className="h-full w-full object-cover"
                    src="/assets/platform-demo.mp4"
                    poster={BRAND.assets.heroImage}
                    controls
                    preload="metadata"
                    playsInline
                    aria-label="E-Code Agent 2.0 builds a customer feedback portal"
                  />
                </div>
                <div className="space-y-2 px-6 py-6 text-[13px] text-muted-foreground md:flex md:items-center md:justify-between md:gap-6">
                  <p className="md:max-w-2xl">
                    The trailer showcases the agent drafting requirements, generating UI layouts, provisioning backend
                    services, and publishing the finished app—all without a single manual command.
                  </p>
                  <Button size="sm" variant="secondary" className="mt-4 md:mt-0" asChild>
                    <a href="#agent-demo">Watch detailed breakdown</a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Video Demo Section */}
        <section id="agent-demo" className="py-20 bg-gradient-to-b from-background to-muted/20">
          <div className="container-responsive max-w-7xl">
            <div className="text-center mb-12">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">Watch AI Agent v2 in Action</h2>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                Real-time demonstrations of AI building production-ready applications from natural language
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-8 mb-12">
              <LazyMotionDiv
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="lg:col-span-2"
              >
                <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl border bg-slate-900">
                  <video
                    key={selectedSegment.id}
                    className="absolute inset-0 h-full w-full object-cover"
                    src={selectedSegment.videoSrc}
                    poster={selectedSegment.poster}
                    controls
                    preload="metadata"
                    playsInline
                    aria-label={`${selectedSegment.title} — ${selectedSegment.description}`}
                  />
                  <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 via-black/20 to-transparent px-6 py-4 text-[11px] text-white">
                    <span className="inline-flex items-center gap-2 font-semibold uppercase tracking-wide">
                      <PlayCircle className="h-4 w-4" /> Segment {selectedSegment.timestamp}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1">
                      <Sparkles className="h-3 w-3" /> Recorded in the live studio
                    </span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-6 text-white">
                    <h3 className="text-[15px] font-semibold">{selectedSegment.title}</h3>
                    <p className="text-[13px] text-white/80">{selectedSegment.description}</p>
                  </div>
                </div>
              </LazyMotionDiv>

              <LazyMotionDiv
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="space-y-4"
              >
                <Card className="hover:shadow-lg transition-all">
                  <CardHeader>
                    <CardTitle className="text-[15px]">Featured Demos</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {trailerSegments.map((segment) => (
                      <button
                        key={segment.id}
                        type="button"
                        onClick={() => setSelectedSegment(segment)}
                        className={`w-full text-left p-3 rounded-lg transition-colors group ${
                          selectedSegment.id === segment.id
                            ? 'bg-muted border border-primary/40 shadow-sm'
                            : 'hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={BRAND.assets.aiAvatar}
                            alt="E-Code Agent avatar"
                            className="h-10 w-10 rounded-lg border object-cover"
                            loading="lazy"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <Timer className="h-3 w-3 text-primary" />
                                {segment.timestamp}
                              </span>
                              {selectedSegment.id === segment.id && (
                                <span className="inline-flex items-center gap-1 text-primary">
                                  <PlayCircle className="h-3 w-3" />
                                  Now playing
                                </span>
                              )}
                            </div>
                            <p className="font-medium">{segment.title}</p>
                            <p className="text-[13px] text-muted-foreground">{segment.description}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </CardContent>
                </Card>

                <Card className="bg-primary/5 border-primary/20">
                  <CardHeader>
                    <CardTitle className="text-[15px] flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Live Demo Stats
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 text-[13px]">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Average Build Time</span>
                        <span className="font-semibold">47 seconds</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Lines of Code Generated</span>
                        <span className="font-semibold">1,247</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Files Created</span>
                        <span className="font-semibold">23</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Success Rate</span>
                        <span className="font-semibold text-green-600">99.7%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </LazyMotionDiv>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {quickReels.map((reel, index) => {
                const Icon = reel.icon;
                return (
                  <div
                    key={reel.id}
                    className="animate-slide-in-up opacity-0"
                    style={{ animationDelay: `${100 * (index + 1)}ms`, animationFillMode: 'forwards' }}
                  >
                    <Card className="group hover:shadow-lg transition-all cursor-pointer">
                      <CardHeader className="pb-3">
                        <Icon className="h-8 w-8 text-primary mb-2" />
                        <CardTitle className="text-base">{reel.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="relative overflow-hidden rounded-lg border">
                          <video
                            className="h-28 w-full object-cover"
                            src={reel.videoSrc}
                            poster={reel.poster}
                            autoPlay
                            muted
                            loop
                            playsInline
                          />
                          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                            <Timer className="h-3 w-3" /> {reel.timestamp}
                          </span>
                        </div>
                        <p className="text-[13px] text-muted-foreground">{reel.description}</p>
                        <p className="text-[11px] font-semibold text-primary">Watch Now →</p>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Capabilities Tabs */}
        <section className="py-20">
          <div className="container-responsive max-w-6xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">More than just code generation</h2>
              <p className="text-[15px] text-muted-foreground">
                A complete development partner that thinks, designs, and builds
              </p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 gap-2 mb-8 sm:grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
                <TabsTrigger value="examples">Examples</TabsTrigger>
                <TabsTrigger value="comparison">Why E-Code?</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  {capabilities.map((cap, idx) => (
                    <Card key={idx}>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-primary" />
                          {cap.title}
                        </CardTitle>
                        <CardDescription>{cap.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {cap.examples.map((example, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                              <span className="text-[13px]">{example}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="capabilities" className="space-y-6">
                <div className="grid lg:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader>
                      <Code className="h-8 w-8 text-primary mb-2" />
                      <CardTitle>Multi-Language Support</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground mb-4">Builds apps in any language or framework</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">JavaScript</Badge>
                        <Badge variant="secondary">Python</Badge>
                        <Badge variant="secondary">HTML/CSS</Badge>
                        <Badge variant="secondary">React</Badge>
                        <Badge variant="secondary">Node.js</Badge>
                        <Badge variant="secondary">More...</Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <Brain className="h-8 w-8 text-primary mb-2" />
                      <CardTitle>Smart Architecture</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground mb-4">Makes intelligent decisions about structure</p>
                      <ul className="space-y-1 text-[13px]">
                        <li>• Proper file organization</li>
                        <li>• Best practice patterns</li>
                        <li>• Scalable architecture</li>
                        <li>• Security considerations</li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <Zap className="h-8 w-8 text-primary mb-2" />
                      <CardTitle>Lightning Fast</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground mb-4">Complete apps in under a minute</p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-[13px]">
                          <span>Simple apps</span>
                          <span className="font-semibold">20-30s</span>
                        </div>
                        <div className="flex justify-between text-[13px]">
                          <span>Complex apps</span>
                          <span className="font-semibold">45-60s</span>
                        </div>
                        <div className="flex justify-between text-[13px]">
                          <span>With database</span>
                          <span className="font-semibold">+15s</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="examples" className="space-y-6">
                <div className="space-y-8">
                  {useCases.map((category, idx) => (
                    <div key={idx}>
                      <h3 className="text-xl font-semibold mb-4">{category.category} Apps</h3>
                      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {category.apps.map((app, i) => (
                          <Card key={i} className="hover:shadow-lg transition-all cursor-pointer">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between mb-2">
                                {app.icon}
                                <Badge variant="outline" className="text-[11px]">
                                  {app.time}
                                </Badge>
                              </div>
                              <h4 className="font-semibold">{app.name}</h4>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="comparison" className="space-y-6">
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-2xl font-semibold mb-6">Traditional Coding</h3>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-red-600 dark:text-red-400 text-[11px]">✗</span>
                        </div>
                        <span>Months to learn programming basics</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-red-600 dark:text-red-400 text-[11px]">✗</span>
                        </div>
                        <span>Hours to set up development environment</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-red-600 dark:text-red-400 text-[11px]">✗</span>
                        </div>
                        <span>Days to build a simple app</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-red-600 dark:text-red-400 text-[11px]">✗</span>
                        </div>
                        <span>Constant debugging and fixing errors</span>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-2xl font-semibold mb-6">E-Code AI Agent</h3>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-green-600 dark:text-green-400 text-[11px]">✓</span>
                        </div>
                        <span>Zero coding knowledge required</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-green-600 dark:text-green-400 text-[11px]">✓</span>
                        </div>
                        <span>Instant setup, no installation needed</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-green-600 dark:text-green-400 text-[11px]">✓</span>
                        </div>
                        <span>Complete apps in under a minute</span>
                      </li>
                      <li className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-green-600 dark:text-green-400 text-[11px]">✓</span>
                        </div>
                        <span>Clean, working code every time</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="mt-12 text-center">
                  <Card className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white max-w-2xl mx-auto">
                    <CardContent className="p-8">
                      <h3 className="text-2xl font-bold mb-4">Ready to build something amazing?</h3>
                      <p className="mb-6">Join thousands who are building apps without writing code</p>
                      <Button size="lg" variant="secondary" onClick={handleGetStarted} className="gap-2">
                        Start Building Now
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-20 bg-muted/30">
          <div className="container-responsive max-w-6xl">
            <div className="grid md:grid-cols-4 gap-8 text-center">
              <div>
                <div className="text-4xl font-bold text-primary mb-2">50K+</div>
                <div className="text-muted-foreground">Apps Built</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-primary mb-2">30s</div>
                <div className="text-muted-foreground">Average Build Time</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-primary mb-2">100%</div>
                <div className="text-muted-foreground">No Code Required</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-primary mb-2">24/7</div>
                <div className="text-muted-foreground">AI Available</div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20">
          <div className="container-responsive max-w-4xl text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Stop dreaming. Start building.</h2>
            <p className="text-[15px] text-muted-foreground mb-8">
              Your ideas deserve to exist. Let our AI bring them to life.
            </p>
            <Button size="lg" onClick={handleGetStarted} className="gap-2">
              Build Your First App
              <Sparkles className="h-4 w-4" />
            </Button>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
