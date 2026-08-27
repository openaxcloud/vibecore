import { resolveMarketingLanguage } from './marketing';

export type CaseStudyWorkflowId = 'idea' | 'preview' | 'git' | 'deploy' | 'workspaces' | 'mcp';
export type CaseStudyShowcaseId = 'workspace' | 'git';
export type CaseStudyCapabilityId = 'hosting' | 'mobile' | 'isolation' | 'terminal';
export type CollaborationFeatureId = 'cursors' | 'editing' | 'comments' | 'workspaces' | 'presence' | 'roles';
export type CollaborationPresenceId = 'editors' | 'follow' | 'agent' | 'comments';
export type CollaborationUseCaseId = 'pairing' | 'education' | 'teams';

interface MarketingExactCaseStudiesCollaborationCopy {
  exactCaseStudies: {
    seo: { title: string; description: string; imageAlt: string };
    hero: {
      badge: string;
      title: string;
      description: string;
      primary: string;
      secondary: string;
    };
    showcase: readonly {
      id: CaseStudyShowcaseId;
      label: string;
      imageAlt: string;
      caption: string;
    }[];
    workflow: {
      title: string;
      description: string;
      items: readonly { id: CaseStudyWorkflowId; title: string; body: string }[];
    };
    deploymentShowcase: { label: string; imageAlt: string; caption: string };
    capabilities: {
      title: string;
      description: string;
      items: readonly { id: CaseStudyCapabilityId; title: string; body: string }[];
    };
    cta: { title: string; description: string; primary: string; secondary: string };
  };
  exactCollaboration: {
    seo: { title: string; description: string; imageAlt: string };
    hero: { title: string; description: string; badge: string };
    features: {
      title: string;
      items: readonly { id: CollaborationFeatureId; title: string; description: string }[];
    };
    presence: {
      title: string;
      cardTitle: string;
      cardDescription: string;
      items: readonly { id: CollaborationPresenceId; title: string; description: string }[];
    };
    useCases: {
      title: string;
      items: readonly { id: CollaborationUseCaseId; title: string; description: string }[];
    };
    cta: { title: string; description: string; button: string };
  };
}

