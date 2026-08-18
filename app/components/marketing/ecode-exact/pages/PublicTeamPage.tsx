import { CheckCircle2, GitBranch, Globe, MessageSquare, Shield, Users, Zap } from 'lucide-react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EcodeExactPublicFooter as PublicFooter,
  EcodeExactPublicNavbar as PublicNavbar,
} from '~/components/marketing/ecode-exact/EcodeExactShell';
import { Button, Link } from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  getMarketingExactAgreementTeamCopy,
  type TeamFeatureId,
  type TeamTestimonialId,
} from '~/lib/i18n/catalogs/marketing-exact-agreement-team';

const TEAM_FEATURE_MEDIA: Record<TeamFeatureId, { icon: ComponentType<{ className?: string }>; className: string }> = {
  multiplayer: { icon: Users, className: 'text-[var(--ecode-accent-text)]' },
  versionControl: { icon: GitBranch, className: 'text-[var(--ecode-accent-text)]' },
  communication: { icon: MessageSquare, className: 'text-green-600' },
  security: { icon: Shield, className: 'text-red-600' },
  environments: { icon: Zap, className: 'text-yellow-600' },
  performance: { icon: Globe, className: 'text-[var(--ecode-accent-text)]' },
};

const TEAM_TESTIMONIAL_AUTHORS: Record<TeamTestimonialId, { person: string; company: string }> = {
  sarah: { person: 'Sarah Chen', company: 'TechStart' },
  marcus: { person: 'Marcus Johnson', company: 'CloudScale' },
  emily: { person: 'Dr. Emily Rodriguez', company: 'Tech University' },
};

export default function PublicTeamPage() {
  const { i18n } = useTranslation();
  const copy = getMarketingExactAgreementTeamCopy(i18n.resolvedLanguage ?? i18n.language).exactTeam;

  const features = copy.features.items.map((feature) => ({ ...feature, ...TEAM_FEATURE_MEDIA[feature.id] }));

  const testimonials = copy.testimonials.items.map((testimonial) => ({
    ...testimonial,
    ...TEAM_TESTIMONIAL_AUTHORS[testimonial.id],
  }));

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar />

      <section className="relative py-20 px-4 bg-gradient-to-b from-[#F26207]/5 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="mkt-h1 mb-6 bg-gradient-to-r from-[#F26207] to-[#F99D25] text-transparent bg-clip-text">
            {copy.hero.title}
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
            {copy.hero.description}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="w-full sm:w-auto">
              <Button size="lg" className="text-[15px] px-8 w-full sm:w-auto min-h-[44px]">
                {copy.hero.primary}
              </Button>
            </Link>
            <Link href="/contact-sales" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="text-[15px] px-8 w-full sm:w-auto min-h-[44px]">
                {copy.hero.secondary}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12">{copy.features.title}</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => {
              const Icon = feature.icon;

              return (
                <div key={feature.id} className="p-6 rounded-lg border bg-card">
                  <Icon className={`w-12 h-12 mb-4 ${feature.className}`} aria-hidden />
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12">{copy.useCases.title}</h2>
          <div className="grid md:grid-cols-2 gap-12">
            {copy.useCases.items.map((useCase) => (
              <div key={useCase.id}>
                <h3 className="text-2xl font-semibold mb-4">{useCase.title}</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">{useCase.description}</p>
                <ul className="space-y-2">
                  {useCase.points.map((point) => (
                    <li key={point} className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" aria-hidden />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12">{copy.testimonials.title}</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial) => (
              <figure key={testimonial.id} className="p-6 rounded-lg border bg-card">
                <blockquote className="text-gray-600 dark:text-gray-400 mb-4 italic">“{testimonial.quote}”</blockquote>
                <figcaption className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-full bg-gradient-to-r from-[#F26207] to-[#F99D25]" aria-hidden />
                  <span>
                    <span className="block font-semibold">{testimonial.person}</span>
                    <span className="block text-[13px] text-gray-500">
                      {testimonial.role}, {testimonial.company}
                    </span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 bg-gradient-to-r from-[#F26207] to-[#F99D25] text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">{copy.cta.title}</h2>
          <p className="text-xl mb-8 opacity-90">{copy.cta.description}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="w-full sm:w-auto">
              <Button size="lg" variant="secondary" className="text-[15px] px-8 w-full sm:w-auto min-h-[44px]">
                {copy.cta.primary}
              </Button>
            </Link>
            <Link href="/pricing" className="w-full sm:w-auto">
              <Button
                size="lg"
                variant="outline"
                className="text-[15px] px-8 w-full sm:w-auto min-h-[44px] bg-transparent text-white border-white hover:bg-white hover:text-[var(--ecode-accent-text)]"
              >
                {copy.cta.secondary}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
