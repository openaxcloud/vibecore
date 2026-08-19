import type { SolutionCopyByLanguage } from './solution-copy';

/**
 * SOL — Game Builder. Declined from the App Builder gabarit, centered on a
 * fictional multiplayer quiz game. All demo data is fictional and labeled; the
 * embedded IDE images come from the separately verified App Builder run.
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
      brandType: 'Live multiplayer quiz',
      nav: ['Lobby', 'Play', 'Leaderboard'],
      eyebrow: 'Round 3 of 5',
      title: 'Which capital sits on the Bosphorus strait?',
      intro:
        'A responsive quiz concept that presents a lobby, timed questions, and a shared-score interface in one clear round loop.',
      primaryHeading: 'Live scoreboard',
      primaryRows: [
        { label: 'Nadia', meta: '1,240 pts', status: 'Leading' },
        { label: 'Marco', meta: '1,180 pts' },
        { label: 'Priya', meta: '1,095 pts' },
      ],
      asideHeading: 'Current question',
      asideRows: [
        { label: 'Category', value: 'Geography' },
        { label: 'Time left', value: '0:12' },
        { label: 'Players', value: '24' },
      ],
      asideCta: 'Submit answer',
      disclaimer: 'Inline responsive demonstration · fictional match data · not a generation record',
      caption: {
        title: 'A game screen that plays like a real match',
        body: 'This inline demonstration shows a live scoreboard, the current question panel, and an answer control in one responsive layout.',
      },
      alt: 'Multiplayer quiz game demonstration with a live scoreboard and a current-question panel.',
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
      eyebrow: 'From plain-language instruction to a running Preview',
      title: 'See the IDE loop behind an E-Code build',
      body: 'The App Builder page shows a captured, real E-Code workspace — the prompt, the agent’s plan, the generated files, and the running Preview — for a booking application. The same build loop applies to an interactive game like this one.',
      galleryLabel: 'Real IDE evidence beside the quiz concept',
      disclaimer:
        'Proof boundary: both screenshots belong to the real App Builder salon run and demonstrate the E-Code workflow. TriviaClash is a scripted, fictional match view; it is not a recorded Game Builder run or evidence of a connected multiplayer server.',
      openFullSizeLabel: 'Open the salon-run IDE capture at full resolution',
      preview: {
        title: 'A working application inside the E-Code Webview',
        body: 'The captured salon run places the user prompt, Agent plan, editable files, and running application on one screen—the same surfaces used to build and test a browser game.',
        alt: 'Real E-Code App Builder capture with the salon prompt and agent tasks, a running booking dashboard in the Webview, and the source-file library.',
      },
      iteration: {
        title: 'The Agent receives a concrete runtime repair request',
        body: 'This genuine follow-up shows an error described in plain language so the Agent can inspect the code, preserve the working routes, and verify the Preview again.',
        alt: 'Real E-Code App Builder capture with a React runtime repair prompt, the salon application Webview, and its editable source files in the IDE.',
      },
      cta: {
        label: 'Open the recorded build workflow',
        ariaLabel: 'Open the recorded E-Code App Builder workflow used as Game Builder evidence',
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
      title: 'Games teams ship with the Game Builder',
      intro: 'From a live quiz night to a classroom challenge, the same loop produces a real, playable game.',
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
      title: 'Transformez une idée de jeu en une version navigateur que vous jouez et inspectez',
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
      brandType: 'Quiz multijoueur en direct',
      nav: ['Salon', 'Jouer', 'Classement'],
      eyebrow: 'Manche 3 sur 5',
      title: 'Quelle capitale se trouve sur le détroit du Bosphore ?',
      intro:
        'Un concept de quiz adaptatif qui présente un salon, des questions chronométrées et une interface de score partagé dans une boucle de manches claire.',
      primaryHeading: 'Classement en direct',
      primaryRows: [
        { label: 'Nadia', meta: '1 240 pts', status: 'En tête' },
        { label: 'Marco', meta: '1 180 pts' },
        { label: 'Priya', meta: '1 095 pts' },
      ],
      asideHeading: 'Question en cours',
      asideRows: [
        { label: 'Catégorie', value: 'Géographie' },
        { label: 'Temps restant', value: '0:12' },
        { label: 'Joueurs', value: '24' },
      ],
      asideCta: 'Valider la réponse',
      disclaimer: 'Démonstration adaptative intégrée · données de partie fictives · pas une trace de génération',
      caption: {
        title: 'Un écran de jeu qui se joue comme une vraie partie',
        body: 'Cette démonstration intégrée présente un classement en direct, le panneau de la question en cours et un contrôle de réponse dans une mise en page adaptative.',
      },
      alt: 'Démonstration de jeu de quiz multijoueur avec un classement en direct et un panneau de question en cours.',
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
          body: 'Les états du salon, de la question, du chrono et du classement vivent dans un code modifiable avec des points de branchement explicites pour un service applicatif temps réel. La synchronisation distante ne démarre qu’une fois ce service connecté.',
        },
        {
          title: 'Score et manches',
          body: 'Le traitement des réponses, le score par manche et les conditions de victoire sont modélisés comme de vraies règles de jeu plutôt qu’un écran statique.',
        },
        {
          title: 'Aperçu et publication',
          body: 'E-Code exécute le parcours local dans l’aperçu à toutes les tailles d’écran. Les interfaces statiques prises en charge suivent la publication guidée ; les parties distantes exigent toujours le service temps réel que vous connectez.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'De l’instruction en langage courant à l’aperçu actif',
      title: 'Découvrez la boucle IDE derrière une construction E-Code',
      body: 'La page Générateur d’applications montre un vrai espace de travail E-Code capturé — le prompt, le plan de l’agent, les fichiers générés et l’aperçu actif — pour une application de réservation. La même boucle de construction s’applique à un jeu interactif comme celui-ci.',
      galleryLabel: 'Preuve IDE réelle en regard du concept de quiz',
      disclaimer:
        'Périmètre de la preuve : les deux captures appartiennent au vrai run Générateur d’applications du salon et montrent le processus E-Code. TriviaClash reste une vue de partie scénarisée et fictive ; ce n’est ni un run Game Builder enregistré, ni la preuve d’un serveur multijoueur connecté.',
      openFullSizeLabel: 'Ouvrir la capture IDE du run salon en pleine résolution',
      preview: {
        title: 'Une application fonctionnelle dans la Webview E-Code',
        body: 'Le run salon capturé réunit le prompt utilisateur, le plan de l’Agent, les fichiers modifiables et l’application active sur un même écran — les mêmes surfaces qui servent à construire et tester un jeu web.',
        alt: 'Vraie capture Générateur d’applications E-Code avec le prompt salon et les tâches de l’agent, un tableau de bord de réservation actif dans la Webview et la bibliothèque de fichiers source.',
      },
      iteration: {
        title: 'L’Agent reçoit une demande précise de réparation d’exécution',
        body: 'Ce vrai suivi formule une erreur en langage courant pour que l’Agent inspecte le code, préserve les routes fonctionnelles et vérifie à nouveau l’aperçu.',
        alt: 'Vraie capture Générateur d’applications E-Code avec un prompt de réparation d’exécution React, la Webview de l’application salon et ses fichiers source modifiables dans l’IDE.',
      },
      cta: {
        label: 'Ouvrir le processus de construction enregistré',
        ariaLabel:
          'Ouvrir le processus Générateur d’applications E-Code enregistré et utilisé comme preuve du Générateur de jeu',
      },
    },
    deliverables: {
      eyebrow: 'Ce que vous recevez',
      title: 'Une base de jeu jouable que vous inspectez et faites évoluer',
      intro:
        'Le projet reste inspectable du premier fichier généré jusqu’à l’aperçu et l’export. Les compilations statiques prises en charge ajoutent une mise en ligne guidée sans masquer le code.',
      items: [
        {
          title: 'Un code de jeu ouvert et exportable',
          body: 'La boucle de rendu, les règles de manche, les composants d’interface, l’état et les styles restent lisibles, versionnables et transportables hors d’E-Code.',
        },
        {
          title: 'Un adaptateur d’état de partie, pas un serveur caché',
          body: 'Les états du salon, de la question, du chrono et du classement apparaissent dans la source. Branchez ce modèle à un service applicatif temps réel avant d’attendre une synchronisation entre joueurs distants.',
        },
        {
          title: 'Un aperçu jouable à chaque format cible',
          body: 'Exécutez le parcours local des manches dans l’aperçu actif et testez les contrôles et le classement sur desktop, tablette et mobile.',
        },
        {
          title: 'Publication guidée de l’interface statique',
          body: 'Les compilations statiques de jeu prises en charge suivent le parcours de mise en ligne E-Code quand le test en jeu est prêt à être partagé.',
        },
        {
          title: 'Un lien de test en ligne avec une frontière serveur claire',
          body: 'Une interface statique prise en charge se publie sur une URL E-Code. Les jeux qui dépendent d’un serveur restent exportables afin de déployer ensemble l’interface utilisateur et l’environnement d’exécution connecté.',
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
        'Le parcours Générateur de jeu garde la logique, l’état prêt à connecter et la publication de l’interface utilisateur dans un seul flux inspectable.',
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
          title: 'Adaptatif par défaut',
          body: 'Les écrans de jeu s’adaptent du grand écran au téléphone sans compilation mobile séparée.',
        },
        {
          title: 'Gardez la source accessible',
          body: 'Exportez le projet ou publiez les interfaces statiques prises en charge tout en conservant des fichiers source modifiables.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Qui construit avec',
      title: 'Les jeux que les équipes livrent avec le Générateur de jeu',
      intro: 'D’une soirée quiz en direct à un défi en classe, la même boucle produit un vrai jeu jouable.',
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
          body: 'Interfaces de jeux de marque avec salons et classements à brancher à l’infrastructure de l’événement.',
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
          body: 'Pas dans la démonstration intégrée : elle utilise des données de partie fictives et aucun service applicatif connecté. La source générée peut modéliser le salon et l’état de partie, mais les joueurs distants exigent un service temps réel que vous connectez, sécurisez et testez.',
        },
        {
          title: 'Puis-je tester le jeu avant de publier ?',
          body: 'Oui. E-Code exécute le parcours local des manches dans l’aperçu sur desktop, tablette et mobile. Le test d’une partie distante commence après le branchement du service réseau.',
        },
        {
          title: 'Puis-je connecter un service applicatif temps réel ou une base ?',
          body: 'Le modèle d’état généré est du code que vous étendez et branchez à des services externes. La démonstration intégrée de cette page utilise des données fictives et aucun service applicatif connecté.',
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
      proofLinkLabel: 'Ouvrir la preuve du processus Générateur de jeu',
      deliverablesLabel: 'Ce que livre le Générateur de jeu',
      featuresLabel: 'Capacités du Générateur de jeu',
      useCasesLabel: 'Cas d’usage du Générateur de jeu',
      faqLabel: 'Questions sur le Générateur de jeu',
      finalCtaLabel: 'Commencer à construire votre jeu',
    },
  },
} as const satisfies SolutionCopyByLanguage;
