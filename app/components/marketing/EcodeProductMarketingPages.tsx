import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Cloud,
  Code2,
  Command,
  Cpu,
  Database,
  FileCode2,
  Gauge,
  GitBranch,
  Globe2,
  GraduationCap,
  Handshake,
  Layers,
  Lock,
  MessageSquare,
  MonitorSmartphone,
  Palette,
  PlayCircle,
  Rocket,
  Search,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  TerminalSquare,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Link } from 'react-router';
import { PublicShell } from '~/components/dashboard/SaaSLayout';
import { getReelDemoHref } from '~/components/marketing/ecode-marketing-reels';
import { Button } from '~/components/ui/Button';
import { formatMarketingDocumentTitle } from '~/lib/i18n/catalogs/marketing';
import {
  getAiAgentMarketingCopy,
  getPricingMarketingCopy,
  getPricingPlanCopy,
  getProductMarketingRouteCopy,
  pricingPlanCopy,
  productMarketingRouteCopy,
  type AiAgentReelId,
  type AiAgentUseCaseId,
  type PricingPlanCopyKey,
  type ProductMarketingPageKey,
} from '~/lib/i18n/catalogs/marketing-product';
import {
  getMarketingProductRemainingCopy,
  type AiPlatformFeatureId,
  type AiToolId,
  type DeploymentModeId,
  type MobileFeatureId,
  type ProductFeatureCategoryId,
  type ProductFeatureId,
  type TeamFeatureId,
} from '~/lib/i18n/catalogs/marketing-product-remaining';
import { classNames } from '~/utils/classNames';
import { socialMetaTags } from '~/utils/social-meta';

type ProductPageKey = ProductMarketingPageKey;
type RemainingProductCopy = ReturnType<typeof getMarketingProductRemainingCopy>;
type ProductFeatureCopy = RemainingProductCopy['features']['items'][number];
type MobileFeatureCopy = RemainingProductCopy['mobile']['features'][number];

type CampaignPageKey = 'bounties' | 'deployments' | 'teams';

type PageRouteDefinition = {
  label: string;
  route: string;
  title: string;
  description: string;
};

type PricingPlanKey = PricingPlanCopyKey;

const productMarketingRoutes = {
  'ai-agent': '/ai-agent',
  ide: '/features',
  multiplayer: '/features#multiplayer',
  'mobile-app': '/mobile',
  teams: '/marketing/teams',
  deployments: '/marketing/deployments',
  pricing: '/pricing',
  bounties: '/marketing/bounties',
  'ai-platform': '/ai',
} as const satisfies Record<ProductPageKey, string>;

export const ecodeProductMarketingPages = Object.fromEntries(
  (Object.keys(productMarketingRoutes) as ProductPageKey[]).map((key) => [
    key,
    {
      ...productMarketingRouteCopy.en[key],
      route: productMarketingRoutes[key],
    },
  ]),
) as { readonly [Key in ProductPageKey]: PageRouteDefinition };

export const ecodeCampaignMarketingPages = {
  bounties: ecodeProductMarketingPages.bounties,
  deployments: ecodeProductMarketingPages.deployments,
  teams: ecodeProductMarketingPages.teams,
} as const satisfies Record<CampaignPageKey, PageRouteDefinition>;

/*
 * Monthly prices must stay aligned with packages/billing/src/index.ts.
 * The marketing page intentionally keeps Pro at $29 and Team at $99 because
 * those are the backend-enforced Stripe checkout amounts.
 */
const pricingPlanConfig = {
  free: {
    monthlyCents: 0,
    annualMonthlyCents: 0,
    popular: false,
    enterprise: false,
    icon: <Sparkles className="h-7 w-7" aria-hidden />,
    gradient: 'from-slate-500 to-slate-700',

    /*
     * The localized pricing catalog owns the five public Starter benefits.
     * Storage, bandwidth and concurrent-app figures remain technical limits in
     * the versioned rate card rather than unsupported marketing quotas.
     */
  },
  core: {
    monthlyCents: 2500,
    annualMonthlyCents: 2000,
    popular: true,
    enterprise: false,
    icon: <Zap className="h-7 w-7" aria-hidden />,
    gradient: 'from-[var(--ecode-accent)] to-amber-500',
  },
  pro: {
    monthlyCents: 10000,
    annualMonthlyCents: 9500,
    popular: false,
    enterprise: false,
    icon: <Rocket className="h-7 w-7" aria-hidden />,
    gradient: 'from-[var(--ecode-accent)] to-[#F99D25]',
  },
  enterprise: {
    monthlyCents: 0,
    annualMonthlyCents: 0,
    popular: false,
    enterprise: true,
    icon: <Building2 className="h-7 w-7" aria-hidden />,
    gradient: 'from-slate-800 to-black',
  },
} as const satisfies Record<
  PricingPlanKey,
  {
    monthlyCents: number;
    annualMonthlyCents: number;
    popular: boolean;
    enterprise: boolean;
    icon: ReactNode;
    gradient: string;
  }
>;

export const ecodePricingPlans = (Object.keys(pricingPlanConfig) as PricingPlanKey[]).map((key) => ({
  key,
  ...pricingPlanCopy.en[key],
  ...pricingPlanConfig[key],
})) satisfies {
  key: PricingPlanKey;
  name: string;
  description: string;
  monthlyCents: number;
  annualMonthlyCents: number;
  cta: string;
  popular: boolean;
  enterprise: boolean;
  icon: ReactNode;
  gradient: string;
  features: readonly string[];
}[];

const heroImage = '/assets/hero-image.svg';
const agentAvatar = '/assets/ai-avatar.svg';

const aiAgentStepIcons = [MessageSquare, Sparkles, Rocket] as const;

const quickReelIcons = {
  multilingual: Globe2,
  database: Database,
  security: ShieldCheck,
  deploy: Rocket,
} as const satisfies Record<AiAgentReelId, LucideIcon>;

const aiAgentUseCaseIcons = {
  business: BriefcaseBusiness,
  personal: Sparkles,
  education: GraduationCap,
  games: PlayCircle,
} as const satisfies Record<AiAgentUseCaseId, LucideIcon>;
type AiAgentTab = 'overview' | 'capabilities' | 'examples' | 'comparison';

/**
 * Selects which content sections the AI Agent page renders for the active tab.
 * Returns boolean flags so the tab strip is a real control rather than a no-op.
 */
export function selectAiAgentTabContent(tab: AiAgentTab): {
  showCapabilities: boolean;
  showUseCases: boolean;
  showComparison: boolean;
} {
  switch (tab) {
    case 'capabilities':
      return { showCapabilities: true, showUseCases: false, showComparison: false };
    case 'examples':
      return { showCapabilities: false, showUseCases: true, showComparison: false };
    case 'comparison':
      return { showCapabilities: false, showUseCases: false, showComparison: true };
    case 'overview':
    default:
      return { showCapabilities: true, showUseCases: true, showComparison: false };
  }
}

const aiPlatformFeatureIcons = {
  autonomous: Bot,
  languages: Code2,
  generation: Brain,
  assistance: MessageSquare,
} as const satisfies Record<AiPlatformFeatureId, LucideIcon>;

