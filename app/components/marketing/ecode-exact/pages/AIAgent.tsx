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
  MessageSquarePlus,
  Package,
  PlayCircle,
  Rocket,
  Settings,
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

  // Redirect signed-in users to the dashboard
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

  // Real product captures from the live E-Code app — never mocks.
  const agentShots = [
    {
      id: 'agent-editor',
      title: 'Agent + Editor',
      description: 'The agent chats on the left while it writes code in the editor and updates the file tree live.',
      label: 'IDE workspace',
      image: '/ecode-static/assets/product/ide.png',
    },
    {
      id: 'git-workflow',
      title: 'Built-in Git workflow',
      description: 'Real Git panel: branch, working tree, the orange Commit button, and the commit graph.',
      label: 'Version control',
      image: '/ecode-static/assets/product/ide-git.png',
    },
    {
      id: 'deployments',
      title: 'In-IDE Deployments',
      description: 'Ship to the cloud straight from the Deployments panel—no terminal, no context switch.',
      label: 'Deploy',
      image: '/ecode-static/assets/product/ide-deploy.png',
    },
  ];

  /*
   * Default the explorer to the Git shot so the three large screenshots on the page
   * (hero = ide.png, Live Demo = ide-deploy.png, explorer = ide-git.png) are distinct
   * rather than repeating the same IDE image.
   */
  const [selectedShot, setSelectedShot] = useState(agentShots[1] ?? agentShots[0]);

  const quickReels = [
    {
      id: 'agent',
      title: 'Agent Panel',
      description: 'Conversational building, right next to your code.',
      icon: Sparkles,
      label: 'Live',
      image: '/ecode-static/assets/product/ide.png',
    },
    {
      id: 'git',
      title: 'Git Workflow',
      description: 'Branches, working tree, and one-click commits.',
      icon: Code,
      label: 'Source',
      image: '/ecode-static/assets/product/ide-git.png',
    },
    {
      id: 'deploy',
      title: 'Instant Deploy',
      description: 'Publish to the cloud from the Deployments panel.',
      icon: Rocket,
      label: 'Deploy',
      image: '/ecode-static/assets/product/ide-deploy.png',
    },
    {
      id: 'mobile',
      title: 'On Mobile',
      description: 'The full app, responsive down to 390px.',
      icon: Globe,
      label: 'Mobile',
      image: '/ecode-static/assets/product/mobile.png',
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
        <section className="relative min-h-[85vh] flex items-center overflow-hidden pt-20 pb-12 sm:pt-24 lg:pt-16 bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950 dark:to-gray-950">
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

                <h1 className="mkt-h1 tracking-tight mb-6">
                  AI Agent v2
                  <span className="block mkt-h2 mt-2 bg-gradient-to-r from-[#F26207] to-[#F99D25] bg-clip-text text-transparent">
                    Build Apps with Natural Language
                  </span>
                </h1>

                <p className="mkt-lead text-muted-foreground mb-8 max-w-2xl mx-auto lg:mx-0">
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
                {/* Real capture of the E-Code Agent working inside the IDE */}
                <figure className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-slate-900">
                  {/* Browser-ish chrome */}
                  <div className="flex items-center gap-2 border-b border-white/10 bg-slate-950/80 px-4 py-3">
                    <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                    <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                    <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                    <span className="ml-3 inline-flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1 text-[11px] font-medium text-white/60">
                      <Sparkles className="h-3 w-3 text-[#F26207]" />
                      app.e-code.ai
                    </span>
                  </div>
                  <img
                    src="/ecode-static/assets/product/ide.png"
                    alt="The E-Code Agent building an app inside the IDE — agent panel, code editor, file tree and run/publish bar"
                    className="block w-full h-auto"
                    loading="eager"
                  />
                  <figcaption className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2 text-[11px] text-white">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 backdrop-blur">
                      <Sparkles className="h-3.5 w-3.5 text-[#F99D25]" />
                      Agent + Editor, captured live
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 backdrop-blur">
                      <Rocket className="h-3.5 w-3.5 text-[#F99D25]" />
                      Run &amp; Publish from one bar
                    </span>
                  </figcaption>
                </figure>
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
              <h2 className="mkt-h2 mb-4">Building apps is now as easy as having a conversation</h2>
              <p className="mkt-body text-muted-foreground">Just describe what you want. Watch it come to life.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 mb-12">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto bg-gradient-to-br from-[#F26207] to-[#F99D25] shadow-lg shadow-[#F26207]/25">
                  <MessageSquarePlus className="h-8 w-8 text-white" />
                </div>
                <h3 className="mkt-h3">1. Describe Your Idea</h3>
                <p className="mkt-body text-muted-foreground">
                  Describe what you want in any language. "Build me a recipe app with search and favorites"
                </p>
              </div>

              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto bg-gradient-to-br from-[#F26207] to-[#F99D25] shadow-lg shadow-[#F26207]/25">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>
                <h3 className="mkt-h3">2. AI Builds Everything</h3>
                <p className="mkt-body text-muted-foreground">
                  Watch as the AI creates files, writes code, and sets up your entire project
                </p>
              </div>

              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto bg-gradient-to-br from-[#F26207] to-[#F99D25] shadow-lg shadow-[#F26207]/25">
                  <Rocket className="h-8 w-8 text-white" />
                </div>
                <h3 className="mkt-h3">3. Your App is Ready</h3>
                <p className="mkt-body text-muted-foreground">
                  In under a minute, your app is running and ready to share with the world
                </p>
              </div>
            </div>

            {/* Real IDE capture — the Agent at work */}
            <Card className="overflow-hidden max-w-4xl mx-auto">
              <CardHeader className="bg-gradient-to-r from-[#F26207] to-[#F99D25] text-white">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3 text-left">
                    <Sparkles className="mt-1 h-6 w-6" />
                    <div>
                      <CardTitle>The E-Code Agent, inside the IDE</CardTitle>
                      <CardDescription className="text-white/80">
                        A real capture: the agent chats on the left while it writes files in the editor and watches the
                        file tree update in real time.
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary" className="self-start bg-white/20 text-white md:self-center">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Live capture
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 bg-black">
                <img
                  src="/ecode-static/assets/product/ide-deploy.png"
                  alt="E-Code in-IDE Deployments panel — publish to a live URL without leaving the editor"
                  className="block w-full h-auto"
                  loading="lazy"
                />
                <div className="space-y-2 px-6 py-6 mkt-small text-muted-foreground md:flex md:items-center md:justify-between md:gap-6">
                  <p className="md:max-w-2xl">
                    Everything you see is the live product: the agent drafts requirements, generates the UI, wires up
                    the backend, and exposes a one-click Run and Publish bar—no manual commands.
                  </p>
                  <Button size="sm" variant="secondary" className="mt-4 md:mt-0" asChild>
                    <a href="#agent-demo">See the Git workflow</a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Video Demo Section */}
        <section id="agent-demo" className="pt-20 pb-12 bg-gradient-to-b from-background to-muted/20">
          <div className="container-responsive max-w-7xl">
            <div className="text-center mb-12">
              <h2 className="mkt-h2 mb-4">Watch AI Agent v2 in Action</h2>
              <p className="mkt-lead text-muted-foreground max-w-3xl mx-auto">
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
                <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-slate-900">
                  {/* Browser-ish chrome */}
                  <div className="flex items-center gap-2 border-b border-white/10 bg-slate-950/80 px-4 py-3">
                    <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                    <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                    <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                    <span className="ml-3 inline-flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1 text-[11px] font-medium text-white/60">
                      <Sparkles className="h-3 w-3 text-[#F26207]" />
                      {selectedShot.label}
                    </span>
                  </div>
                  <img
                    key={selectedShot.id}
                    src={selectedShot.image}
                    alt={`${selectedShot.title} — ${selectedShot.description}`}
                    className="block w-full h-auto"
                    loading="lazy"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-6 text-white">
                    <h3 className="mkt-h3 text-white">{selectedShot.title}</h3>
                    <p className="mkt-small text-white/80">{selectedShot.description}</p>
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
                    <CardTitle className="mkt-h3">Explore the IDE</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {agentShots.map((shot) => (
                      <button
                        key={shot.id}
                        type="button"
                        onClick={() => setSelectedShot(shot)}
                        aria-pressed={selectedShot.id === shot.id}
                        className={`w-full text-left p-3 rounded-lg transition-colors group ${
                          selectedShot.id === shot.id ? 'bg-muted border border-primary/40 shadow-sm' : 'hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={shot.image}
                            alt={`${shot.title} preview`}
                            className="h-12 w-20 flex-shrink-0 rounded-md border object-cover object-left-top"
                            loading="lazy"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <Sparkles className="h-3 w-3 text-primary" />
                                {shot.label}
                              </span>
                              {selectedShot.id === shot.id && (
                                <span className="inline-flex items-center gap-1 text-primary">
                                  <CheckCircle className="h-3 w-3" />
                                  Viewing
                                </span>
                              )}
                            </div>
                            <p className="font-medium">{shot.title}</p>
                            <p className="mkt-small text-muted-foreground">{shot.description}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </CardContent>
                </Card>

                <Card className="bg-primary/5 border-primary/20">
                  <CardHeader>
                    <CardTitle className="mkt-h3 flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      What you&apos;re looking at
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 text-[13px]">
                      <li className="flex items-start gap-2">
                        <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <span>An Agent panel that builds alongside you, in plain language.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Code className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <span>A real code editor and file tree—edit anything by hand at any point.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Globe className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <span>Built-in Git: branches, working tree, and one-click commits.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Rocket className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                        <span>Deploy to the cloud from the same window, no terminal required.</span>
                      </li>
                    </ul>
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
                        <CardTitle className="mkt-h3">{reel.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="relative overflow-hidden rounded-lg border bg-slate-900">
                          <img
                            className="h-28 w-full object-cover object-left-top"
                            src={reel.image}
                            alt={`${reel.title} — ${reel.description}`}
                            loading="lazy"
                          />
                          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                            <Sparkles className="h-3 w-3" /> {reel.label}
                          </span>
                        </div>
                        <p className="mkt-small text-muted-foreground">{reel.description}</p>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Capabilities Tabs */}
        <section className="pt-12 pb-20">
          <div className="container-responsive max-w-6xl">
            <div className="text-center mb-12">
              <h2 className="mkt-h2 mb-4">More than just code generation</h2>
              <p className="mkt-body text-muted-foreground">
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
                              <span className="mkt-body">{example}</span>
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
                      <p className="mkt-body text-muted-foreground mb-4">Builds apps in any language or framework</p>
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
                      <p className="mkt-body text-muted-foreground mb-4">Makes intelligent decisions about structure</p>
                      <ul className="space-y-1 mkt-small">
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
                      <p className="mkt-body text-muted-foreground mb-4">Complete apps in under a minute</p>
                      <div className="space-y-2">
                        <div className="flex justify-between mkt-small">
                          <span>Simple apps</span>
                          <span className="font-semibold">20-30s</span>
                        </div>
                        <div className="flex justify-between mkt-small">
                          <span>Complex apps</span>
                          <span className="font-semibold">45-60s</span>
                        </div>
                        <div className="flex justify-between mkt-small">
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
                      <h3 className="mkt-h3 mb-4">{category.category} Apps</h3>
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
                    <h3 className="mkt-h3 mb-6">Traditional Coding</h3>
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
                    <h3 className="mkt-h3 mb-6">E-Code AI Agent</h3>
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
                  <Card className="bg-gradient-to-r from-[#F26207] to-[#F99D25] text-white max-w-2xl mx-auto">
                    <CardContent className="p-8">
                      <h3 className="mkt-h3 mb-4">Ready to build something amazing?</h3>
                      <p className="mkt-body mb-6">Join thousands who are building apps without writing code</p>
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
            <h2 className="mkt-h2 mb-6">Stop dreaming. Start building.</h2>
            <p className="mkt-body text-muted-foreground mb-8">
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
