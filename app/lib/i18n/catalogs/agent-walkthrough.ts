import { resolveMarketingLanguage } from './marketing';

interface WalkthroughStepCopy {
  label: string;
  detail: string;
}

interface WalkthroughSectionCopy {
  title: string;
  tagline: string;
  why: string;
  steps: readonly [WalkthroughStepCopy, WalkthroughStepCopy, WalkthroughStepCopy];
  notes?: Readonly<{ title: string; body: string }>;
}

export interface AgentWalkthroughCopy {
  preview: {
    mentionsAria: string;
    slashAria: string;
    slashItems: readonly { label: string; hint: string }[];
    planAria: string;
    planTitle: string;
    planProgress: string;
    planTasks: readonly string[];
    patchAria: string;
    patchTitle: string;
    patchStats: string;
    patchApplyAll: string;
    patchAccept: string;
    patchReject: string;
    branchesAria: string;
    branchesButton: string;
    branchNames: readonly string[];
    shareAria: string;
    shareCopy: string;
    shareCopied: string;
    shareDetail: string;
    presenceAria: string;
    presenceProject: string;
    presenceActivity: string;
    i18nAria: string;
    i18nTitle: string;
    i18nReload: string;
    i18nExamplePrimary: string;
    i18nExampleSecondary: string;
  };
  sections: {
    mentions: WalkthroughSectionCopy;
    slash: WalkthroughSectionCopy;
    plan: WalkthroughSectionCopy;
    patchReview: WalkthroughSectionCopy;
    branches: WalkthroughSectionCopy;
    share: WalkthroughSectionCopy;
    presence: WalkthroughSectionCopy;
    i18n: WalkthroughSectionCopy;
  };
  prerequisites: readonly { title: string; detail: string }[];
  captionBeforePath: string;
  captionAfterPath: string;
  previewLabel: string;
  title: string;
  description: string;
  navigationLabel: string;
  prerequisitesLabel: string;
  beforeYouStart: string;
}

