import type { SolutionCopyByLanguage } from './solution-copy';

/**
 * SOL — Game Builder. Dedicated browser-quiz story in EN and FR. All player
 * names and scores are fictional and labeled; proof claims stop at the captured
 * Agent exchange, generated files, Webview, and local game state.
 */
export const GAME_BUILDER_COPY = {
  en: {
    seo: {
      title: 'Game Builder with Real Code | E-Code',
      description:
        'Describe the browser game you want to test. E-Code turns it into an editable game loop, multiplayer interface, and state model with a running Preview, project export, and clear integration points for a real-time service.',
    },
    hero: {
      eyebrow: 'Game Builder for playable browser prototypes',
      title: 'Turn a game idea into a browser build you can play and inspect',
      subtitle:
        'Describe the game, the rounds, and how players compete. E-Code turns that into an editable game loop, lobby interface, scoring rules, and multiplayer state model. Play the local flow in Preview, refine it through the Agent, and connect a real-time service before inviting remote players.',
      primaryCta: { label: 'Describe your game', ariaLabel: 'Describe your game with E-Code' },
      secondaryCta: { label: 'See how it builds', ariaLabel: 'See how E-Code builds the game from a prompt' },
      microcopy:
        'Start from the game you already have in mind. Source files, the running Preview, and publishing controls stay visible as the game evolves.',
    },
    languageSwitch: { label: 'Choose the Game Builder page language', english: 'English', french: 'Français' },
    demo: {
      badge: 'Fictional demo data',
      brand: 'TriviaClash',
      brandType: 'Local quiz prototype',
      nav: ['Lobby', 'Play', 'Leaderboard'],
      eyebrow: 'Scripted round 3 of 5',
      title: 'Which capital sits on the Bosphorus strait?',
      intro:
        'A responsive quiz concept that presents a lobby, timed questions, and a shared-score interface in one clear round loop.',
      primaryHeading: 'Local sample scoreboard',
      primaryRows: [
        { label: 'Nadia', meta: '1,240 sample pts', status: 'Sample lead' },
        { label: 'Marco', meta: '1,180 sample pts' },
        { label: 'Priya', meta: '1,095 sample pts' },
      ],
      asideHeading: 'Current question',
      asideRows: [
        { label: 'Category', value: 'Geography' },
        { label: 'Local timer', value: '0:12 sample' },
        { label: 'Sample players', value: '3 local' },
      ],
      asideCta: 'Test local answer',
      disclaimer:
        'Scripted local interface · fictional players, timer, and scores · no remote match, synchronized clients, or persistent leaderboard · not a generation record',
      caption: {
        title: 'A playable local round with an explicit network boundary',
        body: 'This scripted interface demonstrates a local scoreboard, current-question state, and answer control in one responsive layout.',
      },
      alt: 'Scripted local quiz interface with fictional player scores and a current-question panel; no remote multiplayer is shown.',
    },
    problem: {
      eyebrow: 'From engine lock-in to an inspectable game loop',
      title: 'Game makers look easy until multiplayer state and play-testing fight the tool',
      intro:
        'A live quiz game needs a tight loop: a lobby that fills, questions that fire in sync, and a scoreboard that updates for everyone at once. No-code game tools start fast, then hide the game loop and the networking, and the exported result rarely maps to code the team can keep evolving.',
      obstacles: [
        {
          title: 'The game loop stays hidden',
          body: 'Drag-and-drop makers hide the render loop and timing, so custom scoring, round pacing, and animations mean fighting the tool instead of editing the loop.',
        },
        {
          title: 'Multiplayer state drifts out of sync',
          body: 'When each client tracks its own score and timer, players see different boards, and there is no single source the team can inspect, version, and reason about.',
        },
        {
          title: 'You cannot really play-test it',
          body: 'Previewing one screen is not playing a match. Without a running game and real rounds, timing bugs and edge cases only show up once players are live.',
        },
      ],
      bridge:
        'E-Code starts from the game you describe and produces an editable browser loop, rules, and multiplayer state model in source files. You test the local flow in Preview, connect networking where the code exposes it, and request the next change without leaving the project.',
    },
    build: {
      eyebrow: 'One prompt starts the game',
      title: 'Describe the rounds, not the engine',
      intro:
        'The request below reads like a note from a game designer. The four items map its implementation scope in real source files, not a locked engine.',
      label: 'Example prompt',
      promptText: 'Build a multiplayer quiz game with real-time scoring and a leaderboard.',
      outputs: [
        {
          title: 'Canvas game loop',
          body: 'A real render-and-update loop drives rounds, timers, and animations across desktop, tablet, and mobile from editable components.',
        },
        {
          title: 'Multiplayer state model',
          body: 'Lobby, question, timer, and scoreboard states are modeled in editable code with explicit integration points for a real-time backend. Remote synchronization is not active until that service is connected.',
        },
        {
          title: 'Scoring and rounds',
          body: 'Answer handling, per-round scoring, and win conditions are modeled as working game rules rather than a static screen.',
        },
        {
          title: 'Preview and publishing',
          body: 'E-Code runs the local game flow in Preview across screen sizes. Supported static frontends can follow guided publishing; remote matches still require the real-time service you connect.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Quiz rules → Agent → playable Webview',
      title: 'Play the quiz the Agent assembled inside the IDE',
      body: 'These dedicated E-Code captures show the quiz prompt, the Agent exchange, the generated game files, and a local round running in Webview without leaving the project.',
      galleryLabel: 'Captured quiz-game generation and local play inside E-Code',
      disclaimer:
        'Captured E-Code generation · fictional players, questions, and scores · local browser state only · no network multiplayer, real-time server, account system, or persistent leaderboard is demonstrated',
      openFullSizeLabel: 'Open the quiz-game capture at full resolution',
      preview: {
        title: 'A local quiz round runs beside the editable game files',
        body: 'The first capture keeps the original multiplayer-quiz request and Agent activity visible while Webview renders the question, timer, answers, score, and local leaderboard from generated source.',
        alt: 'Real E-Code Game Builder workspace showing a multiplayer quiz prompt, Agent activity, generated game files, and a local question with score and leaderboard running in Webview.',
      },
      iteration: {
        title: 'The next instruction changes the playable round in place',
        body: 'The follow-up capture records the next prompt beside the updated local quiz state. It proves that the Agent edits the same game and that local answer and score behavior remains visible; it does not prove synchronization between remote players.',
        alt: 'Real E-Code Game Builder iteration showing a follow-up prompt, generated quiz files, and the updated local question and score state in Webview.',
      },
      cta: {
        label: 'Inspect the captured quiz run',
        ariaLabel: 'Inspect the captured E-Code quiz-game generation and local play state',
      },
    },
    deliverables: {
      eyebrow: 'What you receive',
      title: 'A playable game foundation you can inspect and keep evolving',
      intro:
        'The project stays inspectable from the first generated file through Preview and export. Supported static builds add a live release through guided publishing without hiding the code.',
      items: [
        {
          title: 'Game code you can open and export',
          body: 'The render loop, round rules, interface components, state, and styles stay readable, versionable, and portable outside E-Code.',
        },
        {
          title: 'A match-state adapter, not a hidden server',
          body: 'Lobby, question, timer, and leaderboard state is explicit in the source. Connect that model to a real-time backend before expecting synchronized remote players.',
        },
        {
          title: 'A playable Preview at every target size',
          body: 'Run the local round flow in the active Preview and test its controls and scoreboard layouts on desktop, tablet, and mobile.',
        },
        {
          title: 'Guided publishing for the static frontend',
          body: 'Supported static game builds move through E-Code’s guided release path once the play-test is ready to share.',
        },
        {
          title: 'A live playtest link with a clear server boundary',
          body: 'A supported static frontend publishes to an E-Code live URL. Games that depend on a server remain exportable so you can deploy the frontend and connected runtime together.',
        },
        {
          title: 'Tune the next round by talking to the Agent',
          body: 'Ask for a new scoring rule, shorter timer, or another question type, then play the updated local flow without restarting the project.',
        },
      ],
    },
    features: {
      eyebrow: 'Built for real browser games',
      title: 'The browser-game loop, rules, and screens in code you control',
      intro:
        'The Game Builder path keeps game logic, connection-ready state, and frontend publishing in one inspectable workflow.',
      items: [
        {
          title: 'Canvas and game loop',
          body: 'A real render-and-update loop for rounds, timers, and animations you can tune.',
        },
        {
          title: 'Connection-ready multiplayer',
          body: 'Lobby and match state with integration points for the service that synchronizes remote players.',
        },
        {
          title: 'Scoring and rounds',
          body: 'Answer handling, per-round scoring, and win conditions modeled as game rules.',
        },
        {
          title: 'Play-test in Preview',
          body: 'Run the local round flow in Preview across screen sizes before you publish.',
        },
        {
          title: 'Responsive by default',
          body: 'Game screens adapt from wide desktop to phone without a separate mobile build.',
        },
        {
          title: 'Keep the source accessible',
          body: 'Export the project or publish supported static frontends while retaining editable source files.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Who builds with it',
      title: 'Playable game foundations teams extend for each audience',
      intro:
        'From a quiz-night concept to a classroom challenge, the loop produces a playable local game foundation; remote synchronization and persistence begin only after the required services are connected and tested.',
      items: [
        {
          title: 'Multiplayer quiz and trivia',
          body: 'Lobby, timed-question, and shared-score flows ready to connect to a real-time match service.',
        },
        {
          title: 'Classroom and training games',
          body: 'Interactive challenge interfaces with scoring rules and a scoreboard ready for synchronized data.',
        },
        {
          title: 'Event and campaign games',
          body: 'Branded browser-game frontends with lobbies and leaderboards you can wire to event infrastructure.',
        },
        {
          title: 'Casual arcade experiences',
          body: 'Canvas-based games with a game loop, input handling, and score tracking.',
        },
      ],
    },
    faq: {
      eyebrow: 'Common questions',
      title: 'Game Builder, answered honestly',
      intro: 'What the Game Builder path produces, and where its boundaries are.',
      items: [
        {
          title: 'Do I get real code or a locked engine?',
          body: 'You get editable source files — components, the game loop, state, and styles — that you can read, version, and export. There is no proprietary engine lock-in.',
        },
        {
          title: 'Is the multiplayer real?',
          body: 'Not in the inline demonstration: it uses fictional match data and no connected backend. The generated source can model the lobby and match state, but remote players need a real-time service that you connect, secure, and test.',
        },
        {
          title: 'Can I play-test before publishing?',
          body: 'Yes. E-Code runs the local round flow in Preview across desktop, tablet, and mobile. Testing a remote match starts after you connect its networking service.',
        },
        {
          title: 'Can I connect a real-time backend or database?',
          body: 'The generated state model is code you can extend and wire to external services. The inline demonstration on this page uses fictional data and no connected backend.',
        },
        {
          title: 'How do I change the game later?',
          body: 'Edit the files directly or ask the Agent for the next change and review the diff against the running Preview.',
        },
      ],
    },
    finalCta: {
      title: 'Describe your game and play its first rounds',
      body: 'Turn the game you have in mind into an editable browser loop, lobby, and scoring system, play-test the local flow in Preview, then connect the service that powers remote matches.',
      primaryCta: { label: 'Describe your game', ariaLabel: 'Describe your game with E-Code' },
      secondaryCta: { label: 'See how it builds', ariaLabel: 'See how E-Code builds the game from a prompt' },
    },
    aria: {
      pageLabel: 'Game Builder solution page',
      heroLabel: 'Game Builder introduction',
      demoLabel: 'Game Builder product demonstration',
      problemLabel: 'The game building problem',
      buildLabel: 'How the Game Builder works',
      outputListLabel: 'Game build outputs',
      proofLinkLabel: 'Open the Game Builder workflow evidence',
      deliverablesLabel: 'What the Game Builder delivers',
      featuresLabel: 'Game Builder capabilities',
      useCasesLabel: 'Game Builder use cases',
      faqLabel: 'Game Builder questions',
      finalCtaLabel: 'Start building your game',
    },
  },
  fr: {
    seo: {
      title: 'Générateur de jeu avec vrai code | E-Code',
      description:
        'Décrivez le jeu web que vous voulez tester. E-Code le transforme en boucle de jeu, interface multijoueur et modèle d’état modifiables, avec un aperçu actif, l’export du projet et des points de branchement clairs pour un service temps réel.',
    },
    hero: {
      eyebrow: 'Générateur de jeu pour prototypes web jouables',
      title: 'Transformez une idée de jeu en un build web que vous jouez et inspectez',
      subtitle:
        'Décrivez le jeu, les manches et la façon dont les joueurs s’affrontent. E-Code en fait une boucle modifiable, une interface de salon, des règles de score et un modèle d’état multijoueur. Jouez le parcours local dans l’aperçu, affinez-le avec l’Agent, puis connectez un service temps réel avant d’inviter des joueurs distants.',
      primaryCta: { label: 'Décrivez votre jeu', ariaLabel: 'Décrivez votre jeu avec E-Code' },
      secondaryCta: {
        label: 'Voir la construction',
        ariaLabel: 'Voir comment E-Code construit le jeu à partir d’un prompt',
      },
      microcopy:
        'Partez du jeu que vous avez déjà en tête. Les fichiers source, l’aperçu actif et les contrôles de publication restent visibles à mesure que le jeu évolue.',
    },
    languageSwitch: { label: 'Choisir la langue de la page Générateur de jeu', english: 'English', french: 'Français' },
    demo: {
      badge: 'Données fictives',
      brand: 'TriviaClash',
      brandType: 'Prototype de quiz local',
      nav: ['Salon', 'Jouer', 'Classement'],
      eyebrow: 'Manche scénarisée 3 sur 5',
      title: 'Quelle capitale se trouve sur le détroit du Bosphore ?',
      intro:
        'Un concept de quiz responsive qui présente un salon, des questions chronométrées et une interface de score partagé dans une boucle de manches claire.',
      primaryHeading: 'Classement local d’exemple',
      primaryRows: [
        { label: 'Nadia', meta: '1 240 pts fictifs', status: 'Tête d’exemple' },
        { label: 'Marco', meta: '1 180 pts fictifs' },
        { label: 'Priya', meta: '1 095 pts fictifs' },
      ],
      asideHeading: 'Question en cours',
      asideRows: [
        { label: 'Catégorie', value: 'Géographie' },
        { label: 'Chrono local', value: '0:12 fictif' },
        { label: 'Joueurs d’exemple', value: '3 locaux' },
      ],
      asideCta: 'Tester la réponse locale',
      disclaimer:
        'Interface locale scénarisée · joueurs, chrono et scores fictifs · aucune partie distante, synchronisation réseau ni classement persistant · pas une trace de génération',
      caption: {
        title: 'Une manche locale jouable avec une frontière réseau explicite',
        body: 'Cette interface scénarisée présente un classement local, l’état de la question en cours et un contrôle de réponse dans une mise en page responsive.',
      },
      alt: 'Interface locale scénarisée de quiz avec scores fictifs et panneau de question ; aucun multijoueur distant affiché.',
    },
    problem: {
      eyebrow: 'Du carcan du moteur à une boucle de jeu inspectable',
      title:
        'Les créateurs de jeu paraissent simples jusqu’à ce que l’état multijoueur et le test en jeu se heurtent à l’outil',
      intro:
        'Un jeu de quiz en direct a besoin d’une boucle serrée : un salon qui se remplit, des questions qui se déclenchent en synchronie et un classement qui se met à jour pour tout le monde en même temps. Les outils no-code démarrent vite, puis masquent la boucle de jeu et le réseau, et l’export correspond rarement à un code que l’équipe peut faire évoluer.',
      obstacles: [
        {
          title: 'La boucle de jeu reste masquée',
          body: 'Les créateurs par glisser-déposer masquent la boucle de rendu et le minutage, donc un score sur mesure, un rythme de manches et des animations reviennent à lutter contre l’outil au lieu de modifier la boucle.',
        },
        {
          title: 'L’état multijoueur se désynchronise',
          body: 'Quand chaque client suit son propre score et son propre chrono, les joueurs voient des classements différents, et aucune source unique n’est inspectable, versionnable et raisonnée par l’équipe.',
        },
        {
          title: 'Vous ne pouvez pas vraiment le tester en jeu',
          body: 'Prévisualiser un écran n’est pas jouer une partie. Sans jeu actif ni vraies manches, les bugs de minutage et les cas limites n’apparaissent qu’une fois les joueurs en ligne.',
        },
      ],
      bridge:
        'E-Code part du jeu que vous décrivez et produit une boucle web, des règles et un modèle d’état multijoueur modifiables dans les fichiers source. Vous testez le parcours local dans l’aperçu, branchez le réseau aux endroits exposés par le code et demandez le changement suivant sans quitter le projet.',
    },
    build: {
      eyebrow: 'Un prompt lance le jeu',
      title: 'Décrivez les manches, pas le moteur',
      intro:
        'La demande ci-dessous se lit comme un mot d’un concepteur de jeu. Les quatre éléments cartographient son périmètre d’implémentation dans de vrais fichiers source, pas un moteur verrouillé.',
      label: 'Exemple de prompt',
      promptText: 'Crée un jeu de quiz multijoueur avec score en temps réel et classement.',
      outputs: [
        {
          title: 'Boucle de jeu sur canvas',
          body: 'Une vraie boucle de rendu et de mise à jour anime les manches, les chronos et les animations sur desktop, tablette et mobile à partir de composants modifiables.',
        },
        {
          title: 'Modèle d’état multijoueur',
          body: 'Les états du salon, de la question, du chrono et du classement vivent dans un code modifiable avec des points de branchement explicites pour un backend temps réel. La synchronisation distante ne démarre qu’une fois ce service connecté.',
        },
        {
          title: 'Score et manches',
          body: 'Le traitement des réponses, le score par manche et les conditions de victoire sont modélisés comme de vraies règles de jeu plutôt qu’un écran statique.',
        },
        {
          title: 'Aperçu et publication',
          body: 'E-Code exécute le parcours local dans l’aperçu à toutes les tailles d’écran. Les frontends statiques pris en charge suivent la publication guidée ; les parties distantes exigent toujours le service temps réel que vous connectez.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Règles du quiz → Agent → Webview jouable',
      title: 'Jouez au quiz assemblé par l’Agent dans l’IDE',
      body: 'Ces captures E-Code dédiées montrent le prompt du quiz, l’échange avec l’Agent, les fichiers du jeu générés et une manche locale active dans la Webview, sans quitter le projet.',
      galleryLabel: 'Génération capturée du jeu de quiz et partie locale dans E-Code',
      disclaimer:
        'Génération E-Code capturée · joueurs, questions et scores fictifs · état local du navigateur uniquement · aucun multijoueur réseau, serveur temps réel, système de comptes ni classement persistant démontré',
      openFullSizeLabel: 'Ouvrir la capture du jeu de quiz en pleine résolution',
      preview: {
        title: 'Une manche locale tourne à côté des fichiers modifiables du jeu',
        body: 'La première capture conserve la demande initiale de quiz multijoueur et l’activité de l’Agent pendant que la Webview affiche la question, le chrono, les réponses, le score et le classement local issus de la source générée.',
        alt: 'Vrai workspace Game Builder E-Code montrant un prompt de quiz multijoueur, l’activité de l’Agent, les fichiers générés et une question locale avec score et classement dans la Webview.',
      },
      iteration: {
        title: 'L’instruction suivante modifie la manche jouable sur place',
        body: 'La capture de suivi conserve le nouveau prompt auprès de l’état local du quiz mis à jour. Elle prouve que l’Agent modifie le même jeu et que les réponses et le score locaux restent visibles ; elle ne prouve aucune synchronisation entre joueurs distants.',
        alt: 'Vraie itération Game Builder E-Code montrant un prompt de suivi, les fichiers du quiz et l’état local mis à jour de la question et du score dans la Webview.',
      },
      cta: {
        label: 'Inspecter le run capturé du quiz',
        ariaLabel: 'Inspecter la génération E-Code capturée du jeu de quiz et son état de partie local',
      },
    },
    deliverables: {
      eyebrow: 'Ce que vous recevez',
      title: 'Une base de jeu jouable que vous inspectez et faites évoluer',
      intro:
        'Le projet reste inspectable du premier fichier généré jusqu’à l’aperçu et l’export. Les builds statiques pris en charge ajoutent une mise en ligne guidée sans masquer le code.',
      items: [
        {
          title: 'Un code de jeu ouvert et exportable',
          body: 'La boucle de rendu, les règles de manche, les composants d’interface, l’état et les styles restent lisibles, versionnables et transportables hors d’E-Code.',
        },
        {
          title: 'Un adaptateur d’état de partie, pas un serveur caché',
          body: 'Les états du salon, de la question, du chrono et du classement apparaissent dans la source. Branchez ce modèle à un backend temps réel avant d’attendre une synchronisation entre joueurs distants.',
        },
        {
          title: 'Un aperçu jouable à chaque format cible',
          body: 'Exécutez le parcours local des manches dans l’aperçu actif et testez les contrôles et le classement sur desktop, tablette et mobile.',
        },
        {
          title: 'Publication guidée du frontend statique',
          body: 'Les builds statiques de jeu pris en charge suivent le parcours de mise en ligne E-Code quand le test en jeu est prêt à être partagé.',
        },
        {
          title: 'Un lien de test en ligne avec une frontière serveur claire',
          body: 'Un frontend statique pris en charge se publie sur une URL E-Code. Les jeux qui dépendent d’un serveur restent exportables afin de déployer ensemble le frontend et le runtime connecté.',
        },
        {
          title: 'Réglez la manche suivante avec l’Agent',
          body: 'Demandez une nouvelle règle de score, un chrono plus court ou un autre type de question, puis jouez le parcours local mis à jour sans recréer le projet.',
        },
      ],
    },
    features: {
      eyebrow: 'Pensé pour de vrais jeux dans le navigateur',
      title: 'La boucle, les règles et les écrans du jeu web dans un code que vous maîtrisez',
      intro:
        'Le parcours Générateur de jeu garde la logique, l’état prêt à connecter et la publication du frontend dans un seul flux inspectable.',
      items: [
        {
          title: 'Canvas et boucle de jeu',
          body: 'Une vraie boucle de rendu et de mise à jour pour les manches, chronos et animations que vous réglez.',
        },
        {
          title: 'Multijoueur prêt à connecter',
          body: 'Un salon et un état de partie avec les points d’intégration du service qui synchronise les joueurs distants.',
        },
        {
          title: 'Score et manches',
          body: 'Traitement des réponses, score par manche et conditions de victoire modélisés comme des règles de jeu.',
        },
        {
          title: 'Test en jeu dans l’aperçu',
          body: 'Jouez le parcours local dans l’aperçu à toutes les tailles d’écran avant de publier.',
        },
        {
          title: 'Responsive par défaut',
          body: 'Les écrans de jeu s’adaptent du grand écran au téléphone sans build mobile séparé.',
        },
        {
          title: 'Gardez la source accessible',
          body: 'Exportez le projet ou publiez les frontends statiques pris en charge tout en conservant des fichiers source modifiables.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Qui construit avec',
      title: 'Les bases de jeux jouables que les équipes étendent pour chaque public',
      intro:
        'D’un concept de soirée quiz à un défi en classe, la boucle produit une base de jeu local jouable ; synchronisation distante et persistance commencent seulement après branchement et test des services requis.',
      items: [
        {
          title: 'Quiz et trivia multijoueur',
          body: 'Parcours de salon, questions chronométrées et score partagé prêts à brancher à un service de partie temps réel.',
        },
        {
          title: 'Jeux en classe et formation',
          body: 'Interfaces de défis interactifs avec règles de score et classement prêt pour des données synchronisées.',
        },
        {
          title: 'Jeux d’événement et campagne',
          body: 'Frontends de jeux de marque avec salons et classements à brancher à l’infrastructure de l’événement.',
        },
        {
          title: 'Expériences arcade casual',
          body: 'Jeux sur canvas avec boucle de jeu, gestion des entrées et suivi du score.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions fréquentes',
      title: 'Le Générateur de jeu, en toute honnêteté',
      intro: 'Ce que produit le parcours Générateur de jeu, et où sont ses limites.',
      items: [
        {
          title: 'J’obtiens du vrai code ou un moteur verrouillé ?',
          body: 'Vous obtenez des fichiers source modifiables — composants, boucle de jeu, état et styles — que vous lisez, versionnez et exportez. Aucun verrouillage propriétaire de moteur.',
        },
        {
          title: 'Le multijoueur est-il réel ?',
          body: 'Pas dans la démonstration intégrée : elle utilise des données de partie fictives et aucun backend connecté. La source générée peut modéliser le salon et l’état de partie, mais les joueurs distants exigent un service temps réel que vous connectez, sécurisez et testez.',
        },
        {
          title: 'Puis-je tester le jeu avant de publier ?',
          body: 'Oui. E-Code exécute le parcours local des manches dans l’aperçu sur desktop, tablette et mobile. Le test d’une partie distante commence après le branchement du service réseau.',
        },
        {
          title: 'Puis-je connecter un backend temps réel ou une base ?',
          body: 'Le modèle d’état généré est du code que vous étendez et branchez à des services externes. La démonstration intégrée de cette page utilise des données fictives et aucun backend connecté.',
        },
        {
          title: 'Comment modifier le jeu ensuite ?',
          body: 'Modifiez les fichiers directement ou demandez le changement suivant à l’Agent et relisez le diff face à l’aperçu actif.',
        },
      ],
    },
    finalCta: {
      title: 'Décrivez votre jeu et jouez ses premières manches',
      body: 'Transformez le jeu que vous avez en tête en une boucle web, un salon et un système de score modifiables, testez le parcours local dans l’aperçu, puis connectez le service qui anime les parties distantes.',
      primaryCta: { label: 'Décrivez votre jeu', ariaLabel: 'Décrivez votre jeu avec E-Code' },
      secondaryCta: {
        label: 'Voir la construction',
        ariaLabel: 'Voir comment E-Code construit le jeu à partir d’un prompt',
      },
    },
    aria: {
      pageLabel: 'Page solution Générateur de jeu',
      heroLabel: 'Introduction du Générateur de jeu',
      demoLabel: 'Démonstration produit du Générateur de jeu',
      problemLabel: 'Le problème de la création de jeu',
      buildLabel: 'Comment fonctionne le Générateur de jeu',
      outputListLabel: 'Résultats de la génération de jeu',
      proofLinkLabel: 'Ouvrir la preuve du workflow Générateur de jeu',
      deliverablesLabel: 'Ce que livre le Générateur de jeu',
      featuresLabel: 'Capacités du Générateur de jeu',
      useCasesLabel: 'Cas d’usage du Générateur de jeu',
      faqLabel: 'Questions sur le Générateur de jeu',
      finalCtaLabel: 'Commencer à construire votre jeu',
    },
  },
} as const satisfies SolutionCopyByLanguage;
