import { ArrowRight, Code2, Layers, Sparkles, Terminal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  formatMarketingExactAccountLanguagesInteger,
  getMarketingExactAccountLanguagesCopy,
  interpolateMarketingExactAccountLanguagesCopy,
  type LanguageBenefitId,
} from '~/lib/i18n/catalogs/marketing-exact-account-languages';

const BENEFIT_ICONS: Readonly<Record<LanguageBenefitId, LucideIcon>> = {
  ai: Sparkles,
  environments: Terminal,
  mix: Layers,
};

export default function Languages() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingExactAccountLanguagesCopy(language).exactLanguages;
  const languageCount = formatMarketingExactAccountLanguagesInteger(copy.languages.items.length, language);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground" data-testid="page-languages">
      <PublicNavbar />

      <main className="min-w-0 flex-1">
        <section
          className="bg-gradient-to-b from-background to-muted py-responsive"
          aria-labelledby="languages-heading"
        >
          <div className="container-responsive">
            <div className="mx-auto max-w-3xl min-w-0 text-center">
              <Code2 className="mx-auto mb-4 h-12 w-12 text-primary" aria-hidden />
              <h1
                id="languages-heading"
                className="mb-4 break-words font-bold mkt-h1 [overflow-wrap:anywhere]"
                data-testid="heading-languages"
              >
                {copy.hero.title}
              </h1>
              <p className="mb-8 break-words text-muted-foreground mkt-lead">{copy.hero.description}</p>
              <Badge
                variant="secondary"
                className="max-w-full whitespace-normal px-4 py-2 text-center text-[15px] leading-relaxed"
              >
                {interpolateMarketingExactAccountLanguagesCopy(copy.hero.badge, { count: languageCount })}
              </Badge>
            </div>
          </div>
        </section>

        <section className="py-responsive" aria-labelledby="supported-languages-heading">
          <div className="container-responsive">
            <h2
              id="supported-languages-heading"
              className="mb-12 break-words text-center font-bold mkt-h2 [overflow-wrap:anywhere]"
            >
              {copy.languages.title}
            </h2>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {copy.languages.items.map((programmingLanguage) => (
                <Card key={programmingLanguage.id} className="h-full min-w-0">
                  <CardContent className="flex h-full min-w-0 flex-col pt-6">
                    <div className="mb-3 flex min-w-0 items-center gap-3">
                      <Terminal className="h-6 w-6 shrink-0 text-primary" aria-hidden />
                      <h3 className="min-w-0 break-words font-semibold mkt-h3">{programmingLanguage.name}</h3>
                    </div>
                    <p className="mb-4 break-words text-muted-foreground mkt-body">{programmingLanguage.note}</p>
                    <a
                      href="/"
                      aria-label={interpolateMarketingExactAccountLanguagesCopy(copy.languages.actionAria, {
                        language: programmingLanguage.name,
                      })}
                      className="mt-auto inline-flex min-h-11 max-w-full self-start items-center gap-1 rounded-sm text-[13px] font-medium text-primary whitespace-normal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)]"
                      data-testid={`link-start-${programmingLanguage.name.toLowerCase()}`}
                    >
                      <span className="break-words">{copy.languages.action}</span>
                      <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-muted py-responsive" aria-labelledby="frameworks-heading">
          <div className="container-responsive">
            <div className="mx-auto mb-12 max-w-2xl min-w-0 text-center">
              <Layers className="mx-auto mb-4 h-10 w-10 text-primary" aria-hidden />
              <h2 id="frameworks-heading" className="mb-4 break-words font-bold mkt-h2 [overflow-wrap:anywhere]">
                {copy.frameworks.title}
              </h2>
              <p className="break-words text-muted-foreground mkt-lead">{copy.frameworks.description}</p>
            </div>

            <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {copy.frameworks.items.map((framework) => (
                <Card key={framework.id} className="h-full min-w-0">
                  <CardHeader className="min-w-0">
                    <CardTitle className="break-words mkt-h3">{framework.name}</CardTitle>
                    <CardDescription className="break-words mkt-body">{framework.note}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-responsive" aria-labelledby="language-benefits-heading">
          <div className="container-responsive">
            <h2
              id="language-benefits-heading"
              className="mb-12 break-words text-center font-bold mkt-h2 [overflow-wrap:anywhere]"
            >
              {copy.benefits.title}
            </h2>

            <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-3">
              {copy.benefits.items.map((benefit) => {
                const Icon = BENEFIT_ICONS[benefit.id];

                return (
                  <div key={benefit.id} className="flex min-w-0 gap-4">
                    <Icon className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0">
                      <h3 className="mb-2 break-words font-semibold mkt-h3">{benefit.title}</h3>
                      <p className="break-words text-muted-foreground mkt-body">{benefit.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-muted py-responsive" aria-labelledby="languages-cta-heading">
          <div className="container-responsive min-w-0 text-center">
            <h2 id="languages-cta-heading" className="mb-4 break-words text-3xl font-bold [overflow-wrap:anywhere]">
              {copy.cta.title}
            </h2>
            <p className="mx-auto mb-8 max-w-2xl break-words text-[15px] text-muted-foreground">
              {copy.cta.description}
            </p>
            <a
              href="/"
              className="inline-flex min-h-[44px] w-full max-w-full items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-center text-primary-foreground whitespace-normal transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] sm:w-auto"
              data-testid="button-languages-cta"
            >
              <span className="break-words">{copy.cta.action}</span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
            </a>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
