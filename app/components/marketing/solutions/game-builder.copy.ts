import type { SolutionCopyByLanguage } from './solution-copy';

/**
 * SOL — Game Builder. Declined from the App Builder gabarit, centered on a
 * fictional multiplayer quiz game. All demo data is fictional and labeled; the
 * one real captured E-Code IDE proof lives on /solutions/app-builder.
 */
export const GAME_BUILDER_COPY = {
  en: {
    seo: {
      title: 'Game Builder with Real Code | E-Code',
      description:
        'Describe the game you want to play in the browser. E-Code turns it into a canvas game loop and real-time multiplayer in editable source files, with a running Preview you can play-test, project export, and publishing for supported static builds.',
    },
    hero: {
      eyebrow: 'Game Builder for real browser games',
      title: 'Turn a game idea into a multiplayer experience you fully own',
      subtitle:
        'Describe the game, the rounds, and how players compete. E-Code turns that into a canvas game loop and real-time multiplayer in editable source code. Inspect every file, play-test the game in Preview, refine it through the Agent, and publish supported static builds to a live URL.',
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
        'A responsive quiz game that runs a lobby, live questions, and a real-time scoreboard in one clear round loop.',
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
      eyebrow: 'From engine lock-in to a game you own',
      title: 'Game makers look easy until multiplayer state and play-testing fight the tool',
      intro:
        'A live quiz game needs a tight loop: a lobby that fills, questions that fire in sync, and a scoreboard that updates for everyone at once. No-code game tools start fast, then hide the game loop and the networking, and the exported result rarely maps to code the team can keep evolving.',
      obstacles: [
        {
          title: 'The game loop stays hidden',
          body: 'Drag-and-drop makers own the render loop and timing, so custom scoring, round pacing, and animations mean fighting the tool instead of writing the loop.',
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
        'E-Code starts from the game you describe and produces a real canvas loop with real-time multiplayer in source files. You inspect the state, play-test it in Preview, and request the next change without leaving the code behind.',
    },
    build: {
      eyebrow: 'One prompt starts the game',
      title: 'Describe the rounds, not the engine',
      intro:
        'The request below reads like a note from a game designer. The four items map its implementation scope in real source files, not a locked engine.',
      label: 'Example prompt',
      promptText: 'Build a multiplayer quiz game with a lobby, live questions, and a live scoreboard.',
      outputs: [
        {
          title: 'Canvas game loop',
          body: 'A real render-and-update loop drives rounds, timers, and animations across desktop, tablet, and mobile from editable components.',
        },
        {
          title: 'Real-time multiplayer',
          body: 'A lobby, synchronized questions, and a shared scoreboard are modeled as live state the team can extend without desyncing players.',
        },
        {
          title: 'Scoring and rounds',
          body: 'Answer handling, per-round scoring, and win conditions are modeled as working game rules rather than a static screen.',
        },
        {
          title: 'Preview and publishing',
          body: 'E-Code runs the game in Preview so you can play-test across screen sizes. Supported static builds continue through guided publishing to a live URL; other projects stay exportable for any host.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt → agent → Preview',
      title: 'Want to see a real E-Code build end to end?',
      body: 'The App Builder page shows a captured, real E-Code workspace — the prompt, the agent’s plan, the generated files, and the running Preview — for a booking application. The same build loop applies to an interactive game like this one.',
      cta: { label: 'See the real IDE proof', ariaLabel: 'See the real E-Code IDE proof on the App Builder page' },
    },
    deliverables: {
      eyebrow: 'What you receive',
      title: 'A playable game you own and keep evolving',
      intro:
        'The project stays inspectable from the first generated file through Preview and export. Supported static builds add a live release through guided publishing without hiding the code.',
      items: [
        {
          title: 'Editable source files',
          body: 'Real components, game loop, state, and styles you can read, version, and change directly.',
        },
        {
          title: 'Real-time state model',
          body: 'Lobby, questions, timers, and scores modeled as live state you can extend safely.',
        },
        {
          title: 'Responsive game screens',
          body: 'Desktop, tablet, and mobile layouts verified by play-testing in Preview before you publish.',
        },
        {
          title: 'Guided publishing',
          body: 'Supported static builds ship to a live URL through a guided release flow.',
        },
        {
          title: 'Accessible foundations',
          body: 'Semantic structure, focus states, and readable contrast built into the generated markup.',
        },
        {
          title: 'Agent-ready iteration',
          body: 'Ask the Agent for the next change and review the diff against the running game.',
        },
      ],
    },
    features: {
      eyebrow: 'Built for real browser games',
      title: 'Everything a live game needs, in code you control',
      intro: 'The Game Builder path keeps game logic, multiplayer state, and publishing in one inspectable workflow.',
      items: [
        {
          title: 'Canvas and game loop',
          body: 'A real render-and-update loop for rounds, timers, and animations you can tune.',
        },
        {
          title: 'Real-time multiplayer',
          body: 'A lobby and synchronized game state so every player sees the same match.',
        },
        {
          title: 'Scoring and rounds',
          body: 'Answer handling, per-round scoring, and win conditions modeled as game rules.',
        },
        { title: 'Play-test in Preview', body: 'Run real rounds in Preview across screen sizes before you publish.' },
        {
          title: 'Responsive by default',
          body: 'Game screens adapt from wide desktop to phone without a separate mobile build.',
        },
        {
          title: 'Own the code',
          body: 'Export the project or publish supported static builds — the source stays yours.',
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
          body: 'Live quiz nights with a lobby, timed questions, and a shared scoreboard.',
        },
        {
          title: 'Classroom and training games',
          body: 'Interactive challenges that keep a group engaged with real-time scoring.',
        },
        {
          title: 'Event and campaign games',
          body: 'Branded browser games with lobbies and leaderboards ready to share.',
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
          body: 'The generated project models a lobby and synchronized game state in code you can inspect and extend. The inline demonstration on this page uses fictional data and no connected backend.',
        },
        {
          title: 'Can I play-test before publishing?',
          body: 'Yes. E-Code runs the game in Preview so you can play real rounds across desktop, tablet, and mobile before you publish.',
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
      title: 'Describe your game and play it running',
      body: 'Turn the game you have in mind into a canvas loop with real-time multiplayer in real source code, play-test it in Preview, and publish supported static builds.',
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
      proofLinkLabel: 'See the real E-Code IDE proof',
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
        'Décrivez le jeu auquel vous voulez jouer dans le navigateur. E-Code le transforme en une boucle de jeu sur canvas et un multijoueur en temps réel dans des fichiers source modifiables, avec un aperçu actif que vous pouvez tester en jeu, l’export du projet et la publication des builds statiques pris en charge.',
    },
    hero: {
      eyebrow: 'Générateur de jeu pour de vrais jeux dans le navigateur',
      title: 'Transformez une idée de jeu en une expérience multijoueur que vous possédez',
      subtitle:
        'Décrivez le jeu, les manches et la façon dont les joueurs s’affrontent. E-Code en fait une boucle de jeu sur canvas et un multijoueur en temps réel dans un vrai code source modifiable. Inspectez chaque fichier, testez le jeu dans l’aperçu, affinez-le avec l’Agent et publiez les builds statiques pris en charge vers une URL en ligne.',
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
        'Un jeu de quiz responsive qui gère un salon d’attente, des questions en direct et un classement en temps réel dans une boucle de manches claire.',
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
      disclaimer: 'Démonstration responsive intégrée · données de partie fictives · pas une trace de génération',
      caption: {
        title: 'Un écran de jeu qui se joue comme une vraie partie',
        body: 'Cette démonstration intégrée présente un classement en direct, le panneau de la question en cours et un contrôle de réponse dans une mise en page responsive.',
      },
      alt: 'Démonstration de jeu de quiz multijoueur avec un classement en direct et un panneau de question en cours.',
    },
    problem: {
      eyebrow: 'Du carcan du moteur à un jeu que vous possédez',
      title:
        'Les créateurs de jeu paraissent simples jusqu’à ce que l’état multijoueur et le test en jeu se heurtent à l’outil',
      intro:
        'Un jeu de quiz en direct a besoin d’une boucle serrée : un salon qui se remplit, des questions qui se déclenchent en synchronie et un classement qui se met à jour pour tout le monde en même temps. Les outils no-code démarrent vite, puis masquent la boucle de jeu et le réseau, et l’export correspond rarement à un code que l’équipe peut faire évoluer.',
      obstacles: [
        {
          title: 'La boucle de jeu reste masquée',
          body: 'Les créateurs par glisser-déposer possèdent la boucle de rendu et le minutage, donc un score sur mesure, un rythme de manches et des animations reviennent à lutter contre l’outil au lieu d’écrire la boucle.',
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
        'E-Code part du jeu que vous décrivez et produit une vraie boucle sur canvas avec un multijoueur en temps réel dans des fichiers source. Vous inspectez l’état, le testez en jeu dans l’aperçu et demandez le changement suivant sans abandonner le code.',
    },
    build: {
      eyebrow: 'Un prompt lance le jeu',
      title: 'Décrivez les manches, pas le moteur',
      intro:
        'La demande ci-dessous se lit comme un mot d’un concepteur de jeu. Les quatre éléments cartographient son périmètre d’implémentation dans de vrais fichiers source, pas un moteur verrouillé.',
      label: 'Exemple de prompt',
      promptText:
        'Construis un jeu de quiz multijoueur avec un salon d’attente, des questions en direct et un classement en temps réel.',
      outputs: [
        {
          title: 'Boucle de jeu sur canvas',
          body: 'Une vraie boucle de rendu et de mise à jour anime les manches, les chronos et les animations sur desktop, tablette et mobile à partir de composants modifiables.',
        },
        {
          title: 'Multijoueur en temps réel',
          body: 'Un salon, des questions synchronisées et un classement partagé sont modélisés comme un état actif que l’équipe peut étendre sans désynchroniser les joueurs.',
        },
        {
          title: 'Score et manches',
          body: 'Le traitement des réponses, le score par manche et les conditions de victoire sont modélisés comme de vraies règles de jeu plutôt qu’un écran statique.',
        },
        {
          title: 'Aperçu et publication',
          body: 'E-Code exécute le jeu dans l’aperçu pour le tester en jeu à toutes les tailles d’écran. Les builds statiques pris en charge se publient vers une URL en ligne ; les autres projets restent exportables pour tout hébergeur.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt → agent → aperçu',
      title: 'Envie de voir une vraie génération E-Code de bout en bout ?',
      body: 'La page App Builder montre un vrai workspace E-Code capturé — le prompt, le plan de l’agent, les fichiers générés et l’aperçu actif — pour une application de réservation. La même boucle de construction s’applique à un jeu interactif comme celui-ci.',
      cta: {
        label: 'Voir la preuve IDE réelle',
        ariaLabel: 'Voir la preuve IDE réelle E-Code sur la page App Builder',
      },
    },
    deliverables: {
      eyebrow: 'Ce que vous recevez',
      title: 'Un jeu jouable que vous possédez et faites évoluer',
      intro:
        'Le projet reste inspectable du premier fichier généré jusqu’à l’aperçu et l’export. Les builds statiques pris en charge ajoutent une mise en ligne guidée sans masquer le code.',
      items: [
        {
          title: 'Fichiers source modifiables',
          body: 'De vrais composants, boucle de jeu, état et styles que vous lisez, versionnez et modifiez directement.',
        },
        {
          title: 'Modèle d’état en temps réel',
          body: 'Salon, questions, chronos et scores modélisés comme un état actif que vous étendez sans risque.',
        },
        {
          title: 'Écrans de jeu responsives',
          body: 'Desktop, tablette et mobile vérifiés en testant le jeu dans l’aperçu avant publication.',
        },
        {
          title: 'Publication guidée',
          body: 'Les builds statiques pris en charge sont mis en ligne via un parcours de publication guidé.',
        },
        {
          title: 'Bases accessibles',
          body: 'Structure sémantique, états de focus et contraste lisible intégrés au balisage généré.',
        },
        {
          title: 'Itération avec l’Agent',
          body: 'Demandez le changement suivant à l’Agent et relisez le diff face au jeu actif.',
        },
      ],
    },
    features: {
      eyebrow: 'Pensé pour de vrais jeux dans le navigateur',
      title: 'Tout ce dont un jeu en direct a besoin, dans un code que vous maîtrisez',
      intro:
        'Le parcours Générateur de jeu garde la logique de jeu, l’état multijoueur et la publication dans un seul flux inspectable.',
      items: [
        {
          title: 'Canvas et boucle de jeu',
          body: 'Une vraie boucle de rendu et de mise à jour pour les manches, chronos et animations que vous réglez.',
        },
        {
          title: 'Multijoueur en temps réel',
          body: 'Un salon et un état de jeu synchronisé pour que chaque joueur voie la même partie.',
        },
        {
          title: 'Score et manches',
          body: 'Traitement des réponses, score par manche et conditions de victoire modélisés comme des règles de jeu.',
        },
        {
          title: 'Test en jeu dans l’aperçu',
          body: 'Jouez de vraies manches dans l’aperçu à toutes les tailles d’écran avant de publier.',
        },
        {
          title: 'Responsive par défaut',
          body: 'Les écrans de jeu s’adaptent du grand écran au téléphone sans build mobile séparé.',
        },
        {
          title: 'Possédez le code',
          body: 'Exportez le projet ou publiez les builds statiques pris en charge — la source reste la vôtre.',
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
          body: 'Soirées quiz en direct avec un salon, des questions chronométrées et un classement partagé.',
        },
        {
          title: 'Jeux en classe et formation',
          body: 'Défis interactifs qui gardent un groupe engagé avec un score en temps réel.',
        },
        {
          title: 'Jeux d’événement et campagne',
          body: 'Jeux de marque dans le navigateur avec salons et classements prêts à partager.',
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
          body: 'Le projet généré modélise un salon et un état de jeu synchronisé dans un code que vous inspectez et étendez. La démonstration intégrée de cette page utilise des données fictives et aucun backend connecté.',
        },
        {
          title: 'Puis-je tester le jeu avant de publier ?',
          body: 'Oui. E-Code exécute le jeu dans l’aperçu pour jouer de vraies manches sur desktop, tablette et mobile avant de publier.',
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
      title: 'Décrivez votre jeu et jouez-le en direct',
      body: 'Transformez le jeu que vous avez en tête en une boucle sur canvas avec un multijoueur en temps réel dans du vrai code source, testez-le dans l’aperçu et publiez les builds statiques pris en charge.',
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
      proofLinkLabel: 'Voir la preuve IDE réelle E-Code',
      deliverablesLabel: 'Ce que livre le Générateur de jeu',
      featuresLabel: 'Capacités du Générateur de jeu',
      useCasesLabel: 'Cas d’usage du Générateur de jeu',
      faqLabel: 'Questions sur le Générateur de jeu',
      finalCtaLabel: 'Commencer à construire votre jeu',
    },
  },
} as const satisfies SolutionCopyByLanguage;
