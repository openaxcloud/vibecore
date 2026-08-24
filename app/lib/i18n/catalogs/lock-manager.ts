import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const lockManagerEn = {
  'lockManager.panel.title': 'Locks',
  'lockManager.search.placeholder': 'Search…',
  'lockManager.search.ariaLabel': 'Search locked items',
  'lockManager.filter.ariaLabel': 'Filter locked items by type',
  'lockManager.filter.all': 'All',
  'lockManager.filter.files': 'Files',
  'lockManager.filter.folders': 'Folders',
  'lockManager.selectAll.ariaLabel': 'Select all items',
  'lockManager.selectAll.label': 'All',
  'lockManager.unlockSelected': 'Unlock all',
  'lockManager.unlockSelected.title': 'Unlock all selected items',
  'lockManager.empty': 'No locked items found',
  'lockManager.unlockItem.ariaLabel': 'Unlock {path}',
  'lockManager.unlockItem.title': 'Unlock',
  'lockManager.toast.noneSelected': 'Select at least one item to unlock.',
  'lockManager.toast.selected_one': 'Unlocked {count} selected item.',
  'lockManager.toast.selected_other': 'Unlocked {count} selected items.',
  'lockManager.toast.item': '{path} unlocked',
  'lockManager.count.items_one': '{count} item',
  'lockManager.count.items_other': '{count} items',
  'lockManager.count.selected_one': '{count} selected',
  'lockManager.count.selected_other': '{count} selected',
  'lockManager.footer': '{items} • {selected}',
} as const;

export type LockManagerKey = keyof typeof lockManagerEn;
export type LockManagerCopy = Readonly<Record<LockManagerKey, string>>;

export const lockManagerFr: LockManagerCopy = {
  'lockManager.panel.title': 'Verrous',
  'lockManager.search.placeholder': 'Rechercher…',
  'lockManager.search.ariaLabel': 'Rechercher dans les éléments verrouillés',
  'lockManager.filter.ariaLabel': 'Filtrer les éléments verrouillés par type',
  'lockManager.filter.all': 'Tous',
  'lockManager.filter.files': 'Fichiers',
  'lockManager.filter.folders': 'Dossiers',
  'lockManager.selectAll.ariaLabel': 'Sélectionner tous les éléments',
  'lockManager.selectAll.label': 'Tous',
  'lockManager.unlockSelected': 'Tout déverrouiller',
  'lockManager.unlockSelected.title': 'Déverrouiller tous les éléments sélectionnés',
  'lockManager.empty': 'Aucun élément verrouillé trouvé',
  'lockManager.unlockItem.ariaLabel': 'Déverrouiller {path}',
  'lockManager.unlockItem.title': 'Déverrouiller',
  'lockManager.toast.noneSelected': 'Sélectionnez au moins un élément à déverrouiller.',
  'lockManager.toast.selected_one': '{count} élément sélectionné déverrouillé.',
  'lockManager.toast.selected_other': '{count} éléments sélectionnés déverrouillés.',
  'lockManager.toast.item': '{path} déverrouillé',
  'lockManager.count.items_one': '{count} élément',
  'lockManager.count.items_other': '{count} éléments',
  'lockManager.count.selected_one': '{count} sélectionné',
  'lockManager.count.selected_other': '{count} sélectionnés',
  'lockManager.footer': '{items} • {selected}',
};

export function resolveLockManagerLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function getLockManagerCopy(language?: string | null): LockManagerCopy {
  return resolveLockManagerLanguage(language) === 'fr' ? lockManagerFr : lockManagerEn;
}

export function formatLockManagerCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatLockManagerPlural(
  language: string | null | undefined,
  count: number,
  templates: Readonly<{ one: string; other: string }>,
): string {
  const resolvedLanguage = resolveLockManagerLanguage(language);
  const locale = resolvedLanguage === 'fr' ? 'fr-FR' : 'en-US';
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? templates.one : templates.other;

  return formatLockManagerCopy(template, { count: new Intl.NumberFormat(locale).format(count) });
}
