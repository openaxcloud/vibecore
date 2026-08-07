import { normalizeSupportedLanguage, type SupportedLanguage } from '~/lib/i18n/language';
import { formatUserAreaDate, formatUserAreaNumber } from '~/lib/i18n/user-area-locale';

export type ApiKeysWorkspaceSettingsLanguage = 'en' | 'fr';

type LocalizedShape<Value> = Value extends string
  ? string
  : Value extends readonly (infer Item)[]
    ? readonly LocalizedShape<Item>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: LocalizedShape<Value[Key]> }
      : Value;

export const apiKeysWorkspaceSettingsEn = {
  apiKeys: {
    seo: {
      title: 'API keys — E-Code',
      description: 'Create and manage scoped E-Code API keys for secure programmatic access.',
    },
    shell: {
      title: 'API keys',
      description: 'Create, scope, rotate and revoke API keys for automation.',
    },
    created: {
      notice: 'Key created — copy it now. This is the only time the full key is shown.',
      copy: 'Copy',
      copied: 'Copied',
    },
    list: {
      title: 'Active keys',
      count_one: '{count} key',
      count_other: '{count} keys',
      create: 'Create key',
      emptyTitle: 'No API keys yet',
      emptyDescription: 'Create a key to authenticate with the E-Code API.',
    },
    fields: {
      name: 'Name',
      key: 'Key',
      scopes: 'Scopes',
      lastUsed: 'Last used',
      created: 'Created',
      expiration: 'Expiration',
      actions: 'Actions',
      never: 'Never',
      neverExpires: 'Never expires',
      expiresOn: 'Expires {date}',
      tableAria: 'API keys table',
    },
    scopes: {
      read: {
        label: 'Read',
        detail: 'List and fetch resources (safe, read-only requests).',
      },
      write: {
        label: 'Write',
        detail: 'Create, update and delete resources.',
      },
      admin: {
        label: 'Admin',
        detail: 'Full access, including minting and revoking other keys.',
      },
    },
    expiry: {
      never: 'Never expires',
      days30: '30 days',
      days90: '90 days',
      year1: '1 year',
    },
    createDialog: {
      title: 'Create an API key',
      description: 'Scoped, least-privilege tokens authenticate as you for programmatic access.',
      name: 'Name',
      namePlaceholder: 'CI deploy bot',
      scopes: 'Scopes',
      expiration: 'Expiration',
      cancel: 'Cancel',
      creating: 'Creating…',
      create: 'Create key',
    },
    revoke: {
      action: 'Revoke',
      title: 'Revoke key “{name}”?',
      description: 'Any client using it will immediately lose access. This cannot be undone.',
      confirm: 'Revoke key',
    },
    errors: {
      missingKeyId: 'The key could not be identified. Refresh the page and try again.',
      nameRequired: 'Give the key a name.',
      scopeRequired: 'Select at least one scope.',
      expiryInvalid: 'Select a valid expiration period.',
      unknownAction: 'This API key action is not supported.',
      requestRejected: 'The request was rejected. Check your permissions and try again.',
      notFound: 'This API key no longer exists. Refresh the page and try again.',
      conflict: 'This API key could not be changed because its state was updated. Refresh the page and try again.',
      rateLimited: 'Too many requests. Wait a moment and try again.',
      requestFailed: 'The request could not be completed. Try again.',
    },
  },
  workspaceSettings: {
    seo: {
      title: 'Workspace settings — E-Code',
      description: 'Configure editor, layout, terminal and agent preferences for your E-Code workspace.',
    },
    shell: {
      title: 'Workspace settings',
      description: 'Editor and workspace preferences.',
    },
    header: {
      title: 'Workspace settings',
      description: 'Editor, layout, terminal and agent preferences for this workspace.',
    },
    editor: {
      title: 'Editor',
      description: 'Changes apply live to the code editor.',
      fontSize: 'Font size',
      decreaseFontSize: 'Decrease font size',
      increaseFontSize: 'Increase font size',
      fontSizeValue: '{size}px',
      indentation: 'Indentation (tab size)',
      spaces_one: '{count} space',
      spaces_other: '{count} spaces',
      wordWrap: 'Word wrap',
      vimMode: 'Vim mode',
      formatOnSave: 'Format on save',
      reset: 'Reset editor settings',
    },
    appearance: {
      title: 'Appearance',
      description: 'Choose the workspace theme. System follows your device setting.',
      theme: 'Theme',
    },
    layout: {
      title: 'Layout',
      description: 'Panel arrangement.',
      detail: 'Drag panel dividers in the workspace to resize them. The arrangement is saved for each project.',
    },
    accessibleTerminal: {
      title: 'Accessible terminal',
      label: 'Screen-reader-friendly terminal output',
      description: 'Announces terminal output for assistive technology.',
    },
    agent: {
      title: 'AI & agent',
      description: 'Model and agent behaviour.',
      requireReview: 'Require review of AI changes',
      reviewOn:
        'The agent’s file changes stay in “Pending AI changes” — accept or reject each one before it is applied.',
      reviewOff:
        'Off (default): the agent’s file changes apply automatically. Turn this on to review and approve each change first.',
      openSettings: 'Open model and provider settings',
      settingsDetail: 'Model selection and provider keys are managed in account settings.',
    },
    run: {
      title: 'Run & workflows',
      description: 'How this project starts.',
      detailPrefix:
        'Run and install commands are configured for each project in project settings (the E-Code equivalent of Replit’s',
      detailSuffix: '). Open a project → Settings to edit them.',
    },
  },
  themePreference: {
    ariaLabel: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
  },
} as const;

