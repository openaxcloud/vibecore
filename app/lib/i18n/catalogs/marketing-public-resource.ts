import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

type TextPair = readonly [string, string];

interface PublicResourceCopy {
  templates: {
    hero: {
      eyebrow: string;
      title: string;
      description: string;
      primary: string;
      secondary: string;
      metrics: readonly [string, string, string];
    };
    gallery: { eyebrow: string; title: string; description: string };
    searchLabel: string;
    searchPlaceholder: string;
    clearSearch: string;
    tagFilterLabel: string;
    all: string;
    noQueryMatchPrefix: string;
    noQueryMatchSuffix: string;
    noTagMatch: string;
    noMatchDescription: string;
    clearFilters: string;
    matchSingular: string;
    matchPlural: string;
    matchSuffix: string;
    foundations: {
      eyebrow: string;
      title: string;
      description: string;
      imageAlt: string;
      imageCaption: string;
      assurances: readonly TextPair[];
    };
    more: { eyebrow: string; title: string; description: string };
    cta: { title: string; description: string; primary: string; secondary: string };
    card: {
      trending: string;
      official: string;
      free: string;
      ideReady: string;
      useTemplate: string;
      difficulty: Record<'easy' | 'medium' | 'hard', string>;
    };
  };
  community: {
    hero: {
      eyebrow: string;
      title: string;
      description: string;
      primary: string;
      secondary: string;
      metrics: readonly [string, string, string];
    };
    pillars: readonly { id: 'help' | 'showcases' | 'challenges'; title: string; body: string }[];
    feed: { eyebrow: string; title: string; description: string };
    searchLabel: string;
    searchPlaceholder: string;
    newPost: string;
    categoryLabel: string;
    emptyTitle: string;
    emptyDescription: string;
    startDiscussion: string;
    activeChallenges: string;
    joinChallenge: string;
    topContributors: string;
    events: {
      eyebrow: string;
      title: string;
      description: string;
      imageAlt: string;
      imageCaption: string;
      register: string;
    };
    cta: { title: string; description: string; primary: string; secondary: string };
    post: {
      by: string;
      like: string;
      discuss: string;
      save: string;
      read: string;
      reply: string;
    };
    challenge: {
      guidedBuild: string;
      openToMembers: string;
      participate: string;
      difficulty: Record<'easy' | 'medium' | 'hard', string>;
    };
  };
}

