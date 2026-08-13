/**
 * LandingOptimized - Fortune 500 Performance Optimized Landing Page
 *
 * Architecture:
 * - Hero section loads immediately (critical path)
 * - All other sections are lazy-loaded via IntersectionObserver
 * - Minimal imports in initial bundle
 * - CSS animations instead of JS for below-fold content
 */

import {
  Sparkles,
  CheckCircle,
  PlayCircle,
  ArrowRight,
  ChevronRight,
  ShoppingCart,
  MessageSquare,
  Bot,
  LineChart,
  Briefcase,
  ListTodo,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { buildPromptForMode, resolveDemoScrollTarget } from './landing-build-intent';
import {
  BuildModeSelector,
  type BuildMode,
  useEcodeToast,
  useStaticTemplatesQuery,
} from '~/components/marketing/ecode-exact/EcodeExactLandingControls';
import { EcodeExactPublicShell as MarketingLayout } from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  Badge,
  Button,
  usePublicAuth as useAuth,
  useWouterLocation,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import { DeferredSections } from '~/components/marketing/ecode-exact/landing/DeferredSections';
import {
  readPersistedModelId,
  readPersistedProvider,
} from '~/components/marketing/ecode-exact/resolve-preferred-model';
import { scrollToElement, scrollWindowBy } from '~/lib/scroll-to';
import { stashModelHandoff } from '~/utils/model-handoff';

/*
 * Number of reveal-and-retry attempts the "Watch Demo" CTA makes while the lazy
 * video section mounts, and the delay between them. ~10 * 120ms ≈ 1.2s covers the
 * smooth-scroll + IntersectionObserver + Suspense mount of LandingVideo.
 */
const DEMO_SCROLL_MAX_ATTEMPTS = 10;
const DEMO_SCROLL_RETRY_MS = 120;

export default function LandingOptimized() {
  const [, navigate] = useWouterLocation();
  const { user } = useAuth();
  const { toast } = useEcodeToast();
  const [appDescription, setAppDescription] = useState('');
  const [buildModeDialogOpen, setBuildModeDialogOpen] = useState(false);
  const [pendingBuildPrompt, setPendingBuildPrompt] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);

  useEffect(() => {
    const triggerBuild = sessionStorage.getItem('triggerBuildOnLanding');
    const pendingPrompt = sessionStorage.getItem('pendingAppDescription');

    if (user && triggerBuild === 'true' && pendingPrompt) {
      sessionStorage.removeItem('triggerBuildOnLanding');
      handleStartBuilding(pendingPrompt);
    }
  }, [user]);

  const { data: templates = [], isLoading: templatesLoading } = useStaticTemplatesQuery<any[]>();

  const handleStartBuilding = async (description: string) => {
    const trimmed = description.trim();

    if (!trimmed) {
      return;
    }

    /*
     * `usePublicAuth()` on the public marketing shell is a stub that always
     * returns `{ user: null }`, so the old `if (!user)` branch fired for
     * EVERYONE — logged-in users included — bouncing them to /login with no
     * returnTo, which defaults to /dashboard and silently dropped the prompt.
     * Don't gate on a client-side auth signal we can't observe here: open the
     * build-mode picker for everyone and let /projects/new own auth. Its loader
     * redirects logged-out visitors to /login?returnTo=/projects/new and resumes
     * there after sign-in, so the prompt survives login without ever being
     * detoured through /dashboard.
     */
    setPendingBuildPrompt(trimmed);
    setBuildModeDialogOpen(true);
  };

  const handleBuildModeSelect = async (mode: BuildMode) => {
    setBuildModeDialogOpen(false);

    if (mode === 'continue-planning') {
      toast({
        title: 'Continue refining',
        description: 'Take your time to refine your app description',
      });
      return;
    }

    // Prevent duplicate builds
    if (isBuilding) {
      return;
    }

    setIsBuilding(true);

    /*
     * Route into the canonical project-creation flow at /projects/new instead of
     * the legacy POST /api/workspace/bootstrap, which never existed (404) and
     * navigated to the /ide/:id marketing shim rather than the real IDE. The
     * /projects/new loader seeds its composer from ?prompt= and runs the real
     * /orgs/:id/projects/from-ai generation + workspace provisioning, then
     * redirects to the authenticated project IDE — the same path the dashboard
     * "Create project" button uses. This gives the homepage and dashboard a
     * single, working create flow.
     */
    /*
     * Fold the chosen mode INTO the prompt. /projects/new only reads ?prompt=
     * (it ignores ?buildMode= and sessionStorage), so a design-first selection
     * would otherwise be dropped and generate the same full app as full-app.
     * buildPromptForMode prepends an explicit design-first directive so the
     * choice has a real, observable effect through the only channel the create
     * flow consumes.
     */
    const prompt = buildPromptForMode(mode, pendingBuildPrompt);

    /*
     * Hand the prompt off via sessionStorage (NOT the URL) so the user's app
     * idea never lands in a query string, browser history or Referer header,
     * and so it survives the /projects/new -> /login?returnTo -> /projects/new
     * round-trip for logged-out visitors (same-origin sessionStorage persists
     * across the login redirect). `composerBuildIntent` tells /projects/new to
     * auto-submit the create form on arrival instead of waiting for a click.
     */
    try {
      sessionStorage.setItem('pendingAppDescription', prompt);
      sessionStorage.setItem('pendingBuildMode', mode);
      sessionStorage.setItem('composerBuildIntent', '1');
      sessionStorage.removeItem('triggerBuildOnLanding');

      /*
       * Forward the visitor's chosen AI model into the same hand-off so
       * /projects/new generates with it instead of the platform default. The
       * model selector persists the chosen id + provider to localStorage; a
       * non-empty id means the visitor actually made a selection (the default
       * placeholder never writes storage), so we only stash a real choice.
       */
      const chosenModelId = readPersistedModelId();

      if (chosenModelId) {
        stashModelHandoff(chosenModelId, readPersistedProvider());
      }
    } catch {
      /*
       * sessionStorage blocked (private mode) — /projects/new still renders; the
       * visitor just retypes the idea once. Better than throwing here.
       */
    }

    setPendingBuildPrompt('');

    toast({
      title: 'Setting up your project…',
      description:
        mode === 'design-first'
          ? 'Opening the builder to create your design prototype'
          : 'Opening the builder to generate your full application',
    });

    navigate('/projects/new');
  };

  /*
   * The #video-demo anchor only exists once the lazy LandingVideo section mounts
   * via IntersectionObserver, so on first paint a plain getElementById(...) is
   * null and the demo CTA did nothing. Nudge the page toward the video region to
   * trip the observer, then retry until the anchor appears (bounded), and scroll
   * to it. window.scrollBy is a no-op in jsdom, which is fine — the retry logic
   * itself is unit-tested via resolveDemoScrollTarget.
   */
  const scrollToVideoDemo = () => {
    const attempt = (attemptsRemaining: number) => {
      const anchor = document.getElementById('video-demo');
      const action = resolveDemoScrollTarget(Boolean(anchor), attemptsRemaining);

      if (action.kind === 'scroll-to-anchor') {
        if (anchor) {
          scrollToElement(anchor);
        }

        return;
      }

      if (action.kind === 'give-up') {
        return;
      }

      scrollWindowBy(window.innerHeight);
      window.setTimeout(() => attempt(attemptsRemaining - 1), DEMO_SCROLL_RETRY_MS);
    };

    attempt(DEMO_SCROLL_MAX_ATTEMPTS);
  };

  const examples = [
    {
      icon: <ShoppingCart className="h-4 w-4" />,
      label: 'E-commerce Platform',
      text: 'Build a full-stack e-commerce marketplace with Stripe payments, product catalog with search and filters, shopping cart with checkout flow, user authentication, order management dashboard',
      color: 'from-ecode-orange to-ecode-orange-light',
      id: 'ecommerce',
    },
    {
      icon: <MessageSquare className="h-4 w-4" />,
      label: 'Real-time Chat',
      text: 'Create a Slack-like real-time messaging platform with WebSocket connections, public and private channels, direct messages, file sharing, typing indicators',
      color: 'from-ecode-orange-light to-ecode-yellow',
      id: 'chat',
    },
    {
      icon: <Bot className="h-4 w-4" />,
      label: 'AI Assistant',
      text: 'Build an intelligent AI chatbot with OpenAI GPT-5 integration, conversation memory, document upload for RAG knowledge base, streaming responses',
      color: 'from-ecode-orange to-ecode-orange-hover',
      id: 'chatbot',
    },
    {
      icon: <LineChart className="h-4 w-4" />,
      label: 'Analytics Dashboard',
      text: 'Design a Fortune 500-grade analytics dashboard with real-time interactive charts, KPI widgets, data tables with filtering, date range picker',
      color: 'from-ecode-yellow to-ecode-orange',
      id: 'dashboard',
    },
    {
      icon: <Briefcase className="h-4 w-4" />,
      label: 'SaaS Starter',
      text: 'Create a complete SaaS starter kit with landing page, pricing tiers, Stripe subscription billing, user authentication, team management',
      color: 'from-ecode-orange-hover to-ecode-orange',
      id: 'saas',
    },
    {
      icon: <ListTodo className="h-4 w-4" />,
      label: 'Project Management',
      text: 'Build a Jira-like project management tool with drag-and-drop Kanban boards, sprint planning, task assignments, time tracking',
      color: 'from-ecode-orange-light to-ecode-orange',
      id: 'project',
    },
  ];

  return (
    <MarketingLayout>
      {/* Hero Section - Critical Path (loads immediately) */}
      <section
        className="relative min-h-[90vh] flex items-center justify-center overflow-hidden bg-[var(--ecode-background)] animate-fade-in"
        data-testid="section-hero"
      >
        <div className="absolute inset-0 bg-grid-pattern opacity-5 dark:opacity-10" />

        <div className="container-responsive relative z-10 max-w-7xl text-center px-4 py-20">
          <div className="space-y-8">
            <Badge
              variant="outline"
              className="mx-auto inline-flex items-center gap-2 px-6 py-2 text-[13px] font-semibold text-[var(--ecode-text)] shadow-[0_12px_42px_-34px_rgba(242,98,7,0.65)] animate-fade-in"
              style={{
                background: 'linear-gradient(90deg, rgba(242, 98, 7, 0.06), rgba(247, 127, 0, 0.06))',
                borderColor: 'rgba(242, 98, 7, 0.2)',
              }}
              data-testid="badge-hero"
            >
              <Sparkles className="h-4 w-4 text-ecode-accent" />
              AI-Powered Enterprise Development Platform
              <Sparkles className="h-4 w-4 text-ecode-accent" />
            </Badge>

            <h1
              className="text-[44px] sm:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tight animate-fade-in"
              style={{ animationDelay: '100ms' }}
              data-testid="heading-hero"
            >
              <span className="text-[var(--ecode-text)]">Build & Deploy</span>
              <br />
              <span className="bg-gradient-to-r from-ecode-orange via-ecode-orange-light to-ecode-yellow bg-clip-text text-transparent">
                Production Apps
              </span>
              <br />
              <span className="text-[var(--ecode-text)]">in Minutes</span>
            </h1>

            <p
              className="mx-auto max-w-3xl text-xl sm:text-2xl text-[var(--ecode-text-muted)] font-medium animate-fade-in"
              style={{ animationDelay: '200ms' }}
              data-testid="text-hero-description"
            >
              The only platform that combines AI agents, cloud infrastructure, and enterprise security to deliver
              Fortune 500 development velocity to every team.
            </p>

            <div className="max-w-4xl mx-auto mt-8 animate-fade-in" style={{ animationDelay: '400ms' }}>
              <div className="relative group">
                <div className="absolute -inset-1 rounded-2xl blur-lg opacity-20 group-hover:opacity-30 transition-all duration-300 bg-gradient-to-br from-ecode-orange via-ecode-orange-light to-ecode-yellow" />

                <div className="relative bg-[var(--ecode-surface)] border border-[var(--ecode-border)] rounded-2xl p-2 shadow-[0_8px_32px_-8px_rgba(242,98,7,0.15)] transition-all duration-300 hover:border-ecode-accent/30">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Describe your app idea in any language..."
                        className="w-full bg-transparent border-none outline-none text-base sm:text-[15px] placeholder:text-[var(--ecode-text-muted)] text-[var(--ecode-text)] px-4 sm:px-6 py-3 sm:py-4"
                        value={appDescription}
                        onChange={(e) => setAppDescription(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && appDescription.trim()) {
                            handleStartBuilding(appDescription);
                          }
                        }}
                        data-testid="input-app-description"
                      />
                    </div>
                    <Button
                      size="lg"
                      className="bg-ecode-accent hover:bg-ecode-accent-hover text-white shadow-lg px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-[15px] font-semibold h-auto min-h-[44px] rounded-xl transition-all duration-300 hover:scale-105"
                      onClick={() => appDescription.trim() && handleStartBuilding(appDescription)}
                      disabled={!appDescription.trim()}
                      data-testid="button-build-now"
                    >
                      <Sparkles className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                      Build Now
                    </Button>
                  </div>
                </div>
              </div>

              {/* Mobile-only: surface the secondary CTAs right under the prompt (hidden at sm+, where the original row below renders). */}
              <div className="sm:hidden mt-4 flex flex-col gap-3">
                <Button
                  size="lg"
                  variant="outline"
                  className="gap-2 px-6 py-4 text-base border-2 border-[var(--ecode-border)] hover:border-ecode-accent/50 w-full min-h-[48px]"
                  onClick={scrollToVideoDemo}
                  data-testid="button-watch-demo-mobile"
                >
                  <PlayCircle className="h-4 w-4 text-ecode-accent" />
                  Watch Demo (2 min)
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  className="gap-2 px-6 py-4 text-base w-full min-h-[48px] text-[var(--ecode-text)] hover:text-ecode-accent"
                  onClick={() => navigate('/pricing')}
                  data-testid="button-view-pricing-mobile"
                >
                  View Pricing
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-8 space-y-4 animate-fade-in" style={{ animationDelay: '500ms' }}>
                <p className="text-[13px] text-[var(--ecode-text-muted)] text-center">Try these popular examples:</p>
                <div className="relative sm:static">
                  <div className="vc-no-scrollbar flex flex-nowrap justify-start gap-3 overflow-x-auto pb-1 sm:flex-wrap sm:justify-center sm:overflow-visible sm:pb-0">
                    {examples.map((example, index) => (
                      <button
                        key={index}
                        onClick={() => setAppDescription(example.text)}
                        className="group flex shrink-0 items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-[var(--ecode-surface)] border border-[var(--ecode-border)] hover:border-ecode-accent/50 transition-all duration-300 hover:scale-105 min-h-[44px]"
                        data-testid={`button-example-${example.id}`}
                      >
                        <div className={`bg-gradient-to-r ${example.color} text-white p-1.5 rounded-md`}>
                          {example.icon}
                        </div>
                        <span className="whitespace-nowrap text-[11px] sm:text-[13px] font-medium text-[var(--ecode-text)]">
                          {example.label}
                        </span>
                      </button>
                    ))}
                  </div>
                  {/* Right-edge fade hinting at more chips off-screen (mobile only). */}
                  <span
                    className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-[var(--ecode-background)] to-transparent sm:hidden"
                    aria-hidden
                  />
                </div>
              </div>

              <div
                className="flex flex-wrap justify-center gap-4 mt-6 animate-fade-in"
                style={{ animationDelay: '600ms' }}
              >
                <div className="flex items-center gap-2 text-[13px] text-[var(--ecode-text-muted)]">
                  <CheckCircle className="h-4 w-4 text-ecode-accent" />
                  No credit card required
                </div>
                <div className="flex items-center gap-2 text-[13px] text-[var(--ecode-text-muted)]">
                  <CheckCircle className="h-4 w-4 text-ecode-accent" />
                  Deploy instantly
                </div>
                <div className="flex items-center gap-2 text-[13px] text-[var(--ecode-text-muted)]">
                  <CheckCircle className="h-4 w-4 text-ecode-accent" />
                  Scale to millions
                </div>
              </div>
            </div>

            <div
              className="hidden sm:flex sm:flex-row gap-3 sm:gap-4 justify-center items-center mt-8 animate-fade-in"
              style={{ animationDelay: '700ms' }}
            >
              <Button
                size="lg"
                variant="outline"
                className="gap-2 px-6 sm:px-8 py-4 sm:py-6 text-base sm:text-[15px] border-2 border-[var(--ecode-border)] hover:border-ecode-accent/50 w-full sm:w-auto min-h-[48px]"
                onClick={scrollToVideoDemo}
                data-testid="button-watch-demo"
              >
                <PlayCircle className="h-4 w-4 sm:h-5 sm:w-5 text-ecode-accent" />
                Watch Demo (2 min)
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="gap-2 px-6 sm:px-8 py-4 sm:py-6 text-base sm:text-[15px] w-full sm:w-auto min-h-[48px] text-[var(--ecode-text)] hover:text-ecode-accent"
                onClick={() => navigate('/pricing')}
                data-testid="button-view-pricing"
              >
                View Pricing
                <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
          <ChevronRight className="h-8 w-8 text-[var(--ecode-text-muted)] rotate-90" />
        </div>
      </section>

      {/* Deferred Sections - Lazy loaded via IntersectionObserver */}
      <DeferredSections templates={templates} templatesLoading={templatesLoading} />

      {/* BuildModeSelector Dialog */}
      <BuildModeSelector
        open={buildModeDialogOpen}
        onOpenChange={setBuildModeDialogOpen}
        onSelectMode={handleBuildModeSelect}
      />
    </MarketingLayout>
  );
}
