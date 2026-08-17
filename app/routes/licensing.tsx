import { useTranslation } from 'react-i18next';
import type { LoaderFunctionArgs, MetaFunction } from 'react-router';

import { PublicShell } from '~/components/dashboard/SaaSLayout';
import { getMarketingExactLicensingCopy } from '~/lib/i18n/catalogs/marketing-exact-licensing';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { MARKETING_SITE_URL, socialMetaTags } from '~/utils/social-meta';

export function loader({ request }: LoaderFunctionArgs) {
  return { language: resolveRequestLocale(request).language };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const language = data?.language === 'fr' ? 'fr' : 'en';
  const seo = getMarketingExactLicensingCopy(language).exactLicensing.seo;
  const canonical = `${MARKETING_SITE_URL}/licensing`;

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

export default function LicensingRoute() {
  const { i18n } = useTranslation();
  const copy = getMarketingExactLicensingCopy(i18n.resolvedLanguage ?? i18n.language).exactLicensing;

  return (
    <PublicShell>
      <main
        className="min-w-0 bg-[var(--ecode-background)] text-[var(--ecode-text)]"
        data-ecode-marketing-page="licensing"
        data-testid="page-licensing"
      >
        <section
          className="border-b border-[var(--ecode-border)] bg-gradient-to-b from-background to-muted"
          aria-labelledby="licensing-heading"
        >
          <div className="container-responsive max-w-4xl py-16 sm:py-20 lg:py-24">
            <div className="min-w-0 text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ecode-accent-text)]">
                {copy.hero.eyebrow}
              </p>
              <h1
                id="licensing-heading"
                className="mkt-h1 mx-auto mt-3 max-w-3xl break-words text-[var(--ecode-text)] [overflow-wrap:anywhere]"
              >
                {copy.hero.title}
              </h1>
              <p className="mkt-lead mx-auto mt-4 max-w-3xl break-words text-[var(--ecode-text-secondary)] [overflow-wrap:anywhere]">
                {copy.hero.description}
              </p>
            </div>
          </div>
        </section>

        <section
          className="py-12 sm:py-16 lg:py-20"
          aria-labelledby="licensing-sections-heading"
          data-testid="section-licensing-terms"
        >
          <div className="container-responsive max-w-5xl">
            <h2 id="licensing-sections-heading" className="sr-only">
              {copy.sectionsTitle}
            </h2>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {copy.sections.map((section) => (
                <article
                  key={section.id}
                  className="h-full min-w-0 rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-5 sm:p-7"
                  aria-labelledby={`licensing-section-${section.id}`}
                  data-testid={`article-licensing-${section.id}`}
                >
                  <h3
                    id={`licensing-section-${section.id}`}
                    className="break-words text-xl font-semibold text-[var(--ecode-text)] [overflow-wrap:anywhere]"
                  >
                    {section.title}
                  </h3>
                  <p className="mt-3 break-words text-[15px] leading-7 text-[var(--ecode-text-secondary)] [overflow-wrap:anywhere]">
                    {section.body}
                  </p>
                  {section.points.length > 0 ? (
                    <ul className="mt-4 grid gap-2 pl-5 text-sm leading-6 text-[var(--ecode-text-secondary)]">
                      {section.points.map((point) => (
                        <li
                          key={point}
                          className="list-disc break-words marker:text-[var(--ecode-accent-text)] [overflow-wrap:anywhere]"
                        >
                          {point}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
