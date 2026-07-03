import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Boxes,
  Brain,
  CheckCircle,
  Code2,
  GitBranch,
  Globe,
  Languages,
  LayoutDashboard,
  MessageSquare,
  Pause,
  PenTool,
  Play,
  Rocket,
  ScanSearch,
  Sparkles,
  TerminalSquare,
  Users,
  Zap,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type { IconType } from 'react-icons';
import { SiAmazon, SiAnthropic, SiGooglegemini, SiMeta, SiOpenai, SiX } from 'react-icons/si';
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
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import { playVideoAndSyncState, resolveSeekTime } from '~/components/marketing/ecode-exact/pages/ai-demo-seek';
import { scrollToElement } from '~/lib/scroll-to';

type FeatureKey = 'autonomous' | 'multilingual' | 'intelligent' | 'realtime';

const PRODUCT = '/ecode-static/assets/product';

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
      /*
       * Drive the flag off the real play() result so a rejected play (autoplay
       * policy, decode error, 404 source) doesn't leave the overlay hidden.
       */
      void playVideoAndSyncState(video, setIsVideoPlaying);
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

    scrollToElement(video, { block: 'center' });

    const seekAndPlay = () => {
      // Clamp against the real, loaded duration so cues never overshoot the clip.
      video.currentTime = resolveSeekTime(position, video.duration);

      /*
       * Only mark playing if play() actually succeeds; otherwise the overlay
       * would stay hidden with no way to restart the demo.
       */
      void playVideoAndSyncState(video, setIsVideoPlaying);
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
      description: 'Describe what you want and the AI agent plans the build, writes the files and wires it together.',
      icon: Brain,
      details: [
        'Understands plain-language prompts in many languages',
        'Generates a complete project structure automatically',
        'Creates the files, routes and configuration it needs',
        'Installs dependencies and provisions a live workspace',
        'Deploys to a shareable URL with one click',
      ],
    },
    multilingual: {
      title: 'Build in Your Language',
      description: 'Prompt the agent in your native language and get responses, comments and docs back the same way.',
      icon: Languages,
      details: [
        'Describe your ideas in the language you think in',
        'Receive explanations in your preferred language',
        'Code comments written in your language',
        'Documentation generated alongside the code',
        'Accessible to developers around the world',
      ],
    },
    intelligent: {
      title: 'Production-Ready Code',
      description: 'The agent writes clean, conventional code and iterates with you instead of dumping a black box.',
      icon: Code2,
      details: [
        'Clean, maintainable file and folder structure',
        'Follows framework and language conventions',
        'Adds error handling as it builds',
        'Edits and refactors existing code in place',
        'Explains the changes it makes as it makes them',
      ],
    },
    realtime: {
      title: 'A Live Workspace',
      description: 'Every build runs in a real cloud workspace with an editor, terminal and live preview side by side.',
      icon: Zap,
      details: [
        'Edit alongside the agent in a full code editor',
        'Run commands in an integrated terminal',
        'See a live preview update as files change',
        'Connect Git and push from inside the IDE',
        'Pick up the same project from desktop or mobile',
      ],
    },
  };

  // Capabilities the agent can reach for while it builds — each maps to a real platform tool.
  const aiTools: Array<{ name: string; icon: LucideIcon; description: string }> = [
    { name: 'Code Generation', icon: Code2, description: 'Scaffold and edit files across your project' },
    { name: 'Visual Editor', icon: PenTool, description: 'Point at the preview to describe UI changes' },
    { name: 'Codebase Search', icon: ScanSearch, description: 'Read and reason over your existing code' },
    { name: 'Integrated Terminal', icon: TerminalSquare, description: 'Run scripts, tests and CLI tools' },
    { name: 'Dependency Install', icon: Boxes, description: 'Add and manage packages on the fly' },
    { name: 'Git & Deploy', icon: GitBranch, description: 'Commit, push and ship to production' },
  ];

  const useCases: Array<{ title: string; description: string; icon: LucideIcon; example: string }> = [
    {
      title: 'Complete Beginners',
      description: 'Never coded before? Describe your app idea and watch it come to life.',
      icon: Users,
      example: '"A website to track my daily habits with simple charts"',
    },
    {
      title: 'Rapid Prototyping',
      description: 'Turn an idea into a working prototype in minutes, not days.',
      icon: Rocket,
      example: '"A marketplace landing page for selling handmade crafts"',
    },
    {
      title: 'Learning by Building',
      description: 'Learn as you go — the agent explains the code it generates.',
      icon: Brain,
      example: '"Build a Tetris-style game and explain how it works"',
    },
    {
      title: 'Internal Tools',
      description: 'Create dashboards and internal apps without a dedicated dev team.',
      icon: LayoutDashboard,
      example: '"A dashboard to track our sales and inventory"',
    },
  ];

  // Real model providers wired into the platform's LLM registry.
  const modelProviders: Array<{ name: string; icon: IconType }> = [
    { name: 'Anthropic', icon: SiAnthropic },
    { name: 'OpenAI', icon: SiOpenai },
    { name: 'Google Gemini', icon: SiGooglegemini },
    { name: 'Amazon Bedrock', icon: SiAmazon },
    { name: 'xAI', icon: SiX },
    { name: 'Meta Llama', icon: SiMeta },
  ];

  // Honest capability highlights — no invented metrics, just what the platform actually does.
  const highlights = [
    { value: '100+', label: 'Languages you can prompt in', icon: Languages },
    { value: 'Multi-model', label: 'Anthropic, OpenAI, Google & more', icon: Brain },
    { value: 'Live', label: 'Cloud workspace per project', icon: TerminalSquare },
    { value: '1-click', label: 'Deploy to a shareable URL', icon: Rocket },
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
      icon: LayoutDashboard,
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

      {/* Hero Section */}
      <section className="relative min-h-[60vh] md:min-h-[80vh] flex items-center overflow-hidden bg-gradient-to-b from-background to-muted/20 py-16 md:py-0">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#F26207]/10 via-background to-background" />
          <div className="absolute inset-0 bg-grid-pattern opacity-5" />
        </div>

        <div className="container-responsive relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <LazyMotionDiv
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <Badge variant="default" className="mb-6 text-[13px] px-4 py-1.5 bg-[#F26207] text-white">
                <Sparkles className="h-4 w-4 mr-1" />
                THE E-CODE AI AGENT
              </Badge>

              <h1 className="mkt-h1 mb-6 tracking-tight">
                AI That
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#F26207] via-[#F26207] to-[#F99D25]">
                  Builds Your App
                </span>
              </h1>

              <p className="mkt-lead text-muted-foreground mb-8 max-w-2xl">
                Describe what you want and the E-Code agent writes the code, runs it in a live cloud workspace, and
                ships it — all from one prompt.
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
                {highlights.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="text-center">
                      <Icon className="h-5 w-5 mx-auto mb-2 text-[#F26207]" />
                      <div className="text-2xl md:text-3xl font-bold text-[#F26207]">{item.value}</div>
                      <div className="mkt-small text-muted-foreground font-medium">{item.label}</div>
                    </div>
                  );
                })}
              </div>
            </LazyMotionDiv>

            <LazyMotionDiv
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative hidden md:block"
            >
              <div className="absolute -inset-2 bg-gradient-to-r from-[#F26207]/20 to-[#F99D25]/20 blur-2xl rounded-3xl pointer-events-none" />
              <figure className="relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#F26207]/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#F99D25]/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                  <span className="ml-2 mkt-small text-muted-foreground font-medium truncate">
                    E-Code Workspace — AI Agent
                  </span>
                </div>
                <img
                  src={`${PRODUCT}/ide.png`}
                  alt="The E-Code IDE with the AI Agent panel, code editor, file tree and live preview in one workspace"
                  width={1440}
                  height={900}
                  loading="eager"
                  className="block w-full h-auto"
                  data-testid="img-ai-hero-ide"
                />
              </figure>
            </LazyMotionDiv>
          </div>
        </div>
      </section>

      {/* Model providers — real LLMs wired into the platform */}
      <section className="py-12 border-y border-bolt-elements-borderColor bg-muted/20">
        <div className="container-responsive">
          <p className="mkt-small text-center font-medium uppercase tracking-widest text-muted-foreground mb-8">
            Powered by the leading AI models — choose the one that fits your build
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
            {modelProviders.map((provider) => {
              const Icon = provider.icon;
              return (
                <div
                  key={provider.name}
                  className="flex items-center gap-2.5 text-muted-foreground hover:text-foreground transition-colors"
                  data-testid={`model-${provider.name.replace(/\s+/g, '-').toLowerCase()}`}
                >
                  <Icon className="h-6 w-6" aria-hidden />
                  <span className="mkt-small font-semibold">{provider.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Video Demo Section */}
      <section id="demo-video" className="py-20 bg-gradient-to-b from-muted/20 to-background">
        <div className="container-responsive">
          <div className="text-center mb-12">
            <h2 className="mkt-h2 mb-4">See the AI Agent in Action</h2>
            <p className="mkt-lead text-muted-foreground max-w-3xl mx-auto">
              Watch a full app go from a single prompt to a deployed, shareable URL.
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
                  <h3 className="mkt-h3 font-semibold">From prompt to production in one session</h3>
                  <p className="mkt-body text-white/80">
                    Follow along as the AI agent scaffolds a SaaS dashboard, configures infrastructure, and ships to the
                    cloud.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mkt-small font-medium">
                  <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-3 py-2">
                    <CheckCircle className="h-4 w-4 text-[#F99D25] flex-shrink-0" />
                    <span>Multi-step planning</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-3 py-2">
                    <CheckCircle className="h-4 w-4 text-[#F99D25] flex-shrink-0" />
                    <span>Edits code in place</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-3 py-2 sm:col-span-2 lg:col-span-1">
                    <CheckCircle className="h-4 w-4 text-[#F99D25] flex-shrink-0" />
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
                      : 'bg-white text-[#F26207] hover:bg-white/90'
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
                    className="group hover:shadow-xl transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[#F26207]"
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
                        <div className="p-2 bg-[#F26207]/10 rounded-lg group-hover:bg-[#F26207]/20 transition-colors">
                          <Icon className="h-5 w-5 text-[#F26207]" />
                        </div>
                        <CardTitle className="mkt-h3">{highlight.title}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground mkt-body">{highlight.description}</p>
                      <div className="mt-3 mkt-small text-[#F26207] font-medium">Jump to this chapter</div>
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
            <h2 className="mkt-h2 mb-4">How the AI Agent Works</h2>
            <p className="mkt-lead text-muted-foreground max-w-2xl mx-auto">
              From idea to deployed app in three simple steps
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 bg-[#F26207]/10 ring-1 ring-[#F26207]/20 rounded-2xl flex items-center justify-center text-[#F26207]">
                <MessageSquare className="h-10 w-10" />
              </div>
              <h3 className="mkt-h3 mb-2">1. Describe Your Idea</h3>
              <p className="mkt-body text-muted-foreground">
                Tell the agent what you want to build in plain language — any language you prefer.
              </p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 bg-[#F26207]/10 ring-1 ring-[#F26207]/20 rounded-2xl flex items-center justify-center text-[#F26207]">
                <Brain className="h-10 w-10" />
              </div>
              <h3 className="mkt-h3 mb-2">2. AI Builds Everything</h3>
              <p className="mkt-body text-muted-foreground">
                Watch as the agent creates files, writes code, and sets up your project in a live workspace.
              </p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 bg-[#F26207]/10 ring-1 ring-[#F26207]/20 rounded-2xl flex items-center justify-center text-[#F26207]">
                <Globe className="h-10 w-10" />
              </div>
              <h3 className="mkt-h3 mb-2">3. Deploy Instantly</h3>
              <p className="mkt-body text-muted-foreground">
                Ship to a live, shareable URL in one click — no extra configuration or setup needed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Deep Dive */}
      <section className="py-20">
        <div className="container-responsive">
          <div className="text-center mb-12">
            <h2 className="mkt-h2 mb-4">AI Agent Capabilities</h2>
            <p className="mkt-lead text-muted-foreground">Powerful features that make building effortless</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-start max-w-6xl mx-auto">
            <div className="space-y-4">
              {Object.entries(features).map(([key, feature]) => {
                const Icon = feature.icon;
                const isActive = selectedFeature === key;

                return (
                  <Card
                    key={key}
                    className={`cursor-pointer transition-all ${
                      isActive ? 'ring-2 ring-[#F26207] shadow-lg' : 'hover:shadow-md'
                    }`}
                    onClick={() => setSelectedFeature(key as FeatureKey)}
                    data-testid={`card-feature-${key}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`p-2 rounded-lg transition-colors ${
                            isActive ? 'bg-[#F26207] text-white' : 'bg-[#F26207]/10 text-[#F26207]'
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <CardTitle className="mkt-h3">{feature.title}</CardTitle>
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
                  <CardTitle>{features[selectedFeature].title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {features[selectedFeature].details.map((detail, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-[#F26207] mt-0.5 flex-shrink-0" />
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
            <h2 className="mkt-h2 mb-4">Tools the Agent Can Use</h2>
            <p className="mkt-lead text-muted-foreground max-w-2xl mx-auto">
              The agent reaches for real platform capabilities while it builds — the same ones you have in the IDE.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {aiTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Card
                  key={tool.name}
                  className="text-center hover:shadow-lg transition-all"
                  data-testid={`card-tool-${tool.name.replace(/\s+/g, '-').toLowerCase()}`}
                >
                  <CardContent className="pt-6">
                    <div className="w-12 h-12 mx-auto mb-3 bg-[#F26207] rounded-lg flex items-center justify-center">
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="mkt-h3 mb-1">{tool.name}</h3>
                    <p className="mkt-body text-muted-foreground">{tool.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Real product capture — Git workflow inside the IDE */}
      <section className="py-20">
        <div className="container-responsive">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center max-w-6xl mx-auto">
            <div>
              <Badge variant="default" className="mb-4 text-[13px] px-3 py-1 bg-[#F26207] text-white">
                <GitBranch className="h-4 w-4 mr-1" />
                Inside the workspace
              </Badge>
              <h2 className="mkt-h2 mb-4">Not a black box — a real IDE</h2>
              <p className="mkt-body text-muted-foreground mb-6">
                The agent works in the same editor, terminal and Git panel you do. Review every change, commit and push
                to your own repository, then deploy — all without leaving E-Code.
              </p>
              <ul className="space-y-3">
                {[
                  'Inspect and edit every file the agent touches',
                  'Connect GitHub or GitLab and push from the IDE',
                  'Run tests and scripts in the integrated terminal',
                ].map((point) => (
                  <li key={point} className="flex items-start gap-2 mkt-body">
                    <CheckCircle className="h-5 w-5 text-[#F26207] mt-0.5 flex-shrink-0" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            <figure className="group relative">
              <div className="absolute -inset-2 bg-gradient-to-l from-[#F26207]/15 to-[#F99D25]/15 blur-2xl rounded-2xl pointer-events-none" />
              <div className="relative rounded-xl overflow-hidden ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-2xl">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                  <GitBranch className="h-3.5 w-3.5 text-[#F26207]" />
                  <span className="mkt-small text-muted-foreground font-medium truncate">Git — E-Code IDE</span>
                </div>
                <img
                  src={`${PRODUCT}/ide-git.png`}
                  alt="The E-Code IDE Git panel showing source control changes ready to commit and push"
                  width={1440}
                  height={900}
                  loading="lazy"
                  className="block w-full h-auto"
                  data-testid="img-ai-ide-git"
                />
              </div>
            </figure>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-20 bg-muted/30">
        <div className="container-responsive">
          <div className="text-center mb-12">
            <h2 className="mkt-h2 mb-4">Who Builds with the AI Agent?</h2>
            <p className="mkt-lead text-muted-foreground">From complete beginners to experienced developers</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {useCases.map((useCase) => {
              const Icon = useCase.icon;
              return (
                <Card
                  key={useCase.title}
                  className="hover:shadow-lg transition-all"
                  data-testid={`card-usecase-${useCase.title.replace(/\s+/g, '-').toLowerCase()}`}
                >
                  <CardHeader>
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-[#F26207] rounded-lg">
                        <Icon className="h-8 w-8 text-white" />
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

      {/* Try it now */}
      <section className="py-20 bg-gradient-to-b from-muted/30 to-background">
        <div className="container-responsive">
          <Card className="max-w-4xl mx-auto overflow-hidden">
            <div className="bg-gradient-to-r from-[#F26207] to-[#F99D25] p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="mkt-h2 mb-2">Try the AI Agent Now</h2>
                  <p className="mkt-body opacity-90">See how easy it is to build your first app</p>
                </div>
                <Sparkles className="h-12 w-12 opacity-30" />
              </div>
            </div>
            <CardContent className="p-8">
              <div className="space-y-6">
                <div className="bg-muted rounded-lg p-4">
                  <p className="mkt-small text-muted-foreground mb-2">Example prompts to try:</p>
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

      {/* Final CTA Banner */}
      <section className="py-20">
        <div className="container-responsive">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#F26207] to-[#F99D25] px-6 py-16 sm:px-12 md:py-20 text-center text-white shadow-2xl">
            <div className="absolute -top-12 -right-12 w-56 h-56 bg-white/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-56 h-56 bg-white/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative max-w-3xl mx-auto">
              <h2 className="mkt-h2 mb-4">Start building with AI today</h2>
              <p className="mkt-lead text-white/90 mb-8">
                No credit card required. Spin up your first app on the free tier and ship it from your browser.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  asChild
                  className="text-[15px] px-8 h-14 bg-white text-[#F26207] hover:bg-white/90 shadow-lg"
                  data-testid="button-get-started-free"
                >
                  <Link href="/signup">
                    Get Started Free
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="text-[15px] px-8 h-14 border-white/60 bg-transparent text-white hover:bg-white/10"
                  data-testid="button-view-pricing"
                >
                  <Link href="/pricing">View Pricing</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
