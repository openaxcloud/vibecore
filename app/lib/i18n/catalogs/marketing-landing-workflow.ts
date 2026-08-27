import { resolveMarketingLanguage } from './marketing';

export const marketingLandingWorkflowEn = {
  'marketingLandingWorkflow.title': 'How it works',
  'marketingLandingWorkflow.subtitle.one': 'Go from idea to production in {count} simple step.',
  'marketingLandingWorkflow.subtitle.other': 'Go from idea to production in {count} simple steps.',
  'marketingLandingWorkflow.step.position': 'Step {position} of {total}',
  'marketingLandingWorkflow.step.describe.title': 'Describe your app',
  'marketingLandingWorkflow.step.describe.description': 'Tell our AI what you want to build using plain language.',
  'marketingLandingWorkflow.step.generate.title': 'AI generates the code',
  'marketingLandingWorkflow.step.generate.description': 'Watch production-ready code take shape in real time.',
  'marketingLandingWorkflow.step.deploy.title': 'Deploy instantly',
  'marketingLandingWorkflow.step.deploy.description': 'Deploy in one click to a global edge network.',
  'marketingLandingWorkflow.step.scale.title': 'Scale automatically',
  'marketingLandingWorkflow.step.scale.description': 'Auto-scaling infrastructure adapts to every level of traffic.',
} as const;

export type MarketingLandingWorkflowKey = keyof typeof marketingLandingWorkflowEn;
export type MarketingLandingWorkflowCopy = Readonly<Record<MarketingLandingWorkflowKey, string>>;

export const marketingLandingWorkflowFr: MarketingLandingWorkflowCopy = {
  'marketingLandingWorkflow.title': 'Comment cela fonctionne',
  'marketingLandingWorkflow.subtitle.one': 'Passez de l’idée à la production en {count} étape simple.',
  'marketingLandingWorkflow.subtitle.other': 'Passez de l’idée à la production en {count} étapes simples.',
  'marketingLandingWorkflow.step.position': 'Étape {position} sur {total}',
  'marketingLandingWorkflow.step.describe.title': 'Décrivez votre application',
  'marketingLandingWorkflow.step.describe.description':
    'Expliquez à notre IA, en langage naturel, ce que vous souhaitez créer.',
  'marketingLandingWorkflow.step.generate.title': 'L’IA génère le code',
  'marketingLandingWorkflow.step.generate.description':
    'Observez la création en temps réel d’un code prêt pour la production.',
  'marketingLandingWorkflow.step.deploy.title': 'Déployez instantanément',
  'marketingLandingWorkflow.step.deploy.description': 'Déployez en un clic sur un réseau edge mondial.',
  'marketingLandingWorkflow.step.scale.title': 'Adaptez automatiquement la capacité',
  'marketingLandingWorkflow.step.scale.description':
    'L’infrastructure ajuste automatiquement sa capacité à tous les niveaux de trafic.',
};

type MarketingLandingWorkflowInterpolationValue = string | number | bigint;

export function getMarketingLandingWorkflowCopy(language?: string | null): MarketingLandingWorkflowCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingLandingWorkflowFr : marketingLandingWorkflowEn;
}

export function interpolateMarketingLandingWorkflowCopy(
  template: string,
  values: Readonly<Record<string, MarketingLandingWorkflowInterpolationValue>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatMarketingLandingWorkflowNumber(value: number | bigint, language?: string | null): string {
  return new Intl.NumberFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(value);
}

export function formatMarketingLandingWorkflowSubtitle(count: number, language?: string | null): string {
  const copy = getMarketingLandingWorkflowCopy(language);

  const template =
    count === 1 ? copy['marketingLandingWorkflow.subtitle.one'] : copy['marketingLandingWorkflow.subtitle.other'];

  return interpolateMarketingLandingWorkflowCopy(template, {
    count: formatMarketingLandingWorkflowNumber(count, language),
  });
}

export function formatMarketingLandingWorkflowStepPosition(
  position: number,
  total: number,
  language?: string | null,
): string {
  const copy = getMarketingLandingWorkflowCopy(language);

  return interpolateMarketingLandingWorkflowCopy(copy['marketingLandingWorkflow.step.position'], {
    position: formatMarketingLandingWorkflowNumber(position, language),
    total: formatMarketingLandingWorkflowNumber(total, language),
  });
}
