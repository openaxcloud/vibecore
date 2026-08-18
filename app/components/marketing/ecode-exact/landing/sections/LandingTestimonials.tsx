import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  getMarketingLandingRemainingCopy,
  type MarketingLandingRemainingKey,
} from '~/lib/i18n/catalogs/marketing-landing-remaining';

const testimonials: Array<{
  quoteKey: MarketingLandingRemainingKey;
  author: string;
  roleKey: MarketingLandingRemainingKey;
  company: string;
  avatar: string;
}> = [
  {
    quoteKey: 'marketingLanding.testimonials.first.quote',
    author: 'Sarah Chen',
    roleKey: 'marketingLanding.testimonials.first.role',
    company: 'TechCorp Global',
    avatar: 'SC',
  },
  {
    quoteKey: 'marketingLanding.testimonials.second.quote',
    author: 'Michael Rodriguez',
    roleKey: 'marketingLanding.testimonials.second.role',
    company: 'InnovateTech',
    avatar: 'MR',
  },
  {
    quoteKey: 'marketingLanding.testimonials.third.quote',
    author: 'Emily Watson',
    roleKey: 'marketingLanding.testimonials.third.role',
    company: 'CloudScale Solutions',
    avatar: 'EW',
  },
];

export default function LandingTestimonials() {
  const { i18n } = useTranslation();
  const copy = getMarketingLandingRemainingCopy(i18n.resolvedLanguage ?? i18n.language);

  return (
    <section className="py-20 bg-[var(--ecode-surface)]" data-testid="section-testimonials">
      <div className="container-responsive max-w-7xl">
        <div className="text-center mb-12 animate-fade-in">
          <h2 className="mb-4 break-words text-4xl font-bold text-[var(--ecode-text)] sm:text-5xl">
            {copy['marketingLanding.testimonials.title']}
          </h2>
          <p className="mx-auto max-w-3xl break-words text-xl leading-relaxed text-[var(--ecode-text-muted)]">
            {copy['marketingLanding.testimonials.description']}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <Card
              key={index}
              className="min-w-0 bg-[var(--ecode-surface)] border-[var(--ecode-border)] animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <CardContent className="p-6">
                <div className="mb-4 flex gap-1" aria-label={copy['marketingLanding.testimonials.rating']} role="img">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="h-5 w-5 fill-ecode-accent text-ecode-accent-text" aria-hidden />
                  ))}
                </div>
                <blockquote className="mb-6 break-words text-[15px] italic leading-relaxed text-[var(--ecode-text)]">
                  {copy[testimonial.quoteKey]}
                </blockquote>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-ecode-accent to-ecode-secondary-accent flex items-center justify-center text-white font-bold">
                    {testimonial.avatar}
                  </div>
                  <div className="min-w-0">
                    <div className="break-words font-semibold text-[var(--ecode-text)]">{testimonial.author}</div>
                    <div className="break-words text-[13px] text-[var(--ecode-text-muted)]">
                      {copy[testimonial.roleKey]}
                    </div>
                    <div className="break-words text-[11px] text-[var(--ecode-text-muted)]">{testimonial.company}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
