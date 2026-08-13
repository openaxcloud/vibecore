import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export type SidebarMenuLanguage = 'en' | 'fr';
export type SidebarMenuPluralCopy = Readonly<{ one: string; other: string }>;
export type SidebarMenuRuntimeCopy = Readonly<Record<string, string>>;

interface SidebarMenuCopy {
  sidebarMenu: {
    aria: {
      navigation: string;
      openMenu: string;
      closeMenu: string;
      searchChats: string;
      enterSelectionMode: string;
      exitSelectionMode: string;
      userAvatar: string;
      selectConversation: string;
      renameConversation: string;
    };
    header: {
      guestUser: string;
      fallbackUser: string;
      help: string;
      settings: string;
      toggleTheme: string;
      currentDateTime: string;
    };
    history: {
      startNewChat: string;
      title: string;
      localOnlyNote: string;
      searchPlaceholder: string;
      selectAll: string;
      deselectAll: string;
      deleteSelected: string;
      selectedCount: SidebarMenuPluralCopy;
      loading: string;
      loadError: string;
      retry: string;
      empty: string;
      noMatches: string;
      dates: {
        today: string;
        yesterday: string;
        pastThirtyDays: string;
        unknown: string;
      };
      actions: {
        export: string;
        duplicate: string;
        rename: string;
        delete: string;
        saveName: string;
      };
    };
    dialogs: {
      singleTitle: string;
      singleLead: string;
      singleQuestion: string;
      bulkTitle: string;
      bulkLead: SidebarMenuPluralCopy;
      bulkQuestion: string;
      cancel: string;
      delete: string;
    };
    toasts: {
      loadFailed: string;
      deleteSuccess: string;
      deleteFailed: string;
      bulkDeleteSuccess: SidebarMenuPluralCopy;
      bulkDeletePartial: string;
      selectionRequired: string;
      selectionNotFound: string;
      duplicateFailed: string;
      renameInvalidLength: string;
      renameInvalidCharacters: string;
      renameStorageUnavailable: string;
      renameMissingId: string;
      renameSuccess: string;
      renameFailed: string;
    };
    errors: {
      databaseUnavailable: string;
    };
  };
}

export const sidebarMenuEn = {
  sidebarMenu: {
    aria: {
      navigation: 'Chat history and account menu',
      openMenu: 'Open menu',
      closeMenu: 'Close menu',
      searchChats: 'Search chats',
      enterSelectionMode: 'Enter selection mode',
      exitSelectionMode: 'Exit selection mode',
      userAvatar: 'Profile picture for {name}',
      selectConversation: 'Select {name}',
      renameConversation: 'Rename {name}',
    },
    header: {
      guestUser: 'Guest user',
      fallbackUser: 'User',
      help: 'Help & documentation',
      settings: 'Settings',
      toggleTheme: 'Toggle theme',
      currentDateTime: 'Current date and time',
    },
    history: {
      startNewChat: 'Start new chat',
      title: 'Your chats',
      localOnlyNote: 'Stored on this device only — standalone chats are not synced across devices.',
      searchPlaceholder: 'Search chats…',
      selectAll: 'Select all',
      deselectAll: 'Deselect all',
      deleteSelected: 'Delete selected',
      selectedCount: {
        one: '{count} chat selected',
        other: '{count} chats selected',
      },
      loading: 'Loading your chats…',
      loadError: 'Your chat history could not be loaded.',
      retry: 'Try again',
      empty: 'No previous conversations',
      noMatches: 'No matches found',
      dates: {
        today: 'Today',
        yesterday: 'Yesterday',
        pastThirtyDays: 'Past 30 days',
        unknown: 'Unknown date',
      },
      actions: {
        export: 'Export',
        duplicate: 'Duplicate',
        rename: 'Rename',
        delete: 'Delete',
        saveName: 'Save name',
      },
    },
    dialogs: {
      singleTitle: 'Delete chat?',
      singleLead: 'You are about to delete',
      singleQuestion: 'Are you sure you want to delete this chat?',
      bulkTitle: 'Delete selected chats?',
      bulkLead: {
        one: 'You are about to delete {count} chat:',
        other: 'You are about to delete {count} chats:',
      },
      bulkQuestion: 'Are you sure you want to delete these chats?',
      cancel: 'Cancel',
      delete: 'Delete',
    },
    toasts: {
      loadFailed: 'Chat history could not be loaded. Please try again.',
      deleteSuccess: 'Chat deleted successfully.',
      deleteFailed: 'The conversation could not be deleted. Please try again.',
      bulkDeleteSuccess: {
        one: '{count} chat deleted successfully.',
        other: '{count} chats deleted successfully.',
      },
      bulkDeletePartial: 'Deleted {deleted} of {total} chats; failures: {failed}.',
      selectionRequired: 'Select at least one chat to delete.',
      selectionNotFound: 'The selected chats could not be found.',
      duplicateFailed: 'The conversation could not be duplicated. Please try again.',
      renameInvalidLength: 'Chat names must contain between 1 and 100 characters.',
      renameInvalidCharacters: 'Chat names cannot contain angle brackets or control characters.',
      renameStorageUnavailable: 'Chat history storage is unavailable.',
      renameMissingId: 'This chat could not be identified. Reload the page and try again.',
      renameSuccess: 'Chat name updated.',
      renameFailed: 'The chat name could not be updated. Please try again.',
    },
    errors: {
      databaseUnavailable: 'Chat history storage is unavailable.',
    },
  },
} as const satisfies SidebarMenuCopy;

