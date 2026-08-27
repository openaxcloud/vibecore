import { normalizeSupportedLanguage } from '~/lib/i18n/language';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';

export const modelApiEn = {
  'modelApi.catalogUnavailable': 'The AI model catalog is temporarily unavailable. Please try again.',
  'modelApi.providerNotFound': 'The requested AI provider was not found.',
  'modelApi.unknownProvider': 'Unknown provider',
  'modelApi.dynamic': 'Dynamic',
  'modelApi.context': 'context',
  'modelApi.inputPrice': 'in',
  'modelApi.outputPrice': 'out',
  'modelApi.ownedBy': 'by',
  'modelApi.notAvailable': 'N/A',
  'modelApi.bestForCoding': 'Best for Coding',
  'modelApi.fastCoding': 'Fast Coding',
  'modelApi.reasoning': 'Reasoning',
  'modelApi.thinking': 'Thinking',
  'modelApi.codingAndToolUse': 'Coding + Tool Use',
  'modelApi.codingBenchmark': 'Coding: {score}% SWE-bench',
  'modelApi.highCompute': 'High-Compute',
  'modelApi.latest': 'latest',
  'modelApi.downloadOllama': 'Download Ollama',
  'modelApi.getLmStudio': 'Get LMStudio',
} as const;

export type ModelApiCopyKey = keyof typeof modelApiEn;
export type ModelApiCopy = Readonly<Record<ModelApiCopyKey, string>>;
export type ModelApiLanguage = 'en' | 'fr';

export const modelApiFr: ModelApiCopy = {
  'modelApi.catalogUnavailable': 'Le catalogue de modèles d’IA est temporairement indisponible. Veuillez réessayer.',
  'modelApi.providerNotFound': 'Le fournisseur d’IA demandé est introuvable.',
  'modelApi.unknownProvider': 'Fournisseur inconnu',
  'modelApi.dynamic': 'Dynamique',
  'modelApi.context': 'contexte',
  'modelApi.inputPrice': 'entrée',
  'modelApi.outputPrice': 'sortie',
  'modelApi.ownedBy': 'par',
  'modelApi.notAvailable': 'N/D',
  'modelApi.bestForCoding': 'Idéal pour le code',
  'modelApi.fastCoding': 'Code rapide',
  'modelApi.reasoning': 'Raisonnement',
  'modelApi.thinking': 'Réflexion',
  'modelApi.codingAndToolUse': 'Code + utilisation d’outils',
  'modelApi.codingBenchmark': 'Code : {score} % SWE-bench',
  'modelApi.highCompute': 'Calcul intensif',
  'modelApi.latest': 'dernière version',
  'modelApi.downloadOllama': 'Télécharger Ollama',
  'modelApi.getLmStudio': 'Obtenir LM Studio',
};

export function resolveModelApiLanguage(language?: string | null): ModelApiLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function getModelApiCopy(language?: string | null): ModelApiCopy {
  return resolveModelApiLanguage(language) === 'fr' ? modelApiFr : modelApiEn;
}

function formatFrenchDecimal(raw: string): string {
  const value = Number(raw);

  if (!Number.isFinite(value)) {
    return raw;
  }

  const decimals = raw.includes('.') ? Math.min(2, raw.split('.')[1]?.length ?? 0) : 0;

  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatFrenchContextSize(maxTokenAllowed: number): string {
  if (!Number.isFinite(maxTokenAllowed) || maxTokenAllowed <= 0) {
    return modelApiFr['modelApi.notAvailable'];
  }

  if (maxTokenAllowed >= 1_000_000) {
    const value = Math.round((maxTokenAllowed / 1_000_000) * 10) / 10;
    return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value)}\u00A0M`;
  }

  if (maxTokenAllowed >= 1_000) {
    const value = Math.round((maxTokenAllowed / 1_000) * 10) / 10;
    return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value)}\u00A0k`;
  }

  return new Intl.NumberFormat('fr-FR').format(maxTokenAllowed);
}

function replaceFrenchDescriptor(label: string, english: string, french: string): string {
  return label.replace(`(${english})`, `(${french})`);
}

