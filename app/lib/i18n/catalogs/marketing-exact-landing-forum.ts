import { resolveMarketingLanguage } from './marketing';

export type LandingExampleId = 'ecommerce' | 'chat' | 'chatbot' | 'dashboard' | 'saas' | 'project';
export type LandingAssuranceId = 'payment' | 'deploy' | 'scale';
export type ForumCategoryId = 'announcements' | 'support' | 'showcase' | 'features';
export type ForumGuidelineId = 'kindness' | 'topic' | 'search' | 'share';
export type ForumStatId = 'members' | 'posts' | 'solutions';

type CountCopy = Readonly<{ one: string; other: string }>;

interface MarketingExactLandingForumCopy {
  exactLanding: {
    seo: { title: string; description: string; imageAlt: string };
    toast: {
      continueTitle: string;
      continueDescription: string;
      setupTitle: string;
      setupDesignDescription: string;
      setupFullDescription: string;
      storageWarningTitle: string;
      storageWarningDescription: string;
    };
    hero: {
      badge: string;
      titleLineOne: string;
      titleLineTwo: string;
      titleLineThree: string;
      description: string;
      placeholder: string;
      buildNow: string;
      building: string;
      watchDemo: string;
      viewPricing: string;
      examplesTitle: string;
      examples: readonly { id: LandingExampleId; label: string; prompt: string }[];
      assurances: readonly { id: LandingAssuranceId; text: string }[];
    };
  };
  exactForum: {
    seo: { title: string; description: string; imageAlt: string };
    hero: { title: string; description: string; growingMembers: CountCopy };
    stats: { items: readonly { id: ForumStatId; label: string }[] };
    categories: {
      title: string;
      topics: CountCopy;
      posts: CountCopy;
      items: readonly { id: ForumCategoryId; title: string; description: string }[];
    };
    guidelines: {
      title: string;
      description: string;
      items: readonly { id: ForumGuidelineId; title: string; description: string }[];
    };
    cta: { title: string; description: string; button: string };
  };
}

export type ForumCountCopy = CountCopy;

