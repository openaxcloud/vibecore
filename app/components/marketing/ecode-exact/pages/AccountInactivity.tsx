import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';

import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import {
  getMarketingExactAccountLanguagesCopy,
  type AccountInactivityRichText,
} from '~/lib/i18n/catalogs/marketing-exact-account-languages';
import { formatLegalMonthYear } from '~/lib/i18n/legal-date';
import { LEGAL_DATES } from '~/lib/legal-dates';

function renderRichText(segments: AccountInactivityRichText) {
  return segments.map((segment, index) => {
    const key = `${segment.kind}-${index}`;

    if (segment.kind === 'strong') {
      return <strong key={key}>{segment.text}</strong>;
    }

    if (segment.kind === 'email') {
      return (
        <a
          key={key}
          href={`mailto:${segment.address}`}
          className="break-all rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)]"
        >
          {segment.address}
        </a>
      );
    }

    return <Fragment key={key}>{segment.text}</Fragment>;
  });
}

export default function AccountInactivity() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingExactAccountLanguagesCopy(language).exactAccountInactivity;
  const lastUpdated = formatLegalMonthYear(LEGAL_DATES.accountInactivity, language);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground" data-testid="page-account-inactivity">
      <PublicNavbar />

      <main className="min-w-0 flex-1">
        <div className="container-responsive py-responsive">
          <article className="mx-auto min-w-0 max-w-4xl">
            <h1
              className="mb-8 break-words text-responsive-2xl font-bold [overflow-wrap:anywhere]"
              data-testid="heading-account-inactivity"
            >
              {copy.title}
            </h1>

            <div className="prose prose-gray max-w-none space-y-8 break-words [overflow-wrap:anywhere] dark:prose-invert">
              <header>
                <p className="text-[15px] text-muted-foreground">
                  {copy.lastUpdatedLabel} <time>{lastUpdated}</time>
                </p>
                <p>{copy.intro}</p>
              </header>

              {copy.sections.map((section) => {
                const headingId = `account-inactivity-${section.id}`;

                return (
                  <section key={section.id} aria-labelledby={headingId}>
                    <h2 id={headingId} className="mt-8 mb-4 break-words text-2xl font-semibold">
                      {section.title}
                    </h2>
                    {section.paragraphs.map((paragraph, paragraphIndex) => (
                      <p key={`${section.id}-${paragraphIndex}`}>{renderRichText(paragraph)}</p>
                    ))}
                  </section>
                );
              })}
            </div>
          </article>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
