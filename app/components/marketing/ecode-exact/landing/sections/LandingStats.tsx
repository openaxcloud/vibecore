import { Users, Rocket, FileCode2, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getMarketingLandingRemainingCopy,
  type MarketingLandingRemainingKey,
} from '~/lib/i18n/catalogs/marketing-landing-remaining';

const stats: Array<{ labelKey: MarketingLandingRemainingKey; value: string; icon: ReactNode }> = [
  {
    labelKey: 'marketingLanding.stats.activeDevelopers',
    value: '2M+',
    icon: <Users className="h-5 w-5" aria-hidden />,
  },
  {
    labelKey: 'marketingLanding.stats.appsDeployed',
    value: '10M+',
    icon: <Rocket className="h-5 w-5" aria-hidden />,
  },
  {
    labelKey: 'marketingLanding.stats.linesOfCode',
    value: '5B+',
    icon: <FileCode2 className="h-5 w-5" aria-hidden />,
  },
  {
    labelKey: 'marketingLanding.stats.uptimeSla',
    value: '99.99%',
    icon: <TrendingUp className="h-5 w-5" aria-hidden />,
  },
];

export default function LandingStats() {
  const { i18n } = useTranslation();
  const copy = getMarketingLandingRemainingCopy(i18n.resolvedLanguage ?? i18n.language);

  return (
    <section
      className="py-20 bg-gradient-to-b from-[var(--ecode-background)] to-[var(--ecode-surface-tertiary)]"
      data-testid="section-stats"
    >
      <div className="container-responsive max-w-7xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="text-center group animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
              data-testid={`container-stat-${index}`}
            >
              <div
                className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-ecode-accent/10 mb-3 transition-all duration-300 group-hover:bg-ecode-accent/20 group-hover:scale-110"
                data-testid={`icon-stat-${index}`}
              >
                <div className="text-ecode-accent-text">{stat.icon}</div>
              </div>
              <div
                className="text-4xl font-bold bg-gradient-to-r from-ecode-orange via-ecode-orange-light to-ecode-yellow bg-clip-text text-transparent"
                data-testid={`text-stat-value-${index}`}
              >
                {stat.value}
              </div>
              <div
                className="mt-1 break-words text-[13px] leading-relaxed text-[var(--ecode-text-muted)]"
                data-testid={`text-stat-label-${index}`}
              >
                {copy[stat.labelKey]}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
