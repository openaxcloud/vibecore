import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Gauge,
  Info,
  Lock,
  Phone,
  PlayCircle,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Users,
  X,
} from 'lucide-react';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
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
  Switch,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useMarketingNavigate,
  usePublicAuth,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  COMPARISON_COLUMNS,
  type ComparisonCategory,
} from '~/components/marketing/ecode-exact/pages/pricing-comparison';
import { scrollToElement } from '~/lib/scroll-to';

type ApiPlan = {
  tier?: string;
  name?: string;
  interval?: string;
  price?: number;
  features?: string[];
};

interface PricingTier {
  /** Internal tier key (free/core/teams/enterprise) — used to route checkout. */
  tierKey: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  popular?: boolean;
  enterprise?: boolean;
  icon: ReactNode;
  gradient: string;
  features: {
    text: string;
    included: boolean;
    tooltip?: string;
    highlight?: boolean;
  }[];
  cta: string;
  ctaVariant?: 'default' | 'outline' | 'secondary';
}

export default function Pricing() {
  const navigate = useMarketingNavigate();
  const { user } = usePublicAuth();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('yearly');
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [apiPlans] = useState<ApiPlan[] | undefined>(undefined);
  const isLoading = false;
  const error = null;

  // UI metadata for each tier (icons, gradients, descriptions) - static display properties
  const tierUIMetadata: Record<
    string,
    {
      icon: ReactNode;
      gradient: string;
      description: string;
      popular?: boolean;
      enterprise?: boolean;
      ctaVariant: 'default' | 'outline' | 'secondary';
    }
  > = {
    free: {
      icon: <Rocket className="h-6 w-6" />,
      gradient: 'from-gray-600 to-gray-700',
      description: 'Free daily Agent credits to learn and build',
      ctaVariant: 'outline',
    },
    core: {
      icon: <Star className="h-6 w-6" />,
      gradient: 'from-[var(--ecode-accent)] to-[var(--ecode-accent)]/80',
      description: '€25/mo of credits, collaborators and any-region publishing',
      popular: true,
      ctaVariant: 'default',
    },
    teams: {
      icon: <Users className="h-6 w-6" />,
      gradient: 'from-blue-600 to-cyan-600',
      description: 'The most powerful models, more agents, premium support',
      ctaVariant: 'outline',
    },
    enterprise: {
      icon: <Building2 className="h-6 w-6" />,
      gradient: 'from-amber-600 to-orange-600',
      description: 'For large teams and Fortune 500 companies',
      enterprise: true,
      ctaVariant: 'default',
    },
  };

  // Default features for fallback when API is unavailable
  const defaultFeatures: Record<string, PricingTier['features']> = {
    // Replit-parity inclusions (replit.com/pricing).
    /*
     * Carte publique Starter : 5 AVANTAGES, AUCUN quota chiffré. Cette page
     * publiait « 5 projets actifs / 10 Go / 50 Go / 100 requêtes IA » —
     * des valeurs SANS SOURCE qui contredisaient à la fois le catalogue et ce
     * qui est réellement appliqué. Supprimées : les règles vivent dans le
     * contrat Starter + la rate card versionnée.
     */
    free: [
      { text: 'Free Agent credits, refreshed every day', included: true, highlight: true },
      { text: 'Full-stack database included', included: true },
      { text: 'Build slide decks, videos and animations', included: true },
      { text: 'One published project at a time', included: true },
      { text: 'Private or password-protected deployments', included: true },
      { text: 'Remove "Made with" badge', included: false },
      { text: 'Publish to any region', included: false },
      { text: 'Parallel agents', included: false },
    ],
    core: [
      { text: '€25/mo of credits', included: true, highlight: true },
      { text: 'Invite up to 5 collaborators', included: true },
      { text: 'Work in parallel with up to 2 agents', included: true, highlight: true },
      { text: 'Unlimited workspaces', included: true },
      { text: 'Publish to any region', included: true },
      { text: 'Remove "Made with" badge', included: true },
      { text: 'AI integrations', included: true },
      { text: 'Pay-as-you-go beyond credits', included: true },
    ],
    teams: [
      { text: '€100/mo of credits', included: true, highlight: true },
      { text: 'Invite up to 15 collaborators', included: true },
      { text: 'Invite up to 50 viewers', included: true },
      { text: 'Work in parallel with up to 10 agents', included: true, highlight: true },
      { text: 'Access to the most powerful models', included: true, highlight: true },
      { text: '28-day database rollbacks', included: true },
      { text: 'Premium support', included: true },
      { text: 'Everything in Core', included: true },
    ],
    enterprise: [
      { text: 'Custom seat limits', included: true, highlight: true },
      { text: 'SSO / SAML with SCIM', included: true },
      { text: 'Advanced privacy controls', included: true },
      { text: 'Single-tenant environments', included: true },
      { text: 'Region selection + static outbound IPs', included: true },
      { text: 'VPC peering', included: true },
      { text: 'Data warehouse connections', included: true },
      { text: 'Design system support', included: true },
      { text: 'Dedicated support', included: true },
    ],
  };

  // Default prices (fallback when API unavailable)
  const defaultPrices: Record<string, { monthly: number; yearly: number }> = {
    free: { monthly: 0, yearly: 0 },

    /*
     * Replit parity: Core $25/mo ($20/mo billed annually, 20% off);
     * Pro $100/mo ($95/mo billed annually, ~5% off).
     */
    core: { monthly: 25, yearly: 20 },
    teams: { monthly: 100, yearly: 95 },
    enterprise: { monthly: 0, yearly: 0 },
  };

  const tiers: PricingTier[] = useMemo(() => {
    // Group API plans by tier
    const apiPrices: Record<string, { monthly?: number; yearly?: number; features?: string[] }> = {};

    if (apiPlans && apiPlans.length > 0) {
      apiPlans.forEach((plan) => {
        const tierName = (plan.tier || plan.name || '').toLowerCase();

        if (!apiPrices[tierName]) {
          apiPrices[tierName] = {};
        }

        if (plan.interval === 'month') {
          apiPrices[tierName].monthly = plan.price;

          if (plan.features) {
            apiPrices[tierName].features = plan.features;
          }
        } else if (plan.interval === 'year') {
          apiPrices[tierName].yearly = plan.price;

          if (plan.features) {
            apiPrices[tierName].features = plan.features;
          }
        }
      });
    }

    /*
     * Build tiers using API prices when available, fallback to defaults.
     * Internal keys stay free/core/teams/enterprise (used by the comparison
     * table + API mapping); display names follow the Replit-parity model.
     */
    const tierOrder = ['free', 'core', 'teams', 'enterprise'];

    const tierDisplayNames: Record<string, string> = {
      free: 'Starter',
      core: 'Core',
      teams: 'Pro',
      enterprise: 'Enterprise',
    };

    return tierOrder.map((tierKey): PricingTier => {
      const ui = tierUIMetadata[tierKey];
      const apiData = apiPrices[tierKey];
      const fallbackPrices = defaultPrices[tierKey];
      const fallbackFeatures = defaultFeatures[tierKey];

      // Use API prices if available, otherwise use fallback
      const monthlyPrice = apiData?.monthly ?? fallbackPrices.monthly;
      const yearlyPrice = apiData?.yearly ?? fallbackPrices.yearly;

      // Use API features if available, otherwise use default features
      const features = apiData?.features
        ? apiData.features.map((f: string) => ({
            text: f,
            included: true,
            highlight:
              f.toLowerCase().includes('unlimited') ||
              f.toLowerCase().includes('priority') ||
              f.toLowerCase().includes('vcpus'),
          }))
        : fallbackFeatures;

      const displayName = tierDisplayNames[tierKey] ?? tierKey;

      return {
        tierKey,
        name: displayName,
        description: ui.description,
        monthlyPrice,
        yearlyPrice,
        popular: ui.popular,
        enterprise: ui.enterprise,
        icon: ui.icon,
        gradient: ui.gradient,
        features,
        cta: ui.enterprise ? 'Contact Sales' : tierKey === 'free' ? 'Start free' : `Get ${displayName}`,
        ctaVariant: ui.ctaVariant,
      };
    });
  }, [apiPlans]);

  const comparisonFeatures: ComparisonCategory[] = [
    {
      category: 'Infrastructure',
      features: [
        /*
         * Les chiffres Starter de cette section étaient inventés (1 vCPU / 1 GB /
         * 10 GB / 50 GB). Ce sont des limites TECHNIQUES, pas des avantages
         * commerciaux : tant qu'elles ne sont pas capturées sur un compte réel,
         * elles restent « — ». Voir la rate card versionnée.
         */
        { name: 'CPU cores', starter: '—', core: '4 vCPUs', teams: '8 vCPUs', enterprise: 'Custom' },
        { name: 'Memory', starter: '—', core: '8 GB', teams: '16 GB', enterprise: 'Custom' },
        { name: 'Storage', starter: '—', core: '100 GB', teams: '500 GB', enterprise: 'Unlimited' },
        { name: 'Bandwidth', starter: '—', core: '1 TB', teams: 'Unlimited', enterprise: 'Unlimited' },
      ],
    },
    {
      category: 'Development',
      features: [
        // Aucun plafond de projets publié pour Starter : « 5 active » était sans source.
        { name: 'Projects', starter: 'Unlimited', core: 'Unlimited', teams: 'Unlimited', enterprise: 'Unlimited' },
        {
          name: 'Published projects at a time',
          starter: '1',
          core: 'Unlimited',
          teams: 'Unlimited',
          enterprise: 'Unlimited',
        },
        {
          name: 'Private repos',
          starter: <X className="h-4 w-4 text-[var(--ecode-text-muted)]" />,
          core: <Check className="h-4 w-4 text-[var(--ecode-accent-text)]" />,
          teams: <Check className="h-4 w-4 text-[var(--ecode-accent-text)]" />,
          enterprise: <Check className="h-4 w-4 text-[var(--ecode-accent-text)]" />,
        },
        {
          name: 'Custom domains',
          starter: <X className="h-4 w-4 text-[var(--ecode-text-muted)]" />,
          core: '5',
          teams: 'Unlimited',
          enterprise: 'Unlimited',
        },
        {
          name: 'SSL certificates',
          starter: <Check className="h-4 w-4 text-[var(--ecode-accent-text)]" />,
          core: <Check className="h-4 w-4 text-[var(--ecode-accent-text)]" />,
          teams: <Check className="h-4 w-4 text-[var(--ecode-accent-text)]" />,
          enterprise: <Check className="h-4 w-4 text-[var(--ecode-accent-text)]" />,
        },
      ],
    },
    {
      category: 'AI Features',
      features: [
        /*
         * « 100 requêtes/mois » était inventé. Starter fonctionne avec des
         * crédits Agent QUOTIDIENS (plafonnés au mois), dont le montant n'est pas
         * publié : il reste non chiffré tant qu'il n'est pas capturé en réel.
         */
        {
          name: 'Agent credits',
          starter: 'Daily, capped monthly',
          core: 'Monthly credits',
          teams: 'Monthly credits',
          enterprise: 'Custom',
        },
        {
          name: 'Code completion',
          starter: 'Basic',
          core: 'Advanced',
          teams: 'Advanced',
          enterprise: 'Custom models',
        },
        {
          name: 'AI Agent apps',
          starter: <X className="h-4 w-4 text-[var(--ecode-text-muted)]" />,
          core: 'Unlimited',
          teams: 'Unlimited',
          enterprise: 'Unlimited',
        },
        {
          name: 'Custom AI training',
          starter: <X className="h-4 w-4 text-[var(--ecode-text-muted)]" />,
          core: <X className="h-4 w-4 text-[var(--ecode-text-muted)]" />,
          teams: <Check className="h-4 w-4 text-[var(--ecode-accent-text)]" />,
          enterprise: <Check className="h-4 w-4 text-[var(--ecode-accent-text)]" />,
        },
      ],
    },
    {
      category: 'Support',
      features: [
        {
          name: 'Support channels',
          starter: 'Community',
          core: 'Email',
          teams: 'Priority + Chat',
          enterprise: '24/7 Phone',
        },
        { name: 'Response time', starter: 'Best effort', core: '24 hours', teams: '4 hours', enterprise: '1 hour' },
        {
          name: 'Dedicated manager',
          starter: <X className="h-4 w-4 text-[var(--ecode-text-muted)]" />,
          core: <X className="h-4 w-4 text-[var(--ecode-text-muted)]" />,
          teams: <X className="h-4 w-4 text-[var(--ecode-text-muted)]" />,
          enterprise: <Check className="h-4 w-4 text-[var(--ecode-accent-text)]" />,
        },
        {
          name: 'SLA',
          starter: <X className="h-4 w-4 text-[var(--ecode-text-muted)]" />,
          core: <X className="h-4 w-4 text-[var(--ecode-text-muted)]" />,
          teams: '99.9%',
          enterprise: '99.99%',
        },
      ],
    },
  ];

  const handleSelectPlan = (tier: PricingTier) => {
    if (tier.enterprise) {
      navigate('/contact-sales');
      return;
    }

    if (tier.tierKey === 'free') {
      navigate(user ? '/dashboard' : '/register');
      return;
    }

    /*
     * Carry the selected plan + monthly/annual interval into the checkout flow so
     * the annual (discounted) price the user is looking at is the one applied.
     */
    const interval = billingPeriod === 'yearly' ? 'annual' : 'monthly';
    const target = `/subscribe?plan=${encodeURIComponent(tier.tierKey)}&interval=${interval}`;
    navigate(user ? target : `/login?returnTo=${encodeURIComponent(target)}`);
  };

  // Show loading only if actually loading AND no error (use fallback on error)
  if (isLoading && !error) {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--ecode-background)]">
        <PublicNavbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="animate-spin w-12 h-12 border-4 border-[var(--ecode-accent)] border-t-transparent rounded-full mx-auto" />
            <p className="mkt-body text-[var(--ecode-text-muted)]">Loading pricing plans...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--ecode-background)]" data-testid="page-pricing">
      <PublicNavbar />

      {/* Hero Section with Background */}
      <section className="relative py-20 overflow-hidden animate-fadeIn">
        {/* Background: subtle brand-token gradient wash (replaces the former stock photo) */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--ecode-accent)_7%,transparent),transparent_62%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--ecode-background)]/80 via-[var(--ecode-background)]/90 to-[var(--ecode-background)]" />
        </div>

        <div className="container-responsive relative z-10 max-w-7xl">
          <div className="text-center space-y-6 mb-16">
            <div
              className="animate-slide-in-up opacity-0"
              style={{ animationDelay: '0ms', animationFillMode: 'forwards' }}
            >
              <Badge
                variant="secondary"
                className="mb-4 px-6 py-2 text-[13px] font-semibold bg-[var(--ecode-accent)]/10 border-[var(--ecode-accent)]/20 text-[var(--ecode-accent-text)]"
                data-testid="badge-savings"
              >
                <Sparkles className="h-4 w-4 mr-2 text-[var(--ecode-accent-text)]" />
                Save up to 20% with annual billing
              </Badge>
            </div>

            <h1
              className="mkt-h1 font-bold animate-slide-in-up opacity-0"
              style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}
            >
              <span className="text-[var(--ecode-text)]">Pricing that scales</span>
              <br />
              <span className="bg-gradient-to-r from-[var(--ecode-accent)] to-[var(--ecode-accent)]/80 bg-clip-text text-transparent">
                with your growth
              </span>
            </h1>

            <p
              className="mkt-lead text-[var(--ecode-text-muted)] max-w-3xl mx-auto animate-slide-in-up opacity-0"
              style={{ animationDelay: '200ms', animationFillMode: 'forwards' }}
            >
              Start free and upgrade as you grow. No hidden fees, no surprises. Enterprise-grade features at
              startup-friendly prices.
            </p>

            {/* Billing Toggle with Animation */}
            <div
              className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 pt-6 sm:pt-8 animate-slide-in-up opacity-0"
              style={{ animationDelay: '300ms', animationFillMode: 'forwards' }}
            >
              <button
                type="button"
                onClick={() => setBillingPeriod('monthly')}
                aria-pressed={billingPeriod === 'monthly'}
                aria-label="Show monthly pricing"
                className={`cursor-pointer appearance-none border-0 bg-transparent p-0 text-[13px] sm:text-[15px] font-medium transition-colors duration-200 ${billingPeriod === 'monthly' ? 'text-[var(--ecode-text)]' : 'text-[var(--ecode-text-muted)]'}`}
              >
                Monthly
              </button>
              <Switch
                checked={billingPeriod === 'yearly'}
                onCheckedChange={(checked) => setBillingPeriod(checked ? 'yearly' : 'monthly')}
                className="scale-110 sm:scale-125 data-[state=checked]:bg-[var(--ecode-accent)]"
                data-testid="switch-billing-period"
              />
              <button
                type="button"
                onClick={() => setBillingPeriod('yearly')}
                aria-pressed={billingPeriod === 'yearly'}
                aria-label="Show yearly pricing"
                className={`inline-flex cursor-pointer appearance-none items-center border-0 bg-transparent p-0 text-[13px] sm:text-[15px] font-medium transition-colors duration-200 ${billingPeriod === 'yearly' ? 'text-[var(--ecode-text)]' : 'text-[var(--ecode-text-muted)]'}`}
              >
                Yearly
                <Badge className="ml-1 sm:ml-2 text-[10px] sm:text-[11px] bg-[var(--ecode-accent)] text-white border-0">
                  Save 20%
                </Badge>
              </button>
            </div>
          </div>

          {/* Pricing Cards with E-Code Design Tokens */}
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
            data-testid="pricing-cards-grid"
          >
            {tiers.map((tier, index) => (
              <div
                key={tier.name}
                className="relative animate-slide-in-up opacity-0 hover:scale-[1.02] hover:-translate-y-1 transition-transform"
                style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'forwards' }}
                onMouseEnter={() => setHoveredCard(tier.name)}
                onMouseLeave={() => setHoveredCard(null)}
                data-testid={`pricing-card-${tier.name.toLowerCase()}`}
              >
                {/* Popular Badge - E-Code Orange */}
                {tier.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-10">
                    <Badge
                      className="px-4 py-1 bg-[var(--ecode-accent)] text-white border-0 shadow-lg"
                      data-testid="badge-popular"
                    >
                      <Star className="h-3 w-3 mr-1 fill-white" />
                      RECOMMENDED
                    </Badge>
                  </div>
                )}

                {/* Card with E-Code Design Tokens */}
                <Card
                  className={`
                    h-full relative overflow-hidden transition-all duration-300
                    ${
                      tier.popular
                        ? 'border-2 border-[var(--ecode-accent)] shadow-[0_8px_32px_-8px_rgba(242,98,7,0.4)]'
                        : 'border border-[var(--ecode-border)] bg-[var(--ecode-surface)]'
                    }
                    ${hoveredCard === tier.name && !tier.popular ? 'shadow-[0_8px_24px_-8px_rgba(242,98,7,0.2)] border-[var(--ecode-accent)]/30' : ''}
                    ${!tier.popular ? 'hover:border-[var(--ecode-accent)]/30' : ''}
                    backdrop-blur-sm bg-[var(--ecode-surface)]
                  `}
                >
                  {/* Gradient Background */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${tier.gradient} opacity-5`} />

                  <CardHeader className="relative z-10 pb-6">
                    {/* Icon with gradient background */}
                    <div
                      className={`w-14 h-14 rounded-xl bg-gradient-to-br ${tier.gradient} p-3 mb-4 text-white transition-transform duration-200 hover:scale-105`}
                    >
                      {tier.icon}
                    </div>

                    <CardTitle className="mkt-h3 font-bold text-[var(--ecode-text)]">{tier.name}</CardTitle>
                    <CardDescription className="mkt-body mt-2 text-[var(--ecode-text-muted)]">
                      {tier.description}
                    </CardDescription>

                    {/* Price */}
                    <div className="pt-6">
                      {tier.enterprise ? (
                        <div>
                          <div className="text-4xl font-bold text-[var(--ecode-text)]">Custom</div>
                          <p className="mkt-small text-[var(--ecode-text-muted)] mt-1">Contact for pricing</p>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-baseline gap-1">
                            <span
                              className="text-4xl font-bold text-[var(--ecode-text)]"
                              data-testid={`text-price-${tier.name.toLowerCase()}`}
                            >
                              €{billingPeriod === 'monthly' ? tier.monthlyPrice : tier.yearlyPrice}
                            </span>
                            <span className="text-[var(--ecode-text-muted)]" data-testid="text-billing-interval">
                              /month
                            </span>
                          </div>
                          {billingPeriod === 'yearly' && (tier.monthlyPrice - tier.yearlyPrice) * 12 > 0 && (
                            <p
                              className="mkt-small text-[var(--ecode-accent-text)] mt-1 font-medium"
                              data-testid={`text-yearly-savings-${tier.name.toLowerCase()}`}
                            >
                              Save €{(tier.monthlyPrice - tier.yearlyPrice) * 12}/yr
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="relative z-10 space-y-3 sm:space-y-4 p-4 sm:p-6">
                    {/* CTA Button - E-Code Styled */}
                    <Button
                      className={`w-full h-11 sm:h-12 text-[13px] sm:text-base font-semibold transition-all duration-200 ${
                        tier.popular
                          ? 'bg-[var(--ecode-accent)] hover:bg-[var(--ecode-accent-hover)] text-white shadow-lg hover:shadow-xl'
                          : tier.enterprise
                            ? 'bg-[var(--ecode-accent)] hover:bg-[var(--ecode-accent-hover)] text-white'
                            : 'border border-[var(--ecode-border)] bg-[var(--ecode-surface)] text-[var(--ecode-text)] hover:border-[var(--ecode-accent)]/30 hover:bg-[var(--ecode-accent)]/5'
                      }`}
                      variant={tier.popular || tier.enterprise ? 'default' : 'outline'}
                      onClick={() => handleSelectPlan(tier)}
                      data-testid={`button-pricing-${tier.name.toLowerCase()}`}
                    >
                      {tier.cta}
                      <ArrowRight className="ml-1 sm:ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </Button>

                    {/* Features List */}
                    <div className="pt-4 border-t border-[var(--ecode-border)]">
                      <ul className="space-y-3">
                        {tier.features.slice(0, 10).map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-3 group">
                            {feature.included ? (
                              <div
                                className={`mt-0.5 transition-colors duration-200 ${feature.highlight ? 'text-[var(--ecode-accent-text)]' : 'text-[var(--ecode-accent-text)]/70'}`}
                              >
                                <CheckCircle2 className="h-5 w-5" />
                              </div>
                            ) : (
                              <X className="h-5 w-5 text-[var(--ecode-text-muted)]/50 mt-0.5" />
                            )}
                            <span
                              className={`mkt-small transition-colors duration-200 ${
                                !feature.included
                                  ? 'text-[var(--ecode-text-muted)]/50 line-through'
                                  : feature.highlight
                                    ? 'font-semibold text-[var(--ecode-text)]'
                                    : 'text-[var(--ecode-text-secondary)]'
                              }`}
                            >
                              {feature.text}
                              {feature.tooltip && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="inline h-3 w-3 ml-1 text-[var(--ecode-text-muted)] hover:text-[var(--ecode-accent-text)] transition-colors cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent className="bg-[var(--ecode-surface)] border-[var(--ecode-border)] text-[var(--ecode-text)]">
                                      <p>{feature.tooltip}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {tier.features.length > 10 && (
                        <button
                          className="text-[13px] text-[var(--ecode-accent-text)] font-medium mt-4 hover:underline transition-all duration-200 hover:text-[var(--ecode-accent-hover)]"
                          onClick={() => {
                            const comparisonSection = document.getElementById('section-comparison');

                            if (comparisonSection) {
                              /*
                               * Respect reduced motion, then move real focus to the
                               * section heading so keyboard/AT users land where they scrolled.
                               */
                              scrollToElement(comparisonSection, {
                                focus: comparisonSection.querySelector('h2'),
                              });
                            }
                          }}
                          data-testid={`button-more-features-${tier.name.toLowerCase()}`}
                        >
                          + {tier.features.length - 10} more features
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>

          {/* Currency / tax note */}
          <p
            className="text-[12px] text-[var(--ecode-text-muted)] text-center mt-6"
            data-testid="text-pricing-currency-note"
          >
            Prices in EUR. VAT/sales tax not included.
          </p>
        </div>
      </section>

      {/* Detailed Comparison Table - E-Code Styled */}
      <section
        id="section-comparison"
        className="py-20 bg-[var(--ecode-surface-tertiary,var(--ecode-surface))]"
        data-testid="section-comparison"
      >
        <div className="container-responsive max-w-7xl">
          <div className="text-center mb-12">
            <h2 tabIndex={-1} className="mkt-h2 font-bold mb-4 text-[var(--ecode-text)] outline-none animate-fadeIn">
              Compare plans in detail
            </h2>
            <p className="mkt-lead text-[var(--ecode-text-muted)] animate-fadeIn">
              Every feature, every detail, side by side
            </p>
          </div>

          <div className="lg:hidden text-center mb-4">
            <Badge variant="outline" className="text-[10px] text-[var(--ecode-text-muted)] animate-pulse">
              <ChevronRight className="h-3 w-3 mr-1" />
              Swipe left to compare all plans
            </Badge>
          </div>
          <div
            className="animate-slide-in-up opacity-0"
            style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}
          >
            <Card className="overflow-hidden backdrop-blur-sm bg-[var(--ecode-surface)] border-[var(--ecode-border)]">
              <div className="overflow-x-auto">
                <table className="w-full" data-testid="table-comparison">
                  <thead>
                    <tr className="border-b border-[var(--ecode-border)] bg-[var(--ecode-surface-tertiary,var(--ecode-surface))]">
                      <th
                        className="text-left p-6 font-semibold text-[var(--ecode-text)]"
                        data-testid="column-features"
                      >
                        Features
                      </th>
                      {COMPARISON_COLUMNS.map((column) => (
                        <th
                          key={column.key}
                          className="text-center p-6 min-w-[150px]"
                          data-testid={`column-tier-${column.key}`}
                        >
                          <div
                            className={
                              column.accent
                                ? 'font-semibold text-[var(--ecode-accent-text)]'
                                : 'font-semibold text-[var(--ecode-text)]'
                            }
                          >
                            {column.label}
                          </div>
                          <div className="mkt-small text-[var(--ecode-text-muted)] mt-1">{column.sublabel}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonFeatures.map((category, categoryIdx) => (
                      <Fragment key={categoryIdx}>
                        <tr className="bg-[var(--ecode-surface-tertiary,var(--ecode-surface))]">
                          <td colSpan={5} className="px-6 py-3">
                            <div className="mkt-small font-semibold text-[var(--ecode-text-muted)] uppercase tracking-wider">
                              {category.category}
                            </div>
                          </td>
                        </tr>
                        {category.features.map((feature, featureIdx) => (
                          <tr
                            key={featureIdx}
                            className="border-b border-[var(--ecode-border)] hover:bg-[var(--ecode-accent)]/5 transition-colors duration-200"
                            data-testid={`row-feature-${feature.name.toLowerCase().replace(/\s/g, '-')}`}
                          >
                            <td className="p-6 font-medium text-[var(--ecode-text-secondary)]">{feature.name}</td>
                            {COMPARISON_COLUMNS.map((column) => (
                              <td
                                key={column.key}
                                className={
                                  column.key === 'starter'
                                    ? 'text-center p-6 text-[var(--ecode-text-muted)]'
                                    : column.accent
                                      ? 'text-center p-6 text-[var(--ecode-accent-text)] font-medium'
                                      : 'text-center p-6 text-[var(--ecode-text)] font-medium'
                                }
                              >
                                {feature[column.key]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Enterprise Section - E-Code Styled */}
      <section
        className="py-20 bg-slate-900 dark:bg-slate-950 text-white overflow-hidden relative"
        data-testid="section-enterprise"
      >
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[var(--ecode-accent)] rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600 rounded-full blur-[120px]" />
        </div>
        <div className="container-responsive max-w-6xl relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <LazyMotionDiv
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="space-y-6"
            >
              <Badge className="bg-[var(--ecode-accent)]/20 text-[var(--ecode-accent-text)] border-[var(--ecode-accent)]/30">
                <Building2 className="h-4 w-4 mr-2" />
                Enterprise Solutions
              </Badge>
              <h2 className="mkt-h2 font-bold">Built for the world's most demanding teams</h2>
              <p className="mkt-lead opacity-90">
                Get dedicated infrastructure, advanced security, and custom SLAs. Our enterprise plan scales with
                organizations of any size.
              </p>

              <div className="grid sm:grid-cols-2 gap-4 pt-4">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-[var(--ecode-accent-text)]" />
                  <span>SOC 2 Type II Certified</span>
                </div>
                <div className="flex items-center gap-3">
                  <Lock className="h-5 w-5 text-[var(--ecode-accent-text)]" />
                  <span>HIPAA Compliant</span>
                </div>
                <div className="flex items-center gap-3">
                  <Gauge className="h-5 w-5 text-[var(--ecode-accent-text)]" />
                  <span>99.99% Uptime SLA</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-[var(--ecode-accent-text)]" />
                  <span>24/7 Phone Support</span>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  size="lg"
                  className="bg-[var(--ecode-accent)] text-white hover:bg-[var(--ecode-accent-hover)] transition-all duration-200"
                  onClick={() => navigate('/contact-sales')}
                  data-testid="button-enterprise-contact"
                >
                  Contact Sales
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="bg-[var(--ecode-surface)] border-white/20 text-white hover:bg-white/10 hover:border-[var(--ecode-accent)]/50 transition-all duration-200"
                  onClick={() => navigate('/docs/enterprise')}
                  data-testid="button-enterprise-learn"
                >
                  Learn More
                </Button>
              </div>
            </LazyMotionDiv>

            <LazyMotionDiv
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative"
            >
              <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:border-[var(--ecode-accent)]/30 transition-all duration-300">
                <CardHeader>
                  <CardTitle className="text-white">Enterprise includes:</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {[
                      'Custom infrastructure sizing',
                      'Dedicated account manager',
                      'Professional services & training',
                      'Custom integrations',
                      'Air-gapped deployment options',
                      'Advanced audit logging',
                      'Priority feature requests',
                      'Custom billing & contracts',
                    ].map((item, idx) => (
                      <li
                        key={idx}
                        className="flex items-center gap-3 text-white/90 group"
                        data-testid={`list-item-enterprise-${idx}`}
                      >
                        <CheckCircle2 className="h-5 w-5 text-[var(--ecode-accent-text)] group-hover:scale-110 transition-transform duration-200" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </LazyMotionDiv>
          </div>
        </div>
      </section>

      {/* FAQ Section - E-Code Styled */}
      <section className="py-20 bg-[var(--ecode-background)]" data-testid="section-faq">
        <div className="container-responsive max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="mkt-h2 font-bold mb-4 text-[var(--ecode-text)] animate-fadeIn">
              Frequently asked questions
            </h2>
            <p className="mkt-lead text-[var(--ecode-text-muted)] animate-fadeIn">Got questions? We've got answers</p>
          </div>

          <div className="space-y-6">
            {[
              {
                question: 'Can I switch plans anytime?',
                answer:
                  "Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately, and we'll prorate the difference. No lock-in contracts, ever.",
              },
              {
                question: 'What payment methods do you accept?',
                answer:
                  'We accept all major credit cards (Visa, Mastercard, American Express, Discover), PayPal, and ACH bank transfers for annual plans. Enterprise customers can pay via invoice.',
              },
              {
                question: 'Is there a free trial for paid plans?',
                answer:
                  'Yes! All paid plans come with a 14-day free trial. No credit card required. You can also start with our free Starter plan and upgrade anytime.',
              },
              {
                question: 'How does the AI Agent work?',
                answer:
                  'Our AI Agent understands natural language descriptions and builds complete, production-ready applications. It handles all the code, setup, and deployment automatically. Available on Core plans and above.',
              },
              {
                question: 'What happens if I exceed my limits?',
                answer:
                  "We'll notify you when you're approaching 80% of your limits. You can upgrade anytime, or we can discuss custom solutions. We never shut down your services unexpectedly.",
              },
              {
                question: 'Do you offer discounts for students or nonprofits?',
                answer:
                  'Yes! We offer 50% discounts for verified students and registered nonprofits. Contact our support team with proof of eligibility to get started.',
              },
            ].map((faq, idx) => (
              <div
                key={idx}
                className="animate-slide-in-up opacity-0"
                style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'forwards' }}
              >
                <Card
                  className="bg-[var(--ecode-surface)] border-[var(--ecode-border)] hover:border-[var(--ecode-accent)]/30 hover:shadow-[0_4px_16px_-4px_rgba(242,98,7,0.15)] transition-all duration-300"
                  data-testid={`faq-card-${idx}`}
                >
                  <CardHeader>
                    <CardTitle className="mkt-h3 font-semibold text-[var(--ecode-text)]">{faq.question}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-[var(--ecode-text-muted)]">{faq.answer}</p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section - E-Code Orange Gradient */}
      <section
        className="py-20 bg-gradient-to-r from-[var(--ecode-accent)] to-[var(--ecode-accent)]/80"
        data-testid="section-cta"
      >
        <div className="container-responsive max-w-4xl text-center">
          <LazyMotionDiv
            initial={{ scale: 0.9, opacity: 0, y: 30 }}
            whileInView={{ scale: 1, opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            <h2 className="mkt-h2 font-bold text-white">Start building for free today</h2>
            <p className="mkt-lead text-white/90 max-w-2xl mx-auto">
              Join developers worldwide who are shipping faster with E-Code. No credit card required.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
              <Button
                size="lg"
                className="bg-white text-[var(--ecode-accent-text)] hover:bg-white/95 px-8 py-6 text-[15px] font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
                onClick={() => navigate(user ? '/dashboard' : '/register')}
                data-testid="button-cta-start-free"
              >
                <Sparkles className="mr-2 h-5 w-5" />
                Start Free Trial
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-gray-900 border-2 border-gray-900 bg-white/20 hover:bg-white/40 px-8 py-6 text-[15px] font-semibold transition-all duration-200"
                onClick={() => navigate('/demo')}
                data-testid="button-cta-watch-demo"
              >
                <PlayCircle className="mr-2 h-5 w-5" />
                Watch Demo
              </Button>
            </div>
          </LazyMotionDiv>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
