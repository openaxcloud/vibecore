import { ArrowRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Link,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import { resolveTemplateTech, type TemplateLike } from '~/components/marketing/template-tech-icon';
import {
  formatMarketingLandingTemplateLinkLabel,
  getMarketingLandingTemplatesCopy,
  type MarketingLandingTemplatesKey,
} from '~/lib/i18n/catalogs/marketing-landing-templates-video';

export interface LandingTemplate extends TemplateLike {
  id?: number | string;
  category?: string;
  description?: string;
}

interface LandingTemplatesProps {
  templates: readonly LandingTemplate[];
  isLoading: boolean;
}

const defaultTemplateDefinitions = [
  {
    id: 'saas',
    icon: 'stripe',
    nameKey: 'marketingLandingTemplates.fallback.saas.name',
    descriptionKey: 'marketingLandingTemplates.fallback.saas.description',
    categoryKey: 'marketingLandingTemplates.fallback.saas.category',
  },
  {
    id: 'ecommerce',
    icon: 'shopify',
    nameKey: 'marketingLandingTemplates.fallback.ecommerce.name',
    descriptionKey: 'marketingLandingTemplates.fallback.ecommerce.description',
    categoryKey: 'marketingLandingTemplates.fallback.ecommerce.category',
  },
  {
    id: 'analytics',
    icon: 'chartjs',
    nameKey: 'marketingLandingTemplates.fallback.analytics.name',
    descriptionKey: 'marketingLandingTemplates.fallback.analytics.description',
    categoryKey: 'marketingLandingTemplates.fallback.analytics.category',
  },
  {
    id: 'chat',
    icon: 'socketio',
    nameKey: 'marketingLandingTemplates.fallback.chat.name',
    descriptionKey: 'marketingLandingTemplates.fallback.chat.description',
    categoryKey: 'marketingLandingTemplates.fallback.chat.category',
  },
  {
    id: 'documentation',
    icon: 'docs',
    nameKey: 'marketingLandingTemplates.fallback.documentation.name',
    descriptionKey: 'marketingLandingTemplates.fallback.documentation.description',
    categoryKey: 'marketingLandingTemplates.fallback.documentation.category',
  },
  {
    id: 'admin',
    icon: 'admin',
    nameKey: 'marketingLandingTemplates.fallback.admin.name',
    descriptionKey: 'marketingLandingTemplates.fallback.admin.description',
    categoryKey: 'marketingLandingTemplates.fallback.admin.category',
  },
] as const satisfies ReadonlyArray<{
  id: string;
  icon: string;
  nameKey: MarketingLandingTemplatesKey;
  descriptionKey: MarketingLandingTemplatesKey;
  categoryKey: MarketingLandingTemplatesKey;
}>;

export default function LandingTemplates({ templates, isLoading }: LandingTemplatesProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingLandingTemplatesCopy(language);

  const defaultTemplates = defaultTemplateDefinitions.map<LandingTemplate>((template) => ({
    id: template.id,
    icon: template.icon,
    name: copy[template.nameKey],
    description: copy[template.descriptionKey],
    category: copy[template.categoryKey],
  }));

  const displayTemplates = templates.length > 0 ? templates.slice(0, 6) : defaultTemplates;

  return (
    <section
      className="bg-[var(--ecode-surface-tertiary)] py-14 sm:py-20"
      aria-labelledby="landing-templates-heading"
      aria-busy={isLoading}
      data-testid="section-templates"
    >
      <div className="container-responsive max-w-7xl">
        <div className="mb-10 min-w-0 animate-fade-in text-center motion-reduce:animate-none sm:mb-12">
          <h2
            id="landing-templates-heading"
            className="mb-4 break-words text-responsive-2xl font-bold text-[var(--ecode-text)] [overflow-wrap:anywhere]"
          >
            {copy['marketingLandingTemplates.title']}
          </h2>
          <p className="mx-auto max-w-3xl break-words text-responsive-base text-[var(--ecode-text-muted)] [overflow-wrap:anywhere]">
            {copy['marketingLandingTemplates.subtitle']}
          </p>
        </div>

        {isLoading ? (
          <div className="flex min-h-32 items-center justify-center py-12" role="status">
            <Loader2
              className="h-8 w-8 animate-spin text-ecode-accent-text motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span className="sr-only">{copy['marketingLandingTemplates.loading']}</span>
          </div>
        ) : (
          <ul className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {displayTemplates.map((template, index) => {
              const { Icon: IconComponent, brand } = resolveTemplateTech(template);

              return (
                <li
                  key={template.id ?? index}
                  className="min-w-0 animate-fade-in motion-reduce:animate-none"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <Link
                    to="/templates"
                    className="group block h-full min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ecode-surface-tertiary)]"
                    aria-label={formatMarketingLandingTemplateLinkLabel(template.name, language)}
                  >
                    <Card className="h-full min-w-0 border-[var(--ecode-border)] bg-[var(--ecode-surface)] transition-all duration-300 group-hover:border-ecode-accent/50 group-hover:shadow-[0_8px_32px_-8px_rgba(242,98,7,0.2)] motion-reduce:transition-none">
                      <CardHeader className="min-w-0">
                        <div className="flex min-w-0 items-start gap-3">
                          <div
                            className={
                              brand
                                ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface-tertiary)]'
                                : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ecode-accent'
                            }
                            aria-hidden="true"
                          >
                            <IconComponent
                              className="h-5 w-5"
                              style={{ color: brand ?? '#FFFFFF' }}
                              aria-hidden="true"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <CardTitle className="break-words text-[15px] leading-snug [overflow-wrap:anywhere]">
                              {template.name}
                            </CardTitle>
                            {template.category ? (
                              <Badge
                                variant="secondary"
                                className="mt-1 max-w-full whitespace-normal break-words text-left text-[11px] [overflow-wrap:anywhere]"
                              >
                                {template.category}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="min-w-0">
                        <CardDescription className="break-words [overflow-wrap:anywhere]">
                          {template.description}
                        </CardDescription>
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-10 text-center sm:mt-12">
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-auto min-h-11 max-w-full gap-2 whitespace-normal py-3 text-center leading-snug"
          >
            <Link to="/templates">
              <span className="break-words [overflow-wrap:anywhere]">{copy['marketingLandingTemplates.viewAll']}</span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
