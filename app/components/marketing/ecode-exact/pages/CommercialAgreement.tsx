import { FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import { Card, CardContent } from '~/components/marketing/ecode-exact/EcodeExactUi';
import { getMarketingExactAgreementTeamCopy } from '~/lib/i18n/catalogs/marketing-exact-agreement-team';
import { formatLegalMonthYear } from '~/lib/i18n/legal-date';
import { LEGAL_DATES } from '~/lib/legal-dates';

const COMMERCIAL_LEGAL_CONTACT = {
  company: 'E-Code — Snatch Group Limited',
  email: 'legal@e-code.ai',
  address: 'Abba Eban 8 Blvd, 46120 Herzliya Pituach, Israel',
} as const;

export default function CommercialAgreement() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingExactAgreementTeamCopy(language).exactCommercialAgreement;
  const lastUpdated = formatLegalMonthYear(LEGAL_DATES.commercialAgreement, language);

  return (
    <div className="min-h-screen flex flex-col" data-testid="page-commercial-agreement">
      <PublicNavbar />

      <main className="flex-1">
        <div className="container-responsive py-responsive">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="h-8 w-8 text-primary" aria-hidden />
              {/* Échelle h1 de la famille légale : responsive (24→48px), pas un 36px figé à 390. */}
              <h1 className="break-words text-responsive-2xl font-bold" data-testid="heading-commercial-agreement">
                {copy.title}
              </h1>
            </div>
            <p className="text-[15px] text-muted-foreground mb-8">
              {copy.lastUpdated}: {lastUpdated}
            </p>

            <Card className="mb-8">
              <CardContent className="pt-6">
                <p className="text-[15px] text-muted-foreground">{copy.introduction}</p>
              </CardContent>
            </Card>

            <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
              {copy.sections.map((section) => (
                <section key={section.id}>
                  <h2 className="text-2xl font-semibold mt-8 mb-4">{section.title}</h2>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {section.points.length > 0 ? (
                    <ul className="list-disc pl-6 mt-4 space-y-2">
                      {section.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  ) : null}
                  {section.id === 'contact' ? (
                    <div className="mt-4 p-4 bg-muted rounded-lg">
                      <p>{COMMERCIAL_LEGAL_CONTACT.company}</p>
                      <p>
                        {copy.contact.emailLabel}: {COMMERCIAL_LEGAL_CONTACT.email}
                      </p>
                      <p>
                        {copy.contact.addressLabel}: {COMMERCIAL_LEGAL_CONTACT.address}
                      </p>
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
