import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

/* Onglet Secrets de l'IDE — parité Replit (RP-SEC-01 à 08). */
export const secretsPanelEn = {
  'secretsPanel.title': 'Secrets',
  'secretsPanel.menu.aria': 'Secrets actions',
  'secretsPanel.menu.docs': 'Docs',
  'secretsPanel.menu.editJson': 'Edit as JSON',
  'secretsPanel.menu.editEnv': 'Edit as .env',
  'secretsPanel.new': 'New Secret',
  'secretsPanel.filter.placeholder': 'Filter Secrets by name',
  'secretsPanel.filter.aria': 'Filter secrets by name',
  'secretsPanel.form.key': 'Key',
  'secretsPanel.form.value': 'Value',
  'secretsPanel.form.showValue': 'Show value while typing',
  'secretsPanel.form.hideValue': 'Hide value while typing',
  'secretsPanel.form.cancel': 'Cancel',
  'secretsPanel.form.add': 'Add Secret',
  'secretsPanel.form.update': 'Update Secret',
  'secretsPanel.form.invalidKey':
    'A key starts with a letter or underscore and contains only letters, digits and underscores.',
  'secretsPanel.row.copyKey': 'Copy the name {{key}}',
  'secretsPanel.row.copyValue': 'Copy the value of {{key}}',
  'secretsPanel.row.reveal': 'Reveal the value of {{key}}',
  'secretsPanel.row.hide': 'Hide the value of {{key}}',
  'secretsPanel.row.menu': 'Actions for {{key}}',
  'secretsPanel.row.edit': 'Edit',
  'secretsPanel.row.findUsages': 'Find Usages',
  'secretsPanel.row.delete': 'Delete',
  'secretsPanel.row.linked': 'Linked to your account',
  'secretsPanel.empty.title': 'No secrets yet',
  'secretsPanel.empty.description': 'Secrets are encrypted and injected into your app as environment variables.',
  'secretsPanel.noMatch': 'No secret matches “{{filter}}”.',
  'secretsPanel.editor.envTitle': 'Edit as .env',
  'secretsPanel.editor.jsonTitle': 'Edit as JSON',
  'secretsPanel.editor.help':
    'Values are never shown here. Fill in a value to update that secret; leave it empty to keep it unchanged. New keys are created.',
  'secretsPanel.editor.apply': 'Apply',
  'secretsPanel.editor.applying': 'Applying {{done}} / {{total}}…',
  'secretsPanel.editor.nothing': 'Nothing to apply: no value was filled in.',
  'secretsPanel.editor.invalidJson': 'This is not valid JSON.',
  'secretsPanel.editor.notAnObject': 'Expected a JSON object of string values.',
  'secretsPanel.editor.invalidKeys': 'Ignored keys (invalid names): {{keys}}',
  'secretsPanel.editor.skipped': 'Ignored lines: {{count}}',
  'secretsPanel.editor.close': 'Close',
} as const;

export type SecretsPanelKey = keyof typeof secretsPanelEn;
export type SecretsPanelCopy = Readonly<Record<SecretsPanelKey, string>>;

export const secretsPanelFr: SecretsPanelCopy = {
  'secretsPanel.title': 'Secrets',
  'secretsPanel.menu.aria': 'Actions sur les secrets',
  'secretsPanel.menu.docs': 'Docs',
  'secretsPanel.menu.editJson': 'Modifier en JSON',
  'secretsPanel.menu.editEnv': 'Modifier en .env',
  'secretsPanel.new': 'Nouveau secret',
  'secretsPanel.filter.placeholder': 'Filtrer les secrets par nom',
  'secretsPanel.filter.aria': 'Filtrer les secrets par nom',
  'secretsPanel.form.key': 'Clé',
  'secretsPanel.form.value': 'Valeur',
  'secretsPanel.form.showValue': 'Afficher la valeur pendant la saisie',
  'secretsPanel.form.hideValue': 'Masquer la valeur pendant la saisie',
  'secretsPanel.form.cancel': 'Annuler',
  'secretsPanel.form.add': 'Ajouter le secret',
  'secretsPanel.form.update': 'Mettre à jour le secret',
  'secretsPanel.form.invalidKey':
    'Une clé commence par une lettre ou un souligné et ne contient que des lettres, des chiffres et des soulignés.',
  'secretsPanel.row.copyKey': 'Copier le nom {{key}}',
  'secretsPanel.row.copyValue': 'Copier la valeur de {{key}}',
  'secretsPanel.row.reveal': 'Révéler la valeur de {{key}}',
  'secretsPanel.row.hide': 'Masquer la valeur de {{key}}',
  'secretsPanel.row.menu': 'Actions pour {{key}}',
  'secretsPanel.row.edit': 'Modifier',
  'secretsPanel.row.findUsages': 'Trouver les usages',
  'secretsPanel.row.delete': 'Supprimer',
  'secretsPanel.row.linked': 'Lié à votre compte',
  'secretsPanel.empty.title': 'Aucun secret pour l’instant',
  'secretsPanel.empty.description':
    'Les secrets sont chiffrés et injectés dans votre application comme variables d’environnement.',
  'secretsPanel.noMatch': 'Aucun secret ne correspond à « {{filter}} ».',
  'secretsPanel.editor.envTitle': 'Modifier en .env',
  'secretsPanel.editor.jsonTitle': 'Modifier en JSON',
  'secretsPanel.editor.help':
    'Les valeurs ne sont jamais affichées ici. Renseignez une valeur pour mettre ce secret à jour ; laissez-la vide pour ne rien changer. Les nouvelles clés sont créées.',
  'secretsPanel.editor.apply': 'Appliquer',
  'secretsPanel.editor.applying': 'Application {{done}} / {{total}}…',
  'secretsPanel.editor.nothing': 'Rien à appliquer : aucune valeur renseignée.',
  'secretsPanel.editor.invalidJson': 'Ce n’est pas du JSON valide.',
  'secretsPanel.editor.notAnObject': 'Un objet JSON de chaînes était attendu.',
  'secretsPanel.editor.invalidKeys': 'Clés ignorées (noms invalides) : {{keys}}',
  'secretsPanel.editor.skipped': 'Lignes ignorées : {{count}}',
  'secretsPanel.editor.close': 'Fermer',
};

export function resolveSecretsPanelLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function getSecretsPanelCopy(language?: string | null): SecretsPanelCopy {
  return resolveSecretsPanelLanguage(language) === 'fr' ? secretsPanelFr : secretsPanelEn;
}

export function formatSecretsPanelCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{\{(\w+)\}\}/gu, (_match, name: string) => String(values[name] ?? ''));
}
