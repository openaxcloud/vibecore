import { ArrowRight, CheckCircle2, Gavel } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, type LoaderFunctionArgs, type MetaFunction } from 'react-router';

import { PublicShell } from '~/components/dashboard/SaaSLayout';
import {
  formatMarketingExactStrikeSystemInteger,
  getMarketingExactStrikeSystemCopy,
  interpolateMarketingExactStrikeSystemCopy,
} from '~/lib/i18n/catalogs/marketing-exact-strike-system';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { MARKETING_SITE_URL, socialMetaTags } from '~/utils/social-meta';

const STRIKE_SYSTEM_ROUTES = {
  primary: '/report-abuse',
  secondary: '/acceptable-use',
} as const;

const STRIKE_POLICY = {
  warningCount: 1,
  communityCount: 3,
  suspensionCount: 4,
  expiryDays: 180,
} as const;

function strikePolicyValues(language?: string | null) {
  return {
    warningCount: formatMarketingExactStrikeSystemInteger(STRIKE_POLICY.warningCount, language),
    communityCount: formatMarketingExactStrikeSystemInteger(STRIKE_POLICY.communityCount, language),
    suspensionCount: formatMarketingExactStrikeSystemInteger(STRIKE_POLICY.suspensionCount, language),
    days: formatMarketingExactStrikeSystemInteger(STRIKE_POLICY.expiryDays, language),
  };
}

export function loader({ request }: LoaderFunctionArgs) {
  return { language: resolveRequestLocale(request).language };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const language = data?.language === 'fr' ? 'fr' : 'en';
  const catalogSeo = getMarketingExactStrikeSystemCopy(language).exactStrikeSystem.seo;

  const seo = {
    ...catalogSeo,
    description: interpolateMarketingExactStrikeSystemCopy(catalogSeo.description, strikePolicyValues(language)),
  };

  const canonical = `${MARKETING_SITE_URL}/strike-system`;

  const social = socialMetaTags(seo).map((tag) => {
    const identifier = 'property' in tag ? tag.property : 'name' in tag ? tag.name : undefined;

    return identifier === 'og:image:alt' || identifier === 'twitter:image:alt'
      ? { ...tag, content: seo.imageAlt }
      : tag;
  });

  return [
    { title: seo.title },
    { name: 'description', content: seo.description },
    ...social,
    { property: 'og:url', content: canonical },
    { property: 'og:locale', content: language === 'fr' ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: language === 'fr' ? 'en_US' : 'fr_FR' },
    { tagName: 'link', rel: 'canonical', href: canonical },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${canonical}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${canonical}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: canonical },
  ];
};

function StrikeSystemActionLink({
  label,
  to,
  variant = 'primary',
}: {
  label: string;
  to: string;
  variant?: 'primary' | 'secondary';
}) {
  const className =
    variant === 'primary'
      ? 'group inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-normal rounded-md bg-[var(--ecode-accent)] px-5 py-3 text-center text-sm font-semibold text-[var(--ecode-accent-contrast)] transition-colors hover:bg-[var(--ecode-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ecode-background)] motion-reduce:transition-none sm:w-auto'
      : 'group inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-normal rounded-md border border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-5 py-3 text-center text-sm font-semibold text-[var(--ecode-text)] transition-colors hover:border-[var(--ecode-accent)] hover:text-[var(--ecode-accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ecode-background)] motion-reduce:transition-none sm:w-auto';

  return (
    <Link to={to} className={className}>
      {label}
      <ArrowRight
        className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
        aria-hidden="true"
      />
    </Link>
  );
}