export const marketingExactCaseStudiesCollaborationEn = {
  exactCaseStudies: {
    seo: {
      title: 'Case Studies — E-Code',
      description: 'See real E-Code workflows from a plain-language prompt to preview, Git and production deployment.',
      imageAlt: 'E-Code workflows from an AI prompt to a deployed production application',
    },
    hero: {
      badge: 'How teams build with E-Code',
      title: 'From a prompt to a deployed app',
      description:
        'E-Code turns plain-language ideas into real software — the AI Agent writes the code, a live preview runs it, Git keeps it versioned, and one click ships it to production. Here is what that looks like in practice.',
      primary: 'Get started free',
      secondary: 'Open dashboard',
    },
    showcase: [
      {
        id: 'workspace',
        label: 'E-Code Workspace',
        imageAlt:
          'The E-Code IDE showing the AI Agent panel, code editor, file tree and live preview together in one workspace',
        caption: 'Agent, editor, files and live preview together in one cloud workspace.',
      },
      {
        id: 'git',
        label: 'Git in the IDE',
        imageAlt: 'The E-Code source control panel showing commits, branches and diffs inside the editor',
        caption: 'Commit, branch and push without leaving the editor.',
      },
    ],
    workflow: {
      title: 'The build loop, end to end',
      description:
        'Every project on E-Code follows the same path — describe, preview, version, and deploy — without ever leaving the browser.',
      items: [
        {
          id: 'idea',
          title: 'Idea to working app',
          body: 'Describe what you want in plain language. The AI Agent scaffolds the project, writes the code, and wires it up in a cloud workspace — no local setup.',
        },
        {
          id: 'preview',
          title: 'Live preview as you build',
          body: 'Every change runs instantly in a sandboxed preview beside the editor, so you see the result the moment the agent finishes a step.',
        },
        {
          id: 'git',
          title: 'Git built in',
          body: 'Connect GitHub or GitLab, commit, branch, and push straight from the IDE. Your work stays version-controlled without context switching.',
        },
        {
          id: 'deploy',
          title: 'Deploy from the editor',
          body: 'Ship to a live URL with the in-IDE Deployments panel. Static sites and full-stack apps go to production without leaving your workspace.',
        },
        {
          id: 'workspaces',
          title: 'Reproducible workspaces',
          body: 'Each project runs in its own isolated cloud container with the same toolchain for everyone — no "works on my machine".',
        },
        {
          id: 'mcp',
          title: 'Extend with MCP',
          body: 'Add Model Context Protocol connectors so the agent can reach your databases, APIs, and internal tools while it builds.',
        },
      ],
    },
    deploymentShowcase: {
      label: 'Deployments',
      imageAlt: 'The in-IDE Deployments panel where E-Code ships a project to a live production URL',
      caption: 'Ship to a live URL from the in-editor Deployments panel.',
    },
    capabilities: {
      title: 'What you can ship',
      description:
        'E-Code is a full cloud development platform — the same surfaces that power the IDE are available to every project, from a one-page site to a database-backed app.',
      items: [
        {
          id: 'hosting',
          title: 'Static & full-stack hosting',
          body: 'Publish a marketing page or a full app to a live e-code URL straight from the Deployments panel.',
        },
        {
          id: 'mobile',
          title: 'Build from anywhere',
          body: 'The workspace runs in the cloud and adapts down to mobile, so you can review and ship from a phone.',
        },
        {
          id: 'isolation',
          title: 'Isolated by default',
          body: 'Every project gets its own sandboxed container, so untrusted code and dependencies stay contained.',
        },
        {
          id: 'terminal',
          title: 'Full terminal access',
          body: 'Run any command in the integrated terminal — install packages, run migrations, inspect logs.',
        },
      ],
    },
    cta: {
      title: 'Write your own story',
      description:
        'Start a project, describe what you want, and watch E-Code build it. No setup, no credit card to begin.',
      primary: 'Get started free',
      secondary: 'Open dashboard',
    },
  },
  exactCollaboration: {
    seo: {
      title: 'Collaboration — E-Code',
      description:
        'Collaborate in real time with multiplayer editing, comments, live presence, roles and shared E-Code workspaces.',
      imageAlt: 'Real-time team collaboration in the E-Code development workspace',
    },
    hero: {
      title: 'Build together, in real time',
      description:
        'Code, comment, and ship side by side. E-Code brings your whole team — and the AI agent — into one shared, always-live workspace.',
      badge: 'Real-Time Multiplayer',
    },
    features: {
      title: 'Collaboration Features',
      items: [
        {
          id: 'cursors',
          title: 'Multiplayer Cursors',
          description: 'See every teammate move through the editor in real time, each with their own color and name.',
        },
        {
          id: 'editing',
          title: 'Live Editing',
          description: 'Type together in the same file with conflict-free sync — no refreshing, no overwriting.',
        },
        {
          id: 'comments',
          title: 'Inline Comments',
          description: 'Drop threaded comments on any line of code and resolve discussions where the work happens.',
        },
        {
          id: 'workspaces',
          title: 'Shared Workspaces',
          description: 'One workspace, one URL. Invite your team and everyone lands in the same running environment.',
        },
        {
          id: 'presence',
          title: 'Live Presence',
          description: 'Know who is online, which file they are viewing, and what the AI agent is doing right now.',
        },
        {
          id: 'roles',
          title: 'Roles & Permissions',
          description: 'Granular access controls — owner, editor, and viewer roles keep your projects safe.',
        },
      ],
    },
    presence: {
      title: 'Always know who is here',
      cardTitle: 'Presence that keeps everyone in sync',
      cardDescription: "E-Code surfaces live signals so your team never steps on each other's work",
      items: [
        {
          id: 'editors',
          title: 'Active Editors',
          description: 'Live avatars show exactly who is typing in the project at any moment.',
        },
        {
          id: 'follow',
          title: 'Follow Mode',
          description: 'Jump to a teammate and follow their cursor through files as they navigate.',
        },
        {
          id: 'agent',
          title: 'Agent Activity',
          description: 'Watch the AI agent plan, edit, and run commands alongside your team in real time.',
        },
        {
          id: 'comments',
          title: 'Comment Threads',
          description: 'Resolve, reopen, and reply to feedback without ever leaving the editor.',
        },
      ],
    },
    useCases: {
      title: 'How teams use it',
      items: [
        {
          id: 'pairing',
          title: 'Pair Programming',
          description: 'Build features side by side with a teammate or with the E-Code AI agent, all in one session.',
        },
        {
          id: 'education',
          title: 'Teaching & Onboarding',
          description: 'Guide new developers through a live codebase with shared cursors and inline explanations.',
        },
        {
          id: 'teams',
          title: 'Team Projects',
          description: 'Coordinate a whole team across shared workspaces with clear roles and reviewable comments.',
        },
      ],
    },
    cta: {
      title: 'Start building together today',
      description:
        'Spin up a shared workspace, invite your team, and let everyone — including the AI agent — code in the same place at the same time.',
      button: 'Create a Shared Workspace',
    },
  },
} as const satisfies MarketingExactCaseStudiesCollaborationCopy;

