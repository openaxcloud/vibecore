import type { LucideIcon } from 'lucide-react';
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
import { useTranslation } from 'react-i18next';
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
import {
  getMarketingExactAiCopy,
  type ExactAiAgentReelId,
  type ExactAiAgentShotId,
} from '~/lib/i18n/catalogs/marketing-exact-ai';

const AGENT_SHOT_IMAGES: Record<ExactAiAgentShotId, string> = {
  'agent-editor': '/ecode-static/assets/product/ide.png',
  'git-workflow': '/ecode-static/assets/product/ide-git.png',
  deployments: '/ecode-static/assets/product/ide-deploy.png',
};

const PRODUCT_HOST = 'app.e-code.ai';

const AGENT_REEL_MEDIA: Record<ExactAiAgentReelId, { icon: LucideIcon; image: string }> = {
  agent: { icon: Sparkles, image: '/ecode-static/assets/product/ide.png' },
  git: { icon: Code, image: '/ecode-static/assets/product/ide-git.png' },
  deploy: { icon: Rocket, image: '/ecode-static/assets/product/ide-deploy.png' },
  mobile: { icon: Globe, image: '/ecode-static/assets/product/mobile.png' },
};

const LOOKING_ICONS = [Sparkles, Code, Globe, Rocket] as const;

const USE_CASE_ICONS: Record<string, LucideIcon> = {
  landing: Globe,
  contact: MessageSquare,
  admin: Settings,
  analytics: TrendingUp,
  portfolio: Star,
  blog: FileCode,
  tasks: CheckCircle,
  budget: Database,
  quiz: Brain,
  flashcards: Package,
  timer: Timer,
  notes: FileCode,
  memory: Brain,
  puzzle: Cpu,
  word: MessageSquare,
  drawing: Star,
};