export const sidebarMenuFr = {
  sidebarMenu: {
    aria: {
      navigation: 'Historique des discussions et menu du compte',
      openMenu: 'Ouvrir le menu',
      closeMenu: 'Fermer le menu',
      searchChats: 'Rechercher dans les discussions',
      enterSelectionMode: 'Activer le mode de sélection',
      exitSelectionMode: 'Quitter le mode de sélection',
      userAvatar: 'Photo de profil de {name}',
      selectConversation: 'Sélectionner {name}',
      renameConversation: 'Renommer {name}',
    },
    header: {
      guestUser: 'Utilisateur invité',
      fallbackUser: 'Utilisateur',
      help: 'Aide et documentation',
      settings: 'Paramètres',
      toggleTheme: 'Changer de thème',
      currentDateTime: 'Date et heure actuelles',
    },
    history: {
      startNewChat: 'Nouvelle discussion',
      title: 'Vos discussions',
      localOnlyNote:
        'Stocké uniquement sur cet appareil — les discussions autonomes ne sont pas synchronisées entre appareils.',
      searchPlaceholder: 'Rechercher une discussion…',
      selectAll: 'Tout sélectionner',
      deselectAll: 'Tout désélectionner',
      deleteSelected: 'Supprimer la sélection',
      selectedCount: {
        one: '{count} discussion sélectionnée',
        other: '{count} discussions sélectionnées',
      },
      loading: 'Chargement de vos discussions…',
      loadError: 'Impossible de charger l’historique de vos discussions.',
      retry: 'Réessayer',
      empty: 'Aucune discussion précédente',
      noMatches: 'Aucun résultat',
      dates: {
        today: 'Aujourd’hui',
        yesterday: 'Hier',
        pastThirtyDays: '30 derniers jours',
        unknown: 'Date inconnue',
      },
      actions: {
        export: 'Exporter',
        duplicate: 'Dupliquer',
        rename: 'Renommer',
        delete: 'Supprimer',
        saveName: 'Enregistrer le nom',
      },
    },
    dialogs: {
      singleTitle: 'Supprimer la discussion ?',
      singleLead: 'Vous êtes sur le point de supprimer',
      singleQuestion: 'Voulez-vous vraiment supprimer cette discussion ?',
      bulkTitle: 'Supprimer les discussions sélectionnées ?',
      bulkLead: {
        one: 'Vous êtes sur le point de supprimer {count} discussion :',
        other: 'Vous êtes sur le point de supprimer {count} discussions :',
      },
      bulkQuestion: 'Voulez-vous vraiment supprimer ces discussions ?',
      cancel: 'Annuler',
      delete: 'Supprimer',
    },
    toasts: {
      loadFailed: 'Impossible de charger l’historique des discussions. Veuillez réessayer.',
      deleteSuccess: 'Discussion supprimée.',
      deleteFailed: 'Impossible de supprimer la discussion. Veuillez réessayer.',
      bulkDeleteSuccess: {
        one: '{count} discussion supprimée.',
        other: '{count} discussions supprimées.',
      },
      bulkDeletePartial: '{deleted} discussions sur {total} supprimées ; échecs : {failed}.',
      selectionRequired: 'Sélectionnez au moins une discussion à supprimer.',
      selectionNotFound: 'Impossible de retrouver les discussions sélectionnées.',
      duplicateFailed: 'Impossible de dupliquer la discussion. Veuillez réessayer.',
      renameInvalidLength: 'Le nom de la discussion doit contenir entre 1 et 100 caractères.',
      renameInvalidCharacters: 'Le nom de la discussion ne peut pas contenir de chevrons ni de caractères de contrôle.',
      renameStorageUnavailable: 'Le stockage de l’historique des discussions est indisponible.',
      renameMissingId: 'Impossible d’identifier cette discussion. Rechargez la page, puis réessayez.',
      renameSuccess: 'Nom de la discussion mis à jour.',
      renameFailed: 'Impossible de modifier le nom de la discussion. Veuillez réessayer.',
    },
    errors: {
      databaseUnavailable: 'Le stockage de l’historique des discussions est indisponible.',
    },
  },
} as const satisfies SidebarMenuCopy;