const aiToolIcons = {
  search: Search,
  'visual-editor': Palette,
  analysis: FileCode2,
  performance: Gauge,
  packages: Layers,
  debug: Activity,
} as const satisfies Record<AiToolId, LucideIcon>;

const productFeatureIcons = {
  'ai-agent': Bot,
  ide: Code2,
  'command-center': Command,
  files: FileCode2,
  features: Sparkles,
  multiplayer: Users,
  'save-progress': GitBranch,
  'always-available': Cloud,
  database: Database,
  deployment: Rocket,
  security: Shield,
  secrets: Lock,
  monitoring: BarChart3,
} as const satisfies Record<ProductFeatureId, LucideIcon>;

const mobileFeatureIcons = {
  editor: Code2,
  terminal: TerminalSquare,
  ai: Sparkles,
  preview: MonitorSmartphone,
  collab: Users,
  git: GitBranch,
} as const satisfies Record<MobileFeatureId, LucideIcon>;

const deploymentModeIcons = {
  autoscale: Rocket,
  reserved: Cpu,
  static: Globe2,
} as const satisfies Record<DeploymentModeId, LucideIcon>;

const deploymentCapabilityIcons = [Globe2, Activity, Shield, GitBranch] as const;

const teamFeatureIcons = {
  multiplayer: Users,
  git: GitBranch,
  communication: MessageSquare,
  security: Shield,
  environments: Zap,
  performance: Globe2,
} as const satisfies Record<TeamFeatureId, LucideIcon>;

export function makeEcodeProductMeta(key: ProductPageKey): MetaFunction {
  return ({ data, location, matches }) => {
    const routeLanguage = (data as { language?: string } | undefined)?.language;

    const rootLanguage = (matches?.find((match) => match.id === 'root')?.data as { language?: string } | undefined)
      ?.language;

    const page = getProductMarketingRouteCopy(key, routeLanguage ?? rootLanguage);
    const title = formatMarketingDocumentTitle(page.title);

    /*
     * BUG-MKT-003 : canonical dérivé de `location.pathname`, jamais d'un chemin
     * recopié — une table écrite à la main dérive au premier renommage de route.
     */
    return [
      { title },
      { name: 'description', content: page.description },
      ...socialMetaTags({ title, description: page.description, path: location?.pathname }),
    ];
  };
}

export function makeEcodeCampaignMeta(key: CampaignPageKey): MetaFunction {
  return makeEcodeProductMeta(key);
}

