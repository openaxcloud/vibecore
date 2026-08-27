import { resolveMarketingLanguage } from './marketing';

export const starterTemplatesEn = {
  'starterTemplates.expo.label': 'Expo App',
  'starterTemplates.expo.description': 'Expo starter template for building cross-platform mobile apps',
  'starterTemplates.astro.label': 'Astro Basic',
  'starterTemplates.astro.description': 'Lightweight Astro starter template for building fast static websites',
  'starterTemplates.nextShadcn.label': 'Next.js with shadcn/ui',
  'starterTemplates.nextShadcn.description':
    'Next.js starter fullstack template integrated with shadcn/ui components and styling system',
  'starterTemplates.viteShadcn.label': 'Vite with shadcn/ui',
  'starterTemplates.viteShadcn.description':
    'Vite starter fullstack template integrated with shadcn/ui components and styling system',
  'starterTemplates.qwik.label': 'Qwik TypeScript',
  'starterTemplates.qwik.description': 'Qwik framework starter with TypeScript for building resumable applications',
  'starterTemplates.remix.label': 'Remix TypeScript',
  'starterTemplates.remix.description': 'Remix framework starter with TypeScript for full-stack web applications',
  'starterTemplates.slidev.label': 'Slidev Presentation',
  'starterTemplates.slidev.description':
    'Slidev starter template for creating developer-friendly presentations using Markdown',
  'starterTemplates.svelteKit.label': 'SvelteKit',
  'starterTemplates.svelteKit.description': 'SvelteKit starter template for building fast, efficient web applications',
  'starterTemplates.vanillaVite.label': 'Vanilla + Vite',
  'starterTemplates.vanillaVite.description': 'Minimal Vite starter template for vanilla JavaScript projects',
  'starterTemplates.reactVite.label': 'React + Vite + typescript',
  'starterTemplates.reactVite.description': 'React starter template powered by Vite for fast development experience',
  'starterTemplates.viteTypescript.label': 'Vite + TypeScript',
  'starterTemplates.viteTypescript.description':
    'Vite starter template with TypeScript configuration for type-safe development',
  'starterTemplates.vue.label': 'Vue.js',
  'starterTemplates.vue.description': 'Vue.js starter template with modern tooling and best practices',
  'starterTemplates.angular.label': 'Angular Starter',
  'starterTemplates.angular.description':
    'A modern Angular starter template with TypeScript support and best practices configuration',
  'starterTemplates.solid.label': 'SolidJS Tailwind',
  'starterTemplates.solid.description': 'Lightweight SolidJS starter template for building fast static websites',
  'starterTemplates.startAria': 'Start a {template} app',
  'starterTemplates.intro': 'or start a blank app with your favorite stack',
  'starterTemplates.discardTitle': 'Discard your prompt?',
  'starterTemplates.discardDescription':
    'You have an unsent prompt in the composer. Starting a template will leave this page and discard it.',
  'starterTemplates.discardConfirm': 'Discard & continue',
  'starterTemplates.discardCancel': 'Keep editing',
} as const;

export type StarterTemplatesKey = keyof typeof starterTemplatesEn;
export type StarterTemplatesCopy = Readonly<Record<StarterTemplatesKey, string>>;

export const starterTemplatesFr: StarterTemplatesCopy = {
  'starterTemplates.expo.label': 'Application Expo',
  'starterTemplates.expo.description': 'Modèle de démarrage Expo pour créer des applications mobiles multiplateformes',
  'starterTemplates.astro.label': 'Astro de base',
  'starterTemplates.astro.description': 'Modèle Astro léger pour créer des sites statiques rapides',
  'starterTemplates.nextShadcn.label': 'Next.js avec shadcn/ui',
  'starterTemplates.nextShadcn.description':
    'Modèle d’application complète Next.js intégrant les composants shadcn/ui et leur système de styles',
  'starterTemplates.viteShadcn.label': 'Vite avec shadcn/ui',
  'starterTemplates.viteShadcn.description':
    'Modèle d’application complète Vite intégrant les composants shadcn/ui et leur système de styles',
  'starterTemplates.qwik.label': 'Qwik TypeScript',
  'starterTemplates.qwik.description': 'Modèle Qwik avec TypeScript pour créer des applications reprenables rapidement',
  'starterTemplates.remix.label': 'Remix TypeScript',
  'starterTemplates.remix.description': 'Modèle Remix avec TypeScript pour créer des applications web complètes',
  'starterTemplates.slidev.label': 'Présentation Slidev',
  'starterTemplates.slidev.description':
    'Modèle Slidev pour créer en Markdown des présentations adaptées aux équipes techniques',
  'starterTemplates.svelteKit.label': 'SvelteKit',
  'starterTemplates.svelteKit.description': 'Modèle SvelteKit pour créer des applications web rapides et efficaces',
  'starterTemplates.vanillaVite.label': 'Vanilla + Vite',
  'starterTemplates.vanillaVite.description': 'Modèle Vite minimal pour les projets JavaScript sans framework',
  'starterTemplates.reactVite.label': 'React + Vite + TypeScript',
  'starterTemplates.reactVite.description':
    'Modèle React propulsé par Vite pour une expérience de développement rapide',
  'starterTemplates.viteTypescript.label': 'Vite + TypeScript',
  'starterTemplates.viteTypescript.description':
    'Modèle Vite avec une configuration TypeScript pour un développement fortement typé',
  'starterTemplates.vue.label': 'Vue.js',
  'starterTemplates.vue.description': 'Modèle Vue.js avec des outils modernes et les bonnes pratiques',
  'starterTemplates.angular.label': 'Kit de démarrage Angular',
  'starterTemplates.angular.description':
    'Modèle Angular moderne avec TypeScript et une configuration conforme aux bonnes pratiques',
  'starterTemplates.solid.label': 'SolidJS Tailwind',
  'starterTemplates.solid.description': 'Modèle SolidJS léger pour créer des sites statiques rapides',
  'starterTemplates.startAria': 'Démarrer une application {template}',
  'starterTemplates.intro': 'ou démarrez une application vierge avec votre stack préférée',
  'starterTemplates.discardTitle': 'Abandonner votre prompt ?',
  'starterTemplates.discardDescription':
    'Un prompt non envoyé est présent dans l’éditeur. Le démarrage d’un modèle quittera cette page et supprimera ce prompt.',
  'starterTemplates.discardConfirm': 'Abandonner et continuer',
  'starterTemplates.discardCancel': 'Continuer la modification',
};

export function getStarterTemplatesCopy(language?: string | null): StarterTemplatesCopy {
  return resolveMarketingLanguage(language) === 'fr' ? starterTemplatesFr : starterTemplatesEn;
}

export function formatStarterTemplatesCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