export const sidebarMenuCatalog = {
  en: sidebarMenuEn,
  fr: sidebarMenuFr,
} as const satisfies Record<SidebarMenuLanguage, SidebarMenuCopy>;

function flattenSidebarMenuCopy(copy: SidebarMenuCopy): SidebarMenuRuntimeCopy {
  const flattened: Record<string, string> = {};

  const visit = (value: unknown, path: string[]): void => {
    if (typeof value === 'string') {
      flattened[path.join('.')] = value;

      return;
    }

    if (value && typeof value === 'object') {
      for (const [key, nestedValue] of Object.entries(value)) {
        visit(nestedValue, [...path, key]);
      }
    }
  };

  visit(copy, []);

  return Object.freeze(flattened);
}

/** Flat resources intended for the central i18next runtime. */
export const sidebarMenuRuntimeCatalog = {
  en: flattenSidebarMenuCopy(sidebarMenuEn),
  fr: flattenSidebarMenuCopy(sidebarMenuFr),
} as const satisfies Readonly<Record<SidebarMenuLanguage, SidebarMenuRuntimeCopy>>;

export function resolveSidebarMenuLanguage(language?: string | null): SidebarMenuLanguage {
  return normalizeSupportedLanguage(language) === 'fr' ? 'fr' : 'en';
}

export function getSidebarMenuCopy(language?: string | null): SidebarMenuCopy {
  return resolveSidebarMenuLanguage(language) === 'fr' ? sidebarMenuFr : sidebarMenuEn;
}

type InterpolationValue = string | number | bigint;

export function interpolateSidebarMenuCopy(
  template: string,
  values: Readonly<Record<string, InterpolationValue>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatSidebarMenuNumber(value: number | bigint, language?: string | null): string {
  return new Intl.NumberFormat(resolveSidebarMenuLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB').format(value);
}

export function formatSidebarMenuPlural(
  language: string | null | undefined,
  count: number,
  forms: SidebarMenuPluralCopy,
  values: Readonly<Record<string, InterpolationValue>> = {},
): string {
  const locale = resolveSidebarMenuLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB';
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? forms.one : forms.other;

  return interpolateSidebarMenuCopy(template, {
    ...values,
    count: formatSidebarMenuNumber(count, language),
  });
}

export function formatSidebarMenuDate(value: Date, language?: string | null): string {
  return new Intl.DateTimeFormat(resolveSidebarMenuLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'medium',
  }).format(value);
}

export function formatSidebarMenuTime(value: Date, language?: string | null): string {
  return new Intl.DateTimeFormat(resolveSidebarMenuLanguage(language) === 'fr' ? 'fr-FR' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}
