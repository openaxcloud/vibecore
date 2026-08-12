import type { CapturedSolutionCopyByLanguage } from './solution-copy';

/**
 * SOL — Startups. Dedicated launch-cockpit story in EN and FR. All funnel,
 * waitlist, experiment, interview, milestone, and runway data is fictional and
 * labeled; proof claims stop at the captured Agent exchange, generated files,
 * Webview, and local experiment-form interaction.
 */
export const STARTUPS_COPY = {
  en: {
    seo: {
      title: 'Build a Reviewable Startup MVP in Real Code | E-Code',
      description:
        'Describe Launchpad. E-Code generates an editable launch cockpit and hosted Preview; analytics, persistence, email, billing, and production stay unconnected.',
      ogImageAlt: 'E-Code Startups workspace with Launchpad files and a fictional launch cockpit running in Webview.',
    },
    hero: {
      eyebrow: 'For startups shipping an MVP',
      title: 'Go from prototype to a demo-ready MVP in real code',
      subtitle:
        'Describe the product you need to show investors and early users. E-Code turns it into editable source code and a hosted Preview you can share as a link. The same project remains your development base while production integrations, security, and release checks stay explicit.',
      primaryCta: { label: 'Describe your MVP', ariaLabel: 'Describe your startup MVP with E-Code' },
      secondaryCta: { label: 'See the MVP workflow', ariaLabel: 'See how E-Code builds the MVP from a prompt' },
      microcopy:
        'Start from the product you already pitch. Source files, the hosted Preview, and a shareable demo link stay visible as the MVP evolves.',
    },
    languageSwitch: { label: 'Choose the Startups page language', english: 'English', french: 'Français' },
    demo: {
      badge: 'Fictional demo data',
      brand: 'Launchpad',
      brandType: 'Local startup cockpit',
      nav: ['Funnel', 'Experiments', 'Runway'],
      eyebrow: 'Fictional launch workspace',
      title: 'Put launch assumptions, evidence, and next moves on one screen.',
      intro:
        'A responsive local cockpit with an onboarding funnel, waitlist, experiment board, interview notes, product milestones, and runway inputs. Every number is fictional.',
      primaryHeading: 'Fictional launch signals',
      primaryRows: [
        { label: 'Onboarding funnel', meta: 'local sample stages', status: 'Demo data' },
        { label: 'Waitlist', meta: 'fictional local entries' },
        { label: 'Experiment board', meta: 'local cards and states' },
      ],
      asideHeading: 'Founder context',
      asideRows: [
        { label: 'Interview notes', value: 'Fictional' },
        { label: 'Product milestones', value: 'Local plan' },
        { label: 'Runway inputs', value: 'Sample values' },
      ],
      asideCta: 'Add experiment',
      disclaimer:
        'Scripted local interface · fictional funnel, waitlist, experiments, interviews, milestones, and runway · no live analytics, billing, email, external database, or production launch · not a generation record',
      caption: {
        title: 'A launch cockpit that never turns sample data into traction',
        body: 'This local interface demonstrates how founders group funnel, customer-learning, experiment, milestone, and runway decisions without claiming a live analytics or finance connection.',
      },
      alt: 'Scripted Launchpad startup cockpit with fictional onboarding funnel, waitlist, experiment cards, interview notes, product milestones, and runway inputs.',
    },
    problem: {
      eyebrow: 'From throwaway prototype to a product you can use in fundraising conversations',
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
          body: 'Standing up auth, a dashboard, and a landing page from scratch takes time away from customer work and puts the focus on scaffolding.',
        },
        {
          title: 'The investor demo is fragile',
          body: 'A staged mockup breaks the moment someone clicks off the happy path, and there is no live link to share after the meeting.',
        },
      ],
      bridge:
        'E-Code starts from the MVP you describe and produces a working demo in real source files. You inspect the code, run it in a hosted Preview, share the link, and keep developing the same project instead of discarding the prototype.',
    },
    build: {
      eyebrow: 'One prompt starts the launch cockpit',
      title: 'Describe the decisions your startup tracks between customer calls',
      intro:
        'This founder brief becomes Launchpad in editable React and TypeScript files. E-Code runs the cockpit in Webview while all sample records and calculations stay local.',
      label: 'Founder launch brief',
      promptText:
        'Create Launchpad, a launch cockpit for an early-stage startup team. Include onboarding funnel, waitlist, experiment board, customer interview notes, product milestones, and runway inputs using realistic fictional local sample data. Do not claim live analytics, billing, email, or database integrations. Build accessible responsive React and TypeScript with coral, teal, graphite, and orange actions. No purple.',
      outputs: [
        {
          title: 'Onboarding funnel and waitlist',
          body: 'The generated cockpit renders fictional funnel stages and local waitlist entries in a responsive view. No signup is stored outside the project.',
        },
        {
          title: 'Experiment board',
          body: 'Editable components organize local experiment cards and states. The board does not read from live product analytics or an external database.',
        },
        {
          title: 'Customer learning and runway context',
          body: 'Fictional interview notes, product milestones, and runway inputs sit in the same local workspace so the sample launch story stays coherent without becoming a traction claim.',
        },
        {
          title: 'A visible experiment action in Webview',
          body: 'Clicking “Add experiment” opens the “New experiment” form beside the Agent exchange and generated files. The capture verifies that UI transition, not a persisted experiment or board-count update.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Launchpad prompt → Agent → experiment form in Webview',
      title: 'Inspect the launch cockpit generated inside E-Code',
      body: 'These dedicated captures keep the Launchpad prompt, Agent activity, generated React and TypeScript project tree, and the startup cockpit together. The second state opens the “New experiment” form from “Add experiment.”',
      galleryLabel: 'Captured Launchpad generation and New experiment interaction inside E-Code',
      disclaimer:
        'Captured E-Code generation · fictional local funnel, waitlist, experiments, interviews, milestones, and runway inputs · no live analytics, billing, email, external database, persisted experiment, or production deployment is demonstrated',
      openFullSizeLabel: 'Open the Launchpad capture at full size',
      preview: {
        title: 'Launchpad runs beside the files the Agent created',
        body: 'The first capture shows the real Agent exchange and generated project tree while Webview renders the onboarding funnel, waitlist, experiments, interview notes, milestones, runway inputs, and local-data disclosure.',
        alt: 'Real E-Code Startups workspace showing the Launchpad prompt, Agent activity, generated React and TypeScript files, and a fictional local startup launch cockpit in Webview.',
      },
      iteration: {
        title: 'A verified “Add experiment” click opens the local form',
        body: 'After the single generation, a verified click on “Add experiment” opens “New experiment” in Webview. The capture proves the form transition, not an external save, persisted card, live board count, or connected startup metrics.',
        alt: 'E-Code Startups capture after the verified Add experiment click, with Launchpad files and the New experiment form in Webview.',
      },
      cta: {
        label: 'Inspect the captured Launchpad run',
        ariaLabel: 'Inspect the captured E-Code Launchpad generation and New experiment Webview interaction',
      },
    },
    proofVisualAlts: {
      prompt:
        'E-Code Agent prompt requesting Launchpad with a funnel, waitlist, experiment board, milestones, and runway.',
      preview: 'E-Code workspace with generated Launchpad files and the fictional startup cockpit open in Webview.',
      webviewOverview:
        'Launchpad in Webview with a local funnel, waitlist, experiments, interviews, milestones, and runway.',
      iteration:
        'E-Code workspace after the verified Add experiment click, with Launchpad files and New experiment form.',
      webviewIteration: 'Launchpad New experiment form opened after the verified Add experiment interaction.',
      files:
        'E-Code file tree for Launchpad with editable funnel, experiment, interview, milestone, and runway source.',
    },
    deliverables: {
      eyebrow: 'What Launchpad includes',
      title: 'A working MVP foundation you inspect, export, and keep developing',
      intro:
        'The project stays inspectable from the first generated file through the hosted Preview and export. The same source you demo remains the starting point for the engineering, integration, and release work that follows.',
      items: [
        {
          title: 'Real product source',
          body: 'The first product version lives in inspectable components, routes, styles, and logic that the founding team edits, versions, and exports instead of rebuilding from a slide deck.',
        },
        {
          title: 'An explicit data layer',
          body: 'Waitlist records, account shapes, dashboard schemas, adapters, environment references, and secret names stay visible. Your chosen database, identity provider, analytics, and payments still need real credentials and integration work.',
        },
        {
          title: 'A demo-ready responsive Preview',
          body: 'The compatible build runs in Preview at phone, tablet, and desktop sizes so founders review the current product journey before sharing it with an investor or early user.',
        },
        {
          title: 'Guided static launch',
          body: 'A supported static build moves through E-Code’s guided publishing flow. Connecting customer data, authentication, billing, observability, and release controls remains explicit work.',
        },
        {
          title: 'Live demo URL plus export',
          body: 'Publishing a supported static build produces a live E-Code-hosted URL to share. Server-dependent features stay in the exported project and require a compatible runtime and configured services.',
        },
        {
          title: 'Founder-to-Agent iteration',
          body: 'Continue the same conversation with a customer insight or demo note, then inspect the Agent’s file changes and test the refreshed journey in Preview.',
        },
      ],
    },
    features: {
      eyebrow: 'Built for shipping MVPs',
      title: 'Everything a founding team needs to demo and keep building',
      intro: 'The Startups path keeps the prompt, demo, code, and next engineering step in one inspectable workflow.',
      items: [
        {
          title: 'Templates and AI generation',
          body: 'Start from a template or a prompt and generate real, editable source instead of a locked prototype.',
        },
        {
          title: 'Hosted previews',
          body: 'Run the current compatible build in a hosted Preview and review its responsive layouts before sharing it.',
        },
        {
          title: 'Shareable investor demos',
          body: 'Send a live link so a demo survives past the meeting and off the happy path.',
        },
        {
          title: 'Auth and dashboards',
          body: 'Sign-in flows and dashboard shells generated as code you extend, not a fixed template.',
        },
        {
          title: 'Prototype-to-product continuity',
          body: 'Keep developing the exported demo codebase; production services and hardening are added and validated explicitly rather than implied by the prototype.',
        },
        {
          title: 'Startup source you can export',
          body: 'Export the project or publish supported builds. Ownership and permitted use follow the applicable E-Code terms.',
        },
      ],
    },
    useCases: {
      eyebrow: 'MVP moments to validate',
      title: 'MVP foundations founding teams can demonstrate and harden',
      intro:
        'From a pre-seed waitlist to a demo-day product, the loop produces responsive source and working local flows; traction, customer data, and production readiness require separate evidence.',
      items: [
        {
          title: 'Pre-seed waitlist and landing',
          body: 'Present the proposition with a working landing page and local waitlist confirmation; connect storage before counting sign-ups or claiming demand.',
        },
        {
          title: 'Investor and demo-day MVP',
          body: 'A clickable product interface with local flows to walk through, clearly separated from live customer or traction evidence.',
        },
        {
          title: 'Internal product prototype',
          body: 'A running dashboard interface to test the product journey before connecting production data and accounts.',
        },
        {
          title: 'First release candidate',
          body: 'Take the demo code into integration, hardening, and release validation before publishing a customer-facing version.',
        },
      ],
    },
    faq: {
      eyebrow: 'Founder questions',
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
          body: 'Supported builds publish to a live URL through guided publishing, and every project stays exportable. Production still requires configured data and identity services, secrets, security checks, tests, and operational validation for your stack.',
        },
        {
          title: 'Can I add auth, a database, or payments?',
          body: 'The generated flows are code you extend and wire to external services. The inline demonstration on this page uses fictional data and no connected backend.',
        },
        {
          title: 'How do I add the next feature?',
          body: 'Edit the Launchpad files directly or ask the Agent for the next experiment, funnel step, interview view, or milestone, then review the diff against the demo you share.',
        },
      ],
    },
    finalCta: {
      title: 'Describe your MVP and demo it live',
      body: 'Turn the product you pitch into a working MVP in real source code, run it in a hosted Preview, and share the link with investors.',
      primaryCta: { label: 'Describe your MVP', ariaLabel: 'Describe your startup MVP with E-Code' },
      secondaryCta: { label: 'See the MVP workflow', ariaLabel: 'See how E-Code builds the MVP from a prompt' },
    },
    aria: {
      pageLabel: 'Startups solution page',
      heroLabel: 'Startups introduction',
      demoLabel: 'Startup MVP product demonstration',
      problemLabel: 'The startup MVP problem',
      buildLabel: 'How the Startups path works',
      outputListLabel: 'MVP build outputs',
      proofLinkLabel: 'Inspect the Launchpad MVP IDE evidence',
      deliverablesLabel: 'What the Startups path delivers',
      featuresLabel: 'Startups capabilities',
      useCasesLabel: 'Startups use cases',
      faqLabel: 'Startups questions',
      finalCtaLabel: 'Start building your MVP',
    },
  },
  fr: {
    seo: {
      title: 'Lancez un MVP de startup avec un code source modifiable | E-Code',
      description:
        'Décrivez Launchpad. E-Code génère un cockpit local modifiable et un aperçu hébergé ; outils d’analyse, persistance, email, facturation et production restent déconnectés.',
      ogImageAlt:
        'Workspace E-Code Startups avec fichiers Launchpad et cockpit de lancement fictif actif dans la Webview.',
    },
    hero: {
      eyebrow: 'Pour les startups qui lancent un MVP',
      title: 'Passez du prototype à un MVP prêt à démontrer, sous forme de code source modifiable',
      subtitle:
        'Décrivez le produit à montrer aux investisseurs et aux premiers utilisateurs. E-Code en fait du code source modifiable et un aperçu hébergé accessible via un lien partageable. Le même projet reste votre base de développement, tandis que les intégrations, la sécurité et les contrôles de mise en production restent explicites.',
      primaryCta: { label: 'Décrivez votre MVP', ariaLabel: 'Décrivez le MVP de votre startup avec E-Code' },
      secondaryCta: {
        label: 'Voir le parcours du MVP',
        ariaLabel: 'Voir comment E-Code construit le MVP à partir d’un prompt',
      },
      microcopy:
        'Partez du produit que vous présentez déjà. Les fichiers source, l’aperçu hébergé et un lien de démonstration partageable restent visibles à mesure que le MVP évolue.',
    },
    languageSwitch: { label: 'Choisir la langue de la page Startups', english: 'English', french: 'Français' },
    demo: {
      badge: 'Données fictives',
      brand: 'Launchpad',
      brandType: 'Cockpit startup local',
      nav: ['Tunnel', 'Expériences', 'Trésorerie'],
      eyebrow: 'Espace de lancement fictif',
      title: 'Rassemblez hypothèses, apprentissages et prochaines décisions sur un écran.',
      intro:
        'Un cockpit local responsive avec parcours d’intégration, liste d’attente, tableau d’expériences, notes d’entretiens, jalons produit et paramètres de trésorerie. Chaque chiffre est fictif.',
      primaryHeading: 'Signaux de lancement fictifs',
      primaryRows: [
        { label: 'Parcours d’intégration', meta: 'étapes locales d’exemple', status: 'Données démo' },
        { label: 'Liste d’attente', meta: 'entrées locales fictives' },
        { label: 'Tableau d’expériences', meta: 'cartes et états locaux' },
      ],
      asideHeading: 'Contexte fondateur',
      asideRows: [
        { label: 'Notes d’entretiens', value: 'Fictives' },
        { label: 'Jalons produit', value: 'Plan local' },
        { label: 'Trésorerie', value: 'Valeurs d’exemple' },
      ],
      asideCta: 'Ajouter une expérience',
      disclaimer:
        'Interface locale scénarisée · tunnel, liste d’attente, expériences, entretiens, jalons et trésorerie fictifs · aucun outil d’analyse, service de facturation, email, base externe ni lancement en production · pas une trace de génération',
      caption: {
        title: 'Un cockpit de lancement qui ne transforme jamais l’exemple en traction',
        body: 'Cette interface locale regroupe tunnel, apprentissage client, expériences, jalons et trésorerie sans prétendre avoir un outil d’analyse ni une connexion financière active.',
      },
      alt: 'Cockpit startup Launchpad scénarisé avec parcours d’intégration, liste d’attente, cartes d’expériences, notes d’entretiens, jalons produit et paramètres de trésorerie fictifs.',
    },
    problem: {
      eyebrow: 'Du prototype jetable à un produit utilisable dans vos échanges de levée de fonds',
      title: 'Les outils de prototypage paraissent rapides jusqu’à ce que la démo doive devenir un produit durable',
      intro:
        'Une startup doit montrer quelque chose de fonctionnel avant le prochain jalon. Les prototypes no-code se présentent bien mais atteignent un mur, et un MVP codé à la main entame l’horizon de trésorerie nécessaire au véritable produit.',
      obstacles: [
        {
          title: 'Les prototypes ne deviennent pas des produits',
          body: 'Les démos no-code et les maquettes impressionnent une fois, puis enferment l’idée dans un outil que l’équipe ne peut ni étendre, ni héberger, ni confier à un ingénieur pour poursuivre.',
        },
        {
          title: 'Construire le MVP réduit l’horizon de trésorerie',
          body: 'Monter l’authentification, un tableau de bord et une page d’accueil de zéro mobilise du temps qu’une petite équipe doit consacrer aux clients plutôt qu’à l’échafaudage.',
        },
        {
          title: 'La démo investisseurs est fragile',
          body: 'Une maquette mise en scène casse dès qu’on sort du parcours idéal, et il ne reste aucun lien en ligne à partager après la réunion.',
        },
      ],
      bridge:
        'E-Code part du MVP que vous décrivez et produit une démo fonctionnelle dans de vrais fichiers source. Vous inspectez le code, l’exécutez dans un aperçu hébergé, partagez le lien et poursuivez le même projet au lieu de jeter le prototype.',
    },
    build: {
      eyebrow: 'Un prompt lance le cockpit de lancement',
      title: 'Décrivez les décisions que votre startup suit entre deux entretiens clients',
      intro:
        'Ce brief fondateur devient Launchpad dans des fichiers React et TypeScript modifiables. E-Code exécute le cockpit dans la Webview, avec tous les exemples et calculs conservés localement.',
      label: 'Brief de lancement des fondateurs',
      promptText:
        'Créez Launchpad, un cockpit de lancement pour une équipe de startup en amorçage. Ajoutez un parcours d’intégration, une liste d’attente, un tableau d’expériences, des notes d’entretiens clients, des jalons produit et des paramètres de trésorerie avec des données locales fictives réalistes. Ne prétendez pas avoir d’outils d’analyse, de facturation, d’emails ou de base externe actifs. React et TypeScript accessibles et responsive, corail, sarcelle, graphite et actions orange. Aucun violet.',
      outputs: [
        {
          title: 'Parcours d’intégration et liste d’attente',
          body: 'Le cockpit généré affiche des étapes de tunnel et entrées de liste d’attente fictives dans une vue responsive. Aucune inscription ne sort du projet.',
        },
        {
          title: 'Tableau d’expériences',
          body: 'Des composants modifiables organisent des cartes et états locaux. Le tableau ne lit ni outil d’analyse produit actif ni base de données externe.',
        },
        {
          title: 'Apprentissage client et contexte de trésorerie',
          body: 'Notes d’entretiens, jalons produit et paramètres de trésorerie fictifs restent dans le même espace local pour raconter le lancement sans les faire passer pour de la traction.',
        },
        {
          title: 'Action d’expérience visible dans la Webview',
          body: 'Le clic sur « Ajouter une expérience » ouvre le formulaire « Nouvelle expérience » à côté de l’échange avec l’Agent et des fichiers générés. La capture vérifie cette transition d’interface, pas l’enregistrement d’une carte ni le changement du compteur.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt Launchpad → Agent → formulaire dans la Webview',
      title: 'Inspectez le cockpit de lancement généré dans E-Code',
      body: 'Ces captures dédiées réunissent le prompt Launchpad, l’activité de l’Agent, l’arborescence React et TypeScript générée et le cockpit startup. Le second état ouvre « Nouvelle expérience » depuis « Ajouter une expérience ».',
      galleryLabel: 'Génération Launchpad capturée et interaction Nouvelle expérience dans E-Code',
      disclaimer:
        'Génération E-Code capturée · tunnel, liste d’attente, expériences, entretiens, jalons et trésorerie locaux fictifs · aucun outil d’analyse, service de facturation, email, base externe, expérience persistée ni production démontrée',
      openFullSizeLabel: 'Ouvrir la capture Launchpad en grand',
      preview: {
        title: 'Launchpad tourne à côté des fichiers créés par l’Agent',
        body: 'La première capture montre le vrai échange avec l’Agent et l’arborescence générée pendant que la Webview affiche tunnel, liste d’attente, expériences, entretiens, jalons, trésorerie et avertissement sur les données locales.',
        alt: 'Vrai workspace Startups E-Code montrant le prompt Launchpad, l’activité de l’Agent, les fichiers React et TypeScript générés et un cockpit de lancement local fictif dans la Webview.',
      },
      iteration: {
        title: 'Un clic vérifié sur « Ajouter une expérience » ouvre le formulaire local',
        body: 'Après la génération unique, un clic vérifié sur « Ajouter une expérience » ouvre « Nouvelle expérience » dans la Webview. La capture prouve la transition du formulaire, pas un enregistrement externe, une carte persistée, un compteur actif ni des métriques connectées.',
        alt: 'Capture E-Code Startups après le clic vérifié sur Ajouter une expérience, avec fichiers Launchpad et formulaire Nouvelle expérience dans la Webview.',
      },
      cta: {
        label: 'Inspecter l’exécution Launchpad capturée',
        ariaLabel:
          'Inspecter la génération Launchpad capturée dans E-Code et le formulaire Nouvelle expérience dans la Webview',
      },
    },
    proofVisualAlts: {
      prompt:
        'Prompt de l’Agent E-Code demandant Launchpad avec tunnel, liste d’attente, expériences, jalons et trésorerie.',
      preview: 'Workspace E-Code avec fichiers Launchpad générés et cockpit de startup fictif ouvert dans la Webview.',
      webviewOverview:
        'Launchpad dans la Webview avec tunnel, liste d’attente, expériences, entretiens, jalons et trésorerie.',
      iteration:
        'Workspace E-Code après le clic vérifié sur Ajouter une expérience, avec le formulaire Nouvelle expérience.',
      webviewIteration: 'Formulaire Nouvelle expérience de Launchpad ouvert après l’interaction vérifiée.',
      files:
        'Arborescence E-Code de Launchpad avec sources modifiables du tunnel, des expériences, jalons et entretiens.',
    },
    deliverables: {
      eyebrow: 'Ce que comprend Launchpad',
      title: 'Une base de MVP fonctionnelle à inspecter, exporter et poursuivre',
      intro:
        'Le projet reste inspectable du premier fichier généré jusqu’à l’aperçu hébergé et l’export. La source que vous démontrez reste le point de départ des travaux d’ingénierie, d’intégration et de mise en production qui suivent.',
      items: [
        {
          title: 'Vraie source produit',
          body: 'La première version du produit vit dans des composants, routes, styles et logique inspectables que l’équipe fondatrice modifie, versionne et exporte au lieu de repartir d’une présentation.',
        },
        {
          title: 'Couche de données explicite',
          body: 'Les enregistrements de liste d’attente, formes de comptes, schémas du tableau de bord, adaptateurs, références d’environnement et noms de secrets restent visibles. La base, le fournisseur d’identité, l’outil d’analyse et le service de paiement choisis exigent encore de vrais identifiants et un travail d’intégration.',
        },
        {
          title: 'Aperçu responsive prêt pour la démo',
          body: 'Le build compatible tourne dans l’aperçu aux formats téléphone, tablette et ordinateur pour que les fondateurs relisent le parcours courant avant de le partager avec un investisseur ou un premier utilisateur.',
        },
        {
          title: 'Lancement statique guidé',
          body: 'Un build statique pris en charge avance dans le parcours de publication guidée E-Code. Connexion des données clients, authentification, facturation, observabilité et contrôles de livraison restent des travaux explicites.',
        },
        {
          title: 'URL de démo en ligne et export',
          body: 'La publication d’un build statique pris en charge produit une URL en ligne hébergée par E-Code à partager. Les fonctionnalités dépendantes d’un serveur restent dans le projet exporté et exigent un runtime compatible et des services configurés.',
        },
        {
          title: 'Itération du fondateur vers l’Agent',
          body: 'Poursuivez la même conversation avec un retour client ou une note de démo, puis inspectez les changements de fichiers de l’Agent et testez le parcours actualisé dans l’aperçu.',
        },
      ],
    },
    features: {
      eyebrow: 'Pensé pour lancer des MVP',
      title: 'Tout ce dont une équipe fondatrice a besoin pour démontrer et continuer à construire',
      intro:
        'Le parcours Startups garde le prompt, la démo, le code et la prochaine étape d’ingénierie dans un seul flux inspectable.',
      items: [
        {
          title: 'Templates et génération IA',
          body: 'Partez d’un template ou d’un prompt et générez une vraie source modifiable au lieu d’un prototype verrouillé.',
        },
        {
          title: 'Aperçus hébergés',
          body: 'Exécutez le build compatible courant dans un aperçu hébergé et relisez ses mises en page responsives avant partage.',
        },
        {
          title: 'Démos investisseurs partageables',
          body: 'Partagez le lien d’aperçu afin que la démo reste accessible après la réunion et puisse être parcourue au-delà du scénario idéal.',
        },
        {
          title: 'Authentification et tableaux de bord',
          body: 'Parcours de connexion et bases de tableau de bord générés comme du code que vous étendez, pas un template figé.',
        },
        {
          title: 'Continuité du prototype au produit',
          body: 'Poursuivez la base de code exportée de la démo ; les services de production et le durcissement s’ajoutent et se valident explicitement, sans être sous-entendus par le prototype.',
        },
        {
          title: 'Source startup à exporter',
          body: 'Exportez le projet ou publiez les builds pris en charge. La propriété et l’usage autorisé suivent les conditions E-Code applicables.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Moments du MVP à valider',
      title: 'Les bases de MVP que les équipes fondatrices peuvent démontrer puis durcir',
      intro:
        'D’une liste d’attente en pré-amorçage à un produit de journée de démonstration, la boucle produit une source responsive et des parcours locaux actifs ; traction, données clients et aptitude à la production demandent des preuves séparées.',
      items: [
        {
          title: 'Liste d’attente et page en pré-amorçage',
          body: 'Présentez la proposition avec une page fonctionnelle et une confirmation locale de liste d’attente ; branchez le stockage avant de compter des inscriptions ou d’affirmer une demande.',
        },
        {
          title: 'MVP investisseurs et journée de démonstration',
          body: 'Une interface produit cliquable avec des parcours locaux à dérouler, clairement séparée de toute preuve de clients ou de traction.',
        },
        {
          title: 'Prototype produit interne',
          body: 'Une interface de tableau de bord active pour tester le parcours produit avant de brancher données et comptes de production.',
        },
        {
          title: 'Premier candidat à la mise en ligne',
          body: 'Faites passer le code de démo par l’intégration, le durcissement et les contrôles de mise en production avant de publier une version destinée aux clients.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions des fondateurs',
      title: 'Les Startups, en toute honnêteté',
      intro: 'Ce que produit le parcours Startups, et où sont ses limites.',
      items: [
        {
          title: 'J’obtiens un code source modifiable ou un prototype jetable ?',
          body: 'Vous obtenez des fichiers source modifiables — composants, routes, styles et logique — que vous lisez, versionnez et exportez. Le MVP que vous démontrez est la base de code sur laquelle vous continuez à construire.',
        },
        {
          title: 'Puis-je partager une démo en ligne avec des investisseurs ?',
          body: 'Oui. E-Code exécute le MVP dans un aperçu hébergé et vous donne un lien partageable à envoyer après la réunion. Les chiffres de traction de la démonstration de cette page sont fictifs.',
        },
        {
          title: 'Y a-t-il un vrai chemin du prototype à la production ?',
          body: 'Les builds pris en charge se publient vers une URL en ligne via la publication guidée, et chaque projet reste exportable. La production exige encore la configuration des services de données et d’identité, des secrets, des contrôles de sécurité, des tests et la validation opérationnelle de votre stack.',
        },
        {
          title: 'Puis-je ajouter l’authentification, une base ou des paiements ?',
          body: 'Les parcours générés sont du code que vous étendez et branchez à des services externes. La démonstration intégrée de cette page utilise des données fictives et aucun backend connecté.',
        },
        {
          title: 'Comment ajouter la fonctionnalité suivante ?',
          body: 'Modifiez directement les fichiers de Launchpad ou demandez à l’Agent l’expérience, l’étape de tunnel, la vue d’entretien ou le jalon suivant, puis relisez le diff face à la démo partagée.',
        },
      ],
    },
    finalCta: {
      title: 'Décrivez votre MVP et démontrez-le en direct',
      body: 'Transformez le produit que vous présentez en un MVP fonctionnel sous forme de code source modifiable, exécutez-le dans un aperçu hébergé et partagez le lien avec les investisseurs.',
      primaryCta: { label: 'Décrivez votre MVP', ariaLabel: 'Décrivez le MVP de votre startup avec E-Code' },
      secondaryCta: {
        label: 'Voir le parcours du MVP',
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
      proofLinkLabel: 'Inspecter la preuve IDE du MVP Launchpad',
      deliverablesLabel: 'Ce que livre le parcours Startups',
      featuresLabel: 'Capacités du parcours Startups',
      useCasesLabel: 'Cas d’usage des Startups',
      faqLabel: 'Questions sur les Startups',
      finalCtaLabel: 'Commencer à construire votre MVP',
    },
  },
} as const satisfies CapturedSolutionCopyByLanguage;
