import { resolveMarketingLanguage } from './marketing';

export type DeletingDataHighlightId = 'selfService' | 'grace' | 'export' | 'permanent';

export type DeletingDataSectionId = 'export' | 'request' | 'grace' | 'retention';

interface MarketingExactDeletingYourDataCopy {
  exactDeletingYourData: {
    seo: {
      title: string;
      description: string;
      imageAlt: string;
    };
    hero: {
      eyebrow: string;
      title: string;
      description: string;
    };
    actions: {
      primary: string;
      secondary: string;
    };
    highlights: {
      title: string;
      items: readonly {
        id: DeletingDataHighlightId;
        label: string;
      }[];
    };
    guide: {
      title: string;
      sections: readonly {
        id: DeletingDataSectionId;
        title: string;
        body: string;
        items: readonly string[];
      }[];
    };
    cta: {
      title: string;
      description: string;
    };
  };
}

export const marketingExactDeletingYourDataEn = {
  exactDeletingYourData: {
    seo: {
      title: 'Deleting Your Data — E-Code',
      description:
        'Learn how to export or delete your E-Code data yourself, how the 14-day grace period works and what is removed or retained.',
      imageAlt: 'E-Code self-service data export and account deletion guidance',
    },
    hero: {
      eyebrow: 'Legal',
      title: 'Deleting Your Data',
      description:
        'You own your data on E-Code. You can export it or delete your account yourself, on your own schedule. This page explains how it works, the grace period and what happens to your data.',
    },
    actions: {
      primary: 'Manage your data',
      secondary: 'Read the Privacy Policy',
    },
    highlights: {
      title: 'Data-control safeguards',
      items: [
        { id: 'selfService', label: 'Self-service' },
        { id: 'grace', label: '{count}-day grace period' },
        { id: 'export', label: 'Export first' },
        { id: 'permanent', label: 'Permanent after the grace period' },
      ],
    },
    guide: {
      title: 'Export and deletion guide',
      sections: [
        {
          id: 'export',
          title: 'Export your data',
          body: 'Before deleting anything, you can download a copy of your account data — your profile, organizations, projects and preferences — from Data & privacy. Secrets and access tokens are never included in the export.',
          items: [
            'Download from Data & privacy',
            'Profile, organizations, projects and preferences',
            'Secrets and access tokens excluded',
          ],
        },
        {
          id: 'request',
          title: 'Delete your account yourself',
          body: 'Account deletion is self-service: go to Data & privacy, request deletion and confirm. No support ticket is required. Your request schedules the account for permanent deletion.',
          items: ['Data & privacy → Request account deletion', 'Type to confirm', 'No support ticket required'],
        },
        {
          id: 'grace',
          title: '{count}-day grace period',
          body: 'Deletion does not happen instantly. Your account enters a {count}-day grace period during which you can cancel and keep everything. After the grace period, deletion proceeds and is permanent.',
          items: [
            '{count} days to change your mind',
            'Cancel at any time during the grace period',
            'Permanent after the grace period',
          ],
        },
        {
          id: 'retention',
          title: 'What is deleted and what is retained',
          body: 'Deletion removes your personal content — projects, files and profile — from our active systems. A limited set of records may be retained where the law requires it, including billing and tax records or security and audit logs. Backups expire on their normal cycle.',
          items: [
            'Personal content and projects removed',
            'Legally required records may be retained',
            'Backups expire on their normal cycle',
            'See the Privacy Policy for data-subject rights',
          ],
        },
      ],
    },
    cta: {
      title: 'Stay in control of your data',
      description:
        'Export a copy before deleting anything, then use the secure self-service controls when you are ready.',
    },
  },
} as const satisfies MarketingExactDeletingYourDataCopy;