export const apiKeysWorkspaceSettingsFr = {
  apiKeys: {
    seo: {
      title: 'Clés API — E-Code',
      description:
        'Créez et gérez des clés API E-Code à autorisations limitées pour sécuriser les accès programmatiques.',
    },
    shell: {
      title: 'Clés API',
      description:
        'Créez, limitez les autorisations, renouvelez et révoquez les clés API utilisées par vos automatisations.',
    },
    created: {
      notice: 'Clé créée : copiez-la maintenant. C’est la seule fois où elle est affichée dans son intégralité.',
      copy: 'Copier',
      copied: 'Copiée',
    },
    list: {
      title: 'Clés actives',
      count_one: '{count} clé',
      count_other: '{count} clés',
      create: 'Créer une clé',
      emptyTitle: 'Aucune clé API',
      emptyDescription: 'Créez une clé pour vous authentifier auprès de l’API E-Code.',
    },
    fields: {
      name: 'Nom',
      key: 'Clé',
      scopes: 'Autorisations',
      lastUsed: 'Dernière utilisation',
      created: 'Création',
      expiration: 'Expiration',
      actions: 'Actions',
      never: 'Jamais',
      neverExpires: 'Sans expiration',
      expiresOn: 'Expire le {date}',
      tableAria: 'Tableau des clés API',
    },
    scopes: {
      read: {
        label: 'Lecture',
        detail: 'Répertorier et récupérer les ressources (requêtes sûres en lecture seule).',
      },
      write: {
        label: 'Écriture',
        detail: 'Créer, mettre à jour et supprimer des ressources.',
      },
      admin: {
        label: 'Administration',
        detail: 'Accès complet, y compris pour créer et révoquer d’autres clés.',
      },
    },
    expiry: {
      never: 'Sans expiration',
      days30: '30 jours',
      days90: '90 jours',
      year1: '1 an',
    },
    createDialog: {
      title: 'Créer une clé API',
      description:
        'Utilisez un jeton à autorisations limitées et au moindre privilège pour accéder à l’API en votre nom.',
      name: 'Nom',
      namePlaceholder: 'Robot de déploiement CI',
      scopes: 'Autorisations',
      expiration: 'Expiration',
      cancel: 'Annuler',
      creating: 'Création…',
      create: 'Créer la clé',
    },
    revoke: {
      action: 'Révoquer',
      title: 'Révoquer la clé « {name} » ?',
      description: 'Tous les clients qui l’utilisent perdront immédiatement l’accès. Cette action est irréversible.',
      confirm: 'Révoquer la clé',
    },
    errors: {
      missingKeyId: 'Impossible d’identifier la clé. Actualisez la page, puis réessayez.',
      nameRequired: 'Donnez un nom à la clé.',
      scopeRequired: 'Sélectionnez au moins une autorisation.',
      expiryInvalid: 'Sélectionnez une durée d’expiration valide.',
      unknownAction: 'Cette action sur les clés API n’est pas prise en charge.',
      requestRejected: 'La requête a été refusée. Vérifiez vos autorisations, puis réessayez.',
      notFound: 'Cette clé API n’existe plus. Actualisez la page, puis réessayez.',
      conflict: 'Impossible de modifier cette clé API, car son état a changé. Actualisez la page, puis réessayez.',
      rateLimited: 'Trop de requêtes ont été envoyées. Patientez un instant, puis réessayez.',
      requestFailed: 'Impossible de terminer la requête. Réessayez.',
    },
  },
  workspaceSettings: {
    seo: {
      title: 'Paramètres de l’espace de travail — E-Code',
      description:
        'Configurez les préférences de l’éditeur, de la disposition, du terminal et de l’agent dans votre espace de travail E-Code.',
    },
    shell: {
      title: 'Paramètres de l’espace de travail',
      description: 'Préférences de l’éditeur et de l’espace de travail.',
    },
    header: {
      title: 'Paramètres de l’espace de travail',
      description: 'Préférences de l’éditeur, de la disposition, du terminal et de l’agent pour cet espace de travail.',
    },
    editor: {
      title: 'Éditeur',
      description: 'Les changements s’appliquent immédiatement à l’éditeur de code.',
      fontSize: 'Taille de police',
      decreaseFontSize: 'Réduire la taille de police',
      increaseFontSize: 'Augmenter la taille de police',
      fontSizeValue: '{size} px',
      indentation: 'Indentation (taille de tabulation)',
      spaces_one: '{count} espace',
      spaces_other: '{count} espaces',
      wordWrap: 'Retour automatique à la ligne',
      vimMode: 'Mode Vim',
      formatOnSave: 'Formater lors de l’enregistrement',
      reset: 'Réinitialiser les paramètres de l’éditeur',
    },
    appearance: {
      title: 'Apparence',
      description: 'Choisissez le thème de l’espace de travail. Le réglage Système suit celui de votre appareil.',
      theme: 'Thème',
    },
    layout: {
      title: 'Disposition',
      description: 'Organisation des panneaux.',
      detail:
        'Faites glisser les séparateurs des panneaux pour les redimensionner. La disposition est enregistrée pour chaque projet.',
    },
    accessibleTerminal: {
      title: 'Terminal accessible',
      label: 'Sortie du terminal adaptée aux lecteurs d’écran',
      description: 'Annonce la sortie du terminal aux technologies d’assistance.',
    },
    agent: {
      title: 'IA et agent',
      description: 'Comportement du modèle et de l’agent.',
      requireReview: 'Exiger la validation des modifications de l’IA',
      reviewOn:
        'Les modifications de fichiers proposées par l’agent restent dans « Modifications IA en attente » : acceptez-les ou refusez-les une à une avant leur application.',
      reviewOff:
        'Désactivé (par défaut) : les modifications de fichiers de l’agent s’appliquent automatiquement. Activez cette option pour examiner et approuver chaque modification au préalable.',
      openSettings: 'Ouvrir les paramètres des modèles et fournisseurs',
      settingsDetail: 'Le choix du modèle et les clés des fournisseurs sont gérés dans les paramètres du compte.',
    },
    run: {
      title: 'Exécution et flux de travail',
      description: 'Démarrage de ce projet.',
      detailPrefix:
        'Les commandes d’exécution et d’installation sont configurées pour chaque projet dans ses paramètres (l’équivalent E-Code du fichier',
      detailSuffix: '). Ouvrez un projet → Paramètres pour les modifier.',
    },
  },
  themePreference: {
    ariaLabel: 'Thème',
    light: 'Clair',
    dark: 'Sombre',
    system: 'Système',
  },
} as const satisfies LocalizedShape<typeof apiKeysWorkspaceSettingsEn>;