export const marketingExactLandingForumEn = {
  exactLanding: {
    seo: {
      title: 'E-Code — Build, ship and scale apps with AI',
      description:
        'Create production-ready full-stack applications with AI agents, collaborate in real time and deploy with E-Code.',
      imageAlt: 'E-Code AI development platform',
    },
    toast: {
      continueTitle: 'Continue refining',
      continueDescription: 'Take your time to refine your app description.',
      setupTitle: 'Setting up your project…',
      setupDesignDescription: 'Opening the builder to create your design prototype.',
      setupFullDescription: 'Opening the builder to generate your full application.',
      storageWarningTitle: 'Project handoff is unavailable',
      storageWarningDescription:
        'The builder will still open, but your browser requires you to enter the app description again.',
    },
    hero: {
      badge: 'AI-powered enterprise development platform',
      titleLineOne: 'Build and deploy',
      titleLineTwo: 'production apps',
      titleLineThree: 'in minutes',
      description:
        'The only platform combining AI agents, cloud infrastructure and enterprise security to bring Fortune 500 development velocity to every team.',
      placeholder: 'Describe your app idea in any language…',
      buildNow: 'Build now',
      building: 'Opening the builder…',
      watchDemo: 'Watch demo ({duration})',
      viewPricing: 'View pricing',
      examplesTitle: 'Try these popular examples:',
      examples: [
        {
          id: 'ecommerce',
          label: 'E-commerce platform',
          prompt:
            'Build a full-stack e-commerce marketplace with Stripe payments, a product catalog with search and filters, a shopping cart and checkout flow, user authentication, and an order management dashboard',
        },
        {
          id: 'chat',
          label: 'Real-time chat',
          prompt:
            'Create a Slack-like real-time messaging platform with WebSocket connections, public and private channels, direct messages, file sharing, and typing indicators',
        },
        {
          id: 'chatbot',
          label: 'AI assistant',
          prompt:
            'Build an intelligent AI chatbot with OpenAI GPT-5 integration, conversation memory, document uploads for a RAG knowledge base, and streaming responses',
        },
        {
          id: 'dashboard',
          label: 'Analytics dashboard',
          prompt:
            'Design a Fortune 500-grade analytics dashboard with real-time interactive charts, KPI widgets, filterable data tables, and a date range picker',
        },
        {
          id: 'saas',
          label: 'SaaS starter',
          prompt:
            'Create a complete SaaS starter kit with a landing page, pricing tiers, Stripe subscription billing, user authentication, and team management',
        },
        {
          id: 'project',
          label: 'Project management',
          prompt:
            'Build a Jira-like project management tool with drag-and-drop Kanban boards, sprint planning, task assignments, and time tracking',
        },
      ],
      assurances: [
        { id: 'payment', text: 'No credit card required' },
        { id: 'deploy', text: 'Deploy instantly' },
        { id: 'scale', text: 'Scale to millions' },
      ],
    },
  },
  exactForum: {
    seo: {
      title: 'Community Forum — E-Code',
      description: 'Get help, share projects and help shape E-Code in the community forum.',
      imageAlt: 'The E-Code community forum',
    },
    hero: {
      title: 'Join the E-Code community',
      description:
        'Get help, share what you build and shape the future of E-Code with thousands of developers around the world.',
      growingMembers: {
        one: '{count} member and growing',
        other: '{count} members and growing',
      },
    },
    stats: {
      items: [
        { id: 'members', label: 'Members' },
        { id: 'posts', label: 'Posts' },
        { id: 'solutions', label: 'Solutions' },
      ],
    },
    categories: {
      title: 'Browse categories',
      topics: { one: '{count} topic', other: '{count} topics' },
      posts: { one: '{count} post', other: '{count} posts' },
      items: [
        {
          id: 'announcements',
          title: 'Announcements',
          description: 'Product updates, release notes and news straight from the E-Code team.',
        },
        {
          id: 'support',
          title: 'Help and support',
          description: 'Stuck on a build? Ask a question and get answers from the community.',
        },
        {
          id: 'showcase',
          title: 'Showcase',
          description: 'Share the apps you built with E-Code and get feedback from your peers.',
        },
        {
          id: 'features',
          title: 'Feature requests',
          description: 'Tell us what to build next and vote on ideas from the community.',
        },
      ],
    },
    guidelines: {
      title: 'Community guidelines',
      description:
        'The forum works best when everyone helps keep it welcoming. A few simple rules keep conversations useful for every builder.',
      items: [
        {
          id: 'kindness',
          title: 'Be kind and respectful',
          description: 'Treat everyone with respect. No harassment, hate speech or personal attacks.',
        },
        {
          id: 'topic',
          title: 'Stay on topic',
          description: 'Post in the right category and keep threads focused so others can find answers.',
        },
        {
          id: 'search',
          title: 'Search before posting',
          description: 'Your question may already be answered. A quick search keeps the forum tidy.',
        },
        {
          id: 'share',
          title: 'Share what you learn',
          description: 'Mark helpful replies as solutions and pay it forward to the next builder.',
        },
      ],
    },
    cta: {
      title: 'Ready to jump in?',
      description:
        'Create an account, introduce yourself and start your first thread. The community is ready to help you ship.',
      button: 'Join the forum',
    },
  },
} as const satisfies MarketingExactLandingForumCopy;

