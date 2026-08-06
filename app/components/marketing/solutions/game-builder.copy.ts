import type { CapturedSolutionCopyByLanguage } from './solution-copy';

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
        'Describe TriviaClash. E-Code generates an editable browser quiz with lobby, timed questions, local scores, and leaderboard; remote multiplayer needs a backend.',
      ogImageAlt: 'E-Code Game Builder workspace with TriviaClash files and a local quiz running in Webview.',
    },
    hero: {
      eyebrow: 'Game Builder for playable browser prototypes',
      title: 'Turn a game idea into a browser build you can play and inspect',
      subtitle:
        'Describe the quiz, the timed rounds, and the leaderboard. E-Code generates the React and TypeScript files, opens TriviaClash in Webview, and keeps the Agent conversation beside the running game. The captured flow uses fictional players and browser-local state; remote players need a backend you connect and test.',
      primaryCta: { label: 'Describe your game', ariaLabel: 'Describe your game with E-Code' },
      secondaryCta: { label: 'See the playable loop', ariaLabel: 'See how E-Code builds the game from a prompt' },
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
      title: 'Which city sits on the Bosphorus strait?',
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
        'E-Code starts from the quiz you describe and produces editable React and TypeScript source for its lobby, questions, timer, score, and leaderboard. You test that local browser flow in Preview and request the next change without leaving the project. No network service hides behind the demo.',
    },
    build: {
      eyebrow: 'One prompt starts the game',
      title: 'Describe the rounds, not the engine',
      intro:
        'The request below reads like a note from a game designer. The four items map its implementation scope in real source files, not a locked engine.',
      label: 'Quiz game brief',
      promptText: 'Build a multiplayer quiz game with real-time scoring and a leaderboard.',
      outputs: [
        {
          title: 'A working local lobby',
          body: 'TriviaClash opens on a dark arcade lobby with fictional players, a visible local-only notice, and an orange Start quiz action.',
        },
        {
          title: 'Timed questions in React state',
          body: 'Starting the quiz opens Question 1. Answer selection, countdown, score updates, and the final leaderboard run from browser-local state in editable React and TypeScript files.',
        },
        {
          title: 'Fictional score and leaderboard data',
          body: 'Player names, points, and rankings are realistic sample content for the local playtest. They are not remote accounts, synchronized match results, or persistent records.',
        },
        {
          title: 'Agent, files, and playable Webview',
          body: 'The original prompt, Agent work, generated game files, and running Webview stay visible in one IDE while the local lobby changes into the first question.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Quiz rules → Agent → playable Webview',
      title: 'Play the quiz the Agent assembled inside the IDE',
      body: 'These dedicated E-Code captures show the TriviaClash prompt, the Agent exchange, the generated React and TypeScript files, then the local lobby and first question running in Webview.',
      galleryLabel: 'Captured quiz-game generation and local play inside E-Code',
      disclaimer:
        'Captured E-Code generation · fictional players, questions, and scores · local browser state only · no network multiplayer, real-time server, account system, or persistent leaderboard is demonstrated',
      openFullSizeLabel: 'Open the quiz-game capture at full resolution',
      preview: {
        title: 'TriviaClash opens on its local lobby',
        body: 'The first capture keeps the original quiz request and Agent activity visible beside the generated files while Webview renders TriviaClash’s dark lobby, fictional players, local-only disclosure, and Start quiz action.',
        alt: 'Real E-Code Game Builder workspace showing the TriviaClash prompt, Agent activity, generated React files, and the dark local lobby with a Start quiz button in Webview.',
      },
      iteration: {
        title: 'A verified Start quiz click opens Question 1',
        body: 'After the single generation, a verified click on “Start quiz” opens Question 1 in the same Webview. The capture proves that interface transition, not answer scoring, persistence, or synchronization between remote players.',
        alt: 'E-Code Game Builder capture after the verified Start quiz click, with TriviaClash files and Question 1 open in Webview.',
      },
      cta: {
        label: 'Inspect the captured quiz run',
        ariaLabel: 'Inspect the captured E-Code quiz-game generation and local play state',
      },
    },
    proofVisualAlts: {
      prompt: 'E-Code Agent prompt requesting TriviaClash with a multiplayer quiz flow, scoring, and leaderboard.',
      preview: 'E-Code workspace with generated TriviaClash files and the dark local lobby open in Webview.',
      webviewOverview:
        'TriviaClash lobby in Webview with fictional players, a local-only notice, and Start quiz action.',
      iteration:
        'E-Code workspace after the verified Start quiz click, with TriviaClash files and Question 1 in Webview.',
      webviewIteration: 'TriviaClash Question 1 opened from the local lobby after the verified Start quiz interaction.',
      files: 'E-Code file tree for TriviaClash with editable lobby, question, scoring, and leaderboard source.',
    },
    deliverables: {
      eyebrow: 'What the playable quiz includes',
      title: 'A playable game foundation you can inspect and keep evolving',
      intro:
        'TriviaClash stays inspectable from lobby state and timed-question logic through local scoring, Preview, and export. Supported static quiz builds add guided publishing while the multiplayer boundary remains explicit.',
      items: [
        {
          title: 'Game code you can open and export',
          body: 'The lobby, question views, local state, answer controls, timer presentation, leaderboard, and styles stay readable, versionable, and portable outside E-Code.',
        },
        {
          title: 'Local match state, not a hidden server',
          body: 'Lobby, question, timer, score, and leaderboard behavior runs locally in the browser. The captured project includes no network multiplayer backend or persistent store.',
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
      title: 'Trivia lobby, timed rounds, and local scores in code you control',
      intro:
        'The Game Builder path keeps TriviaClash’s generated source, local game states, and running Webview in one inspectable workflow.',
      items: [
        {
          title: 'Lobby to Question 1',
          body: 'A working Start quiz transition takes the local game from its player lobby into the first timed question.',
        },
        {
          title: 'Explicitly local multiplayer-style UI',
          body: 'Fictional players share one browser state for the demo. No network connection or synchronized client behavior is implied.',
        },
        {
          title: 'Scoring and rounds',
          body: 'Answer handling, per-round scoring, and win conditions modeled as game rules.',
        },
        {
          title: 'Play-test in Webview',
          body: 'Run the local lobby and question flow in E-Code’s real Webview while the Agent prompt and files remain available for inspection.',
        },
        {
          title: 'Responsive play surface',
          body: 'Game screens adapt from wide desktop to phone without a separate mobile build.',
        },
        {
          title: 'Own the game-loop source',
          body: 'Export the project or publish supported static frontends while retaining editable source files.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Game formats to play-test',
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
          title: 'Team trivia playtests',
          body: 'Prototype lobby copy, question pacing, local scoring, and leaderboard presentation before adding any remote-match service.',
        },
      ],
    },
    faq: {
      eyebrow: 'Quiz-game questions',
      title: 'Game Builder, answered honestly',
      intro: 'What the Game Builder path produces, and where its boundaries are.',
      items: [
        {
          title: 'Do I get real code or a locked engine?',
          body: 'You get editable React and TypeScript source for the lobby, questions, local state, controls, and styles. The captured TriviaClash project is not a video or a static mockup.',
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
          body: 'Edit the lobby and round logic directly or ask the Agent for another question type, scoring rule, or leaderboard state, then play-test the diff in Preview.',
        },
      ],
    },
    finalCta: {
      title: 'Describe your game and play its first rounds',
      body: 'Turn the game you have in mind into an editable browser loop, lobby, and scoring system, play-test the local flow in Preview, then connect the service that powers remote matches.',
      primaryCta: { label: 'Describe your game', ariaLabel: 'Describe your game with E-Code' },
      secondaryCta: { label: 'See the playable loop', ariaLabel: 'See how E-Code builds the game from a prompt' },
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
      title: 'Générateur de jeu avec un code source modifiable | E-Code',
      description:
        'Décrivez TriviaClash. E-Code génère un quiz web modifiable avec une salle d’attente, des questions, des scores et un classement gérés localement ; le multijoueur distant exige un backend.',
      ogImageAlt: 'Workspace E-Code Game Builder avec fichiers TriviaClash et quiz local actif dans la Webview.',
    },
    hero: {
      eyebrow: 'Générateur de jeu pour prototypes web jouables',
      title: 'Transformez une idée de jeu en un build web que vous jouez et inspectez',
      subtitle:
        'Décrivez le quiz, les manches chronométrées et le classement. E-Code génère les fichiers React et TypeScript, ouvre TriviaClash dans la Webview et garde la conversation avec l’Agent à côté du jeu actif. Le parcours capturé utilise des joueurs fictifs et un état local dans le navigateur ; les joueurs distants exigent un backend connecté et testé.',
      primaryCta: { label: 'Décrivez votre jeu', ariaLabel: 'Décrivez votre jeu avec E-Code' },
      secondaryCta: {
        label: 'Voir la boucle jouable',
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
      nav: ['Salle d’attente', 'Jouer', 'Classement'],
      eyebrow: 'Manche scénarisée 3 sur 5',
      title: 'Quelle ville se trouve sur le détroit du Bosphore ?',
      intro:
        'Un concept de quiz responsive qui présente une salle d’attente, des questions chronométrées et une interface de score partagé dans une boucle de manches claire.',
      primaryHeading: 'Classement local d’exemple',
      primaryRows: [
        { label: 'Nadia', meta: '1 240 pts fictifs', status: 'Première (exemple)' },
        { label: 'Marco', meta: '1 180 pts fictifs' },
        { label: 'Priya', meta: '1 095 pts fictifs' },
      ],
      asideHeading: 'Question en cours',
      asideRows: [
        { label: 'Catégorie', value: 'Géographie' },
        { label: 'Chrono local', value: '0:12 fictif' },
        { label: 'Joueurs d’exemple', value: '3 joueurs locaux' },
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
        'Un jeu de quiz en direct a besoin d’une boucle serrée : une salle de jeu qui se remplit, des questions qui se déclenchent en synchronie et un classement qui se met à jour pour tout le monde en même temps. Les outils no-code démarrent vite, puis masquent la boucle de jeu et le réseau, et l’export correspond rarement à un code que l’équipe peut faire évoluer.',
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
        'E-Code part du quiz décrit et produit une source React et TypeScript modifiable pour la salle d’attente, les questions, le chrono, le score et le classement. Vous testez ce parcours local dans l’aperçu et demandez le changement suivant sans quitter le projet. Aucun service réseau ne se cache derrière la démo.',
    },
    build: {
      eyebrow: 'Un prompt lance le jeu',
      title: 'Décrivez les manches, pas le moteur',
      intro:
        'La demande ci-dessous se lit comme un mot d’un concepteur de jeu. Les quatre éléments en précisent le périmètre d’implémentation dans de vrais fichiers source, pas un moteur verrouillé.',
      label: 'Brief du jeu de quiz',
      promptText: 'Créez un jeu de quiz multijoueur avec score en temps réel et classement.',
      outputs: [
        {
          title: 'Une salle d’attente locale fonctionnelle',
          body: 'TriviaClash s’ouvre sur une salle d’attente de style arcade sombre, avec des joueurs fictifs, une limite locale visible et une action orange « Démarrer le quiz ».',
        },
        {
          title: 'Des questions chronométrées en état React',
          body: 'Le démarrage ouvre Question 1. Choix de réponse, compte à rebours, mise à jour du score et classement final fonctionnent depuis un état local dans le navigateur, au sein de fichiers React et TypeScript modifiables.',
        },
        {
          title: 'Scores et classement fictifs',
          body: 'Noms de joueurs, points et rangs constituent un contenu d’exemple réaliste pour le test local. Ce ne sont ni des comptes distants, ni des résultats synchronisés, ni des données persistantes.',
        },
        {
          title: 'Agent, fichiers et Webview jouable',
          body: 'Le prompt initial, le travail de l’Agent, les fichiers générés et la Webview active restent visibles dans le même IDE pendant que la salle d’attente locale mène à la première question.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Règles du quiz → Agent → Webview jouable',
      title: 'Jouez au quiz assemblé par l’Agent dans l’IDE',
      body: 'Ces captures E-Code dédiées montrent le prompt TriviaClash, l’échange avec l’Agent, les fichiers React et TypeScript générés, puis la salle d’attente locale et la première question, toutes deux actives dans la Webview.',
      galleryLabel: 'Génération capturée du jeu de quiz et partie locale dans E-Code',
      disclaimer:
        'Génération E-Code capturée · joueurs, questions et scores fictifs · état local du navigateur uniquement · aucun multijoueur réseau, serveur temps réel, système de comptes ni classement persistant démontré',
      openFullSizeLabel: 'Ouvrir la capture du jeu de quiz en pleine résolution',
      preview: {
        title: 'TriviaClash s’ouvre sur sa salle d’attente locale',
        body: 'La première capture garde la demande initiale et l’activité de l’Agent à côté des fichiers générés pendant que la Webview affiche la salle d’attente sombre de TriviaClash, ses joueurs fictifs, la limite locale et l’action « Démarrer le quiz ».',
        alt: 'Vrai workspace Game Builder E-Code montrant le prompt TriviaClash, l’activité de l’Agent, les fichiers React générés et la salle d’attente locale sombre avec le bouton Démarrer le quiz dans la Webview.',
      },
      iteration: {
        title: 'Un clic vérifié sur Démarrer le quiz ouvre Question 1',
        body: 'Après la génération unique, un clic vérifié sur « Démarrer le quiz » ouvre Question 1 dans la même Webview. La capture prouve cette transition d’interface, pas le calcul du score, la persistance ni la synchronisation entre joueurs distants.',
        alt: 'Capture E-Code Game Builder après le clic vérifié sur Démarrer le quiz, avec fichiers TriviaClash et Question 1 dans la Webview.',
      },
      cta: {
        label: 'Inspecter l’exécution capturée du quiz',
        ariaLabel: 'Inspecter la génération E-Code capturée du jeu de quiz et son état de partie local',
      },
    },
    proofVisualAlts: {
      prompt: 'Prompt de l’Agent E-Code demandant TriviaClash avec quiz multijoueur, score et classement.',
      preview:
        'Workspace E-Code avec fichiers TriviaClash générés et salle d’attente locale sombre ouverte dans la Webview.',
      webviewOverview:
        'Salle d’attente de TriviaClash dans la Webview avec joueurs fictifs, limite locale et action Démarrer le quiz.',
      iteration:
        'Workspace E-Code après le clic vérifié sur Démarrer le quiz, avec fichiers TriviaClash et Question 1.',
      webviewIteration:
        'Question 1 de TriviaClash ouverte depuis la salle d’attente après l’interaction Démarrer le quiz vérifiée.',
      files:
        'Arborescence E-Code de TriviaClash avec sources modifiables de la salle d’attente, des questions, du score et du classement.',
    },
    deliverables: {
      eyebrow: 'Ce que comprend le quiz jouable',
      title: 'Une base de jeu jouable que vous inspectez et faites évoluer',
      intro:
        'TriviaClash reste inspectable, de l’état de la salle d’attente et des questions chronométrées jusqu’au score local, à l’aperçu et à l’export. Les quiz statiques pris en charge ajoutent une publication guidée tout en gardant explicite la frontière multijoueur.',
      items: [
        {
          title: 'Un code de jeu ouvert et exportable',
          body: 'La salle d’attente, les vues de questions, l’état local, les contrôles de réponse, la présentation du chrono, le classement et les styles restent lisibles, versionnables et transportables hors d’E-Code.',
        },
        {
          title: 'Un état de partie local, pas un serveur caché',
          body: 'Salle d’attente, question, chrono, score et classement fonctionnent localement dans le navigateur. Le projet capturé n’inclut ni backend multijoueur réseau ni stockage persistant.',
        },
        {
          title: 'Un aperçu jouable à chaque format cible',
          body: 'Exécutez le parcours local des manches dans l’aperçu actif et testez les contrôles et le classement sur ordinateur, tablette et mobile.',
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
      title: 'Salle d’attente du quiz, manches chronométrées et scores locaux dans un code que vous maîtrisez',
      intro:
        'Le parcours Générateur de jeu garde la source générée de TriviaClash, ses états locaux et la Webview active dans un seul flux inspectable.',
      items: [
        {
          title: 'De la salle d’attente à Question 1',
          body: 'La transition « Démarrer le quiz » fait passer le jeu local de la salle d’attente des joueurs à la première question chronométrée.',
        },
        {
          title: 'Interface multijoueur locale explicite',
          body: 'Les joueurs fictifs partagent un seul état navigateur pour la démo. Aucune connexion réseau ni synchronisation de clients n’est sous-entendue.',
        },
        {
          title: 'Score et manches',
          body: 'Traitement des réponses, score par manche et conditions de victoire modélisés comme des règles de jeu.',
        },
        {
          title: 'Test en jeu dans la Webview',
          body: 'Parcourez la salle d’attente et la question dans la vraie Webview E-Code pendant que le prompt Agent et les fichiers restent inspectables.',
        },
        {
          title: 'Surface de jeu responsive',
          body: 'Les écrans de jeu s’adaptent du grand écran au téléphone sans build mobile séparé.',
        },
        {
          title: 'Maîtrisez la source de la boucle de jeu',
          body: 'Exportez le projet ou publiez les frontends statiques pris en charge tout en conservant des fichiers source modifiables.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Formats de jeu à tester',
      title: 'Les bases de jeux jouables que les équipes étendent pour chaque public',
      intro:
        'D’un concept de soirée quiz à un défi en classe, la boucle produit une base de jeu local jouable ; synchronisation distante et persistance commencent seulement après branchement et test des services requis.',
      items: [
        {
          title: 'Quiz et trivia multijoueur',
          body: 'Parcours depuis la salle d’attente, questions chronométrées et score partagé prêts à brancher à un service de partie temps réel.',
        },
        {
          title: 'Jeux en classe et formation',
          body: 'Interfaces de défis interactifs avec règles de score et classement prêt pour des données synchronisées.',
        },
        {
          title: 'Jeux d’événement et campagne',
          body: 'Frontends de jeux de marque avec salles de jeu et classements à brancher à l’infrastructure de l’événement.',
        },
        {
          title: 'Tests de quiz en équipe',
          body: 'Prototypez le texte de la salle d’attente, le rythme des questions, le score local et le classement avant d’ajouter un service de partie distante.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions sur le jeu de quiz',
      title: 'Le Générateur de jeu, en toute honnêteté',
      intro: 'Ce que produit le parcours Générateur de jeu, et où sont ses limites.',
      items: [
        {
          title: 'J’obtiens du vrai code ou un moteur verrouillé ?',
          body: 'Vous obtenez une source React et TypeScript modifiable pour la salle d’attente, les questions, l’état local, les contrôles et les styles. Le projet TriviaClash capturé n’est ni une vidéo ni une maquette statique.',
        },
        {
          title: 'Le multijoueur est-il réel ?',
          body: 'Pas dans la démonstration intégrée : elle utilise des données de partie fictives et aucun backend connecté. La source générée peut modéliser la salle d’attente et l’état de partie, mais les joueurs distants exigent un service temps réel que vous connectez, sécurisez et testez.',
        },
        {
          title: 'Puis-je tester le jeu avant de publier ?',
          body: 'Oui. E-Code exécute le parcours local des manches dans l’aperçu sur ordinateur, tablette et mobile. Le test d’une partie distante commence après le branchement du service réseau.',
        },
        {
          title: 'Puis-je connecter un backend temps réel ou une base ?',
          body: 'Le modèle d’état généré est du code que vous étendez et branchez à des services externes. La démonstration intégrée de cette page utilise des données fictives et aucun backend connecté.',
        },
        {
          title: 'Comment modifier le jeu ensuite ?',
          body: 'Modifiez directement la salle d’attente et les manches ou demandez à l’Agent un type de question, une règle de score ou un état de classement, puis testez le diff dans l’aperçu.',
        },
      ],
    },
    finalCta: {
      title: 'Décrivez votre jeu et jouez ses premières manches',
      body: 'Transformez le jeu que vous avez en tête en une boucle web, une salle d’attente et un système de score modifiables, testez le parcours local dans l’aperçu, puis connectez le service qui anime les parties distantes.',
      primaryCta: { label: 'Décrivez votre jeu', ariaLabel: 'Décrivez votre jeu avec E-Code' },
      secondaryCta: {
        label: 'Voir la boucle jouable',
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
      proofLinkLabel: 'Ouvrir la preuve du processus du Générateur de jeu',
      deliverablesLabel: 'Ce que livre le Générateur de jeu',
      featuresLabel: 'Capacités du Générateur de jeu',
      useCasesLabel: 'Cas d’usage du Générateur de jeu',
      faqLabel: 'Questions sur le Générateur de jeu',
      finalCtaLabel: 'Commencer à construire votre jeu',
    },
  },
} as const satisfies CapturedSolutionCopyByLanguage;