export type ApiKeysCopy = LocalizedShape<typeof apiKeysWorkspaceSettingsEn.apiKeys>;
export type WorkspaceSettingsCopy = LocalizedShape<typeof apiKeysWorkspaceSettingsEn.workspaceSettings>;
export type ThemePreferenceCopy = LocalizedShape<typeof apiKeysWorkspaceSettingsEn.themePreference>;

export const API_KEY_ACTION_ERROR_CODES = [
  'missingKeyId',
  'nameRequired',
  'scopeRequired',
  'expiryInvalid',
  'unknownAction',
  'requestRejected',
  'notFound',
  'conflict',
  'rateLimited',
  'requestFailed',
] as const;

export type ApiKeyActionErrorCode = (typeof API_KEY_ACTION_ERROR_CODES)[number];

export function resolveApiKeysWorkspaceSettingsLanguage(language?: string | null): ApiKeysWorkspaceSettingsLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function getApiKeysCopy(language?: string | null): ApiKeysCopy {
  return resolveApiKeysWorkspaceSettingsLanguage(language) === 'fr'
    ? apiKeysWorkspaceSettingsFr.apiKeys
    : apiKeysWorkspaceSettingsEn.apiKeys;
}

export function getWorkspaceSettingsCopy(language?: string | null): WorkspaceSettingsCopy {
  return resolveApiKeysWorkspaceSettingsLanguage(language) === 'fr'
    ? apiKeysWorkspaceSettingsFr.workspaceSettings
    : apiKeysWorkspaceSettingsEn.workspaceSettings;
}

