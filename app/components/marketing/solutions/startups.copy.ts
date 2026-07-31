import type { SolutionCopyByLanguage } from './solution-copy';

/**
 * SOL — Startups. Declined from the App Builder gabarit, centered on a fictional
 * seed-stage startup shipping an MVP from prototype to production. All demo data
 * is fictional and labeled; the one real captured E-Code IDE proof lives on
 * /solutions/app-builder.
 */
export const STARTUPS_COPY = {
  en: {
    seo: {
      title: 'Ship a Startup MVP Fast with Real Code | E-Code',
      description:
        'Describe the MVP your startup needs to demo. E-Code turns it into a working app in editable source files with a hosted Preview you can share with investors, and a clear path from prototype to production.',
    },
    hero: {
      eyebrow: 'For startups shipping an MVP',
      title: 'Go from prototype to a demo-ready MVP in real code',
      subtitle:
        'Describe the product you need to show investors and early users. E-Code turns that into a working app in editable source code, runs it in a hosted Preview you can share as a link, and gives you a path from prototype to production without a rewrite.',
      primaryCta: { label: 'Describe your MVP', ariaLabel: 'Describe your startup MVP with E-Code' },
      secondaryCta: { label: 'See how it builds', ariaLabel: 'See how E-Code builds the MVP from a prompt' },
      microcopy:
        'Start from the product you already pitch. Source files, the hosted Preview, and a shareable demo link stay visible as the MVP evolves.',
    },
    languageSwitch: { label: 'Choose the Startups page language', english: 'English', french: 'Français' },
    demo: {
      badge: 'Fictional demo data',
      brand: 'Launchpad',
      brandType: 'Seed-stage startup',
      nav: ['Product', 'Waitlist', 'Metrics'],
      eyebrow: 'Launch week',
      title: 'MVP checklist',
      intro:
        'A responsive product screen that pairs the MVP milestones with early traction, ready to walk through in a demo.',
      primaryHeading: 'MVP checklist',
      primaryRows: [
        { label: 'Landing + waitlist', meta: 'shipped · preview live', status: 'Live' },
        { label: 'Product dashboard', meta: 'in review · preview live' },
        { label: 'Sign-in and accounts', meta: 'in progress · preview live' },
      ],
      asideHeading: 'Traction',
      asideRows: [
        { label: 'Signups', value: '1,284' },
        { label: 'Preview', value: 'Live' },
        { label: 'Days to demo', value: '6' },
      ],
      asideCta: 'Share preview link',
      disclaimer: 'Inline responsive demonstration · fictional startup data · not a generation record',
      caption: {
        title: 'An MVP that reads like a real product on demo day',
        body: 'This inline demonstration shows a launch checklist, a traction panel, and a shareable preview action in one responsive layout.',
      },
      alt: 'Startup MVP demonstration with a launch checklist and an early-traction panel.',
    },
    problem: {
      eyebrow: 'From throwaway prototype to a product you can raise on',
      title: 'Prototyping tools look fast until the demo has to become a real product',
      intro:
        'A startup needs to show something working before the next milestone. No-code prototypes demo well but hit a wall, and a hand-coded MVP burns the runway you need for the actual product.',
      obstacles: [
        {
          title: 'Prototypes do not become products',
          body: 'No-code and slideware demos impress once, then trap the idea in a tool the team cannot extend, host, or hand to an engineer to keep building.',
        },
        {
          title: 'Building the MVP burns the runway',
          body: 'Standing up auth, a dashboard, and a landing page from scratch costs the weeks a small team needs for customers, not scaffolding.',
        },
        {
          title: 'The investor demo is fragile',
          body: 'A staged mockup breaks the moment someone clicks off the happy path, and there is no live link to share after the meeting.',
        },
      ],
      bridge:
        'E-Code starts from the MVP you describe and produces a working app in real source files. You inspect the code, run it in a hosted Preview, share the link, and keep building the same project toward production.',
    },
    build: {
      eyebrow: 'One prompt starts the MVP',
      title: 'Describe the product, not the plumbing',
      intro:
        'The request below reads like a founder briefing the build. The four items map its implementation scope in real source files, not a throwaway prototype.',
      label: 'Example prompt',
      promptText:
        'Build our MVP: a waitlist landing page, a product dashboard, and sign-in, ready to demo to investors.',
      outputs: [
        {
          title: 'Waitlist landing page',
          body: 'A responsive landing page with a working waitlist capture flow, rendered from real components and routes across desktop, tablet, and mobile.',
        },
        {
          title: 'Product dashboard',
          body: 'A dashboard shell with structured data views and navigation, modeled as editable code the team can extend feature by feature.',
        },
        {
          title: 'Sign-in and accounts',
          body: 'An authentication flow with sign-in and account scaffolding modeled in code, so the demo path is a working journey rather than a static screen.',
        },
        {
          title: 'Hosted Preview and demo link',
          body: 'E-Code runs the MVP in a hosted Preview across screen sizes and gives you a shareable link for investors; the project stays exportable and on a path to production.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt → agent → Preview',
      title: 'Want to see a real E-Code build end to end?',
      body: 'The App Builder page shows a captured, real E-Code workspace — the prompt, the agent’s plan, the generated files, and the running Preview — for a booking application. The same build loop applies to a startup MVP like this one.',
      cta: { label: 'See the real IDE proof', ariaLabel: 'See the real E-Code IDE proof on the App Builder page' },
    },
    deliverables: {
      eyebrow: 'What you receive',
      title: 'A working MVP you own and take to production',
      intro:
        'The project stays inspectable from the first generated file through the hosted Preview and export. The same source you demo is the source you keep building on toward production.',
      items: [
        {
          title: 'Editable source files',
          body: 'Real components, routes, styles, and logic you can read, version, and change directly.',
        },
        {
          title: 'Working core flows',
          body: 'Waitlist capture, dashboard views, and sign-in modeled as functioning journeys, not mockups.',
        },
        {
          title: 'Hosted Preview',
          body: 'A running Preview across desktop, tablet, and mobile that you verify before you show it.',
        },
        { title: 'Shareable demo link', body: 'A link you can send to investors and early users after the meeting.' },
        {
          title: 'Path to production',
          body: 'Supported builds publish to a live URL through guided publishing; other projects stay exportable for your own stack.',
        },
        {
          title: 'Agent-ready iteration',
          body: 'Ask the Agent for the next feature and review the diff against the running MVP.',
        },
      ],
    },
    features: {
      eyebrow: 'Built for shipping MVPs',
      title: 'Everything a founding team needs to demo and keep building',
      intro: 'The Startups path keeps the prototype, the demo, and the road to production in one inspectable workflow.',
      items: [
        {
          title: 'Templates and AI generation',
          body: 'Start from a template or a prompt and generate real, editable source instead of a locked prototype.',
        },
        { title: 'Hosted previews', body: 'Every version runs in a hosted Preview you can open on any device.' },
        {
          title: 'Shareable investor demos',
          body: 'Send a live link so a demo survives past the meeting and off the happy path.',
        },
        {
          title: 'Auth and dashboards',
          body: 'Sign-in flows and dashboard shells generated as code you extend, not a fixed template.',
        },
        {
          title: 'Prototype-to-production path',
          body: 'The MVP you demo is the codebase you scale, without a rewrite between the two.',
        },
        { title: 'Own the code', body: 'Export the project or publish supported builds — the source stays yours.' },
      ],
    },
    useCases: {
      eyebrow: 'Who builds with it',
      title: 'What founding teams ship with the Startups path',
      intro: 'From a pre-seed waitlist to a demo-day product, the same loop produces a real, responsive MVP.',
      items: [
        {
          title: 'Pre-seed waitlist and landing',
          body: 'Validate demand with a working landing page and waitlist before the product exists.',
        },
        { title: 'Investor and demo-day MVP', body: 'A clickable product with real flows to walk through in a pitch.' },
        {
          title: 'Internal product prototype',
          body: 'A working dashboard to test an idea with early users before committing engineering.',
        },
        { title: 'First production release', body: 'The demo MVP taken forward to a live, published first version.' },
      ],
    },
    faq: {
      eyebrow: 'Common questions',
      title: 'Startups, answered honestly',
      intro: 'What the Startups path produces, and where its boundaries are.',
      items: [
        {
          title: 'Do I get real code or a throwaway prototype?',
          body: 'You get editable source files — components, routes, styles, and logic — that you can read, version, and export. The MVP you demo is the codebase you keep building on.',
        },
        {
          title: 'Can I share a live demo with investors?',
          body: 'Yes. E-Code runs the MVP in a hosted Preview and gives you a shareable link you can send after the meeting. The traction numbers in the demo on this page are fictional.',
        },
        {
          title: 'Is there a real path from prototype to production?',
          body: 'Supported builds publish to a live URL through guided publishing, and the project stays exportable, so the same source moves from demo to production without a rewrite.',
        },
        {
          title: 'Can I add auth, a database, or payments?',
          body: 'The generated flows are code you extend and wire to external services. The inline demonstration on this page uses fictional data and no connected backend.',
        },
        {
          title: 'How do I add the next feature?',
          body: 'Edit the files directly or ask the Agent for the next change and review the diff against the running Preview.',
        },
      ],
    },
    finalCta: {
      title: 'Describe your MVP and demo it live',
      body: 'Turn the product you pitch into a working MVP in real source code, run it in a hosted Preview, and share the link with investors.',
      primaryCta: { label: 'Describe your MVP', ariaLabel: 'Describe your startup MVP with E-Code' },
      secondaryCta: { label: 'See how it builds', ariaLabel: 'See how E-Code builds the MVP from a prompt' },
    },
    aria: {
      pageLabel: 'Startups solution page',
      heroLabel: 'Startups introduction',
      demoLabel: 'Startup MVP product demonstration',
      problemLabel: 'The startup MVP problem',
      buildLabel: 'How the Startups path works',
      outputListLabel: 'MVP build outputs',
      proofLinkLabel: 'See the real E-Code IDE proof',
      deliverablesLabel: 'What the Startups path delivers',
      featuresLabel: 'Startups capabilities',
      useCasesLabel: 'Startups use cases',
      faqLabel: 'Startups questions',
      finalCtaLabel: 'Start building your MVP',
    },
  },
  fr: {
    seo: {
      title: 'Lancez un MVP de startup avec du vrai code | E-Code',
      description:
        'Décrivez le MVP que votre startup doit démontrer. E-Code le transforme en une application fonctionnelle dans des fichiers source modifiables, avec un aperçu hébergé à partager avec les investisseurs, et un chemin clair du prototype à la production.',
    },
    hero: {
      eyebrow: 'Pour les startups qui lancent un MVP',
      title: 'Passez du prototype à un MVP prêt à démontrer, en vrai code',
      subtitle:
        'Décrivez le produit à montrer aux investisseurs et aux premiers utilisateurs. E-Code en fait une application fonctionnelle dans du vrai code source, l’exécute dans un aperçu hébergé à partager en lien, et vous donne un chemin du prototype à la production sans réécriture.',
      primaryCta: { label: 'Décrivez votre MVP', ariaLabel: 'Décrivez le MVP de votre startup avec E-Code' },
      secondaryCta: {
        label: 'Voir la construction',
        ariaLabel: 'Voir comment E-Code construit le MVP à partir d’un prompt',
      },
      microcopy:
        'Partez du produit que vous pitchez déjà. Les fichiers source, l’aperçu hébergé et un lien de démonstration partageable restent visibles à mesure que le MVP évolue.',
    },
    languageSwitch: { label: 'Choisir la langue de la page Startups', english: 'English', french: 'Français' },
    demo: {
      badge: 'Données fictives',
      brand: 'Launchpad',
      brandType: 'Startup en amorçage',
      nav: ['Produit', 'Liste d’attente', 'Métriques'],
      eyebrow: 'Semaine de lancement',
      title: 'Checklist du MVP',
      intro:
        'Un écran produit responsive qui associe les jalons du MVP à la traction initiale, prêt à dérouler en démonstration.',
      primaryHeading: 'Checklist du MVP',
      primaryRows: [
        { label: 'Page d’attente + liste', meta: 'livré · aperçu en ligne', status: 'En ligne' },
        { label: 'Tableau de bord produit', meta: 'en revue · aperçu en ligne' },
        { label: 'Connexion et comptes', meta: 'en cours · aperçu en ligne' },
      ],
      asideHeading: 'Traction',
      asideRows: [
        { label: 'Inscriptions', value: '1 284' },
        { label: 'Aperçu', value: 'En ligne' },
        { label: 'Jours avant la démo', value: '6' },
      ],
      asideCta: 'Partager l’aperçu',
      disclaimer: 'Démonstration responsive intégrée · données de startup fictives · pas une trace de génération',
      caption: {
        title: 'Un MVP qui se lit comme un vrai produit le jour de la démo',
        body: 'Cette démonstration intégrée présente une checklist de lancement, un panneau de traction et une action de partage d’aperçu dans une mise en page responsive.',
      },
      alt: 'Démonstration de MVP de startup avec une checklist de lancement et un panneau de traction initiale.',
    },
    problem: {
      eyebrow: 'Du prototype jetable à un produit sur lequel lever des fonds',
      title: 'Les outils de prototypage paraissent rapides jusqu’à ce que la démo doive devenir un vrai produit',
      intro:
        'Une startup doit montrer quelque chose de fonctionnel avant le prochain jalon. Les prototypes no-code démontrent bien mais atteignent un mur, et un MVP codé à la main brûle le runway dont vous avez besoin pour le vrai produit.',
      obstacles: [
        {
          title: 'Les prototypes ne deviennent pas des produits',
          body: 'Les démos no-code et les maquettes impressionnent une fois, puis enferment l’idée dans un outil que l’équipe ne peut ni étendre, ni héberger, ni confier à un ingénieur pour poursuivre.',
        },
        {
          title: 'Construire le MVP brûle le runway',
          body: 'Monter l’authentification, un tableau de bord et une page d’accueil de zéro coûte les semaines qu’une petite équipe doit consacrer aux clients, pas à l’échafaudage.',
        },
        {
          title: 'La démo investisseurs est fragile',
          body: 'Une maquette mise en scène casse dès qu’on sort du parcours idéal, et il ne reste aucun lien en ligne à partager après la réunion.',
        },
      ],
      bridge:
        'E-Code part du MVP que vous décrivez et produit une application fonctionnelle dans de vrais fichiers source. Vous inspectez le code, l’exécutez dans un aperçu hébergé, partagez le lien et continuez à construire le même projet vers la production.',
    },
    build: {
      eyebrow: 'Un prompt lance le MVP',
      title: 'Décrivez le produit, pas la tuyauterie',
      intro:
        'La demande ci-dessous se lit comme un fondateur qui briefe la construction. Les quatre éléments cartographient son périmètre d’implémentation dans de vrais fichiers source, pas un prototype jetable.',
      label: 'Exemple de prompt',
      promptText:
        'Construis notre MVP : une page d’attente, un tableau de bord produit et une connexion, prêt à démontrer aux investisseurs.',
      outputs: [
        {
          title: 'Page d’attente',
          body: 'Une page d’accueil responsive avec un parcours de capture de liste d’attente fonctionnel, rendue à partir de vrais composants et routes sur desktop, tablette et mobile.',
        },
        {
          title: 'Tableau de bord produit',
          body: 'Une base de tableau de bord avec des vues de données structurées et une navigation, modélisée comme un code modifiable que l’équipe étend fonctionnalité par fonctionnalité.',
        },
        {
          title: 'Connexion et comptes',
          body: 'Un parcours d’authentification avec connexion et base de gestion de comptes modélisés en code, pour un parcours de démo réel plutôt qu’un écran statique.',
        },
        {
          title: 'Aperçu hébergé et lien de démo',
          body: 'E-Code exécute le MVP dans un aperçu hébergé à toutes les tailles d’écran et vous donne un lien à partager aux investisseurs ; le projet reste exportable et sur un chemin vers la production.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt → agent → aperçu',
      title: 'Envie de voir une vraie génération E-Code de bout en bout ?',
      body: 'La page App Builder montre un vrai workspace E-Code capturé — le prompt, le plan de l’agent, les fichiers générés et l’aperçu actif — pour une application de réservation. La même boucle de construction s’applique à un MVP de startup comme celui-ci.',
      cta: {
        label: 'Voir la preuve IDE réelle',
        ariaLabel: 'Voir la preuve IDE réelle E-Code sur la page App Builder',
      },
    },
    deliverables: {
      eyebrow: 'Ce que vous recevez',
      title: 'Un MVP fonctionnel que vous possédez et menez en production',
      intro:
        'Le projet reste inspectable du premier fichier généré jusqu’à l’aperçu hébergé et l’export. La source que vous démontrez est celle sur laquelle vous continuez à construire vers la production.',
      items: [
        {
          title: 'Fichiers source modifiables',
          body: 'De vrais composants, routes, styles et logique que vous lisez, versionnez et modifiez directement.',
        },
        {
          title: 'Parcours principaux fonctionnels',
          body: 'Capture de liste d’attente, vues de tableau de bord et connexion modélisées comme des parcours qui fonctionnent, pas des maquettes.',
        },
        {
          title: 'Aperçu hébergé',
          body: 'Un aperçu actif sur desktop, tablette et mobile que vous vérifiez avant de le montrer.',
        },
        {
          title: 'Lien de démo partageable',
          body: 'Un lien à envoyer aux investisseurs et aux premiers utilisateurs après la réunion.',
        },
        {
          title: 'Chemin vers la production',
          body: 'Les builds pris en charge se publient vers une URL en ligne via la publication guidée ; les autres projets restent exportables pour votre propre stack.',
        },
        {
          title: 'Itération avec l’Agent',
          body: 'Demandez la fonctionnalité suivante à l’Agent et relisez le diff face au MVP actif.',
        },
      ],
    },
    features: {
      eyebrow: 'Pensé pour lancer des MVP',
      title: 'Tout ce dont une équipe fondatrice a besoin pour démontrer et continuer à construire',
      intro:
        'Le parcours Startups garde le prototype, la démo et la route vers la production dans un seul flux inspectable.',
      items: [
        {
          title: 'Templates et génération IA',
          body: 'Partez d’un template ou d’un prompt et générez une vraie source modifiable au lieu d’un prototype verrouillé.',
        },
        {
          title: 'Aperçus hébergés',
          body: 'Chaque version s’exécute dans un aperçu hébergé que vous ouvrez sur n’importe quel appareil.',
        },
        {
          title: 'Démos investisseurs partageables',
          body: 'Envoyez un lien en ligne pour qu’une démo survive à la réunion et au parcours idéal.',
        },
        {
          title: 'Authentification et tableaux de bord',
          body: 'Parcours de connexion et bases de tableau de bord générés comme du code que vous étendez, pas un template figé.',
        },
        {
          title: 'Chemin prototype-production',
          body: 'Le MVP que vous démontrez est la base de code que vous faites grandir, sans réécriture entre les deux.',
        },
        {
          title: 'Possédez le code',
          body: 'Exportez le projet ou publiez les builds pris en charge — la source reste la vôtre.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Qui construit avec',
      title: 'Ce que les équipes fondatrices livrent avec le parcours Startups',
      intro:
        'D’une liste d’attente en pré-amorçage à un produit de demo day, la même boucle produit un vrai MVP responsive.',
      items: [
        {
          title: 'Liste d’attente et page en pré-amorçage',
          body: 'Validez la demande avec une page d’accueil fonctionnelle et une liste d’attente avant que le produit n’existe.',
        },
        {
          title: 'MVP investisseurs et demo day',
          body: 'Un produit cliquable avec de vrais parcours à dérouler dans un pitch.',
        },
        {
          title: 'Prototype produit interne',
          body: 'Un tableau de bord fonctionnel pour tester une idée avec les premiers utilisateurs avant d’engager l’ingénierie.',
        },
        {
          title: 'Première mise en production',
          body: 'Le MVP de démonstration mené jusqu’à une première version publiée en ligne.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions fréquentes',
      title: 'Les Startups, en toute honnêteté',
      intro: 'Ce que produit le parcours Startups, et où sont ses limites.',
      items: [
        {
          title: 'J’obtiens du vrai code ou un prototype jetable ?',
          body: 'Vous obtenez des fichiers source modifiables — composants, routes, styles et logique — que vous lisez, versionnez et exportez. Le MVP que vous démontrez est la base de code sur laquelle vous continuez à construire.',
        },
        {
          title: 'Puis-je partager une démo en ligne avec des investisseurs ?',
          body: 'Oui. E-Code exécute le MVP dans un aperçu hébergé et vous donne un lien partageable à envoyer après la réunion. Les chiffres de traction de la démonstration de cette page sont fictifs.',
        },
        {
          title: 'Y a-t-il un vrai chemin du prototype à la production ?',
          body: 'Les builds pris en charge se publient vers une URL en ligne via la publication guidée, et le projet reste exportable, donc la même source passe de la démo à la production sans réécriture.',
        },
        {
          title: 'Puis-je ajouter l’authentification, une base ou des paiements ?',
          body: 'Les parcours générés sont du code que vous étendez et branchez à des services externes. La démonstration intégrée de cette page utilise des données fictives et aucun backend connecté.',
        },
        {
          title: 'Comment ajouter la fonctionnalité suivante ?',
          body: 'Modifiez les fichiers directement ou demandez le changement suivant à l’Agent et relisez le diff face à l’aperçu actif.',
        },
      ],
    },
    finalCta: {
      title: 'Décrivez votre MVP et démontrez-le en direct',
      body: 'Transformez le produit que vous pitchez en un MVP fonctionnel dans du vrai code source, exécutez-le dans un aperçu hébergé et partagez le lien avec les investisseurs.',
      primaryCta: { label: 'Décrivez votre MVP', ariaLabel: 'Décrivez le MVP de votre startup avec E-Code' },
      secondaryCta: {
        label: 'Voir la construction',
        ariaLabel: 'Voir comment E-Code construit le MVP à partir d’un prompt',
      },
    },
    aria: {
      pageLabel: 'Page solution Startups',
      heroLabel: 'Introduction des Startups',
      demoLabel: 'Démonstration produit du MVP de startup',
      problemLabel: 'Le problème du MVP de startup',
      buildLabel: 'Comment fonctionne le parcours Startups',
      outputListLabel: 'Résultats de la génération du MVP',
      proofLinkLabel: 'Voir la preuve IDE réelle E-Code',
      deliverablesLabel: 'Ce que livre le parcours Startups',
      featuresLabel: 'Capacités du parcours Startups',
      useCasesLabel: 'Cas d’usage des Startups',
      faqLabel: 'Questions sur les Startups',
      finalCtaLabel: 'Commencer à construire votre MVP',
    },
  },
} as const satisfies SolutionCopyByLanguage;