export const agentWalkthroughEn: AgentWalkthroughCopy = {
  preview: {
    mentionsAria: '@-mentions palette mockup',
    slashAria: 'Slash commands palette mockup',
    slashItems: [
      { label: 'Run shell command', hint: 'Output streams to terminal' },
      { label: 'Create project snapshot', hint: 'POST /snapshots' },
      { label: 'Show diff for file', hint: 'Switches workbench view' },
      { label: 'Open file in editor', hint: 'Code view and selection' },
      { label: 'Fix last preview error', hint: 'Pre-fill the prompt' },
    ],
    planAria: 'Plan checklist mockup',
    planTitle: 'Plan',
    planProgress: '4 of 5 done · 1 running',
    planTasks: [
      'Sketch the data model',
      'Generate Prisma schema',
      'Add API route',
      'Wire React form',
      'Write integration test',
    ],
    patchAria: 'Patch review panel mockup',
    patchTitle: 'Files changed',
    patchStats: '3 files · +48 −12',
    patchApplyAll: 'Apply all',
    patchAccept: 'Accept',
    patchReject: 'Reject',
    branchesAria: 'Branches dropdown mockup',
    branchesButton: 'branches',
    branchNames: ['Live thread', 'Dark mode experiment', 'Router refactor'],
    shareAria: 'Share link notification mockup',
    shareCopy: 'Copy',
    shareCopied: 'Conversation link copied',
    shareDetail: 'Anyone with the link can view this thread (read-only).',
    presenceAria: 'Presence avatars mockup',
    presenceProject: 'Demo project — chat',
    presenceActivity: 'AV is typing… · MC viewing App.tsx · JD viewing Header.tsx',
    i18nAria: 'Language switch mockup',
    i18nTitle: 'Switch language',
    i18nReload: 'Reload — labels switch to French immediately.',
    i18nExamplePrimary: 'EN → “Files changed”',
    i18nExampleSecondary: 'FR → “Fichiers modifiés”',
  },
  sections: {
    mentions: {
      title: '@ file mentions',
      tagline: 'Reference any project file from the composer without leaving the keyboard.',
      why: 'Typing the path manually is slow and error-prone. The mentions palette opens automatically when you type @, fuzzy-matches across the whole workspace, and remembers the files you mention most often.',
      steps: [
        { label: 'Type @ in the composer', detail: 'The palette opens above the text area. No mouse needed.' },
        { label: 'Filter with letters', detail: 'Fuzzy-match the path and base name. Recent picks rise to the top.' },
        {
          label: 'Press Enter or Tab',
          detail: 'Inserts @src/path.tsx in your prompt; the agent parses it as a file-context attachment.',
        },
      ],
    },
    slash: {
      title: '/ slash commands',
      tagline: 'Eleven built-in quick actions, with no documentation lookup required.',
      why: 'Common workflows—snapshot the repository, open a file diff, run a shell command, or fix the last preview error—should be one keystroke away. The slash palette follows familiar VS Code and Replit conventions.',
      steps: [
        {
          label: 'Type / at the start of the prompt',
          detail: 'The palette opens with all 11 commands. Additional characters filter the list.',
        },
        {
          label: 'Pick the command',
          detail:
            'Built-ins include /build /clear /discuss /diff /file /help /open /plan /preview-error /run /snapshot. Press Enter to execute.',
        },
        {
          label: 'Frequent commands rise to the top',
          detail: 'Recently used commands receive a ranking boost, keeping them one keystroke away.',
        },
      ],
      notes: {
        title: 'Standalone E-Code safety:',
        body: 'Commands that require project context (/snapshot, /run, /preview-error) stop safely outside a project IDE.',
      },
    },
    plan: {
      title: 'Plan-first checklist',
      tagline: 'See the agent’s intent before any file lands.',
      why: 'For larger changes, the agent emits an actionable checklist before touching files. It renders as a live progress widget so you can see what is complete, running, or failing without scrolling through walls of text.',
      steps: [
        { label: 'Enable Plan', detail: 'Use the compact Plan button in the composer toolbar, or type /plan.' },
        {
          label: 'Send your request',
          detail: 'The agent emits a Markdown task list, which is parsed and rendered as a checklist.',
        },
        {
          label: 'Watch the bar fill',
          detail: 'Items become done, in progress, or failed as the agent reports back.',
        },
      ],
    },
    patchReview: {
      title: 'Auto-apply and patch recovery',
      tagline: 'Successful patches apply immediately; failed validation remains reviewable.',
      why: 'Auto-apply is always enabled for successful patches, matching the fast Replit and Cursor default. Validation failures remain visible with retry, reject, and recovery actions.',
      steps: [
        {
          label: 'Check the policy',
          detail: 'Agent settings show auto-apply as enabled and read-only, keeping the behavior predictable.',
        },
        {
          label: 'Recover failures',
          detail: 'Failed validation remains in review with retry and reject actions.',
        },
        { label: 'Undo quickly', detail: 'Successful writes still surface a consolidated Undo notification.' },
      ],
      notes: {
        title: 'Auto-apply enabled?',
        body: 'The review panel is hidden for successful writes; failed validation remains visible for deliberate recovery.',
      },
    },
    branches: {
      title: 'Conversation branches',
      tagline: 'Fork a conversation at any message and keep variants side by side.',
      why: 'Long agent sessions branch naturally. Branches archive the previous thread without losing it, while the header menu lets you switch, rename, or delete each branch.',
      steps: [
        {
          label: 'Branches accumulate automatically',
          detail: 'Each New chat archives the previous thread as a branch.',
        },
        {
          label: 'Switch from the header menu',
          detail: 'The branch icon beside the theme control opens the list.',
        },
        {
          label: 'Rename or delete',
          detail: 'Hover over a branch to reveal Rename and Delete actions.',
        },
      ],
    },
    share: {
      title: 'Share read-only conversations',
      tagline: 'Copy a link that anyone can open.',
      why: 'Bug pairing, design feedback, and teammate onboarding are faster when you can share the exact conversation. The link carries a read-only conversation snapshot.',
      steps: [
        {
          label: 'Select the Share icon',
          detail: 'It sits in the agent header and remains disabled until a message exists.',
        },
        { label: 'The link is copied automatically', detail: 'A clipboard notification confirms the action.' },
        {
          label: 'Recipients see the full thread',
          detail: 'Message bodies up to 32 KB are embedded, with no server request required for v1.',
        },
      ],
    },
    presence: {
      title: 'Live presence',
      tagline: 'See who else is in the project at a glance.',
      why: 'Collaboration feels real when other people are visible. Header avatars show online sessions and status hints; the Collaborators panel retains fine-grained controls.',
      steps: [
        {
          label: 'Open the project in two browsers',
          detail: 'Use a standard and private window, or invite a teammate.',
        },
        {
          label: 'Avatars stack in the header',
          detail: 'Up to three are visible, followed by a +N overflow badge.',
        },
        {
          label: 'Typing indicator',
          detail: 'A subtle dot appears when a collaborator is composing a message.',
        },
      ],
    },
    i18n: {
      title: 'French and English UI',
      tagline: 'The agent panel supports both languages.',
      why: 'The catalog includes English and French translations for every agent-panel surface. Additional languages can be added as bundles without changing component code.',
      steps: [
        {
          label: 'Detect or override',
          detail: 'The browser language is honored initially; a manual choice remains authoritative afterward.',
        },
        { label: 'Apply immediately', detail: 'The global language control updates all platform surfaces.' },
        {
          label: 'Missing translations fall back safely',
          detail: 'Missing French entries use the English catalog, never a raw implementation key.',
        },
      ],
    },
  },
  prerequisites: [
    {
      title: 'Sign in to your E-Code workspace',
      detail: 'Free accounts receive a workspace immediately; enterprise SSO is available to administrators.',
    },
    {
      title: 'Open or create a project',
      detail: 'Choose a template or import an existing repository to start the IDE.',
    },
    {
      title: 'Know the patch policy',
      detail: 'Successful patches apply automatically; failed validation remains reviewable.',
    },
  ],
  captionBeforePath: 'UI mockup — replace it with a real screenshot at',
  captionAfterPath: 'after capture.',
  previewLabel: 'preview',
  title: 'Agent panel walkthrough',
  description:
    'A feature-by-feature tour of the IDE agent: the keystroke you press, what happens next, and a UI mockup for every surface. Use the links below to jump to a section.',
  navigationLabel: 'Agent feature sections',
  prerequisitesLabel: 'Prerequisites',
  beforeYouStart: 'Before you start',
};

