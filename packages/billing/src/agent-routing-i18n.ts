import type { AgentRoutingLineKey } from './agent-routing.js';

export type AgentRoutingLocale = 'en' | 'fr';

const labels: Readonly<Record<AgentRoutingLocale, Readonly<Record<AgentRoutingLineKey, string>>>> = {
  en: {
    lite: 'Lite',
    economy: 'Economy',
    power: 'Power',
    'high-effort': 'High effort (escalation)',
    turbo: 'Turbo',
    classifier: 'Harness classifier',
  },
  fr: {
    lite: 'Léger',
    economy: 'Économie',
    power: 'Puissance',
    'high-effort': 'Effort élevé (escalade)',
    turbo: 'Turbo',
    classifier: 'Classificateur du moteur d’agents',
  },
};

const validationCopy = {
  en: {
    baseInput: 'baseUserInCentsPerM must be a non-negative number',
    baseOutput: 'baseUserOutCentsPerM must be a non-negative number',
    missingLine: 'missing routing line "{line}"',
    duplicateLine: 'duplicate routing line "{line}"',
    providerModelRequired: 'provider and model are required',
    inputCost: 'costInCentsPerM must be a non-negative number',
    outputCost: 'costOutCentsPerM must be a non-negative number',
    multiplier: 'multiplier must be a non-negative number',
    unknownLine: 'unknown routing line "{line}"',
    economyInvariant: 'economy is the default mode: it must stay active with multiplier 1',
  },
  fr: {
    baseInput: 'baseUserInCentsPerM doit être un nombre positif ou nul',
    baseOutput: 'baseUserOutCentsPerM doit être un nombre positif ou nul',
    missingLine: 'ligne de routage manquante « {line} »',
    duplicateLine: 'ligne de routage en double « {line} »',
    providerModelRequired: 'provider et model sont requis',
    inputCost: 'costInCentsPerM doit être un nombre positif ou nul',
    outputCost: 'costOutCentsPerM doit être un nombre positif ou nul',
    multiplier: 'multiplier doit être un nombre positif ou nul',
    unknownLine: 'ligne de routage inconnue « {line} »',
    economyInvariant: 'economy est le mode par défaut : il doit rester actif avec un multiplicateur de 1',
  },
} as const;

export type AgentRoutingValidationCopyKey = keyof (typeof validationCopy)['en'];

export function agentRoutingLabel(key: AgentRoutingLineKey, locale: AgentRoutingLocale = 'en'): string {
  return labels[locale]?.[key] ?? labels.en[key];
}

export function agentRoutingValidationMessage(
  key: AgentRoutingValidationCopyKey,
  locale: AgentRoutingLocale = 'en',
  values: Readonly<Record<string, string | number>> = {},
): string {
  return (validationCopy[locale]?.[key] ?? validationCopy.en[key]).replace(
    /\{([A-Za-z][A-Za-z0-9]*)\}/g,
    (_placeholder, name: string) => String(values[name] ?? ''),
  );
}