/**
 * Localize only E-Code-owned descriptive framing around a model name. Provider
 * brands, model names/ids, owner ids and benchmark names stay byte-identical.
 */
export function localizeModelLabel(label: string, maxTokenAllowed: number, language?: string | null): string {
  if (resolveModelApiLanguage(language) !== 'fr') {
    return label;
  }

  const copy = modelApiFr;

  let localized = label;

  localized = localized.replace(
    / - in:\$([0-9]+(?:\.[0-9]+)?) out:\$([0-9]+(?:\.[0-9]+)?)/gu,
    (_match, input: string, output: string) =>
      ` — ${copy['modelApi.inputPrice']} : ${formatFrenchDecimal(input)}\u00A0$ · ${copy['modelApi.outputPrice']} : ${formatFrenchDecimal(output)}\u00A0$`,
  );

  localized = localized.replace(/\(Dynamic\)/gu, `(${copy['modelApi.dynamic']})`);

  localized = localized.replace(/\(([0-9]+(?:[.,][0-9]+)?\s*[kM])\s+context\)/gu, () => {
    return `(${copy['modelApi.context']} : ${formatFrenchContextSize(maxTokenAllowed)})`;
  });

  localized = localized.replace(
    / - context (N\/A|[0-9]+(?:[.,][0-9]+)?\s*[kM]?)(?=\s*(?:\[|$))/gu,
    (_match, currentValue: string) => {
      const value =
        currentValue === modelApiEn['modelApi.notAvailable']
          ? copy['modelApi.notAvailable']
          : formatFrenchContextSize(maxTokenAllowed);
      return ` — ${copy['modelApi.context']} : ${value}`;
    },
  );

  localized = localized.replace(
    /\[\s*by\s+([^\]]+)\]/gu,
    (_match, owner: string) => `[${copy['modelApi.ownedBy']} ${owner}]`,
  );

  localized = replaceFrenchDescriptor(localized, modelApiEn['modelApi.bestForCoding'], copy['modelApi.bestForCoding']);
  localized = replaceFrenchDescriptor(localized, modelApiEn['modelApi.fastCoding'], copy['modelApi.fastCoding']);
  localized = replaceFrenchDescriptor(localized, modelApiEn['modelApi.reasoning'], copy['modelApi.reasoning']);
  localized = replaceFrenchDescriptor(localized, modelApiEn['modelApi.thinking'], copy['modelApi.thinking']);
  localized = replaceFrenchDescriptor(
    localized,
    modelApiEn['modelApi.codingAndToolUse'],
    copy['modelApi.codingAndToolUse'],
  );
  localized = replaceFrenchDescriptor(localized, modelApiEn['modelApi.highCompute'], copy['modelApi.highCompute']);
  localized = replaceFrenchDescriptor(localized, modelApiEn['modelApi.latest'], copy['modelApi.latest']);
  localized = localized.replace(/\(Coding: ([0-9]+(?:\.[0-9]+)?)% SWE-bench\)/gu, (_match, score: string) => {
    return `(${copy['modelApi.codingBenchmark'].replace('{score}', formatFrenchDecimal(score))})`;
  });

  return localized;
}

export function localizeModelInfo(model: ModelInfo, language?: string | null): ModelInfo {
  return {
    ...model,
    label: localizeModelLabel(model.label, model.maxTokenAllowed, language),
  };
}

function localizeProviderActionLabel(label: string | undefined, language?: string | null): string | undefined {
  if (!label || resolveModelApiLanguage(language) !== 'fr') {
    return label;
  }

  if (label === modelApiEn['modelApi.downloadOllama']) {
    return modelApiFr['modelApi.downloadOllama'];
  }

  if (label === modelApiEn['modelApi.getLmStudio']) {
    return modelApiFr['modelApi.getLmStudio'];
  }

  return label;
}

export function localizeProviderInfo(provider: ProviderInfo, language?: string | null): ProviderInfo {
  return {
    ...provider,
    staticModels: provider.staticModels.map((model) => localizeModelInfo(model, language)),
    labelForGetApiKey: localizeProviderActionLabel(provider.labelForGetApiKey, language),
  };
}
