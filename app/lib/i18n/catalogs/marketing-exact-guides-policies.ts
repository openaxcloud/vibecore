import { resolveMarketingLanguage } from './marketing';

export type PolicyLinkId =
  | 'privacy'
  | 'privacyEmail'
  | 'terms'
  | 'acceptableUse'
  | 'appealsEmail'
  | 'reportAbuse'
  | 'abuseEmail';

export type PolicyRichTextSegment =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'link'; text: string; link: PolicyLinkId };

export type PolicyRichText = readonly PolicyRichTextSegment[];

export interface PolicySectionCopy {
  id: string;
  title: string;
  paragraphs: readonly PolicyRichText[];
  closingParagraphs?: readonly PolicyRichText[];
  orderedItems?: readonly PolicyRichText[];
  unorderedItems?: readonly PolicyRichText[];
}

export interface PolicyPageCopy {
  title: string;
  lastUpdatedLabel: string;
  intro: PolicyRichText;
  sections: readonly PolicySectionCopy[];
}

export type TutorialLevelId = 'beginner' | 'intermediate' | 'advanced';
export type TutorialId = 'agent' | 'deploy' | 'database' | 'collaboration' | 'terminal' | 'git';
export type LearningPathId = 'idea' | 'fullStack' | 'team';

interface MarketingExactGuidesPoliciesCopy {
  policyContacts: {
    dataDeletionEmail: string;
    appealsEmail: string;
    abuseEmail: string;
  };
  exactDataDeletion: PolicyPageCopy & {
    seo: { title: string; description: string; imageAlt: string };
  };
  exactEnforcement: PolicyPageCopy & {
    seo: { title: string; description: string; imageAlt: string };
  };
  exactTutorials: {
    seo: { title: string; description: string; imageAlt: string };
    hero: { title: string; description: string; badge: string };
    figure: { workspaceLabel: string; imageAlt: string; caption: string };
    tutorials: {
      title: string;
      levels: Record<TutorialLevelId, string>;
      items: readonly {
        id: TutorialId;
        title: string;
        level: TutorialLevelId;
        description: string;
      }[];
    };
    paths: {
      title: string;
      description: string;
      items: readonly {
        id: LearningPathId;
        title: string;
        description: string;
        steps: readonly string[];
      }[];
    };
    cta: { title: string; description: string; primary: string; secondary: string };
  };
}