export function getThemePreferenceCopy(language?: string | null): ThemePreferenceCopy {
  return resolveApiKeysWorkspaceSettingsLanguage(language) === 'fr'
    ? apiKeysWorkspaceSettingsFr.themePreference
    : apiKeysWorkspaceSettingsEn.themePreference;
}

export function interpolateApiKeysWorkspaceSettingsCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];
    return value === undefined ? token : String(value);
  });
}

function supportedLanguage(language?: string | null): SupportedLanguage {
  return resolveApiKeysWorkspaceSettingsLanguage(language);
}

export function formatApiKeysWorkspaceSettingsNumber(value: number | bigint, language?: string | null): string {
  return formatUserAreaNumber(value, undefined, supportedLanguage(language));
}

export function formatApiKeyCount(language: string | null | undefined, count: number): string {
  const copy = getApiKeysCopy(language).list;
  const locale = resolveApiKeysWorkspaceSettingsLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB';
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? copy.count_one : copy.count_other;

  return interpolateApiKeysWorkspaceSettingsCopy(template, {
    count: formatApiKeysWorkspaceSettingsNumber(count, language),
  });
}

export function formatWorkspaceSpaces(language: string | null | undefined, count: number): string {
  const copy = getWorkspaceSettingsCopy(language).editor;
  const locale = resolveApiKeysWorkspaceSettingsLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB';
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? copy.spaces_one : copy.spaces_other;

  return interpolateApiKeysWorkspaceSettingsCopy(template, {
    count: formatApiKeysWorkspaceSettingsNumber(count, language),
  });
}

export function formatApiKeyDate(value: Date | string | number, language?: string | null): string {
  return (
    formatUserAreaDate(value, { year: 'numeric', month: 'short', day: 'numeric' }, supportedLanguage(language)) ?? '—'
  );
}

export function resolveApiKeyActionErrorCode(status: number): ApiKeyActionErrorCode {
  if (status === 401 || status === 403) {
    return 'requestRejected';
  }

  if (status === 404) {
    return 'notFound';
  }

  if (status === 409 || status === 412) {
    return 'conflict';
  }

  if (status === 429) {
    return 'rateLimited';
  }

  return 'requestFailed';
}
