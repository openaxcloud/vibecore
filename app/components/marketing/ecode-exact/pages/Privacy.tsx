import { useTranslation } from 'react-i18next';

import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import { getMarketingExactPrivacyTermsCopy } from '~/lib/i18n/catalogs/marketing-exact-privacy-terms';
import { formatLegalMonthYear } from '~/lib/i18n/legal-date';
import { LEGAL_DATES } from '~/lib/legal-dates';

export default function Privacy() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const catalog = getMarketingExactPrivacyTermsCopy(language);
  const copy = catalog.exactPrivacy;
  const lastUpdated = formatLegalMonthYear(LEGAL_DATES.privacy, language);

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-privacy">
      <PublicNavbar />

      <main className="flex-1">
        <div className="container-responsive py-responsive">
          <article className="mx-auto min-w-0 max-w-4xl">
            <h1 className="mb-8 break-words text-responsive-2xl font-bold" data-testid="heading-privacy">
              {copy.title}
            </h1>

            <div className="prose prose-gray dark:prose-invert max-w-none space-y-8 break-words [overflow-wrap:anywhere]">
              <p className="text-[15px] text-muted-foreground">
                {copy.lastUpdatedLabel} <time>{lastUpdated}</time>
              </p>

              {copy.sections.map((section) => {
                const headingId = `privacy-${section.id}`;

                return (
                  <section key={section.id} aria-labelledby={headingId}>
                    <h2 id={headingId} className="mt-8 mb-4 text-2xl font-semibold">
                      {section.title}
                    </h2>
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                    {section.items ? (
                      <ul className="mt-4 list-disc space-y-2 pl-5 sm:pl-6">
                        {section.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                );
              })}

              <section aria-labelledby="privacy-contact">
                <h2 id="privacy-contact" className="mt-8 mb-4 text-2xl font-semibold">
                  {copy.contact.title}
                </h2>
                <p>{copy.contact.description}</p>
                <address className="mt-4 rounded-lg border border-border bg-muted p-4 not-italic sm:p-6">
                  <p className="font-medium text-foreground">{catalog.shared.legalEntity}</p>
                  <p>
                    <span className="font-medium text-foreground">{copy.contact.emailLabel}</span>{' '}
                    <a className="break-all" href={`mailto:${catalog.shared.privacyEmail}`}>
                      {catalog.shared.privacyEmail}
                    </a>
                  </p>
                  <p>
                    <span className="font-medium text-foreground">{copy.contact.addressLabel}</span>{' '}
                    {catalog.shared.postalAddress}
                  </p>
                </address>
              </section>
            </div>
          </article>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
