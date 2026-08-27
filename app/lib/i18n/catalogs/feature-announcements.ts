import type { Feature } from '~/lib/api/features';

export type FeatureAnnouncementLanguage = 'en' | 'fr';
export type FeatureAnnouncementConfig = Omit<Feature, 'viewed'>;
export type FeatureAnnouncementErrorCode = 'FEATURE_ID_REQUIRED' | 'FEATURE_NOT_FOUND';

const ANNOUNCEMENTS = {
  en: [
    {
      id: 'mcp-marketplace',
      name: 'MCP marketplace',
      description: 'Browse and connect Model Context Protocol servers to give the agent new tools.',
      releaseDate: '2026-05-05',
    },
    {
      id: 'static-deployments',
      name: 'Static deployments',
      description: 'Ship static builds straight from the workspace with a shareable preview URL.',
      releaseDate: '2026-05-15',
    },
    {
      id: 'agent-panel',
      name: 'Collaborative agent panel',
      description: 'Review, accept, and undo agent edits inline with live presence and share links.',
      releaseDate: '2026-05-19',
    },
  ],
  fr: [
    {
      id: 'mcp-marketplace',
      name: 'Marketplace MCP',
      description: 'Parcourez et connectez des serveurs Model Context Protocol pour enrichir les outils de l’agent.',
      releaseDate: '2026-05-05',
    },
    {
      id: 'static-deployments',
      name: 'Déploiements statiques',
      description:
        'Publiez vos builds statiques directement depuis l’espace de travail avec une URL de prévisualisation partageable.',
      releaseDate: '2026-05-15',
    },
    {
      id: 'agent-panel',
      name: 'Panneau collaboratif de l’agent',
      description:
        'Examinez, acceptez et annulez les modifications de l’agent dans le code, avec présence en direct et liens de partage.',
      releaseDate: '2026-05-19',
    },
  ],
} as const satisfies Readonly<Record<FeatureAnnouncementLanguage, readonly FeatureAnnouncementConfig[]>>;

const ERROR_MESSAGES = {
  en: {
    FEATURE_ID_REQUIRED: 'A feature id is required.',
    FEATURE_NOT_FOUND: 'The requested feature was not found.',
  },
  fr: {
    FEATURE_ID_REQUIRED: 'Un identifiant de fonctionnalité est requis.',
    FEATURE_NOT_FOUND: 'La fonctionnalité demandée est introuvable.',
  },
} as const satisfies Readonly<
  Record<FeatureAnnouncementLanguage, Readonly<Record<FeatureAnnouncementErrorCode, string>>>
>;

export function normalizeFeatureAnnouncementLanguage(language?: string | null): FeatureAnnouncementLanguage {
  return language?.trim().toLowerCase().split(/[-_]/)[0] === 'fr' ? 'fr' : 'en';
}

export function defaultFeatureAnnouncements(language?: string | null): FeatureAnnouncementConfig[] {
  return ANNOUNCEMENTS[normalizeFeatureAnnouncementLanguage(language)].map((announcement) => ({ ...announcement }));
}

export function featureAnnouncementError(code: FeatureAnnouncementErrorCode, language?: string | null): string {
  return ERROR_MESSAGES[normalizeFeatureAnnouncementLanguage(language)][code] ?? ERROR_MESSAGES.en[code];
}