export const marketingExactLandingForumFr = {
  exactLanding: {
    seo: {
      title: 'E-Code — Créez, déployez et faites évoluer vos applications avec l’IA',
      description:
        'Créez des applications complètes prêtes pour la production avec des agents IA, collaborez en temps réel et déployez-les avec E-Code.',
      imageAlt: 'Plateforme de développement E-Code propulsée par l’IA',
    },
    toast: {
      continueTitle: 'Continuez à préciser votre idée',
      continueDescription: 'Prenez le temps d’affiner la description de votre application.',
      setupTitle: 'Préparation de votre projet…',
      setupDesignDescription: 'Ouverture de l’outil pour créer votre prototype de design.',
      setupFullDescription: 'Ouverture de l’outil pour générer votre application complète.',
      storageWarningTitle: 'Le transfert du projet est indisponible',
      storageWarningDescription:
        'L’outil de création va tout de même s’ouvrir, mais votre navigateur vous demandera de saisir à nouveau la description de l’application.',
    },
    hero: {
      badge: 'Plateforme de développement d’entreprise propulsée par l’IA',
      titleLineOne: 'Créez et déployez',
      titleLineTwo: 'des applications de production',
      titleLineThree: 'en quelques minutes',
      description:
        'La seule plateforme qui réunit agents IA, infrastructure cloud et sécurité d’entreprise pour offrir à chaque équipe la vélocité des entreprises du Fortune 500.',
      placeholder: 'Décrivez votre idée d’application dans la langue de votre choix…',
      buildNow: 'Créer maintenant',
      building: 'Ouverture de l’outil de création…',
      watchDemo: 'Voir la démo ({duration})',
      viewPricing: 'Voir les tarifs',
      examplesTitle: 'Essayez l’un de ces exemples :',
      examples: [
        {
          id: 'ecommerce',
          label: 'Plateforme e-commerce',
          prompt:
            'Créez une place de marché e-commerce complète avec paiements Stripe, catalogue de produits avec recherche et filtres, panier et parcours de paiement, authentification des utilisateurs et tableau de bord de gestion des commandes',
        },
        {
          id: 'chat',
          label: 'Chat en temps réel',
          prompt:
            'Créez une plateforme de messagerie en temps réel inspirée de Slack avec connexions WebSocket, canaux publics et privés, messages directs, partage de fichiers et indicateurs de saisie',
        },
        {
          id: 'chatbot',
          label: 'Assistant IA',
          prompt:
            'Créez un agent conversationnel IA intelligent intégrant OpenAI GPT-5, avec mémoire des conversations, import de documents pour une base de connaissances RAG et réponses diffusées en continu',
        },
        {
          id: 'dashboard',
          label: 'Tableau de bord analytique',
          prompt:
            'Concevez un tableau de bord analytique de niveau Fortune 500 avec graphiques interactifs en temps réel, widgets KPI, tableaux de données filtrables et sélecteur de plage de dates',
        },
        {
          id: 'saas',
          label: 'Kit de démarrage SaaS',
          prompt:
            'Créez un kit de démarrage SaaS complet avec page d’accueil, formules tarifaires, facturation des abonnements Stripe, authentification des utilisateurs et gestion des équipes',
        },
        {
          id: 'project',
          label: 'Gestion de projet',
          prompt:
            'Créez un outil de gestion de projet inspiré de Jira avec tableaux Kanban par glisser-déposer, planification des sprints, attribution des tâches et suivi du temps',
        },
      ],
      assurances: [
        { id: 'payment', text: 'Aucune carte bancaire requise' },
        { id: 'deploy', text: 'Déploiement instantané' },
        { id: 'scale', text: 'Évolutif jusqu’à des millions d’utilisateurs' },
      ],
    },
  },
  exactForum: {
    seo: {
      title: 'Forum de la communauté — E-Code',
      description: 'Obtenez de l’aide, partagez vos projets et contribuez à l’évolution d’E-Code sur le forum.',
      imageAlt: 'Forum de la communauté E-Code',
    },
    hero: {
      title: 'Rejoignez la communauté E-Code',
      description:
        'Obtenez de l’aide, partagez vos créations et contribuez à l’avenir d’E-Code avec des milliers de développeurs du monde entier.',
      growingMembers: {
        one: '{count} membre et une communauté qui grandit',
        other: '{count} membres et une communauté qui grandit',
      },
    },
    stats: {
      items: [
        { id: 'members', label: 'Membres' },
        { id: 'posts', label: 'Publications' },
        { id: 'solutions', label: 'Solutions' },
      ],
    },
    categories: {
      title: 'Parcourir les catégories',
      topics: { one: '{count} sujet', other: '{count} sujets' },
      posts: { one: '{count} publication', other: '{count} publications' },
      items: [
        {
          id: 'announcements',
          title: 'Annonces',
          description: 'Actualités du produit, notes de version et nouvelles publiées par l’équipe E-Code.',
        },
        {
          id: 'support',
          title: 'Aide et assistance',
          description: 'Une difficulté pendant la création ? Posez votre question et obtenez l’aide de la communauté.',
        },
        {
          id: 'showcase',
          title: 'Réalisations',
          description: 'Partagez les applications créées avec E-Code et recueillez l’avis de vos pairs.',
        },
        {
          id: 'features',
          title: 'Suggestions de fonctionnalités',
          description: 'Dites-nous quoi créer ensuite et votez pour les idées proposées par la communauté.',
        },
      ],
    },
    guidelines: {
      title: 'Règles de la communauté',
      description:
        'Le forum est plus utile lorsque chacun contribue à son accueil. Quelques règles simples permettent de garder des échanges constructifs pour tous.',
      items: [
        {
          id: 'kindness',
          title: 'Faites preuve de bienveillance et de respect',
          description:
            'Respectez chaque personne. Le harcèlement, les propos haineux et les attaques personnelles sont interdits.',
        },
        {
          id: 'topic',
          title: 'Restez dans le sujet',
          description:
            'Publiez dans la bonne catégorie et gardez les discussions ciblées pour faciliter la recherche de réponses.',
        },
        {
          id: 'search',
          title: 'Recherchez avant de publier',
          description:
            'Votre question a peut-être déjà une réponse. Une recherche rapide aide à garder le forum clair.',
        },
        {
          id: 'share',
          title: 'Partagez ce que vous apprenez',
          description:
            'Marquez les réponses utiles comme solutions et transmettez à votre tour ce que vous avez appris.',
        },
      ],
    },
    cta: {
      title: 'Vous souhaitez participer ?',
      description:
        'Créez un compte, présentez-vous et lancez votre première discussion. La communauté est prête à vous aider à publier votre projet.',
      button: 'Rejoindre le forum',
    },
  },
} as const satisfies MarketingExactLandingForumCopy;