export const marketingExactGuidesPoliciesEn = {
  policyContacts: {
    dataDeletionEmail: 'privacy@e-code.ai',
    appealsEmail: 'appeals@e-code.ai',
    abuseEmail: 'abuse@e-code.ai',
  },
  exactDataDeletion: {
    seo: {
      title: 'Deleting Your Data — E-Code',
      description: 'Learn how to delete E-Code projects or your account, what is removed and how retention works.',
      imageAlt: 'E-Code project, account and personal data deletion guidance',
    },
    title: 'Deleting Your Data',
    lastUpdatedLabel: 'Last updated:',
    intro: [
      {
        kind: 'text',
        text: 'You own your content and can delete it at any time. This page explains how to delete individual projects, how to delete your entire account, what gets removed, and how to make a deletion request. For how we handle personal data generally, see our ',
      },
      { kind: 'link', text: 'Privacy Policy', link: 'privacy' },
      { kind: 'text', text: '.' },
    ],
    sections: [
      {
        id: 'project',
        title: 'Deleting a single project',
        paragraphs: [
          [
            { kind: 'text', text: 'Open the project, go to its settings, and choose ' },
            { kind: 'strong', text: 'Delete project' },
            {
              kind: 'text',
              text: ". This removes the project's files, deployments, and associated database. Deleting a project does not delete your account.",
            },
          ],
        ],
      },
      {
        id: 'account',
        title: 'Deleting your account',
        paragraphs: [[{ kind: 'text', text: 'To permanently delete your E-Code account and all associated content:' }]],
        orderedItems: [
          [
            { kind: 'text', text: 'Go to ' },
            { kind: 'strong', text: 'Settings → Account → Billing' },
            { kind: 'text', text: '.' },
          ],
          [
            { kind: 'text', text: 'Select ' },
            { kind: 'strong', text: 'Delete account' },
            { kind: 'text', text: ', then ' },
            { kind: 'strong', text: 'Request account deletion' },
            { kind: 'text', text: '.' },
          ],
          [{ kind: 'text', text: 'Confirm the request to start the deletion.' }],
        ],
      },
      {
        id: 'scope',
        title: 'What gets deleted',
        paragraphs: [[{ kind: 'text', text: 'Account deletion removes:' }]],
        closingParagraphs: [
          [
            { kind: 'text', text: 'Deletion is ' },
            { kind: 'strong', text: 'irreversible' },
            { kind: 'text', text: '. Export anything you want to keep before you confirm.' },
          ],
        ],
        unorderedItems: [
          [{ kind: 'text', text: 'All apps, templates, deployments, and stored files.' }],
          [{ kind: 'text', text: 'Databases and object-storage buckets attached to your projects.' }],
          [{ kind: 'text', text: 'Community posts and shared links you created.' }],
          [
            {
              kind: 'text',
              text: 'Personal information associated with the account, subject to the retention notes below.',
            },
          ],
        ],
      },
      {
        id: 'retention',
        title: 'Retention and exceptions',
        paragraphs: [
          [
            {
              kind: 'text',
              text: 'After deletion, content is purged from active systems. Limited records may be retained only where required to comply with legal obligations, resolve disputes, prevent fraud or abuse, or complete billing and tax accounting. Residual copies in encrypted backups are removed on our standard backup-rotation schedule.',
            },
          ],
        ],
      },
      {
        id: 'request',
        title: 'Requesting deletion or a data export',
        paragraphs: [
          [
            {
              kind: 'text',
              text: 'If you cannot access the in-product flow, you can request deletion or a copy of your data by emailing ',
            },
            { kind: 'link', text: 'privacy@e-code.ai', link: 'privacyEmail' },
            {
              kind: 'text',
              text: ' from the address on your account. We verify the request before acting on it.',
            },
          ],
        ],
      },
    ],
  },
  exactEnforcement: {
    seo: {
      title: 'Enforcement Policy — E-Code',
      description: 'Review how E-Code responds to policy violations, weighs enforcement actions and handles appeals.',
      imageAlt: 'E-Code enforcement actions, reports and appeals',
    },
    title: 'Enforcement Policy',
    lastUpdatedLabel: 'Last updated:',
    intro: [
      { kind: 'text', text: 'This policy explains how E-Code responds when an account violates our ' },
      { kind: 'link', text: 'Terms of Service', link: 'terms' },
      { kind: 'text', text: ', ' },
      { kind: 'link', text: 'Acceptable Use Policy', link: 'acceptableUse' },
      {
        kind: 'text',
        text: ', or community standards. Enforcement is outcome-based and proportionate to the severity and recurrence of the violation — we do not operate a fixed numeric “strike count.”',
      },
    ],
    sections: [
      {
        id: 'actions',
        title: 'Enforcement actions',
        paragraphs: [
          [
            {
              kind: 'text',
              text: 'Depending on severity, our Trust & Safety team may take one or more of the following actions:',
            },
          ],
        ],
        closingParagraphs: [
          [
            {
              kind: 'text',
              text: 'Egregious violations — such as hosting malware, CSAM, or active attacks — can result in immediate suspension without a prior warning.',
            },
          ],
        ],
        unorderedItems: [
          [
            { kind: 'strong', text: 'Warning.' },
            {
              kind: 'text',
              text: ' A notice that specific content or behavior violated our policies. We may unpublish or restrict the offending app while you correct the issue. Your workspace stays usable.',
            },
          ],
          [
            { kind: 'strong', text: 'Community restriction.' },
            {
              kind: 'text',
              text: ' You lose the ability to publish, share, or post apps publicly, but you can still use the IDE and your private projects.',
            },
          ],
          [
            { kind: 'strong', text: 'Account suspension.' },
            {
              kind: 'text',
              text: ' Sign-in is blocked and published apps are taken down. For severe or repeated violations, the account and its content may be permanently deleted.',
            },
          ],
        ],
      },
      {
        id: 'factors',
        title: 'Factors we weigh',
        paragraphs: [],
        unorderedItems: [
          [{ kind: 'text', text: 'Severity and real-world harm of the violation.' }],
          [{ kind: 'text', text: 'Whether the behavior is repeated or part of a pattern.' }],
          [{ kind: 'text', text: 'Whether it appears intentional or the result of a mistake.' }],
          [{ kind: 'text', text: 'Your response and willingness to remediate.' }],
        ],
      },
      {
        id: 'appeals',
        title: 'Appeals',
        paragraphs: [
          [
            {
              kind: 'text',
              text: 'If you believe an enforcement action was made in error, you may appeal by emailing ',
            },
            { kind: 'link', text: 'appeals@e-code.ai', link: 'appealsEmail' },
            {
              kind: 'text',
              text: '. Include your username, the action taken, and a clear explanation of why it should be reconsidered. We review appeals and respond with our decision.',
            },
          ],
        ],
      },
      {
        id: 'reporting',
        title: 'Reporting violations',
        paragraphs: [
          [
            { kind: 'text', text: 'To report content or behavior that violates our policies, use ' },
            { kind: 'link', text: 'Report Abuse', link: 'reportAbuse' },
            { kind: 'text', text: ' or email ' },
            { kind: 'link', text: 'abuse@e-code.ai', link: 'abuseEmail' },
            { kind: 'text', text: '. Copyright complaints are handled through our DMCA process.' },
          ],
        ],
      },
    ],
  },
  exactTutorials: {
    seo: {
      title: 'Tutorials — E-Code',
      description: 'Learn to build, deploy and collaborate with the E-Code AI agent through guided tutorials.',
      imageAlt: 'E-Code tutorials in the browser-based AI workspace',
    },
    hero: {
      title: 'Tutorials',
      description: 'Learn to build, deploy and collaborate with the AI agent — one short, hands-on lesson at a time.',
      badge: 'Step-by-step, no setup required',
    },
    figure: {
      workspaceLabel: 'E-Code Workspace',
      imageAlt:
        'The E-Code workspace used throughout the tutorials: the AI agent panel, code editor, file tree and live preview side by side',
      caption: 'Every lesson runs in the same browser-based workspace — no local setup required.',
    },
    tutorials: {
      title: 'Browse Tutorials',
      levels: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' },
      items: [
        {
          id: 'agent',
          title: 'Build a full-stack app with the AI agent',
          level: 'beginner',
          description:
            'Go from a single prompt to a working full-stack app while the AI agent writes, runs and fixes the code for you.',
        },
        {
          id: 'deploy',
          title: 'Deploy to production',
          level: 'beginner',
          description:
            'Ship your project to a live URL in one click and learn how custom domains and environment variables work.',
        },
        {
          id: 'database',
          title: 'Connect a database',
          level: 'intermediate',
          description:
            'Provision a Postgres database, model your schema and wire it into your app with type-safe queries.',
        },
        {
          id: 'collaboration',
          title: 'Real-time collaboration',
          level: 'intermediate',
          description:
            'Invite teammates into your workspace and edit, run and review code together with live presence.',
        },
        {
          id: 'terminal',
          title: 'Master the integrated terminal',
          level: 'intermediate',
          description:
            'Run scripts, manage processes and use the package manager inside your cloud workspace like a local shell.',
        },
        {
          id: 'git',
          title: 'Git workflows & GitHub sync',
          level: 'advanced',
          description:
            'Branch, commit and push from inside the editor, then connect a GitHub repo for two-way sync and pull requests.',
        },
      ],
    },
    paths: {
      title: 'Learning Paths',
      description:
        'Follow a guided sequence of tutorials to build a complete skill set, from your first prompt to shipping with a team.',
      items: [
        {
          id: 'idea',
          title: 'From Idea to App',
          description:
            'Start with nothing but a prompt and finish with a deployed product. Perfect for first-time builders.',
          steps: ['Build with the AI agent', 'Iterate on your design', 'Deploy to production'],
        },
        {
          id: 'fullStack',
          title: 'Full-Stack Foundations',
          description: 'Learn the core building blocks of a production app — data, APIs and authentication.',
          steps: ['Connect a database', 'Add an API layer', 'Secure with auth'],
        },
        {
          id: 'team',
          title: 'Ship as a Team',
          description: 'Collaborate, review and release together with the workflows real engineering teams rely on.',
          steps: ['Real-time collaboration', 'Git & GitHub sync', 'Production deploys'],
        },
      ],
    },
    cta: {
      title: 'Ready to start building?',
      description:
        'Open a workspace and let the AI agent turn your first idea into a running app in minutes — free to start, no credit card required.',
      primary: 'Get started free',
      secondary: 'Open dashboard',
    },
  },
} as const satisfies MarketingExactGuidesPoliciesCopy;

