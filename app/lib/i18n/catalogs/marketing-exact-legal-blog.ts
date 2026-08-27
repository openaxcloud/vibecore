import { resolveMarketingLanguage } from './marketing';

export type ExactLegalPageKey =
  | 'legal'
  | 'terms'
  | 'privacy'
  | 'subprocessors'
  | 'dpa'
  | 'student-dpa'
  | 'security'
  | 'report-abuse';

export type ExactBlogCategoryId =
  | 'All'
  | 'Product'
  | 'AI Agent'
  | 'Deployments'
  | 'Pricing'
  | 'Collaboration'
  | 'Engineering';

export type ExactBlogPostId =
  | 'parallel-agents'
  | 'zero-config-deployments'
  | 'effort-pricing'
  | 'multiplayer-editing'
  | 'agent-streaming'
  | 'self-repair';

export interface ExactLegalPageCopy {
  label: string;
  title: string;
  description: string;
  imageAlt: string;
}

interface MarketingExactLegalBlogCopy {
  exactLegalRegistry: {
    pages: Readonly<Record<ExactLegalPageKey, ExactLegalPageCopy>>;
  };
  exactBlog: {
    seo: { title: string; description: string; imageAlt: string };
    hero: { title: string; description: string; badge: string };
    categoryNavigationLabel: string;
    categories: readonly { id: ExactBlogCategoryId; label: string }[];
    featured: {
      heading: string;
      category: string;
      title: string;
      excerpt: string;
      windowLabel: string;
      imageAlt: string;
    };
    articles: {
      heading: string;
      author: string;
      readMore: string;
      empty: string;
      posts: readonly {
        id: ExactBlogPostId;
        category: string;
        title: string;
        excerpt: string;
      }[];
    };
    cta: {
      title: string;
      description: string;
      dashboard: string;
      getStarted: string;
      exploreFeatures: string;
    };
  };
}

export const marketingExactLegalBlogEn = {
  exactLegalRegistry: {
    pages: {
      legal: {
        label: 'Legal',
        title: 'Legal',
        description:
          'Review E-Code legal policies, agreements, data processing terms, security resources and abuse reporting.',
        imageAlt: 'E-Code legal policies and agreements',
      },
      terms: {
        label: 'Terms',
        title: 'Terms of Service',
        description: 'Read the terms governing access to and use of E-Code services.',
        imageAlt: 'E-Code Terms of Service',
      },
      privacy: {
        label: 'Privacy',
        title: 'Privacy Policy',
        description: 'Learn how E-Code collects, uses, protects and manages personal data.',
        imageAlt: 'E-Code Privacy Policy',
      },
      subprocessors: {
        label: 'Subprocessors',
        title: 'Subprocessors',
        description: 'Review E-Code subprocessors, vendor categories, locations, purposes and compliance coverage.',
        imageAlt: 'E-Code subprocessor register',
      },
      dpa: {
        label: 'DPA',
        title: 'Data Processing Addendum',
        description: 'Review E-Code data processing terms for customers that require a DPA.',
        imageAlt: 'E-Code Data Processing Addendum',
      },
      'student-dpa': {
        label: 'US Student DPA',
        title: 'US Student Data Processing Addendum',
        description:
          'Review E-Code protections for student privacy and education data processing in the United States.',
        imageAlt: 'E-Code US Student Data Processing Addendum',
      },
      security: {
        label: 'Security',
        title: 'Security',
        description:
          'Explore E-Code security controls, compliance posture, infrastructure safeguards and incident response.',
        imageAlt: 'E-Code enterprise security controls',
      },
      'report-abuse': {
        label: 'Report abuse',
        title: 'Report abuse',
        description: 'Report malicious code, privacy violations, spam, harassment or unsafe content on E-Code.',
        imageAlt: 'E-Code abuse reporting form',
      },
    },
  },
  exactBlog: {
    seo: {
      title: 'Blog — E-Code',
      description: 'Read E-Code product updates, engineering deep dives and perspectives on AI-native development.',
      imageAlt: 'The E-Code product and engineering blog',
    },
    hero: {
      title: 'The E-Code blog',
      description: 'Product updates, engineering deep dives and the future of AI-native software development.',
      badge: 'Building in the open',
    },
    categoryNavigationLabel: 'Filter articles by category',
    categories: [
      { id: 'All', label: 'All' },
      { id: 'Product', label: 'Product' },
      { id: 'AI Agent', label: 'AI Agent' },
      { id: 'Deployments', label: 'Deployments' },
      { id: 'Pricing', label: 'Pricing' },
      { id: 'Collaboration', label: 'Collaboration' },
      { id: 'Engineering', label: 'Engineering' },
    ],
    featured: {
      heading: 'Featured',
      category: 'Product',
      title: 'Introducing the E-Code Agent: from prompt to production in one flow',
      excerpt:
        'Our autonomous coding agent plans, writes, runs and previews your application end to end. Describe what you want in plain language, watch a full-stack project come to life in the IDE and publish it to a live URL with one click.',
      windowLabel: 'E-Code workspace',
      imageAlt: 'The E-Code IDE showing the AI Agent, code editor, file tree and live preview in one workspace',
    },
    articles: {
      heading: 'Latest posts',
      author: 'E-Code team',
      readMore: 'Read more',
      empty: 'No posts in this category yet.',
      posts: [
        {
          id: 'parallel-agents',
          category: 'AI Agent',
          title: 'How parallel sub-agents reach consensus on your code',
          excerpt:
            'A look under the hood at how E-Code fans a task out to multiple sub-agents, compares their proposals and merges them into one high-confidence change.',
        },
        {
          id: 'zero-config-deployments',
          category: 'Deployments',
          title: 'Zero-config deployments: static and full-stack, instantly',
          excerpt:
            'Publish from chat to a live URL with no YAML. See how E-Code snapshots your build and serves it on managed infrastructure.',
        },
        {
          id: 'effort-pricing',
          category: 'Pricing',
          title: 'Effort-based pricing: pay for outcomes, not idle seats',
          excerpt:
            'Why we moved from flat per-seat plans to billing that reflects the compute and agent effort your projects actually use.',
        },
        {
          id: 'multiplayer-editing',
          category: 'Collaboration',
          title: 'Real-time multiplayer editing comes to the E-Code IDE',
          excerpt:
            'Presence, shared cursors and live agent activity let your whole team build in one workspace without stepping on each other.',
        },
        {
          id: 'agent-streaming',
          category: 'Engineering',
          title: 'Streaming the agent: how we render thinking in real time',
          excerpt:
            'Explore the SSE pipeline behind per-lane streaming output, our backpressure techniques and how we keep the editor responsive under load.',
        },
        {
          id: 'self-repair',
          category: 'Product',
          title: 'Self-repair: when the agent fixes its own mistakes',
          excerpt:
            'E-Code detects failed builds and broken previews, then retries with a corrected plan to turn dead ends into shipped features.',
        },
      ],
    },
    cta: {
      title: 'Stop reading, start building',
      description: 'Describe your idea in plain language and let the E-Code Agent build, run and ship it for you.',
      dashboard: 'Open dashboard',
      getStarted: 'Get started free',
      exploreFeatures: 'Explore features',
    },
  },
} as const satisfies MarketingExactLegalBlogCopy;

