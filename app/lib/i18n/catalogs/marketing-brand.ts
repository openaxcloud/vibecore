import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const marketingBrandEn = {
  'marketingBrand.tagline': 'Build software fast with AI',
  'marketingBrand.description':
    'Code with AI. Deploy instantly. Share with the world. Build and ship software 10x faster.',
} as const;

export type MarketingBrandKey = keyof typeof marketingBrandEn;
export type MarketingBrandCopy = Readonly<Record<MarketingBrandKey, string>>;

export const marketingBrandFr: MarketingBrandCopy = {
  'marketingBrand.tagline': 'Créez rapidement des logiciels avec l’IA',
  'marketingBrand.description':
    'Codez avec l’IA. Déployez instantanément. Partagez avec le monde entier. Créez et publiez vos logiciels dix fois plus vite.',
};

export function getMarketingBrandCopy(language?: string | null): MarketingBrandCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? marketingBrandFr : marketingBrandEn;
}