export const agentWalkthroughFr: AgentWalkthroughCopy = {
  preview: {
    mentionsAria: 'Maquette de la palette de mentions de fichiers',
    slashAria: 'Maquette de la palette de commandes slash',
    slashItems: [
      { label: 'Exécuter une commande shell', hint: 'La sortie est diffusée dans le terminal' },
      { label: 'Créer un instantané du projet', hint: 'POST /snapshots' },
      { label: 'Afficher le diff du fichier', hint: 'Change la vue de l’espace de travail' },
      { label: 'Ouvrir le fichier dans l’éditeur', hint: 'Vue du code et sélection' },
      { label: 'Corriger la dernière erreur d’aperçu', hint: 'Préremplit le prompt' },
    ],
    planAria: 'Maquette de la checklist du plan',
    planTitle: 'Plan',
    planProgress: '4 tâches sur 5 terminées · 1 en cours',
    planTasks: [
      'Esquisser le modèle de données',
      'Générer le schéma Prisma',
      'Ajouter la route API',
      'Relier le formulaire React',
      'Écrire le test d’intégration',
    ],
    patchAria: 'Maquette du panneau de revue des patchs',
    patchTitle: 'Fichiers modifiés',
    patchStats: '3 fichiers · +48 −12',
    patchApplyAll: 'Tout appliquer',
    patchAccept: 'Accepter',
    patchReject: 'Refuser',
    branchesAria: 'Maquette du menu des branches',
    branchesButton: 'branches',
    branchNames: ['Fil actif', 'Essai du mode sombre', 'Refonte du routeur'],
    shareAria: 'Maquette de la notification de partage',
    shareCopy: 'Copier',
    shareCopied: 'Lien de la conversation copié',
    shareDetail: 'Toute personne disposant du lien peut consulter ce fil en lecture seule.',
    presenceAria: 'Maquette des avatars de présence',
    presenceProject: 'Projet de démonstration — discussion',
    presenceActivity: 'AV écrit… · MC consulte App.tsx · JD consulte Header.tsx',
    i18nAria: 'Maquette du sélecteur de langue',
    i18nTitle: 'Changer de langue',
    i18nReload: 'Actualisez : les libellés passent immédiatement en français.',
    i18nExamplePrimary: 'Langue active → français',
    i18nExampleSecondary: 'Exemple → « Fichiers modifiés »',
  },
  sections: {
    mentions: {
      title: '@ mentions de fichiers',
      tagline: 'Référencez un fichier du projet depuis le composeur, sans quitter le clavier.',
      why: 'Saisir un chemin manuellement est lent et source d’erreurs. La palette s’ouvre automatiquement après @, recherche approximativement dans tout l’espace et mémorise les fichiers les plus cités.',
      steps: [
        {
          label: 'Saisissez @ dans le composeur',
          detail: 'La palette s’ouvre au-dessus de la zone de texte, sans souris.',
        },
        {
          label: 'Filtrez avec quelques lettres',
          detail: 'La recherche porte sur le chemin et le nom du fichier ; les choix récents remontent.',
        },
        {
          label: 'Appuyez sur Entrée ou Tab',
          detail: 'Le chemin @src/path.tsx est inséré et transmis à l’agent comme contexte de fichier.',
        },
      ],
    },
    slash: {
      title: '/ commandes slash',
      tagline: 'Onze actions rapides intégrées, sans devoir consulter la documentation.',
      why: 'Créer un instantané, ouvrir un diff, exécuter une commande shell ou corriger la dernière erreur d’aperçu doit rester accessible en une touche. La palette reprend les conventions familières de VS Code et Replit.',
      steps: [
        {
          label: 'Saisissez / au début du prompt',
          detail: 'La palette affiche les 11 commandes ; les caractères suivants filtrent la liste.',
        },
        {
          label: 'Choisissez la commande',
          detail:
            'Les commandes intégrées sont /build /clear /discuss /diff /file /help /open /plan /preview-error /run /snapshot. Appuyez sur Entrée pour l’exécuter.',
        },
        {
          label: 'Les commandes fréquentes remontent',
          detail: 'Les commandes récemment utilisées bénéficient d’un meilleur classement.',
        },
      ],
      notes: {
        title: 'Sécurité hors projet :',
        body: 'Les commandes qui exigent un projet (/snapshot, /run, /preview-error) s’arrêtent proprement hors de l’IDE.',
      },
    },
    plan: {
      title: 'Checklist avant exécution',
      tagline: 'Consultez l’intention de l’agent avant toute modification de fichier.',
      why: 'Pour les changements importants, l’agent produit une checklist exploitable avant de toucher aux fichiers. Le widget de progression indique ce qui est terminé, en cours ou en échec sans imposer de longs blocs de texte.',
      steps: [
        { label: 'Activez le mode Plan', detail: 'Utilisez le bouton Plan du composeur ou saisissez /plan.' },
        {
          label: 'Envoyez votre demande',
          detail: 'L’agent produit une liste de tâches Markdown, ensuite affichée sous forme de checklist.',
        },
        {
          label: 'Suivez la progression',
          detail: 'Chaque élément passe à terminé, en cours ou en échec selon les retours de l’agent.',
        },
      ],
    },
    patchReview: {
      title: 'Application automatique et récupération des patchs',
      tagline: 'Les patchs valides sont appliqués immédiatement ; les échecs restent révisables.',
      why: 'L’application automatique est toujours active pour les patchs valides, comme dans Replit et Cursor. Les échecs de validation restent visibles avec des actions pour réessayer, refuser ou récupérer.',
      steps: [
        {
          label: 'Vérifiez la politique',
          detail: 'Les paramètres indiquent que l’application automatique est active et non modifiable.',
        },
        {
          label: 'Récupérez après un échec',
          detail: 'Une validation échouée reste dans la revue avec les actions Réessayer et Refuser.',
        },
        {
          label: 'Annulez rapidement',
          detail: 'Les écritures valides affichent toujours une notification Annuler groupée.',
        },
      ],
      notes: {
        title: 'Application automatique active ?',
        body: 'La revue disparaît après une écriture réussie ; un échec reste visible pour permettre une récupération maîtrisée.',
      },
    },
    branches: {
      title: 'Branches de conversation',
      tagline: 'Créez une branche depuis n’importe quel message et conservez les variantes côte à côte.',
      why: 'Les longues sessions se ramifient naturellement. Les branches archivent le fil précédent sans le perdre, tandis que le menu d’en-tête permet de les ouvrir, renommer ou supprimer.',
      steps: [
        {
          label: 'Les branches s’accumulent automatiquement',
          detail: 'Chaque nouvelle conversation archive le fil précédent dans une branche.',
        },
        {
          label: 'Changez de branche depuis l’en-tête',
          detail: 'L’icône de branche près du thème ouvre la liste.',
        },
        { label: 'Renommez ou supprimez', detail: 'Survolez une branche pour afficher les deux actions.' },
      ],
    },
    share: {
      title: 'Partage de conversations en lecture seule',
      tagline: 'Copiez un lien que toute personne autorisée peut ouvrir.',
      why: 'La résolution d’un bug, les retours de conception et l’intégration d’un collègue sont plus rapides lorsque la conversation exacte peut être partagée en lecture seule.',
      steps: [
        {
          label: 'Sélectionnez l’icône Partager',
          detail: 'Elle se trouve dans l’en-tête de l’agent et reste désactivée tant qu’aucun message n’existe.',
        },
        { label: 'Le lien est copié automatiquement', detail: 'Une notification confirme la copie.' },
        {
          label: 'Les destinataires voient tout le fil',
          detail: 'Les messages jusqu’à 32 Ko sont intégrés, sans requête serveur pour la v1.',
        },
      ],
    },
    presence: {
      title: 'Présence en direct',
      tagline: 'Voyez immédiatement qui travaille sur le projet.',
      why: 'La collaboration devient concrète lorsque les autres personnes sont visibles. Les avatars indiquent les sessions en ligne et leur état ; le panneau Collaborateurs conserve les contrôles détaillés.',
      steps: [
        {
          label: 'Ouvrez le projet dans deux navigateurs',
          detail: 'Utilisez une fenêtre normale et privée, ou invitez un collègue.',
        },
        {
          label: 'Les avatars s’empilent dans l’en-tête',
          detail: 'Trois avatars sont visibles, puis un badge +N regroupe les suivants.',
        },
        {
          label: 'Indicateur de saisie',
          detail: 'Un point discret apparaît lorsqu’un collaborateur rédige un message.',
        },
      ],
    },
    i18n: {
      title: 'Interface française et anglaise',
      tagline: 'Le panneau de l’agent prend en charge les deux langues.',
      why: 'Le catalogue fournit une traduction française et anglaise de chaque surface du panneau. De nouvelles langues peuvent être ajoutées sous forme de catalogues, sans modifier les composants.',
      steps: [
        {
          label: 'Détectez ou remplacez la langue',
          detail: 'La langue du navigateur s’applique au premier passage ; un choix manuel reste ensuite prioritaire.',
        },
        { label: 'Appliquez-la immédiatement', detail: 'Le sélecteur global met à jour toutes les surfaces.' },
        {
          label: 'Les traductions manquantes ont un repli sûr',
          detail: 'Une entrée française absente utilise le catalogue anglais, jamais une clé technique brute.',
        },
      ],
    },
  },
  prerequisites: [
    {
      title: 'Connectez-vous à votre espace de travail E-Code',
      detail: 'Les comptes gratuits disposent immédiatement d’un espace ; le SSO est proposé aux administrateurs.',
    },
    {
      title: 'Ouvrez ou créez un projet',
      detail: 'Choisissez un modèle ou importez un dépôt existant pour démarrer l’IDE.',
    },
    {
      title: 'Comprenez la politique des patchs',
      detail: 'Les patchs valides s’appliquent automatiquement ; les échecs restent révisables.',
    },
  ],
  captionBeforePath: 'Maquette de l’interface — remplacez-la par une vraie capture dans',
  captionAfterPath: 'après la capture.',
  previewLabel: 'aperçu',
  title: 'Guide du panneau de l’agent',
  description:
    'Une visite guidée des fonctionnalités de l’agent dans l’IDE : le raccourci utilisé, ce qui se produit ensuite et une maquette de chaque surface. Les liens ci-dessous permettent d’accéder directement à une rubrique.',
  navigationLabel: 'Rubriques des fonctionnalités de l’agent',
  prerequisitesLabel: 'Prérequis',
  beforeYouStart: 'Avant de commencer',
};

export function getAgentWalkthroughCopy(language?: string | null): AgentWalkthroughCopy {
  return resolveMarketingLanguage(language) === 'fr' ? agentWalkthroughFr : agentWalkthroughEn;
}