export function EcodeAiAgentPage() {
  const { i18n } = useTranslation();
  const copy = getAiAgentMarketingCopy(i18n.resolvedLanguage ?? i18n.language);
  const [selectedSegmentId, setSelectedSegmentId] = useState(copy.segments[0].id);
  const [activeTab, setActiveTab] = useState<AiAgentTab>('overview');
  const { showCapabilities, showUseCases, showComparison } = selectAiAgentTabContent(activeTab);
  const selectedSegment = copy.segments.find((segment) => segment.id === selectedSegmentId) ?? copy.segments[0];

  return (
    <PublicShell>
      <MarketingMain>
        <section className="relative overflow-hidden bg-gradient-to-b from-bolt-elements-background-depth-1 to-bolt-elements-background-depth-2 py-16 sm:py-20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(242,98,7,0.16),transparent_34%),radial-gradient(circle_at_80%_15%,rgba(249,157,37,0.14),transparent_28%)]" />
          <Container className="relative grid gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <div>
              <Badge icon={Sparkles}>{copy.badge}</Badge>
              <h1 className="mt-6 max-w-3xl mkt-h1 text-bolt-elements-textPrimary">
                {copy.heroTitle}{' '}
                <span className="block bg-gradient-to-r from-[var(--ecode-accent)] via-amber-400 to-[#F99D25] bg-clip-text text-transparent">
                  {copy.heroAccent}
                </span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-bolt-elements-textSecondary">
                {copy.heroDescription}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ActionLink to="/ai-agent/studio">
                  {copy.launchStudio}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </ActionLink>
                <ActionLink to="#agent-demo" variant="outline">
                  <PlayCircle className="h-4 w-4" aria-hidden />
                  {copy.watchLiveDemo}
                </ActionLink>
              </div>
              <div className="mt-7 flex flex-wrap gap-4 text-sm text-bolt-elements-textSecondary">
                {copy.proof.map((proof) => (
                  <span key={proof} className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[var(--ecode-accent)]" aria-hidden />
                    {proof}
                  </span>
                ))}
              </div>
            </div>
            <DemoFrame
              eyebrow={copy.trailer.eyebrow}
              title={copy.trailer.title}
              description={copy.trailer.description}
              metrics={copy.trailer.metrics}
            />
          </Container>
        </section>

        <Section tone="muted">
          <SectionIntro title={copy.stepsIntro.title} description={copy.stepsIntro.description} />
          <div className="grid gap-6 md:grid-cols-3">
            {copy.steps.map((step, index) => (
              <IconCard key={step.title} icon={aiAgentStepIcons[index]} title={step.title}>
                {step.description}
              </IconCard>
            ))}
          </div>
        </Section>

        <Section id="agent-demo">
          <SectionIntro title={copy.demoIntro.title} description={copy.demoIntro.description} />
          <div className="grid gap-8 lg:grid-cols-[1.5fr_0.85fr]">
            <DemoFrame
              compact
              eyebrow={copy.segmentLabel(selectedSegment.timestamp)}
              title={selectedSegment.title}
              description={selectedSegment.description}
              metrics={copy.demoMetrics}
            />
            <div className="space-y-4">
              <Panel>
                <h3 className="text-base font-semibold text-bolt-elements-textPrimary">{copy.featuredDemos}</h3>
                <div className="mt-4 space-y-3">
                  {copy.segments.map((segment) => (
                    <button
                      key={segment.id}
                      type="button"
                      onClick={() => setSelectedSegmentId(segment.id)}
                      className={classNames(
                        'w-full rounded-lg border p-3 text-left transition-colors',
                        selectedSegmentId === segment.id
                          ? 'border-[var(--ecode-accent)] bg-[var(--ecode-accent)]/10'
                          : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-3',
                      )}
                    >
                      <div className="flex gap-3">
                        <img
                          src={agentAvatar}
                          alt=""
                          className="h-10 w-10 rounded-lg border border-bolt-elements-borderColor"
                        />
                        <div>
                          <div className="text-xs text-bolt-elements-textTertiary">{segment.timestamp}</div>
                          <div className="font-medium text-bolt-elements-textPrimary">{segment.title}</div>
                          <p className="text-sm text-bolt-elements-textSecondary">{segment.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </Panel>
              <Panel>
                <h3 className="flex items-center gap-2 text-base font-semibold text-bolt-elements-textPrimary">
                  <Sparkles className="h-5 w-5 text-[var(--ecode-accent)]" aria-hidden />
                  {copy.agentDoes}
                </h3>
                <dl className="mt-4 space-y-3 text-sm">
                  {copy.agentActions.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4">
                      <dt className="text-bolt-elements-textSecondary">{label}</dt>
                      <dd className="font-semibold text-bolt-elements-textPrimary">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            </div>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {copy.reels.map((reel) => {
              const Icon = quickReelIcons[reel.id];
              return (
                <Link
                  key={reel.id}
                  to={getReelDemoHref()}
                  aria-label={copy.watchDemoLabel(reel.title)}
                  className="group rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)]"
                >
                  <Panel className="h-full transition-colors group-hover:border-[var(--ecode-accent)]">
                    <Icon className="h-7 w-7 text-[var(--ecode-accent)]" aria-hidden />
                    <h3 className="mt-3 font-semibold text-bolt-elements-textPrimary">{reel.title}</h3>
                    <p className="mt-2 text-sm text-bolt-elements-textSecondary">
                      {copy.timestampLabel(reel.timestamp)}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--ecode-accent)]">
                      {copy.watchNow}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </Panel>
                </Link>
              );
            })}
          </div>
        </Section>

        <Section tone="muted">
          <SectionIntro title={copy.moreIntro.title} description={copy.moreIntro.description} />
          <div className="grid gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-2 sm:grid-cols-4">
            {(['overview', 'capabilities', 'examples', 'comparison'] as const).map((tab) => (
              <Button
                key={tab}
                type="button"
                variant={activeTab === tab ? 'default' : 'ghost'}
                onClick={() => setActiveTab(tab)}
              >
                {copy.tabs[tab]}
              </Button>
            ))}
          </div>
          {showCapabilities ? (
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {copy.capabilities.map((capability) => (
                <Panel key={capability.title}>
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-bolt-elements-textPrimary">
                    <Sparkles className="h-5 w-5 text-[var(--ecode-accent)]" aria-hidden />
                    {capability.title}
                  </h3>
                  <p className="mt-2 text-sm text-bolt-elements-textSecondary">{capability.description}</p>
                  <CheckList className="mt-4" items={capability.examples} />
                </Panel>
              ))}
            </div>
          ) : null}
          {showUseCases ? (
            <div className="mt-8 grid gap-4 md:grid-cols-4">
              {copy.useCases.map((useCase) => {
                const Icon = aiAgentUseCaseIcons[useCase.id];
                return (
                  <Panel key={useCase.category}>
                    <Icon className="h-8 w-8 text-[var(--ecode-accent)]" aria-hidden />
                    <h3 className="mt-3 text-lg font-semibold text-bolt-elements-textPrimary">{useCase.category}</h3>
                    <p className="mt-1 text-sm text-bolt-elements-textTertiary">{useCase.timing}</p>
                    <CheckList className="mt-4" items={useCase.apps} />
                  </Panel>
                );
              })}
            </div>
          ) : null}
          {showComparison ? (
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {copy.comparison.map((item) => (
                <Panel key={item.title}>
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-bolt-elements-textPrimary">
                    <Sparkles className="h-5 w-5 text-[var(--ecode-accent)]" aria-hidden />
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm text-bolt-elements-textSecondary">{item.description}</p>
                  <CheckList className="mt-4" items={item.examples} />
                </Panel>
              ))}
            </div>
          ) : null}
        </Section>
      </MarketingMain>
    </PublicShell>
  );
}

export function EcodeAiPlatformPage() {
  const { i18n } = useTranslation();
  const copy = getMarketingProductRemainingCopy(i18n.resolvedLanguage ?? i18n.language).aiPlatform;
  const [selectedFeatureId, setSelectedFeatureId] = useState<AiPlatformFeatureId>('autonomous');
  const selectedFeature = copy.features.find((feature) => feature.key === selectedFeatureId) ?? copy.features[0];

  return (
    <PublicShell>
      <MarketingMain>
        <section className="relative overflow-hidden py-16 sm:py-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(242,98,7,0.12),transparent_35%)]" />
          <Container className="relative grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <Badge icon={Sparkles}>{copy.badge}</Badge>
              <h1 className="mt-6 mkt-h1 text-bolt-elements-textPrimary">
                {copy.heroTitle}{' '}
                <span className="block bg-gradient-to-r from-[var(--ecode-accent)] via-amber-400 to-[#F99D25] bg-clip-text text-transparent">
                  {copy.heroAccent}
                </span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-bolt-elements-textSecondary">
                {copy.heroDescription}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ActionLink to="/ai-agent">
                  {copy.start}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </ActionLink>
                <ActionLink to="#demo-video" variant="outline">
                  {copy.watchDemo}
                </ActionLink>
              </div>
              <div className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-4">
                {copy.highlights.map(([value, label]) => (
                  <div key={value}>
                    <div className="text-lg font-bold text-[var(--ecode-accent)]">{value}</div>
                    <div className="mt-1 text-xs font-medium text-bolt-elements-textSecondary">{label}</div>
                  </div>
                ))}
              </div>
            </div>
            <DemoFrame
              eyebrow={copy.heroDemo.eyebrow}
              title={copy.heroDemo.title}
              description={copy.heroDemo.description}
              metrics={copy.heroDemo.metrics}
            />
          </Container>
        </section>

        <Section id="demo-video" tone="muted">
          <SectionIntro title={copy.demoIntro.title} description={copy.demoIntro.description} />
          <DemoFrame
            compact
            eyebrow={copy.demo.eyebrow}
            title={copy.demo.title}
            description={copy.demo.description}
            metrics={copy.demo.metrics}
          />
        </Section>

        <Section>
          <SectionIntro title={copy.capabilitiesIntro.title} description={copy.capabilitiesIntro.description} />
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              {copy.features.map((feature) => {
                const Icon = aiPlatformFeatureIcons[feature.key];
                return (
                  <button
                    key={feature.key}
                    type="button"
                    onClick={() => setSelectedFeatureId(feature.key)}
                    className={classNames(
                      'w-full rounded-lg border p-4 text-left transition-colors',
                      selectedFeatureId === feature.key
                        ? 'border-[var(--ecode-accent)] bg-[var(--ecode-accent)]/10'
                        : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-2',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className="rounded-lg bg-[var(--ecode-accent)]/10 p-2 text-[var(--ecode-accent)]">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span>
                        <strong className="block text-bolt-elements-textPrimary">{feature.title}</strong>
                        <span className="mt-1 block text-sm text-bolt-elements-textSecondary">
                          {feature.description}
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            <Panel className="lg:sticky lg:top-20">
              <h3 className="text-2xl font-semibold text-bolt-elements-textPrimary">{selectedFeature.title}</h3>
              <CheckList className="mt-5" items={selectedFeature.details} />
            </Panel>
          </div>
        </Section>

        <Section tone="muted">
          <SectionIntro title={copy.toolsIntro.title} description={copy.toolsIntro.description} />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {copy.tools.map((tool) => (
              <IconCard key={tool.id} icon={aiToolIcons[tool.id]} title={tool.name}>
                {tool.description}
              </IconCard>
            ))}
          </div>
        </Section>

        <Section>
          <SectionIntro title={copy.useCasesIntro.title} description={copy.useCasesIntro.description} />
          <div className="grid gap-5 md:grid-cols-2">
            {copy.useCases.map(([title, description]) => (
              <Panel key={title}>
                <h3 className="text-xl font-semibold text-bolt-elements-textPrimary">{title}</h3>
                <p className="mt-3 text-bolt-elements-textSecondary">{description}</p>
              </Panel>
            ))}
          </div>
        </Section>
      </MarketingMain>
    </PublicShell>
  );
}

export function EcodeFeaturesPage() {
  const { i18n } = useTranslation();
  const copy = getMarketingProductRemainingCopy(i18n.resolvedLanguage ?? i18n.language).features;
  const [activeTab, setActiveTab] = useState<ProductFeatureCategoryId>('all');

  const visibleFeatures = useMemo(
    () => copy.items.filter((feature) => activeTab === 'all' || feature.category === activeTab),
    [activeTab, copy.items],
  );

  useEffect(() => {
    const scrollToHash = () => {
      const id = window.location.hash.slice(1);

      if (!id) {
        return;
      }

      window.requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ block: 'start' });
      });
    };

    scrollToHash();
    window.addEventListener('hashchange', scrollToHash);

    return () => window.removeEventListener('hashchange', scrollToHash);
  }, []);

  return (
    <PublicShell>
      <MarketingMain>
        <section className="py-16 sm:py-24">
          <Container className="grid gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <div>
              <Badge icon={Layers}>{copy.heroBadge}</Badge>
              <h1 className="mt-6 mkt-h1 text-bolt-elements-textPrimary">{copy.heroTitle}</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-bolt-elements-textSecondary">
                {copy.heroDescription}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ActionLink to="/signup">
                  {copy.start}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </ActionLink>
                <ActionLink to="/docs" variant="outline">
                  {copy.docs}
                </ActionLink>
              </div>
            </div>
            <WorkspaceMockup />
          </Container>
        </section>

        <Section tone="muted">
          <div className="flex flex-wrap gap-2">
            {copy.tabs.map((tab) => (
              <Button
                key={tab.id}
                type="button"
                variant={activeTab === tab.id ? 'default' : 'outline'}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibleFeatures.map((feature) => (
              <FeatureTile key={feature.id} feature={feature} icon={productFeatureIcons[feature.id]} />
            ))}
          </div>
        </Section>

        <Section id="ide">
          <SectionIntro title={copy.ideIntro.title} description={copy.ideIntro.description} />
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            <WorkspaceMockup large />
            <div className="grid gap-4">
              {copy.ideCards.map(([title, description]) => (
                <Panel key={title}>
                  <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">{title}</h3>
                  <p className="mt-2 text-sm text-bolt-elements-textSecondary">{description}</p>
                </Panel>
              ))}
            </div>
          </div>
        </Section>

        <Section id="multiplayer" tone="dark">
          <SectionIntro title={copy.multiplayerIntro.title} description={copy.multiplayerIntro.description} invert />
          <div className="grid gap-6 md:grid-cols-3">
            {copy.multiplayerCards.map(([title, description]) => (
              <Panel key={title} dark>
                <h3 className="text-xl font-semibold text-white">{title}</h3>
                <p className="mt-3 text-sm text-white/70">{description}</p>
              </Panel>
            ))}
          </div>
        </Section>
      </MarketingMain>
    </PublicShell>
  );
}

export function EcodeMobilePage() {
  const { i18n } = useTranslation();
  const copy = getMarketingProductRemainingCopy(i18n.resolvedLanguage ?? i18n.language).mobile;
  const [activeFeatureId, setActiveFeatureId] = useState<MobileFeatureId>('editor');
  const activeFeature = copy.features.find((feature) => feature.id === activeFeatureId) ?? copy.features[0];

  return (
    <PublicShell>
      <MarketingMain>
        <section className="relative overflow-hidden py-16 sm:py-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(249,157,37,0.16),transparent_32%)]" />
          <Container className="relative grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <Badge icon={Smartphone}>{copy.heroBadge}</Badge>
              <h1 className="mt-6 mkt-h1 text-bolt-elements-textPrimary">{copy.heroTitle}</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-bolt-elements-textSecondary">
                {copy.heroDescription}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ActionLink to="/signup">
                  {copy.start}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </ActionLink>
                <ActionLink to="/mobile-apps" variant="outline">
                  {copy.explore}
                </ActionLink>
              </div>
            </div>
            <PhoneDemo activeFeature={activeFeature} icon={mobileFeatureIcons[activeFeature.id]} />
          </Container>
        </section>

        <Section tone="muted">
          <SectionIntro title={copy.intro.title} description={copy.intro.description} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {copy.features.map((feature) => {
              const Icon = mobileFeatureIcons[feature.id];
              return (
                <button
                  key={feature.id}
                  type="button"
                  onClick={() => setActiveFeatureId(feature.id)}
                  className={classNames(
                    'rounded-lg border p-5 text-left transition-colors',
                    activeFeatureId === feature.id
                      ? 'border-[var(--ecode-accent)] bg-[var(--ecode-accent)]/10'
                      : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-2',
                  )}
                >
                  <Icon className="h-8 w-8 text-[var(--ecode-accent)]" aria-hidden />
                  <h3 className="mt-4 text-lg font-semibold text-bolt-elements-textPrimary">{feature.title}</h3>
                  <p className="mt-2 text-sm text-bolt-elements-textSecondary">{feature.description}</p>
                </button>
              );
            })}
          </div>
        </Section>

        <Section>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <Panel>
              <h2 className="text-3xl font-bold text-bolt-elements-textPrimary">{activeFeature.title}</h2>
              <p className="mt-3 text-bolt-elements-textSecondary">{activeFeature.description}</p>
              <CheckList className="mt-5" items={activeFeature.details} />
            </Panel>
            <MobileFeatureDemo featureId={activeFeature.id} copy={copy} />
          </div>
        </Section>
      </MarketingMain>
    </PublicShell>
  );
}

export function EcodePricingPage() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getPricingMarketingCopy(language);
  const planCopy = getPricingPlanCopy(language);
  const localizedPlans = ecodePricingPlans.map((plan) => ({ ...plan, ...planCopy[plan.key] }));
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  return (
    <PublicShell>
      <MarketingMain>
        <section className="py-16 sm:py-24">
          <Container className="min-w-0 text-center">
            <Badge icon={Star}>{copy.badge}</Badge>
            <h1 className="mx-auto mt-6 max-w-4xl mkt-h1 text-bolt-elements-textPrimary">
              {copy.heroTitle}{' '}
              <span className="block bg-gradient-to-r from-[var(--ecode-accent)] to-amber-400 bg-clip-text text-transparent">
                {copy.heroAccent}
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-bolt-elements-textSecondary">
              {copy.heroDescription}
            </p>
            <div
              className="mx-auto mt-8 inline-flex max-w-full flex-wrap justify-center rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-1"
              role="group"
              aria-label={copy.billingPeriodLabel}
            >
              {(['monthly', 'yearly'] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setBillingPeriod(period)}
                  aria-label={period === 'yearly' ? copy.yearlyAria : copy.monthlyAria}
                  aria-pressed={billingPeriod === period}
                  className={classNames(
                    'min-h-11 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)]',
                    billingPeriod === period
                      ? 'bg-[var(--vc-action-primary-strong)] text-white'
                      : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                  )}
                >
                  {period === 'yearly' ? copy.yearly : copy.monthly}
                </button>
              ))}
            </div>
          </Container>
        </section>

        <Section className="pt-0">
          <div className="grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-4">
            {localizedPlans.map((plan) => (
              <Panel
                key={plan.key}
                className={classNames(
                  'relative flex h-full min-w-0 flex-col overflow-visible',
                  plan.popular && 'border-[var(--ecode-accent)] shadow-[0_20px_60px_rgba(242,98,7,0.22)]',
                )}
              >
                {plan.popular ? (
                  <span className="absolute -top-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-[var(--vc-action-primary-strong)] px-4 py-1 text-xs font-semibold text-white">
                    <Star className="h-3 w-3 fill-current" aria-hidden />
                    {copy.recommended}
                  </span>
                ) : null}
                {/*
                 * `self-start` is load-bearing: this chip is a direct child of a
                 * `flex-col` card, so its `inline-flex` blockifies to `flex` and
                 * the default `align-items: stretch` blew the 48px icon badge up
                 * into a full-width gradient bar across the top of every plan.
                 */}
                <div
                  className={classNames(
                    'inline-flex self-start rounded-xl bg-gradient-to-br p-3 text-white',
                    plan.gradient,
                  )}
                >
                  {plan.icon}
                </div>
                <h2 className="mt-5 break-words text-2xl font-bold text-bolt-elements-textPrimary">{plan.name}</h2>
                <p className="mt-2 min-h-12 break-words text-sm leading-6 text-bolt-elements-textSecondary">
                  {plan.description}
                </p>
                <div className="mt-6">
                  {plan.enterprise ? (
                    <>
                      <div className="text-4xl font-bold text-bolt-elements-textPrimary">{copy.custom}</div>
                      <p className="mt-1 text-sm text-bolt-elements-textTertiary">{copy.contactForPricing}</p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-bolt-elements-textPrimary">
                          {formatMonthlyPrice(
                            billingPeriod === 'monthly' ? plan.monthlyCents : plan.annualMonthlyCents,
                            language,
                          )}
                        </span>
                        <span className="text-bolt-elements-textSecondary">{copy.perMonth}</span>
                      </div>
                      {billingPeriod === 'yearly' && plan.monthlyCents > 0 ? (
                        <p className="mt-1 text-sm font-medium text-[var(--ecode-accent)]">
                          {copy.billedAnnually(formatAnnualPrice(plan.annualMonthlyCents, language))}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="mt-6">
                  <ActionLink
                    to={plan.enterprise ? '/contact-sales' : '/register'}
                    fullWidth
                    variant={plan.popular ? 'default' : 'outline'}
                  >
                    {plan.cta}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </ActionLink>
                </div>
                <CheckList
                  className="mt-6 border-t border-bolt-elements-borderColor pt-5 [overflow-wrap:anywhere]"
                  items={plan.features}
                />
              </Panel>
            ))}
          </div>
        </Section>

        <Section id="section-comparison" tone="muted">
          <SectionIntro title={copy.comparisonTitle} description={copy.comparisonDescription} />
          <div
            className="overflow-x-auto overscroll-x-contain rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)]"
            role="region"
            aria-label={copy.comparisonTableLabel}
            tabIndex={0}
          >
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">{copy.comparisonTableLabel}</caption>
              <thead className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
                <tr>
                  <th className="p-5 text-left font-semibold text-bolt-elements-textPrimary">{copy.featuresLabel}</th>
                  {/*
                   * SCR-007 : le libellé de la colonne accentuée est du TEXTE sur fond
                   * clair. `--ecode-accent` (#f26207) y plafonne à 3,22:1 — mesuré live
                   * le 20/08 à 390 ET 1440. `--ecode-accent-text` (#c74e00 en thème
                   * clair) est le jeton prévu pour l'orange porteur de texte.
                   */}
                  {(['free', 'core', 'pro', 'enterprise'] as const).map((planKey) => (
                    <th
                      key={planKey}
                      className={classNames(
                        'p-5 text-center font-semibold',
                        planKey === 'core' ? 'text-[var(--ecode-accent-text)]' : 'text-bolt-elements-textPrimary',
                      )}
                    >
                      {planCopy[planKey].name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {copy.comparisonRows.map((row) => (
                  <tr key={row[0]} className="border-b border-bolt-elements-borderColor last:border-b-0">
                    {row.map((cell, index) => (
                      <td
                        key={`${row[0]}-col${index}`}
                        className={classNames(
                          'p-5',
                          index === 0
                            ? 'font-medium text-bolt-elements-textPrimary'
                            : 'text-center text-bolt-elements-textSecondary',
                        )}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* D14 — pricing mini-FAQ (accordion under the comparison table). */}
          <div className="mx-auto mt-8 flex max-w-3xl flex-col gap-3" data-testid="pricing-faq">
            {copy.billingFaq.map((item) => (
              <details
                key={item.question}
                className="group rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-5 py-4"
              >
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-1 font-medium text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)]">
                  <span className="min-w-0 break-words">{item.question}</span>
                  <span
                    className="shrink-0 text-bolt-elements-textSecondary transition-transform duration-200 group-open:rotate-45"
                    aria-hidden
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-6 text-bolt-elements-textSecondary">{item.answer}</p>
              </details>
            ))}
          </div>
        </Section>

        <Section tone="dark">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <Badge icon={Building2}>{copy.enterpriseBadge}</Badge>
              <h2 className="mt-5 text-4xl font-bold text-white">{copy.enterpriseTitle}</h2>
              <p className="mt-4 text-lg leading-8 text-white/75">{copy.enterpriseDescription}</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {copy.enterpriseHighlights.map((item) => (
                  <span key={item} className="flex items-center gap-2 text-white/85">
                    <CheckCircle2 className="h-5 w-5 text-[var(--ecode-accent)]" aria-hidden />
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <Panel dark>
              <h3 className="text-xl font-semibold text-white">{copy.enterpriseIncludes}</h3>
              <CheckList className="mt-5" invert items={copy.enterpriseFeatures} />
            </Panel>
          </div>
        </Section>

        <Section>
          <SectionIntro title={copy.faqTitle} description={copy.faqDescription} />
          <div className="grid gap-5 md:grid-cols-2">
            {copy.faq.map(([question, answer]) => (
              <Panel key={question}>
                <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">{question}</h3>
                <p className="mt-2 text-sm leading-6 text-bolt-elements-textSecondary">{answer}</p>
              </Panel>
            ))}
          </div>
        </Section>

        <Section tone="dark">
          <div className="mx-auto max-w-3xl text-center">
            <Badge icon={Rocket}>{copy.ctaBadge}</Badge>
            <h2 className="mt-5 text-4xl font-bold text-white">{copy.ctaTitle}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-white/75">{copy.ctaDescription}</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <ActionLink to="/register">
                {copy.startFree}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </ActionLink>
              <ActionLink to="/contact-sales" variant="outlineDark">
                {copy.contactSales}
              </ActionLink>
            </div>
          </div>
        </Section>
      </MarketingMain>
    </PublicShell>
  );
}

export function EcodeDeploymentsPage() {
  const { i18n } = useTranslation();
  const copy = getMarketingProductRemainingCopy(i18n.resolvedLanguage ?? i18n.language).deployments;

  return (
    <PublicShell>
      <MarketingMain>
        <section className="relative overflow-hidden py-16 sm:py-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(242,98,7,0.14),transparent_32%)]" />
          <Container className="relative grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <Badge icon={Rocket}>{copy.heroBadge}</Badge>
              <h1 className="mt-6 mkt-h1 text-bolt-elements-textPrimary">{copy.heroTitle}</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-bolt-elements-textSecondary">
                {copy.heroDescription}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ActionLink to="/contact-sales">{copy.expert}</ActionLink>
                <ActionLink to="/docs" variant="outline">
                  {copy.docs}
                </ActionLink>
              </div>
            </div>
            <DeploymentStatusCard />
          </Container>
        </section>

        <Section tone="muted">
          <SectionIntro title={copy.modesIntro.title} description={copy.modesIntro.description} />
          <div className="grid gap-5 md:grid-cols-3">
            {copy.modes.map((mode) => (
              <IconCard key={mode.id} icon={deploymentModeIcons[mode.id]} title={mode.title}>
                {mode.description}
                <CheckList className="mt-4" items={mode.bullets} />
              </IconCard>
            ))}
          </div>
        </Section>

        <Section>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {copy.capabilities.map(([title, description], index) => (
              <IconCard key={title} icon={deploymentCapabilityIcons[index]} title={title}>
                {description}
              </IconCard>
            ))}
          </div>
        </Section>

        <Section tone="muted">
          <SectionIntro title={copy.workflowIntro.title} description={copy.workflowIntro.description} />
          <div className="grid gap-5 md:grid-cols-4">
            {copy.workflow.map(([title, description], index) => (
              <Panel key={title}>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--vc-action-primary-strong)] text-sm font-bold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold text-bolt-elements-textPrimary">{title}</h3>
                <p className="mt-2 text-sm text-bolt-elements-textSecondary">{description}</p>
              </Panel>
            ))}
          </div>
        </Section>

        <Section tone="dark">
          <SectionIntro title={copy.controlIntro.title} description={copy.controlIntro.description} invert />
          <div className="grid gap-6 lg:grid-cols-3">
            {copy.controls.map(([title, description]) => (
              <Panel key={title} dark>
                <h3 className="text-xl font-semibold text-white">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/70">{description}</p>
              </Panel>
            ))}
          </div>
        </Section>
      </MarketingMain>
    </PublicShell>
  );
}

export function EcodeBountiesPage() {
  const { i18n } = useTranslation();
  const copy = getMarketingProductRemainingCopy(i18n.resolvedLanguage ?? i18n.language).bounties;

  return (
    <PublicShell>
      <MarketingMain>
        <section className="relative overflow-hidden bg-slate-950 py-16 text-white sm:py-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(242,98,7,0.22),transparent_32%),radial-gradient(circle_at_82%_12%,rgba(249,157,37,0.18),transparent_28%)]" />
          <Container className="relative grid gap-12 lg:grid-cols-[1fr_0.9fr] lg:items-center">
            <div>
              <Badge icon={Handshake}>{copy.heroBadge}</Badge>
              <h1 className="mt-6 mkt-h1">{copy.heroTitle}</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/75">{copy.heroDescription}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ActionLink to="/bounties">{copy.launch}</ActionLink>
                <ActionLink to="/contact-sales" variant="outlineDark">
                  {copy.contact}
                </ActionLink>
              </div>
              <div className="mt-8 flex flex-wrap gap-3 text-sm text-white/70">
                {copy.proof.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1"
                  >
                    <CheckCircle2 className="h-4 w-4 text-[var(--ecode-accent)]" aria-hidden />
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <Panel dark className="bg-white/10">
              <h2 className="text-xl font-semibold text-white">{copy.summaryTitle}</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {copy.highlights.map(([value, label]) => (
                  <div key={value} className="rounded-lg border border-white/10 bg-black/20 p-4">
                    <div className="text-lg font-bold text-white">{value}</div>
                    <p className="mt-1 text-sm text-white/65">{label}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </Container>
        </section>

        <Section>
          <SectionIntro title={copy.audienceIntro.title} description={copy.audienceIntro.description} />
          <div className="grid gap-5 md:grid-cols-3">
            {copy.audience.map(([title, description]) => (
              <Panel key={title}>
                <h3 className="text-xl font-semibold text-bolt-elements-textPrimary">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-bolt-elements-textSecondary">{description}</p>
              </Panel>
            ))}
          </div>
        </Section>

        <Section tone="muted">
          <SectionIntro title={copy.workflowIntro.title} description={copy.workflowIntro.description} />
          <div className="grid gap-5 md:grid-cols-3">
            {copy.workflow.map(([title, description], index) => (
              <Panel key={title}>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--vc-action-primary-strong)] font-bold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold text-bolt-elements-textPrimary">{title}</h3>
                <p className="mt-2 text-sm text-bolt-elements-textSecondary">{description}</p>
              </Panel>
            ))}
          </div>
        </Section>

        <Section>
          <SectionIntro title={copy.categoriesIntro.title} description={copy.categoriesIntro.description} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {copy.categories.map((category) => (
              <Panel key={category}>
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-[var(--ecode-accent)]" aria-hidden />
                  <h3 className="font-semibold text-bolt-elements-textPrimary">{category}</h3>
                </div>
              </Panel>
            ))}
          </div>
        </Section>
      </MarketingMain>
    </PublicShell>
  );
}

export function EcodeTeamsPage() {
  const { i18n } = useTranslation();
  const copy = getMarketingProductRemainingCopy(i18n.resolvedLanguage ?? i18n.language).teams;

  return (
    <PublicShell>
      <MarketingMain>
        <section className="relative overflow-hidden py-16 sm:py-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(242,98,7,0.16),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(249,157,37,0.14),transparent_28%)]" />
          <Container className="relative text-center">
            <Badge icon={Users}>{copy.heroBadge}</Badge>
            <h1 className="mx-auto mt-6 max-w-4xl mkt-h1 text-bolt-elements-textPrimary">{copy.heroTitle}</h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-bolt-elements-textSecondary">
              {copy.heroDescription}
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <ActionLink to="/register">{copy.start}</ActionLink>
              <ActionLink to="/contact-sales" variant="outline">
                {copy.contact}
              </ActionLink>
            </div>
          </Container>
        </section>

        <Section tone="muted">
          <SectionIntro title={copy.featuresIntro.title} description={copy.featuresIntro.description} />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {copy.features.map((feature) => (
              <IconCard key={feature.id} icon={teamFeatureIcons[feature.id]} title={feature.title}>
                {feature.description}
              </IconCard>
            ))}
          </div>
        </Section>

        <Section>
          <SectionIntro title={copy.audiencesIntro.title} description={copy.audiencesIntro.description} />
          <div className="grid gap-8 md:grid-cols-2">
            {copy.audiences.map((audience) => (
              <Panel key={audience.title}>
                <h3 className="text-2xl font-semibold text-bolt-elements-textPrimary">{audience.title}</h3>
                <p className="mt-3 text-bolt-elements-textSecondary">{audience.description}</p>
                <CheckList className="mt-5" items={audience.bullets} />
              </Panel>
            ))}
          </div>
        </Section>

        <Section tone="muted">
          <SectionIntro title={copy.workspaceIntro.title} description={copy.workspaceIntro.description} />
          <ProductFigure
            src="/ecode-static/assets/product/ide-git.png"
            alt={copy.workspaceAlt}
            caption={copy.workspaceCaption}
          />
        </Section>

        <Section tone="dark">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <Badge icon={Users}>{copy.ctaBadge}</Badge>
              <h2 className="mt-5 text-4xl font-bold text-white">{copy.ctaTitle}</h2>
              <p className="mt-4 text-lg leading-8 text-white/75">{copy.ctaDescription}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <ActionLink to="/register">
                {copy.start}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </ActionLink>
              <ActionLink to="/contact-sales" variant="outlineDark">
                {copy.contact}
              </ActionLink>
            </div>
          </div>
        </Section>
      </MarketingMain>
    </PublicShell>
  );
}

export function EcodeCampaignPage({ slug }: { slug: CampaignPageKey }) {
  if (slug === 'bounties') {
    return <EcodeBountiesPage />;
  }

  if (slug === 'deployments') {
    return <EcodeDeploymentsPage />;
  }

  return <EcodeTeamsPage />;
}

function MarketingMain({ children }: { children: ReactNode }) {
  return <main className="bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary">{children}</main>;
}

function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={classNames('mx-auto max-w-7xl px-4 sm:px-6', className)}>{children}</div>;
}

function Section({
  children,
  className,
  id,
  tone = 'default',
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  tone?: 'default' | 'muted' | 'dark';
}) {
  return (
    <section
      id={id}
      className={classNames(
        'py-14 sm:py-20',
        tone === 'muted' && 'bg-bolt-elements-background-depth-2',
        tone === 'dark' && 'bg-slate-950 text-white',
        className,
      )}
    >
      <Container>{children}</Container>
    </section>
  );
}

function SectionIntro({
  title,
  description,
  invert = false,
}: {
  title: string;
  description: string;
  invert?: boolean;
}) {
  return (
    <div className="mb-10 text-center">
      <h2
        className={classNames(
          'text-3xl font-bold tracking-normal sm:text-4xl',
          invert ? 'text-white' : 'text-bolt-elements-textPrimary',
        )}
      >
        {title}
      </h2>
      <p
        className={classNames(
          'mx-auto mt-3 max-w-2xl text-base leading-7',
          invert ? 'text-white/70' : 'text-bolt-elements-textSecondary',
        )}
      >
        {description}
      </p>
    </div>
  );
}

/*
 * `flex-wrap` pushed the icon onto a line of its own as soon as the label
 * outgrew the row (every uppercase eyebrow does, below ~430px), turning the
 * `rounded-full` pill into a multi-line slab with a stranded icon. Keep the
 * icon beside the text and let the LABEL wrap inside the pill instead.
 */
function Badge({ children, icon }: { children: ReactNode; icon: LucideIcon }) {
  const IconComponent = icon;

  return (
    <span className="inline-flex max-w-full flex-nowrap items-center justify-center gap-2 rounded-full bg-[var(--vc-action-primary-strong)] px-4 py-1.5 text-center text-xs font-semibold uppercase leading-5 tracking-[0.14em] text-white">
      <IconComponent className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

function ActionLink({
  children,
  fullWidth = false,
  to,
  variant = 'default',
}: {
  children: ReactNode;
  fullWidth?: boolean;
  to: string;
  variant?: 'default' | 'outline' | 'outlineDark';
}) {
  const className = classNames(
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 py-2 text-center text-sm font-semibold leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)]',
    fullWidth && 'w-full',
    variant === 'default' && 'bg-[var(--vc-action-primary-strong)] text-white hover:brightness-90',
    variant === 'outline' &&
      'border border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2',
    variant === 'outlineDark' && 'border border-white/25 text-white hover:bg-white/10',
  );

  if (/^(https?:)?\/\//.test(to)) {
    return (
      <a href={to} className={className}>
        {children}
      </a>
    );
  }

  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}

function Panel({
  children,
  className,
  dark = false,
  id,
}: {
  children: ReactNode;
  className?: string;
  dark?: boolean;
  id?: string;
}) {
  return (
    <article
      id={id}
      className={classNames(
        'rounded-lg border p-5 shadow-sm',
        dark ? 'border-white/10 bg-white/5' : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-1',
        className,
      )}
    >
      {children}
    </article>
  );
}

function IconCard({ children, icon, title }: { children: ReactNode; icon: LucideIcon; title: string }) {
  const IconComponent = icon;

  return (
    <Panel>
      <span className="inline-flex rounded-lg bg-[var(--ecode-accent)]/10 p-3 text-[var(--ecode-accent)]">
        <IconComponent className="h-7 w-7" aria-hidden />
      </span>
      <h3 className="mt-4 text-xl font-semibold text-bolt-elements-textPrimary">{title}</h3>
      <div className="mt-3 text-sm leading-6 text-bolt-elements-textSecondary">{children}</div>
    </Panel>
  );
}

function CheckList({
  className,
  invert = false,
  items,
}: {
  className?: string;
  invert?: boolean;
  items: readonly string[];
}) {
  return (
    <ul className={classNames('space-y-2 text-sm', className)}>
      {items.map((item) => (
        <li
          key={item}
          className={classNames(
            'flex items-start gap-2',
            invert ? 'text-white/80' : 'text-bolt-elements-textSecondary',
          )}
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ecode-accent)]" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function DemoFrame({
  compact = false,
  description,
  eyebrow,
  metrics,
  title,
}: {
  compact?: boolean;
  description: string;
  eyebrow: string;
  metrics: readonly (readonly [string, string])[];
  title: string;
}) {
  return (
    <div
      className={classNames(
        'relative overflow-hidden rounded-2xl border border-bolt-elements-borderColor bg-slate-950 shadow-2xl',
        compact ? 'min-h-[360px]' : 'min-h-[420px]',
      )}
    >
      <img
        src={heroImage}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-55"
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/20" />
      <div className="relative flex min-h-[inherit] flex-col justify-end p-5 sm:p-7">
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur">
          <PlayCircle className="h-4 w-4" aria-hidden />
          {eyebrow}
        </span>
        <h2 className="mt-4 max-w-2xl text-2xl font-semibold text-white sm:text-3xl">{title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">{description}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {metrics.map(([value, label]) => (
            <div key={`${value}-${label}`} className="rounded-lg border border-white/10 bg-white/10 p-3 backdrop-blur">
              <div className="text-lg font-bold text-white">{value}</div>
              <div className="text-xs text-white/60">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkspaceMockup({ large = false }: { large?: boolean }) {
  const { i18n } = useTranslation();
  const copy = getMarketingProductRemainingCopy(i18n.resolvedLanguage ?? i18n.language).workbench;
  const workspacePreviewUrl = 'ecode://workspace/customer-portal';

  return (
    <div
      className={classNames(
        'overflow-hidden rounded-2xl border border-bolt-elements-borderColor bg-slate-950 shadow-2xl',
        large ? 'min-h-[520px]' : 'min-h-[420px]',
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-400" />
        <span className="h-3 w-3 rounded-full bg-amber-400" />
        <span className="h-3 w-3 rounded-full bg-emerald-400" />
        <span className="ml-3 text-xs text-white/50">{workspacePreviewUrl}</span>
      </div>
      {/*
       * An `fr` track keeps an implicit `min-width: min-content`, and the code
       * block below is `white-space: pre` — so its ~340px min-content width
       * forced this grid WIDER than its `overflow-hidden` shell on a phone and
       * the mockup got clipped on both edges (sidebar labels sheared to
       * "ments", code running off-screen). Stack to one column below `sm`, and
       * let the panes actually shrink via `min-w-0`.
       */}
      <div className="grid min-h-[inherit] grid-cols-1 sm:grid-cols-[0.32fr_0.68fr]">
        <aside className="min-w-0 border-b border-white/10 bg-white/[0.03] p-4 text-xs text-white/55 sm:border-b-0 sm:border-r">
          {['app', 'components', 'routes', 'api', 'deployments'].map((item) => (
            <div key={item} className="mb-3 flex items-center gap-2">
              <Layers className="h-3.5 w-3.5" aria-hidden />
              <span data-user-content>{item}</span>
            </div>
          ))}
        </aside>
        <div className="min-w-0 p-4">
          {/* `overflow-x-auto` keeps a long line inside the panel instead of widening the grid. */}
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/35 p-4 font-mono text-xs leading-6 text-emerald-200">
            <code>
              {'import { Dashboard } from "./components";\n'}
              {'export default function App() {\n'}
              {'  return <Dashboard data={metrics} />;\n'}
              {'}'}
            </code>
          </pre>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {copy.states.map((item) => (
              <span key={item} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductFigure({ alt, caption, src }: { alt: string; caption?: string; src: string }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 shadow-2xl">
      <img src={src} alt={alt} className="block w-full" loading="lazy" decoding="async" />
      {caption ? (
        <figcaption className="border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-5 py-3 text-sm text-bolt-elements-textSecondary">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

function FeatureTile({ feature, icon }: { feature: ProductFeatureCopy; icon: LucideIcon }) {
  const Icon = icon;

  return (
    <Panel>
      <span className="inline-flex rounded-lg bg-[var(--ecode-accent)]/10 p-3 text-[var(--ecode-accent)]">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <h3 className="mt-4 text-xl font-semibold text-bolt-elements-textPrimary">{feature.title}</h3>
      <p className="mt-2 text-sm leading-6 text-bolt-elements-textSecondary">{feature.description}</p>
      <CheckList className="mt-4" items={feature.bullets} />
    </Panel>
  );
}

function PhoneDemo({ activeFeature, icon }: { activeFeature: MobileFeatureCopy; icon: LucideIcon }) {
  const { i18n } = useTranslation();
  const copy = getMarketingProductRemainingCopy(i18n.resolvedLanguage ?? i18n.language).mobile;
  const Icon = icon;

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="rounded-[2.25rem] border border-bolt-elements-borderColor bg-slate-950 p-3 shadow-2xl">
        <div className="rounded-[1.75rem] border border-white/10 bg-gradient-to-b from-slate-900 to-black p-4 text-white">
          <div className="mx-auto mb-5 h-1.5 w-20 rounded-full bg-white/20" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/55">{copy.productName}</span>
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-200">{copy.live}</span>
          </div>
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
            <Icon className="h-10 w-10 text-[var(--ecode-accent)]" aria-hidden />
            <h2 className="mt-4 text-xl font-semibold">{activeFeature.title}</h2>
            <p className="mt-2 text-sm leading-6 text-white/65">{activeFeature.description}</p>
          </div>
          <div className="mt-5 space-y-2">
            {activeFeature.details.slice(0, 3).map((item) => (
              <div key={item} className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/75">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileFeatureDemo({ copy, featureId }: { copy: RemainingProductCopy['mobile']; featureId: MobileFeatureId }) {
  if (featureId === 'terminal') {
    return (
      <Panel dark className="bg-slate-950">
        <div className="font-mono text-sm text-emerald-200">
          <p className="text-emerald-400">
            <code>$ ecode login --sso</code>
          </p>
          <p>{copy.terminalAuthenticated}</p>
          <p className="mt-3 text-emerald-400">
            <code>$ npm run test:mobile</code>
          </p>
          <p>{copy.terminalChecksPassed}</p>
          <p className="mt-3 text-emerald-400">
            <code>$ ecode deploy mobile-app --target=edge</code>
          </p>
          <p>{copy.terminalDeployReady}</p>
        </div>
      </Panel>
    );
  }

  if (featureId === 'preview') {
    return (
      <Panel>
        <h3 className="text-xl font-semibold text-bolt-elements-textPrimary">{copy.devicePreviews}</h3>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {copy.devices.map((device) => (
            <div
              key={device}
              className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-center"
            >
              <MonitorSmartphone className="mx-auto h-8 w-8 text-[var(--ecode-accent)]" aria-hidden />
              <p className="mt-3 text-sm font-medium text-bolt-elements-textPrimary">{device}</p>
              <p className="mt-1 text-xs text-bolt-elements-textSecondary">{copy.edgePreview}</p>
            </div>
          ))}
        </div>
      </Panel>
    );
  }

  return (
    <Panel dark className="bg-slate-950">
      <pre className="rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-xs leading-6 text-emerald-200">
        <code>
          {'import Workspace from "@ecode/mobile";\n'}
          {'const session = Workspace.resume("inventory-app");\n'}
          {'session.enableAI();\n'}
          {'session.share({ team: "Field Ops" });'}
        </code>
      </pre>
    </Panel>
  );
}

function DeploymentStatusCard() {
  const { i18n } = useTranslation();
  const copy = getMarketingProductRemainingCopy(i18n.resolvedLanguage ?? i18n.language).deployments.status;
  const deploymentReference = 'marketing-site@main';

  return (
    <Panel className="bg-slate-950 text-white">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-white/55">{deploymentReference}</p>
          <h2 className="text-2xl font-semibold text-white">{copy.live}</h2>
        </div>
        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-semibold text-emerald-200">
          {copy.healthy}
        </span>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {copy.metrics.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-white/55">{label}</p>
            <p className="mt-1 text-xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function formatMonthlyPrice(cents: number, language?: string | null) {
  return new Intl.NumberFormat(language?.toLowerCase().startsWith('fr') ? 'fr-FR' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatAnnualPrice(monthlyCents: number, language?: string | null) {
  return new Intl.NumberFormat(language?.toLowerCase().startsWith('fr') ? 'fr-FR' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format((monthlyCents * 12) / 100);
}
