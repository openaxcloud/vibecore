import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const appliedFilesToastEn = {
  'appliedFilesToast.title_one': '{count} file applied',
  'appliedFilesToast.title_other': '{count} files applied',
  'appliedFilesToast.description': 'The agent patches were applied successfully.',

  /*
   * Le message honnête quand la génération s'est arrêtée en route. Mesuré en
   * production le 2026-09-08 : deux applications de 24 et 28 fichiers, sans le
   * module que leur `index.html` réclame, annoncées comme réussies.
   */
  'appliedFilesToast.incomplete': 'The generation stopped early — the app cannot start yet.',
  'appliedFilesToast.missingEntry': 'index.html expects {module}, which was never written.',
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
  'appliedFilesToast.incomplete': 'La génération s’est arrêtée en route — l’application ne peut pas encore démarrer.',
  'appliedFilesToast.missingEntry': 'index.html réclame {module}, qui n’a jamais été écrit.',
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
