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
import { useTranslation } from 'react-i18next';
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
import {
  formatLandingDemoLabel,
  getMarketingExactLandingForumCopy,
  type LandingExampleId,
} from '~/lib/i18n/catalogs/marketing-exact-landing-forum';
import { scrollToElement, scrollWindowBy } from '~/lib/scroll-to';
import { stashModelHandoff } from '~/utils/model-handoff';

/*
 * Number of reveal-and-retry attempts the "Watch Demo" CTA makes while the lazy
 * video section mounts, and the delay between them. ~10 * 120ms ≈ 1.2s covers the
 * smooth-scroll + IntersectionObserver + Suspense mount of LandingVideo.
 */
const DEMO_SCROLL_MAX_ATTEMPTS = 10;
const DEMO_SCROLL_RETRY_MS = 120;
const DEMO_DURATION_MINUTES = 2;

const EXAMPLE_VISUALS: Record<LandingExampleId, { icon: typeof ShoppingCart; color: string }> = {
  ecommerce: { icon: ShoppingCart, color: 'from-ecode-orange to-ecode-orange-light' },
  chat: { icon: MessageSquare, color: 'from-ecode-orange-light to-ecode-yellow' },
  chatbot: { icon: Bot, color: 'from-ecode-orange to-ecode-orange-hover' },
  dashboard: { icon: LineChart, color: 'from-ecode-yellow to-ecode-orange' },
  saas: { icon: Briefcase, color: 'from-ecode-orange-hover to-ecode-orange' },
  project: { icon: ListTodo, color: 'from-ecode-orange-light to-ecode-orange' },
};