export function getMarketingExactLandingForumCopy(language?: string | null): MarketingExactLandingForumCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactLandingForumFr : marketingExactLandingForumEn;
}

function intlLocale(language?: string | null): string {
  return resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
}

function interpolate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? '');
}

export function formatLandingDemoLabel(template: string, minutes: number, language?: string | null): string {
  const duration = new Intl.NumberFormat(intlLocale(language), {
    style: 'unit',
    unit: 'minute',
    unitDisplay: 'short',
  }).format(minutes);

  return interpolate(template, { duration });
}

export function formatForumCount(
  count: number,
  forms: ForumCountCopy,
  language?: string | null,
  notation: 'standard' | 'compact' = 'compact',
): string {
  const locale = intlLocale(language);
  const pluralCategory = new Intl.PluralRules(locale).select(count);
  const template = pluralCategory === 'one' ? forms.one : forms.other;

  const formattedCount = new Intl.NumberFormat(locale, {
    notation,
    maximumFractionDigits: notation === 'compact' ? 1 : 0,
  }).format(count);

  return interpolate(template, { count: formattedCount });
}

export function formatForumStat(
  count: number,
  language?: string | null,
  notation: 'standard' | 'compact' = 'compact',
): string {
  return `${new Intl.NumberFormat(intlLocale(language), {
    notation,
    maximumFractionDigits: notation === 'compact' ? 1 : 0,
  }).format(count)}+`;
}
