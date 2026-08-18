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
import { useTranslation } from 'react-i18next';
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
import {
  getMarketingExactAiCopy,
  type ExactAiDemoHighlightId,
  type ExactAiFeatureId,
  type ExactAiToolId,
  type ExactAiUseCaseId,
} from '~/lib/i18n/catalogs/marketing-exact-ai';
import { scrollToElement } from '~/lib/scroll-to';

const PRODUCT = '/ecode-static/assets/product';

const FEATURE_ICONS: Record<ExactAiFeatureId, LucideIcon> = {
  autonomous: Brain,
  multilingual: Languages,
  intelligent: Code2,
  realtime: Zap,
};

const TOOL_ICONS: Record<ExactAiToolId, LucideIcon> = {
  code: Code2,
  visual: PenTool,
  search: ScanSearch,
  terminal: TerminalSquare,
  dependencies: Boxes,
  git: GitBranch,
};

const USE_CASE_ICONS: Record<ExactAiUseCaseId, LucideIcon> = {
  beginner: Users,
  prototype: Rocket,
  learning: Brain,
  internal: LayoutDashboard,
};

const HIGHLIGHT_ICONS: Record<string, LucideIcon> = {
  languages: Languages,
  models: Brain,
  workspace: TerminalSquare,
  deploy: Rocket,
};

const DEMO_HIGHLIGHT_MEDIA: Record<ExactAiDemoHighlightId, { icon: LucideIcon; position: number }> = {
  scaffold: { icon: Rocket, position: 0 },
  dashboard: { icon: LayoutDashboard, position: 1 / 3 },
  deploy: { icon: Globe, position: 2 / 3 },
};

const MODEL_PROVIDERS: Array<{ name: string; icon: IconType }> = [
  { name: 'Anthropic', icon: SiAnthropic },
  { name: 'OpenAI', icon: SiOpenai },
  { name: 'Google Gemini', icon: SiGooglegemini },
  { name: 'Amazon Bedrock', icon: SiAmazon },
  { name: 'xAI', icon: SiX },
  { name: 'Meta Llama', icon: SiMeta },
];

