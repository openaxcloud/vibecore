import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowRight,
  Blocks,
  CheckCircle2,
  ChevronRight,
  Code,
  Code2,
  Cpu,
  Database,
  FolderTree,
  GitBranch,
  Globe2,
  KeyRound,
  Layers,
  LayoutDashboard,
  Network,
  Rocket,
  Settings2,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Users,
  Users2,
  Zap,
} from 'lucide-react';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useMarketingNavigate,
  usePublicAuth,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import { getMarketingExactProductCopy } from '~/lib/i18n/catalogs/marketing-exact-product';
import {
  getMarketingProductRemainingCopy,
  type ProductFeatureId,
} from '~/lib/i18n/catalogs/marketing-product-remaining';

const FEATURE_ICONS: Record<ProductFeatureId, LucideIcon> = {
  'ai-agent': Sparkles,
  ide: Code2,
  'command-center': TerminalSquare,
  files: FolderTree,
  features: Blocks,
  multiplayer: Users2,
  'save-progress': GitBranch,
  'always-available': Globe2,
  database: Database,
  deployment: Rocket,
  security: ShieldCheck,
  secrets: KeyRound,
  monitoring: Activity,
};

const OVERVIEW_ICONS = {
  environments: Cpu,
  ecosystem: Network,
  configuration: Settings2,
} as const satisfies Record<string, LucideIcon>;

const WORKFLOW_ICONS = {
  code: Code,
  collaborate: Users,
  deploy: Rocket,
} as const satisfies Record<string, LucideIcon>;

/**
 * Filters the feature list for a given category tab. The special `'All'` tab
 * returns every feature; any other value returns only the features whose
 * `category` matches exactly. Kept as a pure function so the tab/data alignment
 * is unit-testable independently of the React tree.
 */
export function filterFeaturesByCategory<T extends { category: string }>(items: T[], category: string): T[] {
  return items.filter((item) => category === 'All' || item.category === category);
}