export const marketingExactDeletingYourDataFr = {
  exactDeletingYourData: {
    seo: {
      title: 'Suppression de vos données — E-Code',
      description:
        'Découvrez comment exporter ou supprimer vous-même vos données E-Code, comment fonctionne le délai de grâce de 14 jours et quelles données sont supprimées ou conservées.',
      imageAlt: 'Guide E-Code sur l’export de données et la suppression du compte en libre-service',
    },
    hero: {
      eyebrow: 'Centre juridique',
      title: 'Suppression de vos données',
      description:
        'Vos données sur E-Code vous appartiennent. Vous pouvez les exporter ou supprimer vous-même votre compte, au moment qui vous convient. Cette page explique la procédure, le délai de grâce et le devenir de vos données.',
    },
    actions: {
      primary: 'Gérer vos données',
      secondary: 'Lire la Politique de confidentialité',
    },
    highlights: {
      title: 'Garanties de maîtrise de vos données',
      items: [
        { id: 'selfService', label: 'En libre-service' },
        { id: 'grace', label: 'Délai de grâce de {count} jours' },
        { id: 'export', label: 'Export préalable' },
        { id: 'permanent', label: 'Suppression définitive après le délai' },
      ],
    },
    guide: {
      title: 'Guide d’export et de suppression',
      sections: [
        {
          id: 'export',
          title: 'Exporter vos données',
          body: 'Avant toute suppression, vous pouvez télécharger une copie des données de votre compte — profil, organisations, projets et préférences — depuis Données et confidentialité. Les secrets et les jetons d’accès ne sont jamais inclus dans l’export.',
          items: [
            'Téléchargement depuis Données et confidentialité',
            'Profil, organisations, projets et préférences',
            'Secrets et jetons d’accès exclus',
          ],
        },
        {
          id: 'request',
          title: 'Supprimer vous-même votre compte',
          body: 'La suppression du compte est disponible en libre-service : ouvrez Données et confidentialité, demandez la suppression, puis confirmez-la. Aucun ticket d’assistance n’est nécessaire. Votre demande programme la suppression définitive du compte.',
          items: [
            'Données et confidentialité → Demander la suppression du compte',
            'Confirmation par saisie',
            'Aucun ticket d’assistance nécessaire',
          ],
        },
        {
          id: 'grace',
          title: 'Délai de grâce de {count} jours',
          body: 'La suppression n’est pas immédiate. Votre compte bénéficie d’un délai de grâce de {count} jours pendant lequel vous pouvez annuler la demande et tout conserver. Une fois ce délai écoulé, la suppression est lancée et devient définitive.',
          items: [
            '{count} jours pour revenir sur votre décision',
            'Annulation possible à tout moment pendant ce délai',
            'Suppression définitive une fois le délai écoulé',
          ],
        },
        {
          id: 'retention',
          title: 'Données supprimées et données conservées',
          body: 'La suppression efface vos contenus personnels — projets, fichiers et profil — de nos systèmes actifs. Un ensemble limité de données peut être conservé lorsque la loi l’exige, notamment des documents de facturation et fiscaux ou des journaux de sécurité et d’audit. Les sauvegardes expirent selon leur cycle habituel.',
          items: [
            'Contenus personnels et projets supprimés',
            'Certaines données peuvent être conservées lorsque la loi l’exige',
            'Les sauvegardes expirent selon leur cycle habituel',
            'Consultez la Politique de confidentialité pour connaître vos droits',
          ],
        },
      ],
    },
    cta: {
      title: 'Gardez la maîtrise de vos données',
      description:
        'Exportez une copie avant toute suppression, puis utilisez les contrôles sécurisés en libre-service lorsque vous êtes prêt.',
    },
  },
} as const satisfies MarketingExactDeletingYourDataCopy;

export function getMarketingExactDeletingYourDataCopy(language?: string | null): MarketingExactDeletingYourDataCopy {
  return resolveMarketingLanguage(language) === 'fr'
    ? marketingExactDeletingYourDataFr
    : marketingExactDeletingYourDataEn;
}

export function interpolateMarketingExactDeletingYourDataCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>>,
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatMarketingExactDeletingYourDataInteger(value: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(value);
}
