import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const appliedFilesToastEn = {
  'appliedFilesToast.title_one': '{count} file applied',
  'appliedFilesToast.title_other': '{count} files applied',
  'appliedFilesToast.description': 'The agent patches were applied successfully.',
  'appliedFilesToast.details': 'View details',
  'appliedFilesToast.remaining_one': '{count} more file',
  'appliedFilesToast.remaining_other': '{count} more files',
  'appliedFilesToast.undoAll': 'Undo all',
  'appliedFilesToast.dismissAll': 'Dismiss all',
} as const;

export type AppliedFilesToastKey = keyof typeof appliedFilesToastEn;
export type AppliedFilesToastCopy = Readonly<Record<AppliedFilesToastKey, string>>;

export const appliedFilesToastFr: AppliedFilesToastCopy = {
  'appliedFilesToast.title_one': '{count} fichier appliqué',
  'appliedFilesToast.title_other': '{count} fichiers appliqués',
  'appliedFilesToast.description': 'Les patchs de l’agent ont bien été appliqués.',
  'appliedFilesToast.details': 'Afficher les détails',
  'appliedFilesToast.remaining_one': '{count} fichier supplémentaire',
  'appliedFilesToast.remaining_other': '{count} fichiers supplémentaires',
  'appliedFilesToast.undoAll': 'Tout annuler',
  'appliedFilesToast.dismissAll': 'Tout fermer',
};

export function getAppliedFilesToastCopy(language?: string | null): AppliedFilesToastCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? appliedFilesToastFr : appliedFilesToastEn;
}

export function formatAppliedFilesToastCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatAppliedFilesToastPlural(
  language: string | null | undefined,
  count: number,
  templates: Readonly<{ one: string; other: string }>,
): string {
  const locale = normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? templates.one : templates.other;

  return formatAppliedFilesToastCopy(template, {
    count: new Intl.NumberFormat(locale).format(count),
  });
}