export const marketingExactGuidesPoliciesFr = {
  policyContacts: {
    dataDeletionEmail: 'privacy@e-code.ai',
    appealsEmail: 'appeals@e-code.ai',
    abuseEmail: 'abuse@e-code.ai',
  },
  exactDataDeletion: {
    seo: {
      title: 'Suppression de vos données — E-Code',
      description:
        'Découvrez comment supprimer vos projets ou votre compte E-Code, quelles données sont effacées et comment fonctionne leur conservation.',
      imageAlt: 'Procédure de suppression des projets, du compte et des données personnelles E-Code',
    },
    title: 'Suppression de vos données',
    lastUpdatedLabel: 'Dernière mise à jour :',
    intro: [
      {
        kind: 'text',
        text: 'Vous restez propriétaire de votre contenu et pouvez le supprimer à tout moment. Cette page explique comment supprimer un projet, votre compte dans son intégralité, les données concernées et la procédure à suivre pour présenter une demande. Pour savoir comment nous traitons les données personnelles en général, consultez notre ',
      },
      { kind: 'link', text: 'Politique de confidentialité', link: 'privacy' },
      { kind: 'text', text: '.' },
    ],
    sections: [
      {
        id: 'project',
        title: 'Suppression d’un projet',
        paragraphs: [
          [
            { kind: 'text', text: 'Ouvrez le projet, accédez à ses paramètres, puis sélectionnez ' },
            { kind: 'strong', text: 'Supprimer le projet' },
            {
              kind: 'text',
              text: '. Cette action supprime les fichiers, les déploiements et la base de données associés au projet. Elle ne supprime pas votre compte.',
            },
          ],
        ],
      },
      {
        id: 'account',
        title: 'Suppression de votre compte',
        paragraphs: [
          [
            {
              kind: 'text',
              text: 'Pour supprimer définitivement votre compte E-Code et l’ensemble du contenu associé :',
            },
          ],
        ],
        orderedItems: [
          [
            { kind: 'text', text: 'Accédez à ' },
            { kind: 'strong', text: 'Paramètres → Compte → Facturation' },
            { kind: 'text', text: '.' },
          ],
          [
            { kind: 'text', text: 'Sélectionnez ' },
            { kind: 'strong', text: 'Supprimer le compte' },
            { kind: 'text', text: ', puis ' },
            { kind: 'strong', text: 'Demander la suppression du compte' },
            { kind: 'text', text: '.' },
          ],
          [{ kind: 'text', text: 'Confirmez la demande pour lancer la suppression.' }],
        ],
      },
      {
        id: 'scope',
        title: 'Données supprimées',
        paragraphs: [[{ kind: 'text', text: 'La suppression du compte efface :' }]],
        closingParagraphs: [
          [
            { kind: 'text', text: 'La suppression est ' },
            { kind: 'strong', text: 'irréversible' },
            { kind: 'text', text: '. Exportez tout ce que vous souhaitez conserver avant de confirmer.' },
          ],
        ],
        unorderedItems: [
          [
            {
              kind: 'text',
              text: 'Toutes les applications ainsi que l’ensemble des modèles, déploiements et fichiers stockés.',
            },
          ],
          [
            {
              kind: 'text',
              text: 'Les bases de données et espaces de stockage d’objets associés à vos projets.',
            },
          ],
          [{ kind: 'text', text: 'Les publications de la communauté et les liens partagés que vous avez créés.' }],
          [
            {
              kind: 'text',
              text: 'Les informations personnelles associées au compte, sous réserve des règles de conservation ci-dessous.',
            },
          ],
        ],
      },
      {
        id: 'retention',
        title: 'Conservation et exceptions',
        paragraphs: [
          [
            {
              kind: 'text',
              text: 'Après la suppression, le contenu est purgé des systèmes actifs. Certains enregistrements peuvent être conservés dans la stricte mesure nécessaire au respect d’obligations légales, au règlement de litiges, à la prévention de la fraude ou des abus, ou à la finalisation des opérations comptables et fiscales. Les copies résiduelles présentes dans les sauvegardes chiffrées sont supprimées selon notre cycle habituel de rotation des sauvegardes.',
            },
          ],
        ],
      },
      {
        id: 'request',
        title: 'Demande de suppression ou d’export des données',
        paragraphs: [
          [
            {
              kind: 'text',
              text: 'Si vous ne pouvez pas accéder à la procédure intégrée au produit, demandez la suppression ou une copie de vos données en écrivant à ',
            },
            { kind: 'link', text: 'privacy@e-code.ai', link: 'privacyEmail' },
            {
              kind: 'text',
              text: ' depuis l’adresse associée à votre compte. Nous vérifions la demande avant d’y donner suite.',
            },
          ],
        ],
      },
    ],
  },
  exactEnforcement: {
    seo: {
      title: 'Politique d’application des règles — E-Code',
      description:
        'Découvrez comment E-Code répond aux infractions, évalue les mesures applicables et traite les recours.',
      imageAlt: 'Mesures d’application des règles, signalements et recours E-Code',
    },
    title: 'Politique d’application des règles',
    lastUpdatedLabel: 'Dernière mise à jour :',
    intro: [
      { kind: 'text', text: 'La présente politique explique comment E-Code intervient lorsqu’un compte enfreint nos ' },
      { kind: 'link', text: 'Conditions d’utilisation', link: 'terms' },
      { kind: 'text', text: ', notre ' },
      { kind: 'link', text: 'Politique d’utilisation acceptable', link: 'acceptableUse' },
      {
        kind: 'text',
        text: ' ou les règles de la communauté. L’application des règles tient compte des conséquences et reste proportionnée à la gravité et à la répétition de l’infraction : nous n’appliquons aucun barème fixe fondé sur un nombre d’avertissements.',
      },
    ],
    sections: [
      {
        id: 'actions',
        title: 'Mesures d’application',
        paragraphs: [
          [
            {
              kind: 'text',
              text: 'Selon la gravité, notre équipe Confiance et sécurité peut prendre une ou plusieurs des mesures d’application des règles suivantes :',
            },
          ],
        ],
        closingParagraphs: [
          [
            {
              kind: 'text',
              text: 'Les infractions particulièrement graves — notamment l’hébergement de logiciels malveillants ou de contenus pédopornographiques (CSAM), ou des attaques actives — peuvent entraîner une suspension immédiate sans avertissement préalable.',
            },
          ],
        ],
        unorderedItems: [
          [
            { kind: 'strong', text: 'Avertissement.' },
            {
              kind: 'text',
              text: ' Nous vous informons qu’un contenu ou un comportement précis a enfreint nos politiques. Nous pouvons retirer de la publication ou restreindre l’application concernée pendant que vous corrigez le problème. Votre espace de travail reste utilisable.',
            },
          ],
          [
            { kind: 'strong', text: 'Restriction des fonctions communautaires.' },
            {
              kind: 'text',
              text: ' Vous perdez la possibilité de publier, partager ou rendre publiques des applications, mais pouvez continuer à utiliser l’IDE et vos projets privés.',
            },
          ],
          [
            { kind: 'strong', text: 'Suspension du compte.' },
            {
              kind: 'text',
              text: ' L’accès au compte est bloqué et les applications publiées sont retirées. En cas d’infraction grave ou répétée, le compte et son contenu peuvent être supprimés définitivement.',
            },
          ],
        ],
      },
      {
        id: 'factors',
        title: 'Critères pris en compte',
        paragraphs: [],
        unorderedItems: [
          [{ kind: 'text', text: 'La gravité de l’infraction et ses conséquences concrètes.' }],
          [{ kind: 'text', text: 'Le caractère répété du comportement ou son inscription dans un schéma récurrent.' }],
          [{ kind: 'text', text: 'Le caractère intentionnel du comportement ou le fait qu’il résulte d’une erreur.' }],
          [{ kind: 'text', text: 'Votre réaction et votre volonté de remédier au problème.' }],
        ],
      },
      {
        id: 'appeals',
        title: 'Recours',
        paragraphs: [
          [
            {
              kind: 'text',
              text: 'Si vous estimez qu’une mesure d’application des règles a été prise par erreur, vous pouvez former un recours en écrivant à ',
            },
            { kind: 'link', text: 'appeals@e-code.ai', link: 'appealsEmail' },
            {
              kind: 'text',
              text: '. Indiquez votre nom d’utilisateur, la mesure prise et les raisons précises pour lesquelles elle devrait être réexaminée. Nous étudions les recours et vous communiquons notre décision.',
            },
          ],
        ],
      },
      {
        id: 'reporting',
        title: 'Signalement des infractions',
        paragraphs: [
          [
            { kind: 'text', text: 'Pour signaler un contenu ou un comportement contraire à nos politiques, utilisez ' },
            { kind: 'link', text: 'Signaler un abus', link: 'reportAbuse' },
            { kind: 'text', text: ' ou écrivez à ' },
            { kind: 'link', text: 'abuse@e-code.ai', link: 'abuseEmail' },
            {
              kind: 'text',
              text: '. Les réclamations relatives au droit d’auteur sont traitées selon notre procédure DMCA.',
            },
          ],
        ],
      },
    ],
  },
  exactTutorials: {
    seo: {
      title: 'Tutoriels — E-Code',
      description: 'Apprenez à créer, déployer et collaborer avec l’agent IA E-Code grâce à des tutoriels guidés.',
      imageAlt: 'Tutoriels E-Code dans l’espace de travail IA du navigateur',
    },
    hero: {
      title: 'Tutoriels',
      description: 'Apprenez à créer, déployer et collaborer avec l’agent IA, au fil de leçons courtes et pratiques.',
      badge: 'Pas à pas, sans configuration requise',
    },
    figure: {
      workspaceLabel: 'Espace de travail E-Code',
      imageAlt:
        'L’espace de travail E-Code utilisé dans les tutoriels, avec le panneau de l’agent IA, l’éditeur de code, l’arborescence des fichiers et l’aperçu en direct côte à côte',
      caption:
        'Chaque leçon se déroule dans le même espace de travail accessible depuis le navigateur, sans configuration locale.',
    },
    tutorials: {
      title: 'Parcourir les tutoriels',
      levels: { beginner: 'Débutant', intermediate: 'Intermédiaire', advanced: 'Avancé' },
      items: [
        {
          id: 'agent',
          title: 'Créer une application complète avec l’agent IA',
          level: 'beginner',
          description:
            'Passez d’un simple prompt à une application complète et opérationnelle pendant que l’agent IA écrit, exécute et corrige le code pour vous.',
        },
        {
          id: 'deploy',
          title: 'Déployer en production',
          level: 'beginner',
          description:
            'Publiez votre projet sur une URL publique en un clic et découvrez le fonctionnement des domaines personnalisés et des variables d’environnement.',
        },
        {
          id: 'database',
          title: 'Connecter une base de données',
          level: 'intermediate',
          description:
            'Provisionnez une base de données Postgres, modélisez son schéma et intégrez-la à votre application avec des requêtes typées.',
        },
        {
          id: 'collaboration',
          title: 'Collaboration en temps réel',
          level: 'intermediate',
          description:
            'Invitez votre équipe dans votre espace de travail pour modifier, exécuter et réviser le code ensemble, avec des indicateurs de présence en temps réel.',
        },
        {
          id: 'terminal',
          title: 'Maîtriser le terminal intégré',
          level: 'intermediate',
          description:
            'Exécutez des scripts, gérez les processus et utilisez le gestionnaire de paquets dans votre espace de travail cloud comme dans un shell local.',
        },
        {
          id: 'git',
          title: 'Parcours Git et synchronisation GitHub',
          level: 'advanced',
          description:
            'Créez des branches, effectuez des commits et poussez vos changements depuis l’éditeur, puis connectez un dépôt GitHub pour bénéficier de la synchronisation bidirectionnelle et des pull requests.',
        },
      ],
    },
    paths: {
      title: 'Parcours d’apprentissage',
      description:
        'Suivez une séquence guidée de tutoriels pour acquérir toutes les compétences nécessaires, du premier prompt à une livraison en équipe.',
      items: [
        {
          id: 'idea',
          title: 'De l’idée à l’application',
          description:
            'Partez d’un simple prompt et obtenez un produit déployé. Le parcours idéal pour une première création.',
          steps: ['Créer avec l’agent IA', 'Faire évoluer le design', 'Déployer en production'],
        },
        {
          id: 'fullStack',
          title: 'Fondations d’une application complète',
          description:
            'Découvrez les composants essentiels d’une application de production : données, API et authentification.',
          steps: ['Connecter une base de données', 'Ajouter une couche API', 'Sécuriser avec l’authentification'],
        },
        {
          id: 'team',
          title: 'Livrer en équipe',
          description:
            'Collaborez, révisez et publiez ensemble avec les parcours utilisés par de véritables équipes d’ingénierie.',
          steps: ['Collaborer en temps réel', 'Synchroniser Git et GitHub', 'Déployer en production'],
        },
      ],
    },
    cta: {
      title: 'Vous souhaitez commencer ?',
      description:
        'Ouvrez un espace de travail et laissez l’agent IA transformer votre première idée en application opérationnelle en quelques minutes. Commencez gratuitement, sans carte bancaire.',
      primary: 'Commencer gratuitement',
      secondary: 'Ouvrir le tableau de bord',
    },
  },
} as const satisfies MarketingExactGuidesPoliciesCopy;

export function getMarketingExactGuidesPoliciesCopy(language?: string | null): MarketingExactGuidesPoliciesCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactGuidesPoliciesFr : marketingExactGuidesPoliciesEn;
}

function formatLocale(language?: string | null): string {
  return resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
}

export function formatGuidesPoliciesInteger(value: number, language?: string | null): string {
  return new Intl.NumberFormat(formatLocale(language), { maximumFractionDigits: 0 }).format(value);
}

export function formatPolicySectionHeading(number: number, title: string, language?: string | null): string {
  return `${formatGuidesPoliciesInteger(number, language)}. ${title}`;
}

export function formatTutorialDuration(minutes: number, language?: string | null): string {
  return new Intl.NumberFormat(formatLocale(language), {
    style: 'unit',
    unit: 'minute',
    unitDisplay: 'short',
  }).format(minutes);
}
