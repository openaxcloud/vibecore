import { Brain, Gauge, Globe2, MessagesSquare, Rocket, Shield, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  formatMarketingExactLandingFeaturesInteger,
  formatMarketingExactLandingFeaturesPercent,
  getMarketingExactLandingFeaturesCopy,
  interpolateMarketingExactLandingFeaturesCopy,
  type LandingFeatureId,
} from '~/lib/i18n/catalogs/marketing-exact-landing-features';

const FEATURE_ICONS: Record<LandingFeatureId, LucideIcon> = {
  infrastructure: Rocket,
  ai: Brain,
  security: Shield,
  collaboration: MessagesSquare,
  speed: Gauge,
  edge: Globe2,
};

export default function LandingFeatures() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingExactLandingFeaturesCopy(language).exactLandingFeatures;

  const featureVariables = {
    uptime: formatMarketingExactLandingFeaturesPercent(0.9999, language),
    locations: formatMarketingExactLandingFeaturesInteger(200, language),
  };

  return (
    <section
      className="bg-[var(--ecode-surface)] py-16 sm:py-20 lg:py-24"
      aria-labelledby="landing-features-heading"
      data-testid="section-features"
    >
      <div className="container-responsive max-w-7xl">
        <div className="mx-auto mb-12 min-w-0 max-w-3xl animate-fade-in text-center motion-reduce:animate-none sm:mb-16">
          <h2
            id="landing-features-heading"
            className="mb-4 break-words text-responsive-2xl font-bold text-[var(--ecode-text)] [overflow-wrap:anywhere]"
          >
            {copy.heading}
          </h2>
          <p className="mx-auto max-w-3xl break-words text-responsive-base text-[var(--ecode-text-muted)] [overflow-wrap:anywhere]">
            {copy.description}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {copy.features.map((feature, index) => {
            const Icon = FEATURE_ICONS[feature.id];

            const description = interpolateMarketingExactLandingFeaturesCopy(feature.description, featureVariables);

            return (
              <Card
                key={feature.id}
                className="group h-full min-w-0 animate-fade-in border-[var(--ecode-border)] bg-[var(--ecode-surface)] transition-all duration-300 hover:border-ecode-accent/50 hover:shadow-xl motion-reduce:animate-none motion-reduce:transition-none"
                style={{ animationDelay: `${index * 100}ms` }}
                data-testid={`card-feature-${index}`}
              >
                <CardHeader className="min-w-0">
                  <div
                    className="mb-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-ecode-accent to-ecode-secondary-accent text-white shadow-lg shadow-primary/20 transition-transform duration-300 group-hover:scale-110 motion-reduce:transform-none motion-reduce:transition-none"
                    data-testid={`icon-feature-${index}`}
                    aria-hidden="true"
                  >
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <CardTitle
                    className="break-words text-xl text-[var(--ecode-text)] [overflow-wrap:anywhere]"
                    data-testid={`text-feature-title-${index}`}
                  >
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="min-w-0">
                  <CardDescription
                    className="break-words text-base text-[var(--ecode-text-muted)] [overflow-wrap:anywhere]"
                    data-testid={`text-feature-description-${index}`}
                  >
                    {description}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
