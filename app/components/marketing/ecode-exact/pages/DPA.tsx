import { Download, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import { Button } from '~/components/marketing/ecode-exact/EcodeExactUi';
import { Card } from '~/components/marketing/ecode-exact/EcodeExactUi';
import { getMarketingExactDpaCopy } from '~/lib/i18n/catalogs/marketing-exact-dpa';
import { formatLegalMonthYear } from '~/lib/i18n/legal-date';
import { LEGAL_DATES } from '~/lib/legal-dates';

const PRIVACY_EMAIL = 'privacy@e-code.ai';

export default function DPA() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingExactDpaCopy(language).exactDpa;
  const lastUpdated = formatLegalMonthYear(LEGAL_DATES.dpa, language);

  return (
    <div className="min-h-screen bg-background" data-testid="page-dpa">
      <PublicNavbar />

      <section className="py-responsive">
        <div className="container-responsive">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-responsive-2xl font-bold tracking-tight mb-4" data-testid="heading-dpa">
              {copy.title}
            </h1>

            <p className="text-responsive-base text-muted-foreground mb-8">{copy.introduction}</p>

            {copy.sections.map((section) => (
              <Card key={section.id} className="p-8 mb-8">
                <h2 className="text-2xl font-semibold mb-6">{section.title}</h2>
                <div className="space-y-4 text-[13px]">
                  {section.blocks.map((block, index) => {
                    const key = `${section.id}-${block.type}-${index}`;

                    if (block.type === 'heading') {
                      return (
                        <h3 key={key} className="font-semibold text-base pt-2">
                          {block.text}
                        </h3>
                      );
                    }

                    if (block.type === 'list') {
                      return (
                        <ul key={key} className="list-disc pl-6 space-y-2">
                          {block.items.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      );
                    }

                    if (block.type === 'definition') {
                      return (
                        <p key={key}>
                          <strong>“{block.term}”</strong> {block.text}
                        </p>
                      );
                    }

                    if (block.type === 'subprocessorsLink') {
                      return (
                        <p key={key}>
                          {block.before}{' '}
                          <a href="/subprocessors" className="text-primary hover:underline">
                            {block.link}
                          </a>
                          {block.after}
                        </p>
                      );
                    }

                    return <p key={key}>{block.text}</p>;
                  })}
                </div>
              </Card>
            ))}

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                asChild
                className="flex items-center gap-2 min-h-[44px]"
                data-testid="button-dpa-download"
              >
                <a href={`mailto:legal@e-code.ai?subject=${encodeURIComponent(copy.downloadSubject)}`}>
                  <Download className="h-4 w-4" />
                  {copy.download}
                </a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="flex items-center gap-2 min-h-[44px]"
                data-testid="button-dpa-contact-legal"
              >
                <a href={`mailto:legal@e-code.ai?subject=${encodeURIComponent(copy.contactSubject)}`}>
                  <Mail className="h-4 w-4" />
                  {copy.contact}
                </a>
              </Button>
            </div>

            <div className="mt-8 p-4 bg-muted rounded-lg">
              <p className="text-[13px] text-muted-foreground">
                <strong>{copy.lastUpdated} :</strong> {lastUpdated}
                <br />
                <strong>{copy.effectiveDate} :</strong> {copy.effectiveValue}
                <br />
                {copy.contactPrefix}{' '}
                <a href="mailto:privacy@e-code.ai" className="text-primary hover:underline">
                  {PRIVACY_EMAIL}
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