export const marketingPublicResourceEn = {
  templates: {
    hero: {
      eyebrow: 'Templates',
      title: 'Start faster with production-ready E-Code templates',
      description:
        'Browse real E-Code project starters adapted into the E-Code marketing experience. Pick a foundation, open the preserved IDE, and continue with typed code, preview and deployment workflows.',
      primary: 'Browse templates',
      secondary: 'Open docs',
      metrics: ['Official templates', 'Categories', 'Project-ready'],
    },
    gallery: {
      eyebrow: 'Template gallery',
      title: 'Curated starters without the app dashboard chrome',
      description:
        "This is a public marketing gallery. It uses the same E-Code header and footer as the homepage, while the cards are powered by E-Code's real template catalog.",
    },
    searchLabel: 'Search templates',
    searchPlaceholder: 'Search templates, stacks or tags…',
    clearSearch: 'Clear search',
    tagFilterLabel: 'Filter templates by tag',
    all: 'All',
    noQueryMatchPrefix: 'No templates match “',
    noQueryMatchSuffix: '”',
    noTagMatch: 'No templates match this tag',
    noMatchDescription: 'Try a different search or tag, or clear the filters to browse the full catalog.',
    clearFilters: 'Clear filters',
    matchSingular: 'template matches',
    matchPlural: 'templates match',
    matchSuffix: 'your filters.',
    foundations: {
      eyebrow: 'Real project foundations',
      title: 'Templates stay public. Workspaces stay private.',
      description:
        'Visitors see a marketing page. Signed-in builders continue into the IDE, where auth, files, terminal, preview and deployment controls remain part of the real product.',
      imageAlt: 'E-Code IDE with file tree, editor and live preview',
      imageCaption: 'The preserved E-Code IDE your template opens into.',
      assurances: [
        ['No invented catalog', 'Cards come from existing E-Code starters.'],
        ['No user menu', 'Public pages do not render account dropdowns.'],
        ['Same shell', 'Header and footer match the marketing routes.'],
      ],
    },
    more: {
      eyebrow: 'More starters',
      title: 'More ways to start',
      description: 'Additional foundations for web apps, AI agents, dashboards, APIs and mobile projects.',
    },
    cta: {
      title: 'Ready to turn a template into a real project?',
      description: 'Open a starter, keep the generated code reviewable, and continue in the preserved E-Code IDE.',
      primary: 'Start building',
      secondary: 'See pricing',
    },
    card: {
      trending: 'Trending',
      official: 'Official',
      free: 'Free',
      ideReady: 'IDE-ready',
      useTemplate: 'Use template',
      difficulty: { easy: 'Easy', medium: 'Medium', hard: 'Hard' },
    },
  },
  community: {
    hero: {
      eyebrow: 'Community',
      title: 'Connect with builders shipping real E-Code projects',
      description:
        'Read public discussions, join challenges, follow contributors and learn the implementation patterns teams use to move from prompt to production.',
      primary: 'Start a discussion',
      secondary: 'Explore posts',
      metrics: ['Public discussions', 'Active challenges', 'Upcoming programs'],
    },
    pillars: [
      {
        id: 'help',
        title: 'Launch help',
        body: 'Ask for architecture review, deployment checks and template hardening advice.',
      },
      {
        id: 'showcases',
        title: 'Public showcases',
        body: 'Read project breakdowns and implementation notes without opening private workspaces.',
      },
      {
        id: 'challenges',
        title: 'Challenges',
        body: 'Join guided builds for agents, mobile apps, dashboards and production backends.',
      },
    ],
    feed: {
      eyebrow: 'Community feed',
      title: 'Discussions, showcases and implementation help',
      description:
        'Browse public posts with the E-Code marketing header and footer. Replying, liking, bookmarking or posting requires sign-in and returns you to the community flow.',
    },
    searchLabel: 'Search community',
    searchPlaceholder: 'Search discussions, tags or builders…',
    newPost: 'New post',
    categoryLabel: 'Community categories',
    emptyTitle: 'No public discussions found',
    emptyDescription: 'Try a different search or open a new thread after signing in.',
    startDiscussion: 'Start a discussion',
    activeChallenges: 'Active challenges',
    joinChallenge: 'Join a challenge',
    topContributors: 'Top contributors',
    events: {
      eyebrow: 'Events and programs',
      title: 'Join the public side of the builder network.',
      description:
        'Community content remains readable. Participation, private files and workspace controls stay behind the authenticated product flow.',
      imageAlt: 'E-Code project dashboard showing real workspaces and deployment status',
      imageCaption: 'The dashboard you continue into after signing in.',
      register: 'Register interest',
    },
    cta: {
      title: 'Join the conversation without opening the app dashboard.',
      description:
        'Sign in only when you want to post, reply, bookmark, join a challenge or create a project. Public browsing stays on the marketing site.',
      primary: 'Join community',
      secondary: 'Browse templates',
    },
    post: {
      by: 'by',
      like: 'Like',
      discuss: 'Discuss',
      save: 'Save',
      read: 'Read discussion',
      reply: 'Reply',
    },
    challenge: {
      guidedBuild: 'Guided build',
      openToMembers: 'Open to all members',
      participate: 'Participate',
      difficulty: { easy: 'Easy', medium: 'Medium', hard: 'Hard' },
    },
  },
} as const satisfies PublicResourceCopy;