export const marketingExactCaseStudiesCollaborationFr = {
  exactCaseStudies: {
    seo: {
      title: 'Cas d’usage — E-Code',
      description:
        'Découvrez des parcours E-Code réels, du prompt en langage naturel à l’aperçu, Git et la mise en production.',
      imageAlt: 'Parcours E-Code, du prompt adressé à l’IA à l’application déployée en production',
    },
    hero: {
      badge: 'Comment les équipes créent avec E-Code',
      title: 'Du prompt à l’application déployée',
      description:
        'E-Code transforme vos idées exprimées en langage naturel en logiciels concrets : l’agent IA écrit le code, un aperçu en direct l’exécute, Git conserve les versions et un clic suffit pour passer en production. Voici à quoi ressemble ce parcours.',
      primary: 'Commencer gratuitement',
      secondary: 'Ouvrir le tableau de bord',
    },
    showcase: [
      {
        id: 'workspace',
        label: 'Espace de travail E-Code',
        imageAlt:
          'L’IDE E-Code affichant ensemble le panneau de l’agent IA, l’éditeur de code, l’arborescence des fichiers et l’aperçu en direct',
        caption: 'L’agent, l’éditeur, les fichiers et l’aperçu en direct réunis dans un espace de travail cloud.',
      },
      {
        id: 'git',
        label: 'Git dans l’IDE',
        imageAlt: 'Le panneau de gestion de versions E-Code affichant les commit, branches et diff dans l’éditeur',
        caption: 'Effectuez vos commit, créez des branches et poussez vos modifications sans quitter l’éditeur.',
      },
    ],
    workflow: {
      title: 'Le cycle de création, de bout en bout',
      description:
        'Chaque projet E-Code suit le même parcours — décrire, prévisualiser, versionner et déployer — sans jamais quitter le navigateur.',
      items: [
        {
          id: 'idea',
          title: 'De l’idée à l’application fonctionnelle',
          body: 'Décrivez votre besoin en langage naturel. L’agent IA structure le projet, écrit le code et connecte ses composants dans un espace de travail cloud, sans configuration locale.',
        },
        {
          id: 'preview',
          title: 'Un aperçu en direct pendant la création',
          body: 'Chaque modification s’exécute immédiatement dans un aperçu isolé à côté de l’éditeur ; vous voyez ainsi le résultat dès que l’agent termine une étape.',
        },
        {
          id: 'git',
          title: 'Git intégré',
          body: 'Connectez GitHub ou GitLab, effectuez vos commit, créez des branches et poussez vos modifications directement depuis l’IDE. Votre travail reste versionné sans changement de contexte.',
        },
        {
          id: 'deploy',
          title: 'Déployer depuis l’éditeur',
          body: 'Publiez sur une URL en direct grâce au panneau Déploiements de l’IDE. Les sites statiques et applications complètes passent en production sans quitter votre espace de travail.',
        },
        {
          id: 'workspaces',
          title: 'Espaces de travail reproductibles',
          body: 'Chaque projet s’exécute dans son propre conteneur cloud isolé, avec la même chaîne d’outils pour toute l’équipe : fini les écarts entre machines.',
        },
        {
          id: 'mcp',
          title: 'Étendre les possibilités avec MCP',
          body: 'Ajoutez des connecteurs Model Context Protocol afin que l’agent puisse accéder à vos bases de données, API et outils internes pendant la création.',
        },
      ],
    },
    deploymentShowcase: {
      label: 'Déploiements',
      imageAlt: 'Le panneau Déploiements de l’IDE depuis lequel E-Code publie un projet sur une URL de production',
      caption: 'Publiez sur une URL en direct depuis le panneau Déploiements intégré à l’éditeur.',
    },
    capabilities: {
      title: 'Ce que vous pouvez livrer',
      description:
        'E-Code est une plateforme complète de développement cloud : les mêmes surfaces que celles de l’IDE sont proposées à chaque projet, du site d’une page à l’application connectée à une base de données.',
      items: [
        {
          id: 'hosting',
          title: 'Hébergement de sites statiques et d’applications complètes',
          body: 'Publiez une page marketing ou une application complète sur une URL E-Code en direct depuis le panneau Déploiements.',
        },
        {
          id: 'mobile',
          title: 'Créez depuis n’importe où',
          body: 'L’espace de travail s’exécute dans le cloud et s’adapte au mobile, ce qui vous permet de vérifier et livrer depuis un téléphone.',
        },
        {
          id: 'isolation',
          title: 'Isolation par défaut',
          body: 'Chaque projet dispose de son propre conteneur isolé, afin que le code et les dépendances non fiables restent confinés.',
        },
        {
          id: 'terminal',
          title: 'Accès complet au terminal',
          body: 'Exécutez toute commande dans le terminal intégré : installez des paquets, lancez les migrations et inspectez les journaux.',
        },
      ],
    },
    cta: {
      title: 'Écrivez votre propre réussite',
      description:
        'Lancez un projet, décrivez votre besoin et regardez E-Code le concrétiser. Aucune configuration ni carte bancaire n’est nécessaire pour commencer.',
      primary: 'Commencer gratuitement',
      secondary: 'Ouvrir le tableau de bord',
    },
  },
  exactCollaboration: {
    seo: {
      title: 'Collaboration — E-Code',
      description:
        'Collaborez en temps réel grâce à l’édition simultanée, aux commentaires, à la présence en direct, aux rôles et aux espaces de travail partagés E-Code.',
      imageAlt: 'Collaboration d’équipe en temps réel dans l’espace de développement E-Code',
    },
    hero: {
      title: 'Créez ensemble, en temps réel',
      description:
        'Programmez, commentez et livrez côte à côte. E-Code réunit toute votre équipe — ainsi que l’agent IA — dans un même espace de travail partagé et toujours actif.',
      badge: 'Collaboration simultanée en temps réel',
    },
    features: {
      title: 'Fonctionnalités de collaboration',
      items: [
        {
          id: 'cursors',
          title: 'Curseurs partagés',
          description:
            'Voyez chaque membre de l’équipe se déplacer dans l’éditeur en temps réel, avec sa propre couleur et son nom.',
        },
        {
          id: 'editing',
          title: 'Édition simultanée',
          description:
            'Écrivez ensemble dans le même fichier avec une synchronisation sans conflit, sans actualisation ni écrasement.',
        },
        {
          id: 'comments',
          title: 'Commentaires intégrés',
          description:
            'Ajoutez des fils de discussion sur n’importe quelle ligne de code et résolvez les échanges au plus près du travail.',
        },
        {
          id: 'workspaces',
          title: 'Espaces de travail partagés',
          description:
            'Un espace de travail, une URL. Invitez votre équipe : chaque membre rejoint le même environnement en cours d’exécution.',
        },
        {
          id: 'presence',
          title: 'Présence en direct',
          description:
            'Sachez qui est en ligne, quel fichier chaque personne consulte et ce que fait l’agent IA à cet instant.',
        },
        {
          id: 'roles',
          title: 'Rôles et autorisations',
          description: 'Des contrôles d’accès granulaires — propriétaire, éditeur et lecteur — protègent vos projets.',
        },
      ],
    },
    presence: {
      title: 'Sachez toujours qui est présent',
      cardTitle: 'Une présence qui maintient toute l’équipe synchronisée',
      cardDescription: 'E-Code affiche les signaux en direct afin que les membres de l’équipe ne se gênent jamais',
      items: [
        {
          id: 'editors',
          title: 'Éditeurs actifs',
          description: 'Les avatars en direct indiquent précisément qui écrit dans le projet à chaque instant.',
        },
        {
          id: 'follow',
          title: 'Mode suivi',
          description: 'Rejoignez un collègue et suivez son curseur de fichier en fichier pendant sa navigation.',
        },
        {
          id: 'agent',
          title: 'Activité de l’agent',
          description:
            'Observez l’agent IA planifier, modifier et exécuter des commandes aux côtés de votre équipe en temps réel.',
        },
        {
          id: 'comments',
          title: 'Fils de commentaires',
          description: 'Résolvez, rouvrez et traitez les retours sans jamais quitter l’éditeur.',
        },
      ],
    },
    useCases: {
      title: 'Comment les équipes collaborent',
      items: [
        {
          id: 'pairing',
          title: 'Programmation en binôme',
          description:
            'Développez une fonctionnalité côte à côte avec un collègue ou avec l’agent IA E-Code, au cours d’une même session.',
        },
        {
          id: 'education',
          title: 'Formation et intégration',
          description:
            'Accompagnez les nouveaux développeurs dans une base de code active grâce aux curseurs partagés et aux explications intégrées.',
        },
        {
          id: 'teams',
          title: 'Projets d’équipe',
          description:
            'Coordonnez toute une équipe dans des espaces de travail partagés, avec des rôles clairs et des commentaires vérifiables.',
        },
      ],
    },
    cta: {
      title: 'Commencez à créer ensemble dès aujourd’hui',
      description:
        'Créez un espace de travail partagé, invitez votre équipe et permettez à chacun — y compris à l’agent IA — de programmer au même endroit, au même moment.',
      button: 'Créer un espace de travail partagé',
    },
  },
} as const satisfies MarketingExactCaseStudiesCollaborationCopy;

export function getMarketingExactCaseStudiesCollaborationCopy(
  language?: string | null,
): MarketingExactCaseStudiesCollaborationCopy {
  return resolveMarketingLanguage(language) === 'fr'
    ? marketingExactCaseStudiesCollaborationFr
    : marketingExactCaseStudiesCollaborationEn;
}