export default function Features() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const baseCopy = getMarketingProductRemainingCopy(language).features;
  const copy = getMarketingExactProductCopy(language).exactProduct.features;
  const navigate = useMarketingNavigate();
  const { user } = usePublicAuth();

  const features = copy.items.map((item) => {
    const baseFeature = baseCopy.items.find((feature) => feature.id === item.id)!;
    const Icon = FEATURE_ICONS[item.id];

    return {
      ...item,
      title: baseFeature.title,
      description: baseFeature.description,
      icon: <Icon className="h-6 w-6" />,
    };
  });

  const categories = copy.tabs;

  return (
    <div className="min-h-screen flex flex-col">
      <PublicNavbar />

      {/* Hero Section */}
      <section className="py-12 sm:py-16 md:py-20 px-4 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center space-y-4 sm:space-y-6">
            <Badge variant="secondary" className="mb-2 sm:mb-4 text-[11px] sm:text-[13px]">
              <Zap className="h-3 w-3 mr-1" />
              {baseCopy.heroBadge}
            </Badge>
            <h1 className="mkt-h1 font-bold">{baseCopy.heroTitle}</h1>
            <p className="mkt-lead text-muted-foreground max-w-3xl mx-auto px-4 sm:px-0">{baseCopy.heroDescription}</p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4 sm:px-0">
              <Button
                size="lg"
                onClick={() => navigate(user ? '/dashboard' : '/login')}
                className="min-h-[44px]"
                data-testid="button-features-start-building"
              >
                {baseCopy.start}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate('/docs')}
                className="min-h-[44px]"
                data-testid="button-features-docs"
              >
                {baseCopy.docs}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Product Screenshot Showcase — real captures of the live E-Code app */}
      <section className="px-4 pb-4 sm:pb-8 md:pb-12">
        <div className="container mx-auto max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 sm:gap-8 items-stretch">
            {/* Primary shot: the full IDE */}
            <figure className="lg:col-span-3 group relative">
              <div className="absolute -inset-2 bg-gradient-to-r from-[#F26207]/20 to-[#F99D25]/20 blur-2xl rounded-2xl pointer-events-none" />
              <div className="relative rounded-xl overflow-hidden ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-2xl">
                <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#F26207]/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#F99D25]/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                  <span className="ml-2 text-[11px] sm:text-[13px] text-muted-foreground font-medium truncate">
                    {copy.showcase.workspaceTitle}
                  </span>
                </div>
                <img
                  src="/ecode-static/assets/product/ide.png"
                  alt={copy.showcase.workspaceAlt}
                  width={1440}
                  height={900}
                  loading="lazy"
                  className="block w-full h-auto"
                  data-testid="img-features-ide"
                />
              </div>
              <figcaption className="mt-3 flex items-start gap-2 text-[11px] sm:text-[13px] text-muted-foreground px-1">
                <LayoutDashboard className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#F26207] flex-shrink-0 mt-0.5" />
                <span>{copy.showcase.workspaceCaption}</span>
              </figcaption>
            </figure>

            {/* Secondary shot: in-IDE deployments */}
            <figure className="lg:col-span-2 group relative">
              <div className="absolute -inset-2 bg-gradient-to-l from-[#F26207]/15 to-[#F99D25]/15 blur-2xl rounded-2xl pointer-events-none" />
              <div className="relative rounded-xl overflow-hidden ring-1 ring-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-2xl">
                <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3">
                  <Rocket className="h-3.5 w-3.5 text-[#F26207]" />
                  <span className="text-[11px] sm:text-[13px] text-muted-foreground font-medium truncate">
                    {copy.showcase.deploymentsTitle}
                  </span>
                </div>
                <img
                  src="/ecode-static/assets/product/ide-deploy.png"
                  alt={copy.showcase.deploymentsAlt}
                  width={1440}
                  height={900}
                  loading="lazy"
                  className="block w-full h-auto"
                  data-testid="img-features-ide-deploy"
                />
              </div>
              <figcaption className="mt-3 flex items-start gap-2 text-[11px] sm:text-[13px] text-muted-foreground px-1">
                <Rocket className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#F26207] flex-shrink-0 mt-0.5" />
                <span>{copy.showcase.deploymentsCaption}</span>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-12 sm:py-16 md:py-20 px-4">
        <div className="container mx-auto max-w-7xl">
          <Tabs defaultValue="All" className="w-full">
            <TabsList className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 w-full max-w-3xl mx-auto gap-1 h-auto flex-wrap">
              {categories.map((category) => (
                <TabsTrigger
                  key={category.id}
                  value={category.id}
                  className="text-[11px] sm:text-[13px] min-h-[44px]"
                  data-testid={`tab-features-${category.id.toLowerCase()}`}
                >
                  {category.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {categories.map((category) => {
              const visibleFeatures = filterFeaturesByCategory(features, category.id);

              return (
                <TabsContent key={category.id} value={category.id} className="mt-8 sm:mt-12">
                  {visibleFeatures.length === 0 ? (
                    <div
                      className="text-center py-12 sm:py-16 text-muted-foreground text-[13px] sm:text-[15px]"
                      data-testid="text-features-empty"
                    >
                      {copy.empty}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
                      {visibleFeatures.map((feature) => (
                        <Card
                          key={feature.id}
                          id={feature.id}
                          className="hover:shadow-lg transition-shadow"
                          data-testid={`card-feature-${feature.id}`}
                        >
                          <CardHeader className="p-4 sm:p-6">
                            <div className="flex items-center justify-center p-2 sm:p-3 bg-bolt-elements-background-depth-3 text-[#F26207] ring-1 ring-[#F26207]/30 rounded-lg w-fit mb-3 sm:mb-4">
                              {feature.icon}
                            </div>
                            <CardTitle className="mkt-h3">{feature.title}</CardTitle>
                            <CardDescription className="mkt-small">{feature.description}</CardDescription>
                          </CardHeader>
                          <CardContent className="p-4 sm:p-6 pt-0">
                            <ul className="space-y-1.5 sm:space-y-2">
                              {feature.details.map((detail) => (
                                <li key={detail} className="flex items-start gap-2 text-[11px] sm:text-[13px]">
                                  <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 text-[#F26207] flex-shrink-0 mt-0.5" />
                                  <span>{detail}</span>
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      </section>

      {/* Platform Overview */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="secondary" className="mb-4">
                <Layers className="h-3 w-3 mr-1" />
                {copy.overview.badge}
              </Badge>
              <h2 className="mkt-h2 font-bold mb-4">{copy.overview.title}</h2>
              <p className="mkt-body text-muted-foreground mb-6">{copy.overview.description}</p>
              <div className="space-y-4">
                {copy.overview.points.map((point) => {
                  const Icon = OVERVIEW_ICONS[point.id];

                  return (
                    <div key={point.id} className="flex items-start gap-3">
                      <div className="p-2 bg-bolt-elements-background-depth-3 ring-1 ring-[#F26207]/30 rounded">
                        <Icon className="h-5 w-5 text-[#F26207]" />
                      </div>
                      <div>
                        <h3 className="mkt-h3 font-semibold" data-testid={`text-feature-overview-${point.id}`}>
                          {point.title}
                        </h3>
                        <p className="mkt-small text-muted-foreground">{point.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-[#F26207]/20 to-[#F99D25]/20 blur-3xl" />
              <Card className="relative">
                <CardContent className="p-8">
                  <div className="space-y-4">
                    {copy.overview.workflow.map((item) => {
                      const Icon = WORKFLOW_ICONS[item.id];

                      return (
                        <div key={item.id} className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                          <Icon className="h-8 w-8 text-primary" />
                          <div>
                            <p className="font-semibold">{item.title}</p>
                            <p className="mkt-small text-muted-foreground">{item.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="mkt-h2 font-bold mb-4">{copy.cta.title}</h2>
          <p className="mkt-body text-muted-foreground mb-8">{copy.cta.description}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              onClick={() => navigate(user ? '/dashboard' : '/login')}
              data-testid="button-features-get-started"
            >
              {copy.cta.primary}
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate('/contact-sales')}
              data-testid="button-features-contact-sales"
            >
              {copy.cta.secondary}
            </Button>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
