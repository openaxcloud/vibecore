import type { SolutionCopyByLanguage } from './solution-copy';

/**
 * SOL — Startups. Dedicated seed-stage MVP story in EN and FR. All product and
 * traction data is fictional and labeled; proof claims stop at the captured Agent
 * exchange, generated files, Webview, and local demo interactions.
 */
export const STARTUPS_COPY = {
  en: {
    seo: {
      title: 'Ship a Startup MVP Fast with Real Code | E-Code',
      description:
        'Describe the MVP your startup needs to demo. E-Code turns it into editable source files with a hosted Preview, a shareable review link, project export, and guided publishing for supported builds.',
    },
    hero: {
      eyebrow: 'For startups shipping an MVP',
      title: 'Go from prototype to a demo-ready MVP in real code',
      subtitle:
        'Describe the product you need to show investors and early users. E-Code turns it into editable source code and a hosted Preview you can share as a link. The same project remains your development base while production integrations, security, and release checks stay explicit.',
      primaryCta: { label: 'Describe your MVP', ariaLabel: 'Describe your startup MVP with E-Code' },
      secondaryCta: { label: 'See how it builds', ariaLabel: 'See how E-Code builds the MVP from a prompt' },
      microcopy:
        'Start from the product you already pitch. Source files, the hosted Preview, and a shareable demo link stay visible as the MVP evolves.',
    },
    languageSwitch: { label: 'Choose the Startups page language', english: 'English', french: 'Français' },
    demo: {
      badge: 'Fictional demo data',
      brand: 'Launchpad',
      brandType: 'Fictional product concept',
      nav: ['Product', 'Waitlist', 'Metrics'],
      eyebrow: 'Sample launch plan',
      title: 'Local MVP checklist',
      intro:
        'A responsive local product scenario that pairs fictional milestones with demo-only states; it does not report traction, stored sign-ups, or a production launch.',
      primaryHeading: 'Fictional MVP states',
      primaryRows: [
        { label: 'Landing + waitlist', meta: 'local route · demo state', status: 'UI ready' },
        { label: 'Product dashboard', meta: 'local route · review state' },
        { label: 'Sign-in and accounts', meta: 'screen scaffold · no provider' },
      ],
      asideHeading: 'Demo boundaries',
      asideRows: [
        { label: 'Waitlist records', value: 'Local fixtures' },
        { label: 'Preview state', value: 'Current IDE run' },
        { label: 'Next milestone', value: 'Sample only' },
      ],
      asideCta: 'Preview share control',
      disclaimer:
        'Scripted local interface · fictional product and milestones · no stored sign-ups, real accounts, analytics, funding, or production launch · not a generation record',
      caption: {
        title: 'An MVP walkthrough that keeps traction and production claims out',
        body: 'This local interface demonstrates a launch checklist, explicit demo boundaries, and the presentation of a share control without claiming an external share occurred.',
      },
      alt: 'Scripted local startup MVP interface with fictional milestones, local fixtures, and an unverified share-control preview.',
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
        'E-Code starts from the MVP you describe and produces a working demo in real source files. You inspect the code, run it in a hosted Preview, share the link, and keep developing the same project instead of discarding the prototype.',
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
          body: 'A responsive landing page with a waitlist form and submission structure, rendered from real components and routes across desktop, tablet, and mobile. Persistent storage still needs its chosen service configured.',
        },
        {
          title: 'Product dashboard',
          body: 'A dashboard shell with structured data views and navigation, modeled as editable code the team can extend feature by feature.',
        },
        {
          title: 'Sign-in and accounts',
          body: 'Sign-in and account screens with route scaffolding modeled in code. A real identity provider, session policy, and production secrets remain separate integration work.',
        },
        {
          title: 'Hosted Preview and demo link',
          body: 'E-Code runs the compatible MVP build in a hosted Preview and provides a shareable review link. The project stays exportable while production readiness remains a separate validation step.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Founder brief → Agent → MVP Webview',
      title: 'Inspect the startup demo generated from one product brief',
      body: 'These dedicated E-Code captures show the founder prompt, the Agent exchange, the generated landing-page and dashboard files, and the MVP running in Webview inside the same project.',
      galleryLabel: 'Captured startup-MVP generation and local demo flow inside E-Code',
      disclaimer:
        'Captured E-Code generation · fictional product and traction data · waitlist and account behavior stays local to the demo · no persistent database, production authentication, email delivery, analytics, or production deployment is demonstrated',
      openFullSizeLabel: 'Open the startup-MVP capture at full size',
      preview: {
        title: 'The landing page and product shell run beside their files',
        body: 'The first capture keeps the MVP brief and Agent activity visible while Webview renders the waitlist landing page, product navigation, and dashboard shell from generated source.',
        alt: 'Real E-Code Startups workspace showing an MVP prompt, Agent activity, generated landing-page and dashboard files, and the startup product running in Webview.',
      },
      iteration: {
        title: 'A founder follow-up becomes a visible demo change',
        body: 'The second capture keeps the next instruction beside the updated MVP and its source. A local confirmation or navigation state proves the demo interaction; it does not prove stored sign-ups, real accounts, or production readiness.',
        alt: 'Real E-Code Startups iteration showing a founder follow-up prompt, generated MVP files, and an updated local waitlist or product state in Webview.',
      },
      cta: {
        label: 'Inspect the captured MVP run',
        ariaLabel: 'Inspect the captured E-Code startup-MVP generation and local demo interaction',
      },
    },
    deliverables: {
      eyebrow: 'What you receive',
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
          title: 'Exportable source',
          body: 'Export the project or publish supported builds. Ownership and permitted use follow the applicable E-Code terms.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Who builds with it',
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
          body: 'Supported builds publish to a live URL through guided publishing, and every project stays exportable. Production still requires configured data and identity services, secrets, security checks, tests, and operational validation for your stack.',
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
        'Décrivez le MVP que votre startup doit démontrer. E-Code le transforme en fichiers source modifiables avec un aperçu hébergé, un lien de revue partageable, l’export du projet et la publication guidée pour les builds pris en charge.',
    },
    hero: {
      eyebrow: 'Pour les startups qui lancent un MVP',
      title: 'Passez du prototype à un MVP prêt à démontrer, en vrai code',
      subtitle:
        'Décrivez le produit à montrer aux investisseurs et aux premiers utilisateurs. E-Code en fait du code source modifiable et un aperçu hébergé à partager en lien. Le même projet reste votre base de développement, tandis que les intégrations, la sécurité et les contrôles de mise en production restent explicites.',
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
      brandType: 'Concept produit fictif',
      nav: ['Produit', 'Liste d’attente', 'Métriques'],
      eyebrow: 'Plan de lancement d’exemple',
      title: 'Checklist locale du MVP',
      intro:
        'Un scénario produit local et responsive qui associe des jalons fictifs à des états de démo ; il ne rapporte ni traction, ni inscription stockée, ni lancement en production.',
      primaryHeading: 'États fictifs du MVP',
      primaryRows: [
        { label: 'Page d’attente + liste', meta: 'route locale · état de démo', status: 'UI prête' },
        { label: 'Tableau de bord produit', meta: 'route locale · état de revue' },
        { label: 'Connexion et comptes', meta: 'écrans échafaudés · aucun fournisseur' },
      ],
      asideHeading: 'Frontières de la démo',
      asideRows: [
        { label: 'Fiches d’attente', value: 'Fixtures locales' },
        { label: 'État de l’aperçu', value: 'Run IDE courant' },
        { label: 'Prochain jalon', value: 'Exemple seul' },
      ],
      asideCta: 'Prévisualiser le contrôle de partage',
      disclaimer:
        'Interface locale scénarisée · produit et jalons fictifs · aucune inscription stockée, compte réel, analytics, levée ni production · pas une trace de génération',
      caption: {
        title: 'Un parcours MVP qui exclut toute promesse de traction ou de production',
        body: 'Cette interface locale présente une checklist de lancement, les frontières explicites de la démo et un contrôle de partage sans prétendre qu’un partage externe a eu lieu.',
      },
      alt: 'Interface locale scénarisée de MVP avec jalons fictifs, fixtures locales et contrôle de partage non vérifié.',
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
        'E-Code part du MVP que vous décrivez et produit une démo fonctionnelle dans de vrais fichiers source. Vous inspectez le code, l’exécutez dans un aperçu hébergé, partagez le lien et poursuivez le même projet au lieu de jeter le prototype.',
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
          body: 'Une page d’accueil responsive avec un formulaire de liste d’attente et sa structure de soumission, rendue à partir de vrais composants et routes sur desktop, tablette et mobile. Le service choisi pour la persistance reste à configurer.',
        },
        {
          title: 'Tableau de bord produit',
          body: 'Une base de tableau de bord avec des vues de données structurées et une navigation, modélisée comme un code modifiable que l’équipe étend fonctionnalité par fonctionnalité.',
        },
        {
          title: 'Connexion et comptes',
          body: 'Des écrans de connexion et de compte avec une base de routes modélisée en code. Un vrai fournisseur d’identité, la politique de session et les secrets de production restent un travail d’intégration distinct.',
        },
        {
          title: 'Aperçu hébergé et lien de démo',
          body: 'E-Code exécute le build compatible du MVP dans un aperçu hébergé et fournit un lien de revue partageable. Le projet reste exportable, tandis que l’aptitude à la production fait l’objet d’une validation séparée.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Brief fondateur → Agent → Webview du MVP',
      title: 'Inspectez la démo startup générée à partir d’un seul brief produit',
      body: 'Ces captures E-Code dédiées montrent le prompt du fondateur, l’échange avec l’Agent, les fichiers générés de la landing page et du tableau de bord et le MVP actif dans la Webview du même projet.',
      galleryLabel: 'Génération capturée du MVP startup et parcours local dans E-Code',
      disclaimer:
        'Génération E-Code capturée · produit et traction fictifs · comportement de la liste d’attente et des comptes limité à la démo locale · aucune base persistante, authentification de production, livraison d’email, analytics ni production démontrée',
      openFullSizeLabel: 'Ouvrir la capture du MVP startup en grand',
      preview: {
        title: 'La landing page et le produit tournent à côté de leurs fichiers',
        body: 'La première capture conserve le brief du MVP et l’activité de l’Agent pendant que la Webview affiche la landing page de liste d’attente, la navigation produit et le tableau de bord issus de la source générée.',
        alt: 'Vrai workspace Startups E-Code montrant un prompt de MVP, l’activité de l’Agent, les fichiers générés de landing page et de tableau de bord et le produit actif dans la Webview.',
      },
      iteration: {
        title: 'Un suivi du fondateur devient un changement visible dans la démo',
        body: 'La seconde capture conserve l’instruction suivante auprès du MVP mis à jour et de sa source. Une confirmation ou une navigation locale prouve l’interaction de la démo ; elle ne prouve ni inscription stockée, ni vrai compte, ni préparation à la production.',
        alt: 'Vraie itération Startups E-Code montrant un prompt de suivi du fondateur, les fichiers du MVP et un état local mis à jour de la liste d’attente ou du produit dans la Webview.',
      },
      cta: {
        label: 'Inspecter le run capturé du MVP',
        ariaLabel: 'Inspecter la génération E-Code capturée du MVP startup et son interaction locale',
      },
    },
    deliverables: {
      eyebrow: 'Ce que vous recevez',
      title: 'Une base de MVP fonctionnelle à inspecter, exporter et poursuivre',
      intro:
        'Le projet reste inspectable du premier fichier généré jusqu’à l’aperçu hébergé et l’export. La source que vous démontrez reste le point de départ des travaux d’ingénierie, d’intégration et de mise en production qui suivent.',
      items: [
        {
          title: 'Vraie source produit',
          body: 'La première version du produit vit dans des composants, routes, styles et logique inspectables que l’équipe fondatrice modifie, versionne et exporte au lieu de repartir d’un slide deck.',
        },
        {
          title: 'Couche de données explicite',
          body: 'Enregistrements de liste d’attente, formes de comptes, schémas du tableau de bord, adaptateurs, références d’environnement et noms de secrets restent visibles. Base, fournisseur d’identité, analytics et paiements choisis exigent encore de vrais identifiants et un travail d’intégration.',
        },
        {
          title: 'Aperçu responsive prêt pour la démo',
          body: 'Le build compatible tourne dans l’aperçu aux formats téléphone, tablette et desktop pour que les fondateurs relisent le parcours courant avant de le partager avec un investisseur ou un premier utilisateur.',
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
          body: 'Envoyez un lien en ligne pour qu’une démo survive à la réunion et au parcours idéal.',
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
          title: 'Source exportable',
          body: 'Exportez le projet ou publiez les builds pris en charge. La propriété et l’usage autorisé suivent les conditions E-Code applicables.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Qui construit avec',
      title: 'Les bases de MVP que les équipes fondatrices peuvent démontrer puis durcir',
      intro:
        'D’une liste d’attente en pré-amorçage à un produit de demo day, la boucle produit une source responsive et des parcours locaux actifs ; traction, données clients et aptitude à la production demandent des preuves séparées.',
      items: [
        {
          title: 'Liste d’attente et page en pré-amorçage',
          body: 'Présentez la proposition avec une page fonctionnelle et une confirmation locale de liste d’attente ; branchez le stockage avant de compter des inscriptions ou d’affirmer une demande.',
        },
        {
          title: 'MVP investisseurs et demo day',
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
          body: 'Les builds pris en charge se publient vers une URL en ligne via la publication guidée, et chaque projet reste exportable. La production exige encore la configuration des services de données et d’identité, des secrets, des contrôles de sécurité, des tests et la validation opérationnelle de votre stack.',
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
