import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const monitoringChartsEn = {
  'monitoringCharts.aiCostUsd': 'AI cost (USD)',
  'monitoringCharts.tokens': 'Tokens',
  'monitoringCharts.tokenCount_one': '{count} token',
  'monitoringCharts.tokenCount_other': '{count} tokens',
  'monitoringCharts.observations': 'Observations',
  'monitoringCharts.observationCount_one': '{count} observation',
  'monitoringCharts.observationCount_other': '{count} observations',
  'monitoringCharts.bucketUpperBound': 'Bucket upper bound (seconds)',
} as const;

export type MonitoringChartsKey = keyof typeof monitoringChartsEn;
export type MonitoringChartsCopy = Readonly<Record<MonitoringChartsKey, string>>;

export const monitoringChartsFr: MonitoringChartsCopy = {
  'monitoringCharts.aiCostUsd': 'Coût de l’IA (USD)',
  'monitoringCharts.tokens': 'Jetons',
  'monitoringCharts.tokenCount_one': '{count} jeton',
  'monitoringCharts.tokenCount_other': '{count} jetons',
  'monitoringCharts.observations': 'Observations',
  'monitoringCharts.observationCount_one': '{count} observation',
  'monitoringCharts.observationCount_other': '{count} observations',
  'monitoringCharts.bucketUpperBound': 'Borne supérieure de l’intervalle (secondes)',
};

export function getMonitoringChartsCopy(language?: string | null): MonitoringChartsCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? monitoringChartsFr : monitoringChartsEn;
}

function monitoringLocale(language?: string | null): string {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
}

export function formatMonitoringNumber(value: number, language?: string | null): string {
  return new Intl.NumberFormat(monitoringLocale(language)).format(value);
}

export function formatMonitoringCurrency(value: number, language?: string | null): string {
  return new Intl.NumberFormat(monitoringLocale(language), {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatMonitoringPlural(
  value: number,
  language: string | null | undefined,
  forms: Readonly<{ one: string; other: string }>,
): string {
  const locale = monitoringLocale(language);
  const template = new Intl.PluralRules(locale).select(value) === 'one' ? forms.one : forms.other;

  return template.replace('{count}', formatMonitoringNumber(value, language));
}
