import type { SolutionCopyByLanguage } from './solution-copy';

/**
 * SOL — Freelancers. Declined from the App Builder gabarit, centered on a
 * fictional independent developer delivering client projects with a clean
 * handoff. All demo data is fictional and labeled; the one real captured
 * E-Code IDE proof lives on /solutions/app-builder.
 */
export const FREELANCERS_COPY = {
  en: {
    seo: {
      title: 'Deliver Client Projects Faster | E-Code for Freelancers',
      description:
        'Start each client project from repeatable templates, share preview links for review, and hand off editable source code. E-Code turns a brief into a working app in real files with a running Preview, project export, and publishing for supported builds.',
    },
    hero: {
      eyebrow: 'E-Code for freelancers and independent studios',
      title: 'Deliver client projects faster, with a handoff that stays clean',
      subtitle:
        'Describe the client brief once and E-Code turns it into a working app in editable source code. Start from your own repeatable patterns, share a preview link for review, iterate through the Agent, and hand off an exported project the client can inspect and continue.',
      primaryCta: { label: 'Start a client project', ariaLabel: 'Start a client project with E-Code' },
      secondaryCta: { label: 'See how it builds', ariaLabel: 'See how E-Code builds a client project from a prompt' },
      microcopy:
        'Begin from the brief you already have. Source files, the running Preview, and a shareable preview link stay visible as the work moves toward handoff.',
    },
    demo: {
      badge: 'Fictional demo data',
      brand: 'Studio Ferro',
      brandType: 'Independent developer',
      nav: ['Projects', 'Previews', 'Handoff'],
      eyebrow: 'Client delivery',
      title: 'Ship each client project on a repeatable path to handoff.',
      intro:
        'A responsive delivery view that tracks active client projects, the preview links shared for review, and the handoff pack.',
      primaryHeading: 'Active client projects',
      primaryRows: [
        { label: 'Boutique — storefront', meta: 'preview shared · v3', status: 'Delivered' },
        { label: 'Clinic — booking portal', meta: 'preview shared · v2' },
        { label: 'Agency — landing page', meta: 'in build · v1' },
      ],
      asideHeading: 'Handoff',
      asideRows: [
        { label: 'Source', value: 'Exported' },
        { label: 'Preview link', value: 'Shared' },
        { label: 'Docs', value: 'Included' },
      ],
      asideCta: 'Send handoff pack',
      disclaimer: 'Inline responsive demonstration · fictional freelancer data · not a generation record',
      caption: {
        title: 'A delivery view that reads like a real client pipeline',
        body: 'This inline demonstration shows active client projects, the preview links shared for review, and a source-code handoff pack in one responsive layout.',
      },
      alt: 'Freelancer client-delivery demonstration with a list of active client projects and a handoff panel.',
    },
    problem: {
      eyebrow: 'From one-off builds to a repeatable delivery path',
      title: 'Client work is fast to start and slow to hand off cleanly',
      intro:
        'A freelancer wins on speed and on trust. Rebuilding the same scaffolding for every client burns the speed, and a messy handoff — code the client cannot run, edit, or keep — burns the trust on the last day of the project.',
      obstacles: [
        {
          title: 'Every project starts from zero',
          body: 'Rewiring auth, layout, and the same base screens for each new client eats the hours you should spend on what makes the project specific.',
        },
        {
          title: 'Review happens over screenshots',
          body: 'Sending images and scheduling calls to show progress slows every round of feedback, and the client never sees the real, running app until late.',
        },
        {
          title: 'Handoff leaves loose ends',
          body: 'A zip with no clear structure, or a build only you can run, turns the final delivery into support tickets and leaves the client dependent on you.',
        },
      ],
      bridge:
        'E-Code starts each project from the patterns you describe and produces a working app in real source files. You share a preview link for review, iterate against it, and hand off an exported codebase with the setup information the client needs to continue.',
    },
    build: {
      eyebrow: 'One prompt starts the client project',
      title: 'Describe the brief, not the boilerplate',
      intro:
        'The request below reads like a note from a client. The four items map its implementation scope in real source files, from the portal down to the handoff of the code.',
      label: 'Example prompt',
      promptText:
        'Build a client web app with a portal, shareable preview links, and a clean handoff of the source code.',
      outputs: [
        {
          title: 'Client portal',
          body: 'Sign-in, a project dashboard, and the core client screens render across desktop, tablet, and mobile from real components and routes.',
        },
        {
          title: 'Shareable preview links',
          body: 'The running app is reachable through a preview link you can send for review, so feedback happens against the real thing, not screenshots.',
        },
        {
          title: 'Reusable structure',
          body: 'Layout, navigation, and base screens are modeled as editable code you can lift into the next client project instead of rebuilding it.',
        },
        {
          title: 'Source-code handoff',
          body: 'E-Code runs the app in Preview and exports the project files. Supported builds also use guided publishing; source ownership and reuse remain governed by the applicable E-Code terms and your client agreement.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt → agent → Preview',
      title: 'Review the real prompt-to-Preview workflow before a client handoff',
      body: 'These are authentic captures from the App Builder salon-booking run. They show the prompt, agent exchange, files, and running Preview a freelancer reviews inside E-Code; they do not present the fictional client-delivery board above as a captured generation.',
      galleryLabel: 'Real salon-booking run used as client-delivery workflow evidence',
      disclaimer:
        'Both IDE images document the real App Builder reference run. The freelancer project board on this page is a scripted demonstration with fictional client data, not a generation log or client engagement.',
      openFullSizeLabel: 'Open the client-delivery workflow reference at full size',
      preview: {
        title: 'The client brief stays beside the working result',
        body: 'The real reference capture shows the salon request, agent conversation, generated project files, and booking Preview in the same E-Code workspace.',
        alt: 'Real E-Code App Builder salon run showing the request, agent conversation, generated files, and booking app Preview as workflow evidence for freelancers.',
      },
      iteration: {
        title: 'A review note becomes a visible iteration',
        body: 'The follow-up capture records the next instruction and updated Preview together, illustrating the review loop before exported-source handoff.',
        alt: 'Real E-Code App Builder salon follow-up showing the next instruction and updated booking Preview inside the IDE.',
      },
      cta: { label: 'See the real IDE proof', ariaLabel: 'See the real E-Code IDE proof on the App Builder page' },
    },
    deliverables: {
      eyebrow: 'What you receive',
      title: 'A client project you can review, ship, and hand off',
      intro:
        'The project stays inspectable from the first generated file through Preview and export. Shareable preview links carry review; an exported-source handoff reduces the client’s dependency on your workspace.',
      items: [
        {
          title: 'Source prepared for handoff',
          body: 'The client build consists of inspectable components, routes, styles, and logic you export, document, and transfer under the terms of the engagement.',
        },
        {
          title: 'Client integration map',
          body: 'Schemas, adapters, environment references, and secret names show where client data and services connect. Real credentials stay outside source and each database, identity, email, or payment provider still needs configuration.',
        },
        {
          title: 'Responsive review Preview',
          body: 'The compatible project runs in Preview across desktop, tablet, and mobile, giving the client one current interface to review instead of a folder of screenshots.',
        },
        {
          title: 'Guided publishing for static work',
          body: 'Supported static sites and frontends follow the guided E-Code publishing flow, with final content, domains, analytics, and client acceptance handled as named delivery steps.',
        },
        {
          title: 'Live static URL and runtime handoff',
          body: 'A supported static build receives a live E-Code-hosted URL for review or delivery. Apps with server logic remain exportable and need the client’s selected runtime, accounts, secrets, and operating setup.',
        },
        {
          title: 'Feedback turned into an Agent change',
          body: 'Paste the client’s next revision into the Agent conversation, then compare the changed files and refreshed Preview before sending the next review link.',
        },
      ],
    },
    features: {
      eyebrow: 'Built for client delivery',
      title: 'Everything an independent developer needs to ship and hand off',
      intro:
        'The Freelancers path keeps repeatable structure, client review, and a clean handoff in one inspectable workflow.',
      items: [
        {
          title: 'Repeatable templates',
          body: 'Start from your own base structure and screens instead of scaffolding each project again.',
        },
        {
          title: 'Preview links for review',
          body: 'Share a running preview URL so clients approve the real app, not a mockup.',
        },
        {
          title: 'Source-code handoff',
          body: 'Export the project files so the client receives an editable codebase and a clear continuation point.',
        },
        {
          title: 'Iterate with the Agent',
          body: 'Request the next change and review the diff against the running Preview.',
        },
        {
          title: 'Responsive by default',
          body: 'Layouts adapt from wide desktop to phone without a separate mobile build.',
        },
        {
          title: 'Exportable project files',
          body: 'Export the project or publish supported builds; the client’s ownership and reuse rights follow your agreement and the applicable E-Code terms.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Who builds with it',
      title: 'Projects freelancers ship with E-Code',
      intro: 'From a client portal to a launch page, the same loop produces a real, responsive app ready to hand off.',
      items: [
        {
          title: 'Client web apps and portals',
          body: 'Dashboards and sign-in flows delivered as editable project files for the client’s next development step.',
        },
        {
          title: 'Marketing and landing pages',
          body: 'Responsive sites with lead capture, shared for review before they go live.',
        },
        {
          title: 'Internal tools for clients',
          body: 'Small back-office apps that model a real workflow rather than a static prototype.',
        },
        {
          title: 'Prototypes for pitches',
          body: 'A running preview link that turns a proposal into something the client can click.',
        },
      ],
    },
    faq: {
      eyebrow: 'Common questions',
      title: 'E-Code for freelancers, answered honestly',
      intro: 'What the Freelancers path produces, and where its boundaries are.',
      items: [
        {
          title: 'Does the client get real code or a locked project?',
          body: 'You export editable source files — components, routes, styles, and content — rather than handing over only a screenshot or a hosted preview. Ownership and permitted reuse follow the applicable E-Code terms and your client agreement.',
        },
        {
          title: 'How do clients review the work?',
          body: 'You share a running preview link so the client reviews the real app at each round, and you iterate against their feedback in the same workspace.',
        },
        {
          title: 'What does the handoff include?',
          body: 'The exported source project, the preview link, and setup notes. External credentials, provider accounts, and production environment configuration remain explicit client handoff items.',
        },
        {
          title: 'Can I reuse a project across clients?',
          body: 'The exported structure is technically reusable. You remain responsible for licenses, your client agreements, confidential material, and removing every client’s data before reuse.',
        },
        {
          title: 'Can I connect a database or external services?',
          body: 'The generated code is yours to extend and wire to external services. The inline demonstration on this page uses fictional data and no connected backend.',
        },
      ],
    },
    finalCta: {
      title: 'Start a client project and share it today',
      body: 'Turn a client brief into a working app in real source code, share a preview link for review, and hand off an editable, exported project.',
      primaryCta: { label: 'Start a client project', ariaLabel: 'Start a client project with E-Code' },
      secondaryCta: { label: 'See how it builds', ariaLabel: 'See how E-Code builds a client project from a prompt' },
    },
    aria: {
      pageLabel: 'Freelancers solution page',
      heroLabel: 'Freelancers introduction',
      demoLabel: 'Freelancers product demonstration',
      problemLabel: 'The client delivery problem',
      buildLabel: 'How E-Code works for freelancers',
      outputListLabel: 'Client project build outputs',
      proofLinkLabel: 'See the real E-Code IDE proof',
      deliverablesLabel: 'What E-Code delivers for freelancers',
      featuresLabel: 'Freelancer delivery capabilities',
      useCasesLabel: 'Freelancer use cases',
      faqLabel: 'Freelancer questions',
      finalCtaLabel: 'Start your client project',
    },
  },
  fr: {
    seo: {
      title: 'Livrez vos projets clients plus vite | E-Code pour freelances',
      description:
        'Démarrez chaque projet client depuis des modèles réutilisables, partagez des liens d’aperçu pour la revue et transmettez un code source modifiable. E-Code transforme un brief en une application fonctionnelle dans de vrais fichiers, avec un aperçu actif, l’export du projet et la publication des compilations prises en charge.',
    },
    hero: {
      eyebrow: 'E-Code pour freelances et studios indépendants',
      title: 'Livrez vos projets clients plus vite, avec un transfert qui reste propre',
      subtitle:
        'Décrivez le brief client une fois et E-Code en fait une application fonctionnelle dans un vrai code source modifiable. Partez de vos propres modèles réutilisables, partagez un lien d’aperçu pour la revue, itérez avec l’Agent et transmettez un projet exporté que le client peut inspecter et poursuivre.',
      primaryCta: { label: 'Démarrer un projet client', ariaLabel: 'Démarrer un projet client avec E-Code' },
      secondaryCta: {
        label: 'Voir la construction',
        ariaLabel: 'Voir comment E-Code construit un projet client à partir d’un prompt',
      },
      microcopy:
        'Partez du brief que vous avez déjà. Les fichiers source, l’aperçu actif et un lien d’aperçu partageable restent visibles à mesure que le travail avance vers le transfert.',
    },
    demo: {
      badge: 'Données fictives',
      brand: 'Studio Ferro',
      brandType: 'Développeur indépendant',
      nav: ['Projets', 'Aperçus', 'Transfert'],
      eyebrow: 'Livraison client',
      title: 'Livrez chaque projet client sur un parcours répétable jusqu’au transfert.',
      intro:
        'Une vue de livraison adaptative qui suit les projets clients actifs, les liens d’aperçu partagés pour la revue et le dossier de transfert.',
      primaryHeading: 'Projets clients actifs',
      primaryRows: [
        { label: 'Boutique — vitrine', meta: 'aperçu partagé · v3', status: 'Livré' },
        { label: 'Clinique — portail de réservation', meta: 'aperçu partagé · v2' },
        { label: 'Agence — page d’atterrissage', meta: 'en construction · v1' },
      ],
      asideHeading: 'Transfert',
      asideRows: [
        { label: 'Source', value: 'Exporté' },
        { label: 'Lien d’aperçu', value: 'Partagé' },
        { label: 'Documentation', value: 'Inclus' },
      ],
      asideCta: 'Envoyer le dossier de transfert',
      disclaimer: 'Démonstration adaptative intégrée · données de freelance fictives · pas une trace de génération',
      caption: {
        title: 'Une vue de livraison qui se lit comme un vrai pipeline client',
        body: 'Cette démonstration intégrée présente les projets clients actifs, les liens d’aperçu partagés pour la revue et un dossier de transfert du code source dans une mise en page adaptative.',
      },
      alt: 'Démonstration de livraison client pour freelance avec une liste de projets clients actifs et un panneau de transfert.',
    },
    problem: {
      eyebrow: 'Des compilations ponctuelles à un parcours de livraison répétable',
      title: 'Le travail client démarre vite et se transmet lentement',
      intro:
        'Un freelance gagne sur la vitesse et sur la confiance. Reconstruire le même échafaudage pour chaque client brûle la vitesse, et un transfert bâclé — un code que le client ne peut ni exécuter, ni modifier, ni conserver — brûle la confiance le dernier jour du projet.',
      obstacles: [
        {
          title: 'Chaque projet repart de zéro',
          body: 'Recâbler l’authentification, la mise en page et les mêmes écrans de base pour chaque nouveau client mange les heures à consacrer à ce qui rend le projet spécifique.',
        },
        {
          title: 'La revue se fait par captures d’écran',
          body: 'Envoyer des images et planifier des appels pour montrer l’avancement ralentit chaque tour de retours, et le client ne voit la vraie application en fonctionnement que tard.',
        },
        {
          title: 'Le transfert laisse des fils qui pendent',
          body: 'Un zip sans structure claire, ou une version que vous seul savez exécuter, transforme la livraison finale en tickets de support et laisse le client dépendant de vous.',
        },
      ],
      bridge:
        'E-Code part des modèles que vous décrivez et produit une application fonctionnelle dans de vrais fichiers source. Vous partagez un lien d’aperçu pour la revue, itérez face à lui et transmettez une base de code exportée avec les informations d’installation nécessaires pour poursuivre.',
    },
    build: {
      eyebrow: 'Un prompt lance le projet client',
      title: 'Décrivez le brief, pas le boilerplate',
      intro:
        'La demande ci-dessous se lit comme un mot d’un client. Les quatre éléments cartographient son périmètre d’implémentation dans de vrais fichiers source, du portail jusqu’au transfert du code.',
      label: 'Exemple de prompt',
      promptText:
        'Construis une application web client avec un portail, des liens d’aperçu partageables et un transfert propre du code source.',
      outputs: [
        {
          title: 'Portail client',
          body: 'Connexion, tableau de bord de projet et écrans clients principaux s’affichent sur desktop, tablette et mobile à partir de vrais composants et routes.',
        },
        {
          title: 'Liens d’aperçu partageables',
          body: 'L’application en fonctionnement est accessible via un lien d’aperçu que vous pouvez envoyer pour la revue, pour des retours sur le vrai produit, pas sur des captures.',
        },
        {
          title: 'Structure réutilisable',
          body: 'Mise en page, navigation et écrans de base sont modélisés comme un code modifiable que vous reprenez dans le projet client suivant au lieu de le reconstruire.',
        },
        {
          title: 'Transfert du code source',
          body: 'E-Code exécute l’application dans l’aperçu et exporte les fichiers du projet. Les compilations prises en charge utilisent aussi la publication guidée ; la propriété et la réutilisation de la source suivent les conditions E-Code applicables et votre contrat client.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt → agent → aperçu',
      title: 'Relisez le vrai parcours du prompt à l’aperçu avant un transfert client',
      body: 'Voici de vraies captures du run Générateur d’applications du salon de coiffure. Elles montrent le prompt, l’échange avec l’agent, les fichiers et l’aperçu actif qu’un freelance relit dans E-Code ; elles ne présentent pas le tableau de livraison client fictif ci-dessus comme une génération capturée.',
      galleryLabel: 'Vrai run de réservation du salon utilisé comme preuve du parcours de livraison client',
      disclaimer:
        'Les deux images IDE documentent le vrai run Générateur d’applications de référence. Le tableau de projets freelance de cette page est une démonstration scénarisée avec des données clients fictives, pas un journal de génération ni une mission client.',
      openFullSizeLabel: 'Ouvrir la référence du parcours de livraison client en plein format',
      preview: {
        title: 'Le brief client reste à côté du résultat fonctionnel',
        body: 'La vraie capture de référence montre la demande du salon, la conversation avec l’agent, les fichiers projet générés et l’aperçu de réservation dans le même espace de travail E-Code.',
        alt: 'Vrai run Générateur d’applications E-Code du salon montrant la demande, la conversation avec l’agent, les fichiers générés et l’aperçu de réservation comme preuve de parcours pour les freelances.',
      },
      iteration: {
        title: 'Une note de revue devient une itération visible',
        body: 'La capture de suivi conserve ensemble l’instruction suivante et l’aperçu mis à jour, pour illustrer la boucle de revue avant le transfert de la source exportée.',
        alt: 'Vrai suivi Générateur d’applications E-Code du salon montrant l’instruction suivante et l’aperçu de réservation mis à jour dans l’IDE.',
      },
      cta: {
        label: 'Voir la preuve IDE réelle',
        ariaLabel: 'Voir la preuve IDE réelle E-Code sur la page Générateur d’applications',
      },
    },
    deliverables: {
      eyebrow: 'Ce que vous recevez',
      title: 'Un projet client que vous pouvez relire, livrer et transmettre',
      intro:
        'Le projet reste inspectable du premier fichier généré jusqu’à l’aperçu et l’export. Les liens d’aperçu partageables portent la revue ; le transfert de la source exportée réduit la dépendance du client à votre espace de travail.',
      items: [
        {
          title: 'Source préparée pour le transfert',
          body: 'Le projet client se compose de composants, routes, styles et logique inspectables que vous exportez, documentez et transmettez selon les conditions de la mission.',
        },
        {
          title: 'Carte des intégrations client',
          body: 'Schémas, adaptateurs, références d’environnement et noms de secrets indiquent où brancher données et services du client. Les vrais identifiants restent hors de la source et chaque base, fournisseur d’identité, email ou paiement exige encore sa configuration.',
        },
        {
          title: 'Aperçu adaptatif pour la revue',
          body: 'Le projet compatible tourne dans l’aperçu sur desktop, tablette et mobile, pour donner au client une interface courante unique à relire plutôt qu’un dossier de captures.',
        },
        {
          title: 'Publication guidée des projets statiques',
          body: 'Les sites et interfaces statiques pris en charge suivent le parcours de publication guidée E-Code, avec contenu final, domaines, analytics et validation client traités comme des étapes de livraison nommées.',
        },
        {
          title: 'URL statique en ligne et relais d’exécution',
          body: 'Une compilation statique prise en charge reçoit une URL en ligne hébergée par E-Code pour la revue ou la livraison. Les applications avec logique serveur restent exportables et exigent l’environnement d’exécution, les comptes, les secrets et l’exploitation choisis par le client.',
        },
        {
          title: 'Retour client transformé en changement Agent',
          body: 'Collez la prochaine révision du client dans la conversation avec l’Agent, puis comparez les fichiers modifiés et l’aperçu actualisé avant d’envoyer le prochain lien de revue.',
        },
      ],
    },
    features: {
      eyebrow: 'Pensé pour la livraison client',
      title: 'Tout ce dont un développeur indépendant a besoin pour livrer et transmettre',
      intro:
        'Le parcours Freelances garde la structure réutilisable, la revue client et un transfert propre dans un seul flux inspectable.',
      items: [
        {
          title: 'Modèles réutilisables',
          body: 'Partez de votre propre structure de base et de vos écrans au lieu d’échafauder chaque projet à nouveau.',
        },
        {
          title: 'Liens d’aperçu pour la revue',
          body: 'Partagez une URL d’aperçu active pour que les clients valident la vraie application, pas une maquette.',
        },
        {
          title: 'Transfert du code source',
          body: 'Exportez les fichiers du projet pour que le client reçoive une base de code modifiable et un point de reprise clair.',
        },
        {
          title: 'Itérer avec l’Agent',
          body: 'Demandez le changement suivant et relisez le diff face à l’aperçu actif.',
        },
        {
          title: 'Adaptatif par défaut',
          body: 'Les mises en page s’adaptent du grand écran au téléphone sans compilation mobile séparée.',
        },
        {
          title: 'Fichiers projet exportables',
          body: 'Exportez le projet ou publiez les compilations prises en charge ; les droits de propriété et de réutilisation du client suivent votre accord et les conditions E-Code applicables.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Qui construit avec',
      title: 'Les projets que les freelances livrent avec E-Code',
      intro:
        'D’un portail client à une page de lancement, la même boucle produit une vraie application adaptative prête à transmettre.',
      items: [
        {
          title: 'Applications web et portails clients',
          body: 'Tableaux de bord et parcours de connexion livrés sous forme de fichiers projet modifiables pour la prochaine étape de développement du client.',
        },
        {
          title: 'Pages vitrines et d’atterrissage',
          body: 'Sites adaptatifs avec capture de leads, partagés pour la revue avant la mise en ligne.',
        },
        {
          title: 'Outils internes pour clients',
          body: 'Petites applications de back-office qui modélisent un vrai processus plutôt qu’une maquette statique.',
        },
        {
          title: 'Prototypes pour propositions',
          body: 'Un lien d’aperçu actif qui transforme une proposition en quelque chose que le client peut cliquer.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions fréquentes',
      title: 'E-Code pour freelances, en toute honnêteté',
      intro: 'Ce que produit le parcours Freelances, et où sont ses limites.',
      items: [
        {
          title: 'Le client obtient-il du vrai code ou un projet verrouillé ?',
          body: 'Vous exportez des fichiers source modifiables — composants, routes, styles et contenu — au lieu de transmettre seulement une capture ou une maquette hébergée. La propriété et la réutilisation autorisée suivent les conditions E-Code applicables et votre contrat client.',
        },
        {
          title: 'Comment les clients relisent-ils le travail ?',
          body: 'Vous partagez un lien d’aperçu actif pour que le client relise la vraie application à chaque tour, et vous itérez selon ses retours dans le même espace de travail.',
        },
        {
          title: 'Que contient le transfert ?',
          body: 'Le projet source exporté, le lien d’aperçu et les notes d’installation. Les identifiants externes, les comptes fournisseurs et la configuration de l’environnement de production restent des éléments explicites du transfert client.',
        },
        {
          title: 'Puis-je réutiliser un projet entre clients ?',
          body: 'La structure exportée est techniquement réutilisable. Vous restez responsable des licences, de vos contrats clients, des éléments confidentiels et de la suppression de toutes les données du client avant réutilisation.',
        },
        {
          title: 'Puis-je connecter une base ou des services externes ?',
          body: 'Le code généré est le vôtre à étendre et à brancher à des services externes. La démonstration intégrée de cette page utilise des données fictives et aucun service applicatif connecté.',
        },
      ],
    },
    finalCta: {
      title: 'Démarrez un projet client et partagez-le aujourd’hui',
      body: 'Transformez un brief client en une application fonctionnelle dans du vrai code source, partagez un lien d’aperçu pour la revue et transmettez un projet modifiable et exporté.',
      primaryCta: { label: 'Démarrer un projet client', ariaLabel: 'Démarrer un projet client avec E-Code' },
      secondaryCta: {
        label: 'Voir la construction',
        ariaLabel: 'Voir comment E-Code construit un projet client à partir d’un prompt',
      },
    },
    aria: {
      pageLabel: 'Page solution Freelances',
      heroLabel: 'Introduction Freelances',
      demoLabel: 'Démonstration produit Freelances',
      problemLabel: 'Le problème de la livraison client',
      buildLabel: 'Comment E-Code fonctionne pour les freelances',
      outputListLabel: 'Résultats de la génération du projet client',
      proofLinkLabel: 'Voir la preuve IDE réelle E-Code',
      deliverablesLabel: 'Ce que livre E-Code pour les freelances',
      featuresLabel: 'Capacités de livraison pour freelances',
      useCasesLabel: 'Cas d’usage freelances',
      faqLabel: 'Questions freelances',
      finalCtaLabel: 'Démarrer votre projet client',
    },
  },
} as const satisfies SolutionCopyByLanguage;
