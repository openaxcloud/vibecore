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
  Globe,
  Briefcase,
  ListTodo,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import {
  AIModelSelector,
  apiRequest,
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
    if (!user) {
      sessionStorage.setItem('pendingAppDescription', description);
      sessionStorage.setItem('triggerBuildOnLanding', 'true');
      toast({
        title: 'Sign in required',
        description: 'Please sign in to create your workspace',
      });
      navigate('/login');

      return;
    }

    setPendingBuildPrompt(description);
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

    try {
      const result = (await apiRequest('POST', '/api/workspace/bootstrap', {
        prompt: pendingBuildPrompt,
        buildMode: mode,
        options: { autoStart: true, language: 'typescript', framework: 'react' },
      })) as any;

      if (result.success) {
        sessionStorage.setItem(`agent-prompt-${result.projectId}`, pendingBuildPrompt);
        sessionStorage.setItem(`agent-build-mode-${result.projectId}`, mode);
        sessionStorage.removeItem('pendingAppDescription');
        sessionStorage.removeItem('triggerBuildOnLanding');
        setPendingBuildPrompt('');

        toast({
          title: 'Creating your workspace...',
          description:
            mode === 'design-first'
              ? 'AI is creating your design prototype now'
              : 'AI is generating your full application now',
        });
        navigate(`/ide/${result.projectId}?bootstrap=${result.bootstrapToken}&buildMode=${mode}`);
      } else {
        throw new Error(result.error || 'Bootstrap failed');
      }
    } catch (error: any) {
      setIsBuilding(false);

      // Handle auth errors silently - user is already being redirected to login by queryClient
      if (
        error?.status === 401 ||
        error?.status === 403 ||
        error?.message?.includes('Unauthorized') ||
        error?.message?.includes('403')
      ) {
        // Store prompt so user can continue after login
        sessionStorage.setItem('pendingAppDescription', pendingBuildPrompt);
        sessionStorage.setItem('triggerBuildOnLanding', 'true');
        navigate('/login');

        return;
      }

      toast({
        title: 'Error',
        description: 'Failed to create workspace. Please try again.',
        variant: 'destructive',
      });
    }
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
      icon: <Globe className="h-4 w-4" />,
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
        style={{ fontFamily: 'var(--ecode-font-sans)' }}
        data-testid="section-hero"
      >
        <div className="absolute inset-0 bg-grid-pattern opacity-5 dark:opacity-10" />

        <div className="container-responsive relative z-10 max-w-7xl text-center px-4 py-20">
          <div className="space-y-8">
            <Badge
              variant="secondary"
              className="mx-auto inline-flex items-center gap-2 px-6 py-2 text-[13px] font-semibold bg-gradient-to-r from-ecode-accent/10 to-ecode-secondary-accent/10 border border-ecode-accent/20 animate-fade-in"
              data-testid="badge-hero"
            >
              <Sparkles className="h-4 w-4 text-ecode-accent" />
              AI-Powered Enterprise Development Platform
              <Sparkles className="h-4 w-4 text-ecode-accent" />
            </Badge>

            <h1
              className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tight animate-fade-in"
              style={{ animationDelay: '100ms' }}
              data-testid="heading-hero"
            >
              <span className="bg-gradient-to-r from-[var(--ecode-text)] to-[var(--ecode-text-secondary)] bg-clip-text text-transparent">
                Build & Deploy
              </span>
              <br />
              <span className="bg-gradient-to-r from-ecode-orange via-ecode-orange-light to-ecode-yellow bg-clip-text text-transparent">
                Production Apps
              </span>
              <br />
              <span className="bg-gradient-to-r from-[var(--ecode-text)] to-[var(--ecode-text-secondary)] bg-clip-text text-transparent">
                in Minutes
              </span>
            </h1>

            <p
              className="mx-auto max-w-3xl text-xl sm:text-2xl text-[var(--ecode-text-muted)] font-medium animate-fade-in"
              style={{ animationDelay: '200ms' }}
              data-testid="text-hero-description"
            >
              The only platform that combines AI agents, cloud infrastructure, and enterprise security to deliver
              Fortune 500 development velocity to every team.
            </p>

            <div className="max-w-4xl mx-auto mt-8 animate-fade-in" style={{ animationDelay: '300ms' }}>
              <div className="flex justify-center">
                <AIModelSelector variant="card" className="w-full max-w-2xl" />
              </div>
            </div>

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

              <div className="mt-8 space-y-4 animate-fade-in" style={{ animationDelay: '500ms' }}>
                <p className="text-[13px] text-[var(--ecode-text-muted)] text-center">Try these popular examples:</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {examples.map((example, index) => (
                    <button
                      key={index}
                      onClick={() => setAppDescription(example.text)}
                      className="group flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-[var(--ecode-surface)] border border-[var(--ecode-border)] hover:border-ecode-accent/50 transition-all duration-300 hover:scale-105 min-h-[44px]"
                      data-testid={`button-example-${example.id}`}
                    >
                      <div className={`bg-gradient-to-r ${example.color} text-white p-1.5 rounded-md`}>
                        {example.icon}
                      </div>
                      <span className="text-[11px] sm:text-[13px] font-medium text-[var(--ecode-text)]">
                        {example.label}
                      </span>
                    </button>
                  ))}
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
              className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center mt-8 animate-fade-in"
              style={{ animationDelay: '700ms' }}
            >
              <Button
                size="lg"
                variant="outline"
                className="gap-2 px-6 sm:px-8 py-4 sm:py-6 text-base sm:text-[15px] border-2 border-[var(--ecode-border)] hover:border-ecode-accent/50 w-full sm:w-auto min-h-[48px]"
                onClick={() => document.getElementById('video-demo')?.scrollIntoView({ behavior: 'smooth' })}
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
