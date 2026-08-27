import { Sparkles, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, useWouterLocation } from '~/components/marketing/ecode-exact/EcodeExactUi';
import { getMarketingLandingRemainingCopy } from '~/lib/i18n/catalogs/marketing-landing-remaining';

export default function LandingCta() {
  const [, navigate] = useWouterLocation();
  const { i18n } = useTranslation();
  const copy = getMarketingLandingRemainingCopy(i18n.resolvedLanguage ?? i18n.language);

  return (
    <section
      className="py-20 bg-gradient-to-r from-ecode-accent via-ecode-orange-light to-ecode-yellow"
      data-testid="section-cta"
    >
      <div className="container-responsive max-w-4xl text-center">
        <h2 className="mb-6 break-words text-4xl font-bold text-white animate-fade-in sm:text-5xl">
          {copy['marketingLanding.cta.title']}
        </h2>
        <p
          className="mb-8 break-words text-xl leading-relaxed text-white/90 animate-fade-in"
          style={{ animationDelay: '100ms' }}
        >
          {copy['marketingLanding.cta.description']}
        </p>
        <div
          className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in"
          style={{ animationDelay: '200ms' }}
        >
          <Button
            size="lg"
            className="!h-auto min-h-[44px] max-w-full gap-2 !whitespace-normal break-words bg-white px-8 py-3 text-center text-[15px] font-semibold leading-tight text-ecode-accent hover:bg-white/90"
            onClick={() => navigate('/register')}
            data-testid="button-cta-register"
          >
            <Sparkles className="h-5 w-5 shrink-0" aria-hidden />
            {copy['marketingLanding.cta.start']}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="!h-auto min-h-[44px] max-w-full gap-2 !whitespace-normal break-words border-2 border-gray-900 bg-white/20 px-8 py-3 text-center text-[15px] font-semibold leading-tight text-gray-900 hover:bg-white/40"
            onClick={() => navigate('/pricing')}
            data-testid="button-cta-pricing"
          >
            {copy['marketingLanding.cta.plans']}
            <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
          </Button>
        </div>
      </div>
    </section>
  );
}
