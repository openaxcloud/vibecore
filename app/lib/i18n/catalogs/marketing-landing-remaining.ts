import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const marketingLandingRemainingEn = {
  'marketingLanding.cta.title': 'Ready to build something amazing?',
  'marketingLanding.cta.description': 'Join more than 2 million developers shipping production apps faster.',
  'marketingLanding.cta.start': 'Start building for free',
  'marketingLanding.cta.plans': 'View enterprise plans',
  'marketingLanding.stats.activeDevelopers': 'Active developers',
  'marketingLanding.stats.appsDeployed': 'Apps deployed',
  'marketingLanding.stats.linesOfCode': 'Lines of code',
  'marketingLanding.stats.uptimeSla': 'Uptime SLA',
  'marketingLanding.languages.title': 'Every language, every framework',
  'marketingLanding.languages.description':
    'Build with your favorite tools—we support more than 29 languages and all major frameworks.',
  'marketingLanding.testimonials.title': 'Trusted by industry leaders',
  'marketingLanding.testimonials.description': 'See what engineering leaders say about the E-Code platform.',
  'marketingLanding.testimonials.rating': '5 out of 5 stars',
  'marketingLanding.testimonials.first.quote':
    'E-Code reduced our development time by 85% and saved us $2 million annually in engineering costs.',
  'marketingLanding.testimonials.first.role': 'CTO, Fortune 500 technology company',
  'marketingLanding.testimonials.second.quote':
    'The AI agent built our entire customer portal in three days. Work that used to take months now takes hours.',
  'marketingLanding.testimonials.second.role': 'VP of Engineering, Series C startup',
  'marketingLanding.testimonials.third.quote':
    'This is the best development platform we have used. Our team productivity increased by 400% in the first month.',
  'marketingLanding.testimonials.third.role': 'Director of Engineering, enterprise SaaS',
} as const;

export type MarketingLandingRemainingKey = keyof typeof marketingLandingRemainingEn;
export type MarketingLandingRemainingCopy = Readonly<Record<MarketingLandingRemainingKey, string>>;

export const marketingLandingRemainingFr: MarketingLandingRemainingCopy = {
  'marketingLanding.cta.title': 'Prêt à créer quelque chose d’exceptionnel ?',
  'marketingLanding.cta.description':
    'Rejoignez plus de 2 millions de développeurs qui livrent plus rapidement des applications en production.',
  'marketingLanding.cta.start': 'Commencer à créer gratuitement',
  'marketingLanding.cta.plans': 'Voir les offres Entreprise',
  'marketingLanding.stats.activeDevelopers': 'Développeurs actifs',
  'marketingLanding.stats.appsDeployed': 'Applications déployées',
  'marketingLanding.stats.linesOfCode': 'Lignes de code',
  'marketingLanding.stats.uptimeSla': 'SLA de disponibilité',
  'marketingLanding.languages.title': 'Tous les langages, tous les frameworks',
  'marketingLanding.languages.description':
    'Créez avec vos outils préférés : nous prenons en charge plus de 29 langages et tous les principaux frameworks.',
  'marketingLanding.testimonials.title': 'La confiance des leaders du secteur',
  'marketingLanding.testimonials.description':
    'Découvrez ce que les responsables de l’ingénierie disent de la plateforme E-Code.',
  'marketingLanding.testimonials.rating': '5 étoiles sur 5',
  'marketingLanding.testimonials.first.quote':
    'E-Code a réduit notre temps de développement de 85 % et nous fait économiser 2 millions de dollars par an en coûts d’ingénierie.',
  'marketingLanding.testimonials.first.role': 'CTO, entreprise technologique du Fortune 500',
  'marketingLanding.testimonials.second.quote':
    'L’agent IA a créé l’intégralité de notre portail client en trois jours. Ce qui prenait des mois ne demande désormais que quelques heures.',
  'marketingLanding.testimonials.second.role': 'Vice-président de l’ingénierie, startup de série C',
  'marketingLanding.testimonials.third.quote':
    'C’est la meilleure plateforme de développement que nous ayons utilisée. La productivité de notre équipe a augmenté de 400 % dès le premier mois.',
  'marketingLanding.testimonials.third.role': 'Directrice de l’ingénierie, SaaS d’entreprise',
};

export function getMarketingLandingRemainingCopy(language?: string | null): MarketingLandingRemainingCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? marketingLandingRemainingFr : marketingLandingRemainingEn;
}