export default function StrikeSystemPage() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingExactStrikeSystemCopy(language).exactStrikeSystem;
  const values = strikePolicyValues(language);
  const localizeText = (value: string) => interpolateMarketingExactStrikeSystemCopy(value, values);

  return (
    <PublicShell>
      <main
        className="min-w-0 bg-[var(--ecode-background)] text-[var(--ecode-text)]"
        data-ecode-marketing-page="strike-system"
        data-testid="page-strike-system"
      >
        <section
          className="border-b border-[var(--ecode-border)] bg-gradient-to-b from-background to-muted"
          aria-labelledby="strike-system-heading"
        >
          <div className="container-responsive py-16 sm:py-20 lg:py-24">
            <div className="mx-auto min-w-0 max-w-4xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-4 py-2 text-[13px] font-semibold text-[var(--ecode-accent-text)]">
                <Gavel className="h-4 w-4 shrink-0" aria-hidden="true" />
                {copy.hero.eyebrow}
              </span>
              <h1
                id="strike-system-heading"
                className="mkt-h1 mx-auto mt-6 max-w-4xl break-words text-[var(--ecode-text)] [overflow-wrap:anywhere]"
              >
                {copy.hero.title}
              </h1>
              <p className="mkt-lead mx-auto mt-5 max-w-3xl break-words text-[var(--ecode-text-secondary)] [overflow-wrap:anywhere]">
                {copy.hero.description}
              </p>
              <div className="mx-auto mt-8 flex max-w-3xl flex-col justify-center gap-3 sm:flex-row">
                <StrikeSystemActionLink label={copy.actions.primary} to={STRIKE_SYSTEM_ROUTES.primary} />
                <StrikeSystemActionLink
                  label={copy.actions.secondary}
                  to={STRIKE_SYSTEM_ROUTES.secondary}
                  variant="secondary"
                />
              </div>
            </div>
          </div>
        </section>

        <section
          className="py-12 sm:py-16"
          aria-labelledby="strike-system-highlights-heading"
          data-testid="section-strike-system-highlights"
        >
          <div className="container-responsive max-w-6xl">
            <h2 id="strike-system-highlights-heading" className="sr-only">
              {copy.highlights.title}
            </h2>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {copy.highlights.items.map((highlight) => (
                <li
                  key={highlight.id}
                  className="flex min-h-[4.75rem] min-w-0 items-center gap-3 rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-4 text-sm font-medium"
                  data-testid={`highlight-strike-system-${highlight.id}`}
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--ecode-accent-text)]" aria-hidden="true" />
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{localizeText(highlight.label)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          className="border-y border-[var(--ecode-border)] bg-[var(--ecode-surface-secondary)] py-12 sm:py-16 lg:py-20"
          aria-labelledby="strike-system-policy-heading"
          data-testid="section-strike-system-policy"
        >
          <div className="container-responsive max-w-6xl">
            <h2 id="strike-system-policy-heading" className="sr-only">
              {copy.policy.title}
            </h2>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {copy.policy.sections.map((section) => (
                <article
                  key={section.id}
                  className="h-full min-w-0 rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-5 sm:p-7"
                  aria-labelledby={`strike-system-section-${section.id}`}
                  data-testid={`article-strike-system-${section.id}`}
                >
                  <h3
                    id={`strike-system-section-${section.id}`}
                    className="break-words text-xl font-bold tracking-tight [overflow-wrap:anywhere] sm:text-2xl"
                  >
                    {localizeText(section.title)}
                  </h3>
                  <p className="mt-4 break-words text-[15px] leading-7 text-[var(--ecode-text-secondary)] [overflow-wrap:anywhere]">
                    {localizeText(section.body)}
                  </p>
                  <ul className="mt-6 grid gap-3">
                    {section.items.map((item) => (
                      <li key={item} className="flex min-w-0 items-start gap-3 text-sm font-medium">
                        <ArrowRight
                          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ecode-accent-text)]"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 break-words [overflow-wrap:anywhere]">{localizeText(item)}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-14 sm:py-20" aria-labelledby="strike-system-cta-heading">
          <div className="container-responsive max-w-6xl">
            <div className="flex min-w-0 flex-col items-start gap-7 rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 max-w-2xl">
                <h2
                  id="strike-system-cta-heading"
                  className="break-words text-2xl font-bold [overflow-wrap:anywhere] sm:text-3xl"
                >
                  {copy.cta.title}
                </h2>
                <p className="mt-3 break-words text-[15px] leading-7 text-[var(--ecode-text-secondary)] [overflow-wrap:anywhere]">
                  {copy.cta.description}
                </p>
              </div>
              <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row lg:justify-end">
                <StrikeSystemActionLink label={copy.actions.primary} to={STRIKE_SYSTEM_ROUTES.primary} />
                <StrikeSystemActionLink
                  label={copy.actions.secondary}
                  to={STRIKE_SYSTEM_ROUTES.secondary}
                  variant="secondary"
                />
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