export const marketingPublicResourceFr = {
  templates: {
    hero: {
      eyebrow: 'Modèles',
      title: 'Démarrez plus vite avec des modèles E-Code prêts pour la production',
      description:
        'Parcourez de véritables bases de projet E-Code intégrées à l’expérience marketing. Choisissez un point de départ, ouvrez l’IDE préservé et poursuivez avec du code typé, des aperçus et des flux de déploiement.',
      primary: 'Parcourir les modèles',
      secondary: 'Ouvrir la documentation',
      metrics: ['Modèles officiels', 'Catégories', 'Prêts pour un projet'],
    },
    gallery: {
      eyebrow: 'Galerie de modèles',
      title: 'Des bases sélectionnées, sans l’interface du tableau de bord',
      description:
        'Cette galerie marketing publique utilise les mêmes en-tête et pied de page que l’accueil. Ses cartes reposent sur le véritable catalogue de modèles E-Code.',
    },
    searchLabel: 'Rechercher des modèles',
    searchPlaceholder: 'Rechercher un modèle, une technologie ou une étiquette…',
    clearSearch: 'Effacer la recherche',
    tagFilterLabel: 'Filtrer les modèles par étiquette',
    all: 'Tous',
    noQueryMatchPrefix: 'Aucun modèle ne correspond à « ',
    noQueryMatchSuffix: ' »',
    noTagMatch: 'Aucun modèle ne correspond à cette étiquette',
    noMatchDescription:
      'Essayez une autre recherche ou une autre étiquette, ou effacez les filtres pour parcourir tout le catalogue.',
    clearFilters: 'Effacer les filtres',
    matchSingular: 'modèle correspond',
    matchPlural: 'modèles correspondent',
    matchSuffix: 'à vos filtres.',
    foundations: {
      eyebrow: 'De vraies bases de projet',
      title: 'Les modèles restent publics. Les espaces de travail restent privés.',
      description:
        'Les visiteurs consultent une page marketing. Les personnes connectées poursuivent dans l’IDE, où l’authentification, les fichiers, le terminal, l’aperçu et le déploiement restent ceux du vrai produit.',
      imageAlt: 'IDE E-Code avec arborescence, éditeur et aperçu en direct',
      imageCaption: 'L’IDE E-Code préservé dans lequel s’ouvre votre modèle.',
      assurances: [
        ['Un vrai catalogue', 'Les cartes proviennent des modèles E-Code existants.'],
        ['Aucun menu utilisateur', 'Les pages publiques n’affichent pas les menus de compte.'],
        ['La même structure', 'L’en-tête et le pied de page correspondent aux routes marketing.'],
      ],
    },
    more: {
      eyebrow: 'Autres modèles',
      title: 'Encore plus de façons de démarrer',
      description: 'D’autres bases pour les applications web et mobiles, agents IA, tableaux de bord et API.',
    },
    cta: {
      title: 'Prêt à transformer un modèle en véritable projet ?',
      description: 'Ouvrez une base, gardez le code généré facile à réviser et poursuivez dans l’IDE E-Code préservé.',
      primary: 'Commencer à créer',
      secondary: 'Voir les tarifs',
    },
    card: {
      trending: 'Tendance',
      official: 'Officiel',
      free: 'Gratuit',
      ideReady: 'Prêt pour l’IDE',
      useTemplate: 'Utiliser ce modèle',
      difficulty: { easy: 'Facile', medium: 'Intermédiaire', hard: 'Difficile' },
    },
  },
  community: {
    hero: {
      eyebrow: 'Communauté',
      title: 'Échangez avec des personnes qui publient de vrais projets E-Code',
      description:
        'Lisez les discussions publiques, rejoignez des défis, suivez les contributeurs et découvrez les pratiques qui permettent de passer du prompt à la production.',
      primary: 'Lancer une discussion',
      secondary: 'Découvrir les publications',
      metrics: ['Discussions publiques', 'Défis actifs', 'Programmes à venir'],
    },
    pillars: [
      {
        id: 'help',
        title: 'Aide au lancement',
        body: 'Demandez une revue d’architecture, des contrôles de déploiement et des conseils pour renforcer un modèle.',
      },
      {
        id: 'showcases',
        title: 'Vitrines publiques',
        body: 'Découvrez des projets et leurs notes d’implémentation sans ouvrir d’espace privé.',
      },
      {
        id: 'challenges',
        title: 'Défis',
        body: 'Participez à des créations guidées pour les agents, applications mobiles, tableaux de bord et services applicatifs de production.',
      },
    ],
    feed: {
      eyebrow: 'Fil de la communauté',
      title: 'Discussions, présentations et aide à l’implémentation',
      description:
        'Parcourez les publications avec l’en-tête et le pied de page marketing d’E-Code. Répondre, aimer, enregistrer ou publier nécessite une connexion et vous ramène au parcours Communauté.',
    },
    searchLabel: 'Rechercher dans la communauté',
    searchPlaceholder: 'Rechercher une discussion, une étiquette ou un profil…',
    newPost: 'Nouvelle publication',
    categoryLabel: 'Catégories de la communauté',
    emptyTitle: 'Aucune discussion publique trouvée',
    emptyDescription: 'Essayez une autre recherche ou ouvrez un nouveau fil après vous être connecté.',
    startDiscussion: 'Lancer une discussion',
    activeChallenges: 'Défis actifs',
    joinChallenge: 'Rejoindre un défi',
    topContributors: 'Principaux contributeurs',
    events: {
      eyebrow: 'Événements et programmes',
      title: 'Rejoignez le réseau public des créateurs.',
      description:
        'Le contenu de la communauté reste accessible à tous. La participation, les fichiers privés et les contrôles de l’espace restent dans le parcours produit authentifié.',
      imageAlt: 'Tableau de bord E-Code présentant de vrais espaces de travail et l’état des déploiements',
      imageCaption: 'Le tableau de bord que vous rejoignez après vous être connecté.',
      register: 'Manifester mon intérêt',
    },
    cta: {
      title: 'Rejoignez la conversation sans ouvrir le tableau de bord.',
      description:
        'Connectez-vous uniquement pour publier, répondre, enregistrer, rejoindre un défi ou créer un projet. La consultation publique reste sur le site marketing.',
      primary: 'Rejoindre la communauté',
      secondary: 'Parcourir les modèles',
    },
    post: {
      by: 'par',
      like: 'J’aime',
      discuss: 'Discuter',
      save: 'Enregistrer',
      read: 'Lire la discussion',
      reply: 'Répondre',
    },
    challenge: {
      guidedBuild: 'Création guidée',
      openToMembers: 'Ouvert à tous les membres',
      participate: 'Participer',
      difficulty: { easy: 'Facile', medium: 'Intermédiaire', hard: 'Difficile' },
    },
  },
} as const satisfies PublicResourceCopy;

export const marketingPublicResourceCatalog = {
  en: marketingPublicResourceEn,
  fr: marketingPublicResourceFr,
} as const satisfies Record<MarketingLanguage, PublicResourceCopy>;

export function getMarketingPublicResourceCopy(language?: string | null): PublicResourceCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingPublicResourceFr : marketingPublicResourceEn;
}