export default function LandingOptimized() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingExactLandingForumCopy(language).exactLanding;
  const demoLabel = formatLandingDemoLabel(copy.hero.watchDemo, DEMO_DURATION_MINUTES, language);
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
        title: copy.toast.continueTitle,
        description: copy.toast.continueDescription,
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
    let handoffStored = true;

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
      handoffStored = false;

      /*
       * sessionStorage blocked (private mode) — /projects/new still renders; the
       * visitor just retypes the idea once. Better than throwing here.
       */
    }

    setPendingBuildPrompt('');

    const setupDescription =
      mode === 'design-first' ? copy.toast.setupDesignDescription : copy.toast.setupFullDescription;

    toast({
      title: handoffStored ? copy.toast.setupTitle : copy.toast.storageWarningTitle,
      description: handoffStored ? setupDescription : copy.toast.storageWarningDescription,
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

  const examples = copy.hero.examples.map((example) => ({
    ...example,
    ...EXAMPLE_VISUALS[example.id],
  }));

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
            {/*
             * `flex-wrap` broke the pill below ~430px: the label alone is wider
             * than the row, so the two decorative sparkles wrapped onto lines of
             * their own and the `rounded-full` badge became a 106px-tall slab.
             * `flex-nowrap` + `min-w-0` on the label keeps the sparkles flanking
             * the text and lets the text itself wrap inside the pill.
             */}
            <Badge
              variant="outline"
              className="mx-auto inline-flex max-w-full flex-nowrap items-center justify-center gap-2 border-ecode-accent/25 bg-ecode-accent/10 px-4 py-2 text-center text-[13px] font-semibold leading-snug text-[var(--ecode-text)] shadow-sm animate-fade-in sm:px-6"
              style={{
                background: 'linear-gradient(90deg, rgba(242, 98, 7, 0.06), rgba(247, 127, 0, 0.06))',
              }}
              data-testid="badge-hero"
            >
              <Sparkles className="h-4 w-4 shrink-0 text-ecode-accent-text" aria-hidden="true" />
              <span className="min-w-0 break-words">{copy.hero.badge}</span>
              <Sparkles className="h-4 w-4 shrink-0 text-ecode-accent-text" aria-hidden="true" />
            </Badge>

            <h1
              className="break-words text-[44px] sm:text-6xl lg:text-7xl xl:text-8xl font-bold leading-[1.05] tracking-tight animate-fade-in"
              style={{ animationDelay: '100ms' }}
              data-testid="heading-hero"
            >
              <span className="text-[var(--ecode-text)]">{copy.hero.titleLineOne}</span>
              <br />
              <span className="bg-gradient-to-r from-ecode-orange via-ecode-orange-light to-ecode-yellow bg-clip-text text-transparent">
                {copy.hero.titleLineTwo}
              </span>
              <br />
              <span className="text-[var(--ecode-text)]">{copy.hero.titleLineThree}</span>
            </h1>

            <p
              className="mx-auto max-w-3xl break-words text-lg font-medium leading-relaxed text-[var(--ecode-text-muted)] animate-fade-in sm:text-2xl"
              style={{ animationDelay: '200ms' }}
              data-testid="text-hero-description"
            >
              {copy.hero.description}
            </p>

            <div className="max-w-4xl mx-auto mt-8 animate-fade-in" style={{ animationDelay: '400ms' }}>
              <div className="relative group">
                <div className="absolute -inset-1 rounded-2xl blur-lg opacity-20 group-hover:opacity-30 transition-all duration-300 bg-gradient-to-br from-ecode-orange via-ecode-orange-light to-ecode-yellow" />

                <div className="relative bg-[var(--ecode-surface)] border border-[var(--ecode-border)] rounded-2xl p-2 shadow-[0_8px_32px_-8px_rgba(242,98,7,0.15)] transition-all duration-300 hover:border-ecode-accent/30">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder={copy.hero.placeholder}
                        aria-label={copy.hero.placeholder}
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
                      className="min-w-0 whitespace-normal bg-ecode-accent px-6 py-3 text-base font-semibold leading-snug text-white shadow-lg transition-all duration-300 hover:bg-ecode-accent-hover sm:px-8 sm:py-4 sm:text-[15px] sm:hover:scale-105"
                      onClick={() => appDescription.trim() && handleStartBuilding(appDescription)}
                      disabled={!appDescription.trim() || isBuilding}
                      aria-busy={isBuilding}
                      data-testid="button-build-now"
                    >
                      <Sparkles className="mr-2 h-4 w-4 shrink-0 sm:h-5 sm:w-5" aria-hidden="true" />
                      {isBuilding ? copy.hero.building : copy.hero.buildNow}
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
                  <PlayCircle className="h-4 w-4 shrink-0 text-ecode-accent-text" aria-hidden="true" />
                  <span className="min-w-0 break-words">{demoLabel}</span>
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  className="gap-2 px-6 py-4 text-base w-full min-h-[48px] text-[var(--ecode-text)] hover:text-ecode-accent-text"
                  onClick={() => navigate('/pricing')}
                  data-testid="button-view-pricing-mobile"
                >
                  <span className="min-w-0 break-words">{copy.hero.viewPricing}</span>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Button>
              </div>

              <div className="mt-8 space-y-4 animate-fade-in" style={{ animationDelay: '500ms' }}>
                <p className="break-words text-center text-[13px] text-[var(--ecode-text-muted)]">
                  {copy.hero.examplesTitle}
                </p>
                <div className="relative sm:static">
                  <div className="vc-no-scrollbar flex flex-nowrap justify-start gap-3 overflow-x-auto pb-1 sm:flex-wrap sm:justify-center sm:overflow-visible sm:pb-0">
                    {examples.map((example) => {
                      const Icon = example.icon;

                      return (
                        <button
                          key={example.id}
                          type="button"
                          onClick={() => setAppDescription(example.prompt)}
                          className="group flex shrink-0 items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-[var(--ecode-surface)] border border-[var(--ecode-border)] hover:border-ecode-accent/50 transition-all duration-300 hover:scale-105 min-h-[44px]"
                          data-testid={`button-example-${example.id}`}
                        >
                          <div className={`shrink-0 rounded-md bg-gradient-to-r ${example.color} p-1.5 text-white`}>
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </div>
                          <span className="whitespace-nowrap text-[11px] sm:text-[13px] font-medium text-[var(--ecode-text)]">
                            {example.label}
                          </span>
                        </button>
                      );
                    })}
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
                {copy.hero.assurances.map((assurance) => (
                  <div
                    key={assurance.id}
                    className="flex min-w-0 max-w-full items-center gap-2 text-[13px] text-[var(--ecode-text-muted)]"
                  >
                    <CheckCircle className="h-4 w-4 shrink-0 text-ecode-accent-text" aria-hidden="true" />
                    <span className="break-words">{assurance.text}</span>
                  </div>
                ))}
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
                <PlayCircle className="h-4 w-4 shrink-0 text-ecode-accent-text sm:h-5 sm:w-5" aria-hidden="true" />
                <span className="min-w-0 break-words">{demoLabel}</span>
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="gap-2 px-6 sm:px-8 py-4 sm:py-6 text-base sm:text-[15px] w-full sm:w-auto min-h-[48px] text-[var(--ecode-text)] hover:text-ecode-accent-text"
                onClick={() => navigate('/pricing')}
                data-testid="button-view-pricing"
              >
                <span className="min-w-0 break-words">{copy.hero.viewPricing}</span>
                <ArrowRight className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
          <ChevronRight className="h-8 w-8 rotate-90 text-[var(--ecode-text-muted)]" aria-hidden="true" />
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