export const marketingExactLegalBlogFr = {
  exactLegalRegistry: {
    pages: {
      legal: {
        label: 'Juridique',
        title: 'Informations juridiques',
        description:
          'Consultez les politiques, accords, conditions de traitement des données, ressources de sécurité et procédures de signalement d’E-Code.',
        imageAlt: 'Politiques et accords juridiques d’E-Code',
      },
      terms: {
        label: 'Conditions',
        title: 'Conditions d’utilisation',
        description: 'Consultez les conditions qui régissent l’accès aux services E-Code et leur utilisation.',
        imageAlt: 'Conditions d’utilisation d’E-Code',
      },
      privacy: {
        label: 'Confidentialité',
        title: 'Politique de confidentialité',
        description: 'Découvrez comment E-Code collecte, utilise, protège et gère les données personnelles.',
        imageAlt: 'Politique de confidentialité d’E-Code',
      },
      subprocessors: {
        label: 'Sous-traitants ultérieurs',
        title: 'Sous-traitants ultérieurs',
        description:
          'Consultez les sous-traitants d’E-Code, leurs catégories, leurs implantations, leurs finalités et leur couverture de conformité.',
        imageAlt: 'Registre des sous-traitants ultérieurs d’E-Code',
      },
      dpa: {
        label: 'DPA',
        title: 'Accord de traitement des données',
        description: 'Consultez les conditions de traitement des données d’E-Code pour les clients qui exigent un DPA.',
        imageAlt: 'Accord de traitement des données d’E-Code',
      },
      'student-dpa': {
        label: 'DPA élèves — États-Unis',
        title: 'Accord américain de traitement des données des élèves',
        description:
          'Consultez les protections E-Code relatives à la vie privée des élèves et au traitement des données éducatives aux États-Unis.',
        imageAlt: 'Accord américain E-Code de traitement des données des élèves',
      },
      security: {
        label: 'Sécurité',
        title: 'Sécurité',
        description:
          'Découvrez les contrôles de sécurité, la posture de conformité, les protections d’infrastructure et la réponse aux incidents d’E-Code.',
        imageAlt: 'Contrôles de sécurité d’entreprise E-Code',
      },
      'report-abuse': {
        label: 'Signaler un abus',
        title: 'Signaler un abus',
        description:
          'Signalez tout code malveillant, atteinte à la vie privée, spam, harcèlement ou contenu dangereux sur E-Code.',
        imageAlt: 'Formulaire E-Code de signalement d’un abus',
      },
    },
  },
  exactBlog: {
    seo: {
      title: 'Blog — E-Code',
      description:
        'Découvrez les actualités produit d’E-Code, nos analyses techniques et nos perspectives sur le développement natif avec l’IA.',
      imageAlt: 'Blog produit et ingénierie d’E-Code',
    },
    hero: {
      title: 'Le blog E-Code',
      description:
        'Actualités produit, analyses techniques approfondies et perspectives sur l’avenir du développement logiciel natif avec l’IA.',
      badge: 'Nous construisons au grand jour',
    },
    categoryNavigationLabel: 'Filtrer les articles par catégorie',
    categories: [
      { id: 'All', label: 'Tous les articles' },
      { id: 'Product', label: 'Produit' },
      { id: 'AI Agent', label: 'Agent IA' },
      { id: 'Deployments', label: 'Déploiements' },
      { id: 'Pricing', label: 'Tarifs' },
      { id: 'Collaboration', label: 'Collaboration' },
      { id: 'Engineering', label: 'Ingénierie' },
    ],
    featured: {
      heading: 'À la une',
      category: 'Produit',
      title: 'Découvrez l’Agent E-Code : du prompt à la production dans un même processus',
      excerpt:
        'Notre agent de code autonome planifie, écrit, exécute et prévisualise votre application de bout en bout. Décrivez votre besoin en langage naturel, regardez une application complète prendre vie dans l’IDE, puis publiez-la sur une URL en un clic.',
      windowLabel: 'Espace de travail E-Code',
      imageAlt:
        'IDE E-Code réunissant l’Agent IA, l’éditeur de code, l’arborescence des fichiers et l’aperçu en direct',
    },
    articles: {
      heading: 'Derniers articles',
      author: 'Équipe E-Code',
      readMore: 'Lire la suite',
      empty: 'Aucun article dans cette catégorie pour le moment.',
      posts: [
        {
          id: 'parallel-agents',
          category: 'Agent IA',
          title: 'Comment des sous-agents parallèles parviennent à un consensus sur votre code',
          excerpt:
            'Découvrez comment E-Code répartit une tâche entre plusieurs sous-agents, compare leurs propositions et les fusionne en une modification unique à haut niveau de confiance.',
        },
        {
          id: 'zero-config-deployments',
          category: 'Déploiements',
          title: 'Déploiements sans configuration : sites statiques ou applications complètes, instantanément',
          excerpt:
            'Publiez depuis le chat vers une URL active, sans YAML. Découvrez comment E-Code capture votre compilation et la sert sur une infrastructure administrée.',
        },
        {
          id: 'effort-pricing',
          category: 'Tarifs',
          title: 'Tarification fondée sur l’effort : payez pour les résultats, pas pour des sièges inactifs',
          excerpt:
            'Pourquoi nous avons remplacé les forfaits fixes par siège par une facturation qui reflète le calcul et l’effort des agents réellement mobilisés par vos projets.',
        },
        {
          id: 'multiplayer-editing',
          category: 'Collaboration',
          title: 'L’édition multijoueur en temps réel arrive dans l’IDE E-Code',
          excerpt:
            'Présence, curseurs partagés et activité en direct des agents permettent à toute votre équipe de créer dans le même espace de travail sans se gêner.',
        },
        {
          id: 'agent-streaming',
          category: 'Ingénierie',
          title: 'Diffusion de l’agent : comment nous affichons son raisonnement en temps réel',
          excerpt:
            'Découvrez la chaîne de traitement SSE qui alimente la diffusion en continu, nos techniques de régulation de charge et la façon dont l’éditeur reste réactif sous charge.',
        },
        {
          id: 'self-repair',
          category: 'Produit',
          title: 'Autoréparation : quand l’agent corrige ses propres erreurs',
          excerpt:
            'E-Code détecte les compilations en échec et les aperçus défectueux, puis réessaie avec un plan corrigé pour transformer les impasses en fonctionnalités publiées.',
        },
      ],
    },
    cta: {
      title: 'Passez de la lecture à la création',
      description:
        'Décrivez votre idée en langage naturel et laissez l’Agent E-Code la créer, l’exécuter et la publier pour vous.',
      dashboard: 'Ouvrir le tableau de bord',
      getStarted: 'Commencer gratuitement',
      exploreFeatures: 'Découvrir les fonctionnalités',
    },
  },
} as const satisfies MarketingExactLegalBlogCopy;

export function getMarketingExactLegalBlogCopy(language?: string | null): MarketingExactLegalBlogCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactLegalBlogFr : marketingExactLegalBlogEn;
}

export function formatExactBlogDate(date: string | Date, language?: string | null): string {
  const value = date instanceof Date ? date : new Date(`${date}T00:00:00.000Z`);

  return new Intl.DateTimeFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value);
}