export default function AiAgent() {
  const { i18n } = useTranslation();
  const copy = getMarketingExactAiCopy(i18n.resolvedLanguage ?? i18n.language).exactAi.aiAgent;
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
  const agentShots = copy.shots.map((shot) => ({ ...shot, image: AGENT_SHOT_IMAGES[shot.id] }));

  /*
   * Default the explorer to the Git shot so the three large screenshots on the page
   * (hero = ide.png, Live Demo = ide-deploy.png, explorer = ide-git.png) are distinct
   * rather than repeating the same IDE image.
   */
  const [selectedShotId, setSelectedShotId] = useState<ExactAiAgentShotId>('git-workflow');
  const selectedShot = agentShots.find((shot) => shot.id === selectedShotId) ?? agentShots[0];

  const quickReels = copy.reels.map((reel) => ({ ...reel, ...AGENT_REEL_MEDIA[reel.id] }));
  const capabilities = copy.capabilities;
  const useCases = copy.useCases;

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
                  {copy.badge}
                </Badge>

                <h1 className="mkt-h1 tracking-tight mb-6">
                  {copy.heroTitle}
                  <span className="block mkt-h2 mt-2 bg-gradient-to-r from-[#F26207] to-[#F99D25] bg-clip-text text-transparent">
                    {copy.heroAccent}
                  </span>
                </h1>

                <p className="mkt-lead text-muted-foreground mb-8 max-w-2xl mx-auto lg:mx-0">{copy.heroDescription}</p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-8">
                  <Button
                    size="lg"
                    onClick={handleGetStarted}
                    className="text-[15px] px-8 h-14 shadow-lg hover:shadow-xl transition-all bg-gradient-to-r from-primary to-primary/90"
                  >
                    {copy.launchStudio}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                  <Button size="lg" variant="outline" className="text-[15px] px-8 h-14" asChild>
                    <a href="#agent-demo">
                      {copy.watchLiveDemo}
                      <PlayCircle className="ml-2 h-5 w-5" />
                    </a>
                  </Button>
                </div>

                <div className="flex flex-wrap gap-6 justify-center lg:justify-start text-[13px] text-muted-foreground">
                  {copy.proof.map((item) => (
                    <div key={item} className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>{item}</span>
                    </div>
                  ))}
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
                      <Sparkles className="h-3 w-3 text-[var(--ecode-accent-text)]" />
                      {PRODUCT_HOST}
                    </span>
                  </div>
                  <img
                    src="/ecode-static/assets/product/ide.png"
                    alt={copy.heroImageAlt}
                    className="block w-full h-auto"
                    loading="eager"
                  />
                  <figcaption className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2 text-[11px] text-white">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 backdrop-blur">
                      <Sparkles className="h-3.5 w-3.5 text-[#F99D25]" />
                      {copy.heroCaptions[0]}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 backdrop-blur">
                      <Rocket className="h-3.5 w-3.5 text-[#F99D25]" />
                      {copy.heroCaptions[1]}
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
              <h2 className="mkt-h2 mb-4">{copy.stepsIntro.title}</h2>
              <p className="mkt-body text-muted-foreground">{copy.stepsIntro.description}</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 mb-12">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto bg-gradient-to-br from-[#F26207] to-[#F99D25] shadow-lg shadow-[#F26207]/25">
                  <MessageSquarePlus className="h-8 w-8 text-white" />
                </div>
                <h3 className="mkt-h3">{copy.steps[0]?.title}</h3>
                <p className="mkt-body text-muted-foreground">{copy.steps[0]?.description}</p>
              </div>

              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto bg-gradient-to-br from-[#F26207] to-[#F99D25] shadow-lg shadow-[#F26207]/25">
                  <Sparkles className="h-8 w-8 text-white" />
                </div>
                <h3 className="mkt-h3">{copy.steps[1]?.title}</h3>
                <p className="mkt-body text-muted-foreground">{copy.steps[1]?.description}</p>
              </div>

              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto bg-gradient-to-br from-[#F26207] to-[#F99D25] shadow-lg shadow-[#F26207]/25">
                  <Rocket className="h-8 w-8 text-white" />
                </div>
                <h3 className="mkt-h3">{copy.steps[2]?.title}</h3>
                <p className="mkt-body text-muted-foreground">{copy.steps[2]?.description}</p>
              </div>
            </div>

            {/* Real IDE capture — the Agent at work */}
            <Card className="overflow-hidden max-w-4xl mx-auto">
              <CardHeader className="bg-gradient-to-r from-[#F26207] to-[#F99D25] text-white">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3 text-left">
                    <Sparkles className="mt-1 h-6 w-6" />
                    <div>
                      <CardTitle>{copy.capture.title}</CardTitle>
                      <CardDescription className="text-white/80">{copy.capture.description}</CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary" className="self-start bg-white/20 text-white md:self-center">
                    <Sparkles className="h-3 w-3 mr-1" />
                    {copy.capture.badge}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0 bg-black">
                <img
                  src="/ecode-static/assets/product/ide-deploy.png"
                  alt={copy.capture.imageAlt}
                  className="block w-full h-auto"
                  loading="lazy"
                />
                <div className="space-y-2 px-6 py-6 mkt-small text-white/75 md:flex md:items-center md:justify-between md:gap-6">
                  <p className="md:max-w-2xl">{copy.capture.body}</p>
                  <Button size="sm" variant="secondary" className="mt-4 md:mt-0" asChild>
                    <a href="#agent-demo">{copy.capture.action}</a>
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
              <h2 className="mkt-h2 mb-4">{copy.demoIntro.title}</h2>
              <p className="mkt-lead text-muted-foreground max-w-3xl mx-auto">{copy.demoIntro.description}</p>
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
                      <Sparkles className="h-3 w-3 text-[var(--ecode-accent-text)]" />
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
                    <CardTitle className="mkt-h3">{copy.exploreTitle}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {agentShots.map((shot) => (
                      <button
                        key={shot.id}
                        type="button"
                        onClick={() => setSelectedShotId(shot.id)}
                        aria-pressed={selectedShot.id === shot.id}
                        className={`w-full text-left p-3 rounded-lg transition-colors group ${
                          selectedShot.id === shot.id ? 'bg-muted border border-primary/40 shadow-sm' : 'hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={shot.image}
                            alt={shot.previewAlt}
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
                                  {copy.viewing}
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
                      {copy.lookingTitle}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 text-[13px]">
                      {copy.lookingItems.map((item, index) => {
                        const Icon = LOOKING_ICONS[index] ?? Sparkles;

                        return (
                          <li key={item} className="flex items-start gap-2">
                            <Icon className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                            <span>{item}</span>
                          </li>
                        );
                      })}
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
              <h2 className="mkt-h2 mb-4">{copy.moreIntro.title}</h2>
              <p className="mkt-body text-muted-foreground">{copy.moreIntro.description}</p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 gap-2 mb-8 sm:grid-cols-4">
                <TabsTrigger value="overview">{copy.tabs.overview}</TabsTrigger>
                <TabsTrigger value="capabilities">{copy.tabs.capabilities}</TabsTrigger>
                <TabsTrigger value="examples">{copy.tabs.examples}</TabsTrigger>
                <TabsTrigger value="comparison">{copy.tabs.comparison}</TabsTrigger>
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
                      <CardTitle>{copy.languageSupport.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="mkt-body text-muted-foreground mb-4">{copy.languageSupport.description}</p>
                      <div className="flex flex-wrap gap-2">
                        {copy.languageSupport.technologies.map((technology) => (
                          <Badge key={technology} variant="secondary">
                            {technology}
                          </Badge>
                        ))}
                        <Badge variant="secondary">{copy.languageSupport.more}</Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <Brain className="h-8 w-8 text-primary mb-2" />
                      <CardTitle>{copy.architecture.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="mkt-body text-muted-foreground mb-4">{copy.architecture.description}</p>
                      <ul className="space-y-1 mkt-small">
                        {copy.architecture.points.map((point) => (
                          <li key={point}>• {point}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <Zap className="h-8 w-8 text-primary mb-2" />
                      <CardTitle>{copy.speed.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="mkt-body text-muted-foreground mb-4">{copy.speed.description}</p>
                      <div className="space-y-2">
                        {copy.speed.metrics.map((metric) => (
                          <div key={metric.label} className="flex justify-between gap-4 mkt-small">
                            <span>{metric.label}</span>
                            <span className="font-semibold whitespace-nowrap">{metric.value}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="examples" className="space-y-6">
                <div className="space-y-8">
                  {useCases.map((category) => (
                    <div key={category.id}>
                      <h3 className="mkt-h3 mb-4">{category.heading}</h3>
                      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {category.apps.map((app) => {
                          const Icon = USE_CASE_ICONS[app.id] ?? Sparkles;

                          return (
                            <Card key={app.id} className="hover:shadow-lg transition-all cursor-pointer">
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <Icon className="h-4 w-4" />
                                  <Badge variant="outline" className="text-[11px]">
                                    {app.time}
                                  </Badge>
                                </div>
                                <h4 className="font-semibold">{app.name}</h4>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="comparison" className="space-y-6">
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="mkt-h3 mb-6">{copy.comparison.traditionalTitle}</h3>
                    <ul className="space-y-3">
                      {copy.comparison.traditionalItems.map((item) => (
                        <li key={item} className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-red-600 dark:text-red-400 text-[11px]">✗</span>
                          </div>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="mkt-h3 mb-6">{copy.comparison.agentTitle}</h3>
                    <ul className="space-y-3">
                      {copy.comparison.agentItems.map((item) => (
                        <li key={item} className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-green-600 dark:text-green-400 text-[11px]">✓</span>
                          </div>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-12 text-center">
                  <Card className="bg-gradient-to-r from-[#F26207] to-[#F99D25] text-white max-w-2xl mx-auto">
                    <CardContent className="p-8">
                      <h3 className="mkt-h3 mb-4">{copy.comparison.ctaTitle}</h3>
                      <p className="mkt-body mb-6">{copy.comparison.ctaDescription}</p>
                      <Button size="lg" variant="secondary" onClick={handleGetStarted} className="gap-2">
                        {copy.comparison.ctaAction}
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
              {copy.stats.map((stat) => (
                <div key={stat.label}>
                  <div className="text-4xl font-bold text-primary mb-2">{stat.value}</div>
                  <div className="text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20">
          <div className="container-responsive max-w-4xl text-center">
            <h2 className="mkt-h2 mb-6">{copy.finalCta.title}</h2>
            <p className="mkt-body text-muted-foreground mb-8">{copy.finalCta.description}</p>
            <Button size="lg" onClick={handleGetStarted} className="gap-2">
              {copy.finalCta.action}
              <Sparkles className="h-4 w-4" />
            </Button>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