export default function AI() {
  const { i18n } = useTranslation();
  const copy = getMarketingExactAiCopy(i18n.resolvedLanguage ?? i18n.language).exactAi.ai;
  const [selectedFeature, setSelectedFeature] = useState<ExactAiFeatureId>('autonomous');

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

  const features = copy.features.map((feature) => ({ ...feature, icon: FEATURE_ICONS[feature.id] }));
  const activeFeature = features.find((feature) => feature.id === selectedFeature) ?? features[0]!;

  // Capabilities the agent can reach for while it builds — each maps to a real platform tool.
  const aiTools = copy.tools.map((tool) => ({ ...tool, icon: TOOL_ICONS[tool.id] }));

  const useCases = copy.useCases.map((useCase) => ({ ...useCase, icon: USE_CASE_ICONS[useCase.id] }));

  // Honest capability highlights — no invented metrics, just what the platform actually does.
  const highlights = copy.highlights.map((highlight) => ({
    ...highlight,
    icon: HIGHLIGHT_ICONS[highlight.id] ?? Sparkles,
  }));

  /*
   * All three cards jump into the SAME shared platform demo clip, so each one
   * is a chapter expressed as a fraction (0..1) of the real video. The concrete
   * timestamp is resolved from the loaded video duration at click time, which
   * keeps cues in-bounds regardless of the asset's actual length.
   */
  const demoHighlights = copy.demoHighlights.map((highlight) => ({
    ...highlight,
    ...DEMO_HIGHLIGHT_MEDIA[highlight.id],
  }));

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
                {copy.badge}
              </Badge>

              <h1 className="mkt-h1 mb-6 tracking-tight">
                {copy.heroPrefix}
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#F26207] via-[#F26207] to-[#F99D25]">
                  {copy.heroAccent}
                </span>
              </h1>

              <p className="mkt-lead text-muted-foreground mb-8 max-w-2xl">{copy.heroDescription}</p>

              <div className="flex flex-col sm:flex-row gap-4 mb-12">
                <Button
                  size="lg"
                  asChild
                  className="text-[15px] px-8 h-14 shadow-lg hover:shadow-xl transition-shadow"
                  data-testid="button-start-building"
                >
                  <Link href="/ai-agent">
                    {copy.startBuilding}
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
                    {copy.watchDemo}
                  </a>
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {highlights.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="text-center">
                      <Icon className="h-5 w-5 mx-auto mb-2 text-[var(--ecode-accent-text)]" />
                      <div className="text-2xl md:text-3xl font-bold text-[var(--ecode-accent-text)]">{item.value}</div>
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
                    {copy.workspaceTitle}
                  </span>
                </div>
                <img
                  src={`${PRODUCT}/ide.png`}
                  alt={copy.heroImageAlt}
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
            {copy.modelsIntro}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
            {MODEL_PROVIDERS.map((provider) => {
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
            <h2 className="mkt-h2 mb-4">{copy.demoIntro.title}</h2>
            <p className="mkt-lead text-muted-foreground max-w-3xl mx-auto">{copy.demoIntro.description}</p>
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
                {copy.video.fallback}
              </video>
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/60 pointer-events-none" />
              <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-6 lg:p-10 pointer-events-none text-white">
                <div className="space-y-3 max-w-xl">
                  <Badge
                    variant="secondary"
                    className="w-fit bg-white/20 text-white backdrop-blur border border-white/30"
                  >
                    {copy.video.badge}
                  </Badge>
                  <h3 className="mkt-h3 font-semibold">{copy.video.title}</h3>
                  <p className="mkt-body text-white/80">{copy.video.description}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mkt-small font-medium">
                  <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-3 py-2">
                    <CheckCircle className="h-4 w-4 text-[#F99D25] flex-shrink-0" />
                    <span>{copy.video.points[0]}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-3 py-2">
                    <CheckCircle className="h-4 w-4 text-[#F99D25] flex-shrink-0" />
                    <span>{copy.video.points[1]}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-3 py-2 sm:col-span-2 lg:col-span-1">
                    <CheckCircle className="h-4 w-4 text-[#F99D25] flex-shrink-0" />
                    <span>{copy.video.points[2]}</span>
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
                      : 'bg-white text-[var(--ecode-accent-text)] hover:bg-white/90'
                  }`}
                  onClick={handleVideoToggle}
                  aria-label={isVideoPlaying ? copy.video.pauseAria : copy.video.playAria}
                  data-testid="button-video-toggle"
                >
                  {isVideoPlaying ? (
                    <>
                      <Pause className="h-5 w-5" />
                      {copy.video.pause}
                    </>
                  ) : (
                    <>
                      <Play className="h-5 w-5" />
                      {copy.video.play}
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
                    aria-label={`${copy.video.jumpPrefix} ${highlight.title} ${copy.video.jumpSuffix}`}
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
                          <Icon className="h-5 w-5 text-[var(--ecode-accent-text)]" />
                        </div>
                        <CardTitle className="mkt-h3">{highlight.title}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground mkt-body">{highlight.description}</p>
                      <div className="mt-3 mkt-small text-[var(--ecode-accent-text)] font-medium">
                        {copy.video.jumpAction}
                      </div>
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
            <h2 className="mkt-h2 mb-4">{copy.howItWorks.title}</h2>
            <p className="mkt-lead text-muted-foreground max-w-2xl mx-auto">{copy.howItWorks.description}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 bg-[#F26207]/10 ring-1 ring-[#F26207]/20 rounded-2xl flex items-center justify-center text-[var(--ecode-accent-text)]">
                <MessageSquare className="h-10 w-10" />
              </div>
              <h3 className="mkt-h3 mb-2">{copy.howItWorks.steps[0]?.title}</h3>
              <p className="mkt-body text-muted-foreground">{copy.howItWorks.steps[0]?.description}</p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 bg-[#F26207]/10 ring-1 ring-[#F26207]/20 rounded-2xl flex items-center justify-center text-[var(--ecode-accent-text)]">
                <Brain className="h-10 w-10" />
              </div>
              <h3 className="mkt-h3 mb-2">{copy.howItWorks.steps[1]?.title}</h3>
              <p className="mkt-body text-muted-foreground">{copy.howItWorks.steps[1]?.description}</p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 bg-[#F26207]/10 ring-1 ring-[#F26207]/20 rounded-2xl flex items-center justify-center text-[var(--ecode-accent-text)]">
                <Globe className="h-10 w-10" />
              </div>
              <h3 className="mkt-h3 mb-2">{copy.howItWorks.steps[2]?.title}</h3>
              <p className="mkt-body text-muted-foreground">{copy.howItWorks.steps[2]?.description}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Deep Dive */}
      <section className="py-20">
        <div className="container-responsive">
          <div className="text-center mb-12">
            <h2 className="mkt-h2 mb-4">{copy.featuresIntro.title}</h2>
            <p className="mkt-lead text-muted-foreground">{copy.featuresIntro.description}</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-start max-w-6xl mx-auto">
            <div className="space-y-4">
              {features.map((feature) => {
                const Icon = feature.icon;
                const isActive = selectedFeature === feature.id;

                return (
                  <Card
                    key={feature.id}
                    className={`cursor-pointer transition-all ${
                      isActive ? 'ring-2 ring-[#F26207] shadow-lg' : 'hover:shadow-md'
                    }`}
                    onClick={() => setSelectedFeature(feature.id)}
                    data-testid={`card-feature-${feature.id}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`p-2 rounded-lg transition-colors ${
                            isActive ? 'bg-[#F26207] text-white' : 'bg-[#F26207]/10 text-[var(--ecode-accent-text)]'
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
                  <CardTitle>{activeFeature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {activeFeature.details.map((detail) => (
                      <li key={detail} className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-[var(--ecode-accent-text)] mt-0.5 flex-shrink-0" />
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
            <h2 className="mkt-h2 mb-4">{copy.toolsIntro.title}</h2>
            <p className="mkt-lead text-muted-foreground max-w-2xl mx-auto">{copy.toolsIntro.description}</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {aiTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Card
                  key={tool.id}
                  className="text-center hover:shadow-lg transition-all"
                  data-testid={`card-tool-${tool.id}`}
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
                {copy.workspace.badge}
              </Badge>
              <h2 className="mkt-h2 mb-4">{copy.workspace.title}</h2>
              <p className="mkt-body text-muted-foreground mb-6">{copy.workspace.description}</p>
              <ul className="space-y-3">
                {copy.workspace.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 mkt-body">
                    <CheckCircle className="h-5 w-5 text-[var(--ecode-accent-text)] mt-0.5 flex-shrink-0" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            <figure className="group relative">
              <div className="absolute -inset-2 bg-gradient-to-l from-[#F26207]/15 to-[#F99D25]/15 blur-2xl rounded-2xl pointer-events-none" />
              <div className="relative rounded-xl overflow-hidden ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-2xl">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                  <GitBranch className="h-3.5 w-3.5 text-[var(--ecode-accent-text)]" />
                  <span className="mkt-small text-muted-foreground font-medium truncate">
                    {copy.workspace.gitTitle}
                  </span>
                </div>
                <img
                  src={`${PRODUCT}/ide-git.png`}
                  alt={copy.workspace.gitImageAlt}
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
            <h2 className="mkt-h2 mb-4">{copy.useCasesIntro.title}</h2>
            <p className="mkt-lead text-muted-foreground">{copy.useCasesIntro.description}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {useCases.map((useCase) => {
              const Icon = useCase.icon;
              return (
                <Card
                  key={useCase.id}
                  className="hover:shadow-lg transition-all"
                  data-testid={`card-usecase-${useCase.id}`}
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
                  <h2 className="mkt-h2 mb-2">{copy.tryIt.title}</h2>
                  <p className="mkt-body opacity-90">{copy.tryIt.description}</p>
                </div>
                <Sparkles className="h-12 w-12 opacity-30" />
              </div>
            </div>
            <CardContent className="p-8">
              <div className="space-y-6">
                <div className="bg-muted rounded-lg p-4">
                  <p className="mkt-small text-muted-foreground mb-2">{copy.tryIt.promptsLabel}</p>
                  <div className="space-y-2">
                    {copy.tryIt.prompts.map((prompt) => (
                      <Button
                        key={prompt.id}
                        variant="outline"
                        size="sm"
                        className="w-full h-auto min-h-9 justify-start whitespace-normal text-left"
                        asChild
                        data-testid={`button-prompt-${prompt.id}`}
                      >
                        <Link href={`/agent?prompt=${encodeURIComponent(prompt.query)}`}>{prompt.label}</Link>
                      </Button>
                    ))}
                  </div>
                </div>
                <Button size="lg" className="w-full" asChild data-testid="button-open-agent">
                  <Link href="/agent">
                    {copy.tryIt.openAgent}
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
              <h2 className="mkt-h2 mb-4">{copy.finalCta.title}</h2>
              <p className="mkt-lead text-white/90 mb-8">{copy.finalCta.description}</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  asChild
                  className="text-[15px] px-8 h-14 bg-white text-[var(--ecode-accent-text)] hover:bg-white/90 shadow-lg"
                  data-testid="button-get-started-free"
                >
                  <Link href="/signup">
                    {copy.finalCta.primary}
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
                  <Link href="/pricing">{copy.finalCta.secondary}</Link>
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
