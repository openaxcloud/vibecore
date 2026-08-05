import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const computeTierPreviewEn = {
  'computeTierPreview.note':
    'Preview — these controls activate once managed compute is provisioned. Nothing is deployed yet.',
  'computeTierPreview.schedule.label': 'Schedule (cron)',
  'computeTierPreview.schedule.valid': 'Valid schedule (minute hour day month weekday).',
  'computeTierPreview.field.minute': 'minute',
  'computeTierPreview.field.hour': 'hour',
  'computeTierPreview.field.day-of-month': 'day of month',
  'computeTierPreview.field.month': 'month',
  'computeTierPreview.field.day-of-week': 'day of week',
  'computeTierPreview.cron.required': 'Enter a cron expression.',
  'computeTierPreview.cron.fieldCount':
    'Expected {expected} fields (minute hour day month weekday); received {actual}.',
  'computeTierPreview.cron.notNumber': '{field}: “{token}” is not a number.',
  'computeTierPreview.cron.outOfRange': '{field}: {value} is outside the allowed range ({min}–{max}).',
  'computeTierPreview.cron.positiveStep': '{field}: step “{token}” must be a positive integer.',
  'computeTierPreview.cron.malformedStep': '{field}: “{token}” is not a valid step expression.',
  'computeTierPreview.cron.malformedRange': '{field}: “{token}” is not a valid range.',
  'computeTierPreview.cron.rangeOrder': '{field}: range start {start} is greater than end {end}.',
  'computeTierPreview.cron.emptyList': '{field}: the list contains an empty value.',
  'computeTierPreview.preset.every-15-minutes': 'Every 15 minutes',
  'computeTierPreview.preset.hourly': 'Hourly',
  'computeTierPreview.preset.daily-02': 'Daily at 02:00',
  'computeTierPreview.preset.weekly-monday-09': 'Weekly (Mon 09:00)',
  'computeTierPreview.autoscale.min': 'Min instances',
  'computeTierPreview.autoscale.max': 'Max instances',
  'computeTierPreview.autoscale.invalid': 'Max instances must be at least the minimum (and at least 1).',
  'computeTierPreview.machine.label': 'Machine size',
  'computeTierPreview.machine.shared': 'Shared · 0.5 vCPU / 1 GB',
  'computeTierPreview.machine.small': 'Small · 1 vCPU / 2 GB',
  'computeTierPreview.machine.medium': 'Medium · 2 vCPU / 4 GB',
  'computeTierPreview.machine.large': 'Large · 4 vCPU / 8 GB',
  'computeTierPreview.lifecycle.title': 'Lifecycle',
  'computeTierPreview.lifecycle.start': 'Start',
  'computeTierPreview.lifecycle.stop': 'Stop',
  'computeTierPreview.lifecycle.restart': 'Restart',
  'computeTierPreview.lifecycle.unavailable': 'Available once this tier is provisioned',
  'computeTierPreview.history.noRuns': 'No runs yet',
  'computeTierPreview.history.noActivity': 'No activity yet',
  'computeTierPreview.history.runHistory': 'Run history appears here once the tier is active.',
  'computeTierPreview.history.deploymentActivity': 'Deployment activity appears here once the tier is active.',
} as const;

export type ComputeTierPreviewKey = keyof typeof computeTierPreviewEn;
export type ComputeTierPreviewCopy = Readonly<Record<ComputeTierPreviewKey, string>>;

export const computeTierPreviewFr: ComputeTierPreviewCopy = {
  'computeTierPreview.note':
    'Aperçu — ces commandes s’activeront lorsque le calcul managé sera provisionné. Aucun déploiement n’a encore lieu.',
  'computeTierPreview.schedule.label': 'Planification (cron)',
  'computeTierPreview.schedule.valid': 'Planification valide (minute, heure, jour, mois et jour de la semaine).',
  'computeTierPreview.field.minute': 'minute',
  'computeTierPreview.field.hour': 'heure',
  'computeTierPreview.field.day-of-month': 'jour du mois',
  'computeTierPreview.field.month': 'mois',
  'computeTierPreview.field.day-of-week': 'jour de la semaine',
  'computeTierPreview.cron.required': 'Saisissez une expression cron.',
  'computeTierPreview.cron.fieldCount':
    '{expected} champs sont attendus (minute, heure, jour, mois et jour de la semaine) ; {actual} reçus.',
  'computeTierPreview.cron.notNumber': '{field} : « {token} » n’est pas un nombre.',
  'computeTierPreview.cron.outOfRange': '{field} : {value} est hors de la plage autorisée ({min}–{max}).',
  'computeTierPreview.cron.positiveStep': '{field} : le pas « {token} » doit être un entier positif.',
  'computeTierPreview.cron.malformedStep': '{field} : « {token} » n’est pas une expression de pas valide.',
  'computeTierPreview.cron.malformedRange': '{field} : « {token} » n’est pas une plage valide.',
  'computeTierPreview.cron.rangeOrder': '{field} : le début {start} de la plage est supérieur à sa fin {end}.',
  'computeTierPreview.cron.emptyList': '{field} : la liste contient une valeur vide.',
  'computeTierPreview.preset.every-15-minutes': 'Toutes les 15 minutes',
  'computeTierPreview.preset.hourly': 'Toutes les heures',
  'computeTierPreview.preset.daily-02': 'Tous les jours à 02:00',
  'computeTierPreview.preset.weekly-monday-09': 'Chaque lundi à 09:00',
  'computeTierPreview.autoscale.min': 'Instances min.',
  'computeTierPreview.autoscale.max': 'Instances max.',
  'computeTierPreview.autoscale.invalid':
    'Le nombre maximal d’instances doit être supérieur ou égal au minimum, et au moins égal à 1.',
  'computeTierPreview.machine.label': 'Taille de la machine',
  'computeTierPreview.machine.shared': 'Partagée · 0,5 vCPU / 1 Go',
  'computeTierPreview.machine.small': 'Petite · 1 vCPU / 2 Go',
  'computeTierPreview.machine.medium': 'Moyenne · 2 vCPU / 4 Go',
  'computeTierPreview.machine.large': 'Grande · 4 vCPU / 8 Go',
  'computeTierPreview.lifecycle.title': 'Cycle de vie',
  'computeTierPreview.lifecycle.start': 'Démarrer',
  'computeTierPreview.lifecycle.stop': 'Arrêter',
  'computeTierPreview.lifecycle.restart': 'Redémarrer',
  'computeTierPreview.lifecycle.unavailable': 'Disponible après le provisionnement de cette offre',
  'computeTierPreview.history.noRuns': 'Aucune exécution pour le moment',
  'computeTierPreview.history.noActivity': 'Aucune activité pour le moment',
  'computeTierPreview.history.runHistory': 'L’historique des exécutions apparaîtra ici lorsque l’offre sera active.',
  'computeTierPreview.history.deploymentActivity':
    'L’activité des déploiements apparaîtra ici lorsque l’offre sera active.',
};

export function resolveComputeTierPreviewLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function getComputeTierPreviewCopy(language?: string | null): ComputeTierPreviewCopy {
  return resolveComputeTierPreviewLanguage(language) === 'fr' ? computeTierPreviewFr : computeTierPreviewEn;
}

export function formatComputeTierPreviewCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatComputeTierPreviewNumber(value: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveComputeTierPreviewLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(value);
}
