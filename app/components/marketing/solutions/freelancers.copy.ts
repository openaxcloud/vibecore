import type { SolutionCopyByLanguage } from './solution-copy';

/**
 * SOL — Freelancers. Dedicated client-delivery story in EN and FR. All clients,
 * projects, and review states are fictional and labeled; proof claims stop at the
 * captured Agent exchange, generated files, Webview, and local portal interaction.
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
    languageSwitch: { label: 'Choose the Freelancers page language', english: 'English', french: 'Français' },
    demo: {
      badge: 'Fictional demo data',
      brand: 'Studio Ferro',
      brandType: 'Fictional delivery scenario',
      nav: ['Projects', 'Previews', 'Handoff'],
      eyebrow: 'Local client-delivery demo',
      title: 'Review a repeatable project-to-handoff interface.',
      intro:
        'A responsive local scenario with fictional projects, review states, preview controls, and a handoff checklist; it does not record real client delivery.',
      primaryHeading: 'Fictional client projects',
      primaryRows: [
        { label: 'Boutique — storefront', meta: 'sample review state · v3', status: 'UI: delivered' },
        { label: 'Clinic — booking portal', meta: 'sample review state · v2' },
        { label: 'Agency — landing page', meta: 'local build state · v1' },
      ],
      asideHeading: 'Handoff controls',
      asideRows: [
        { label: 'Source', value: 'Export control' },
        { label: 'Preview link', value: 'Share control' },
        { label: 'Docs', value: 'Checklist UI' },
      ],
      asideCta: 'Preview handoff flow',
      disclaimer:
        'Scripted local interface · fictional clients and states · no link sent, source transferred, payment processed, email delivered, or client acceptance · not a generation record',
      caption: {
        title: 'A delivery workflow scenario without invented client activity',
        body: 'This local interface demonstrates project-state cards, preview and export controls, and a handoff checklist without claiming that a real share or transfer occurred.',
      },
      alt: 'Scripted local freelancer interface with fictional projects and unverified preview-share, source-export, and handoff controls.',
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
      eyebrow: 'Client brief → Agent → delivery-portal Webview',
      title: 'Inspect the client portal generated for this freelance workflow',
      body: 'These dedicated E-Code captures show the client brief, the Agent exchange, the generated portal and delivery files, and the client-facing project view running in Webview.',
      galleryLabel: 'Captured client-portal generation and local review flow inside E-Code',
      disclaimer:
        'Captured E-Code generation · fictional clients, projects, and review states · local portal behavior only · no production authentication, email, payment, externally verified share access, or completed source handoff is demonstrated',
      openFullSizeLabel: 'Open the client-portal capture at full size',
      preview: {
        title: 'The client brief stays beside the running portal',
        body: 'The first capture keeps the delivery request and Agent activity beside the generated source while Webview renders the project overview, review status, preview entry, and handoff checklist from fictional local data.',
        alt: 'Real E-Code Freelancers workspace showing a client-portal brief, Agent activity, generated delivery files, and a project review and handoff view running in Webview.',
      },
      iteration: {
        title: 'A review note becomes a visible portal update',
        body: 'The follow-up capture keeps the next instruction beside the updated local project state and generated files. It proves the Agent iteration and in-browser review flow, not that a real client received a link or accepted a handoff.',
        alt: 'Real E-Code Freelancers iteration showing a client review prompt, generated portal files, and an updated local project status in Webview.',
      },
      cta: {
        label: 'Inspect the captured client run',
        ariaLabel: 'Inspect the captured E-Code client-portal generation and local review state',
      },
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
      title: 'Project foundations freelancers prepare for review and handoff',
      intro:
        'From a client portal to a launch page, the loop produces responsive source and a running interface; client acceptance, external sharing, service connections, and the final transfer remain verifiable delivery steps.',
      items: [
        {
          title: 'Client web apps and portals',
          body: 'Dashboard and sign-in interfaces delivered as editable project files, with identity and server enforcement still explicit integration work.',
        },
        {
          title: 'Marketing and landing pages',
          body: 'Responsive sites with a validated form UI and delivery hook, ready for review before any live submission service is connected.',
        },
        {
          title: 'Internal tools for clients',
          body: 'Small back-office interfaces that model a client workflow while keeping persistence, identity, and authorization boundaries visible.',
        },
        {
          title: 'Prototypes for pitches',
          body: 'A running preview link to review the proposed journey; client opening and acceptance are confirmed outside the scripted page demo.',
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
          body: 'You export editable source files — components, routes, styles, and content — rather than handing over only a screenshot or hosted mock. Ownership and permitted reuse follow the applicable E-Code terms and your client agreement.',
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
        'Démarrez chaque projet client depuis des modèles réutilisables, partagez des liens d’aperçu pour la revue et transmettez un code source modifiable. E-Code transforme un brief en une application fonctionnelle dans de vrais fichiers, avec un aperçu actif, l’export du projet et la publication des builds pris en charge.',
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
    languageSwitch: { label: 'Choisir la langue de la page Freelances', english: 'English', french: 'Français' },
    demo: {
      badge: 'Données fictives',
      brand: 'Studio Ferro',
      brandType: 'Scénario de livraison fictif',
      nav: ['Projets', 'Aperçus', 'Transfert'],
      eyebrow: 'Démo locale de livraison client',
      title: 'Relisez une interface répétable du projet au transfert.',
      intro:
        'Un scénario local responsive avec des projets, états de revue, contrôles d’aperçu et checklist de transfert fictifs ; il ne consigne aucune livraison client réelle.',
      primaryHeading: 'Projets clients fictifs',
      primaryRows: [
        { label: 'Boutique — vitrine', meta: 'état de revue fictif · v3', status: 'UI : livré' },
        { label: 'Clinique — portail de réservation', meta: 'état de revue fictif · v2' },
        { label: 'Agence — page d’atterrissage', meta: 'état de build local · v1' },
      ],
      asideHeading: 'Contrôles de transfert',
      asideRows: [
        { label: 'Source', value: 'Contrôle d’export' },
        { label: 'Lien d’aperçu', value: 'Contrôle de partage' },
        { label: 'Docs', value: 'Checklist UI' },
      ],
      asideCta: 'Prévisualiser le transfert',
      disclaimer:
        'Interface locale scénarisée · clients et états fictifs · aucun lien envoyé, code transmis, paiement traité, email livré ni accord client · pas une trace de génération',
      caption: {
        title: 'Un scénario de livraison sans activité client inventée',
        body: 'Cette interface locale présente des cartes d’état, des contrôles d’aperçu et d’export, et une checklist de transfert sans prétendre qu’un partage ou transfert réel a eu lieu.',
      },
      alt: 'Interface locale scénarisée pour freelance avec projets fictifs et contrôles non vérifiés de partage, export et transfert.',
    },
    problem: {
      eyebrow: 'Des builds ponctuels à un parcours de livraison répétable',
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
          body: 'Un zip sans structure claire, ou un build que vous seul savez exécuter, transforme la livraison finale en tickets de support et laisse le client dépendant de vous.',
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
        'Construis une app web client avec un portail, des liens d’aperçu partageables et un transfert propre du code source.',
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
          body: 'E-Code exécute l’application dans l’aperçu et exporte les fichiers du projet. Les builds pris en charge utilisent aussi la publication guidée ; la propriété et la réutilisation de la source suivent les conditions E-Code applicables et votre contrat client.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Brief client → Agent → Webview du portail de livraison',
      title: 'Inspectez le portail client généré pour ce workflow freelance',
      body: 'Ces captures E-Code dédiées montrent le brief client, l’échange avec l’Agent, les fichiers générés du portail et de la livraison et la vue projet destinée au client active dans la Webview.',
      galleryLabel: 'Génération capturée du portail client et parcours de revue local dans E-Code',
      disclaimer:
        'Génération E-Code capturée · clients, projets et états de revue fictifs · comportement local du portail uniquement · aucune authentification de production, email, paiement, ouverture externe du lien ni remise effective de la source démontrée',
      openFullSizeLabel: 'Ouvrir la capture du portail client en grand',
      preview: {
        title: 'Le brief client reste à côté du portail actif',
        body: 'La première capture conserve la demande de livraison et l’activité de l’Agent auprès de la source générée pendant que la Webview affiche le projet, son état de revue, l’entrée d’aperçu et la checklist de transfert à partir de données locales fictives.',
        alt: 'Vrai workspace Freelances E-Code montrant un brief de portail client, l’activité de l’Agent, les fichiers de livraison générés et une vue de revue et de transfert active dans la Webview.',
      },
      iteration: {
        title: 'Une note de revue devient une mise à jour visible du portail',
        body: 'La capture de suivi conserve l’instruction suivante auprès de l’état local du projet mis à jour et des fichiers générés. Elle prouve l’itération de l’Agent et le parcours de revue dans le navigateur, pas qu’un vrai client a reçu le lien ou accepté le transfert.',
        alt: 'Vraie itération Freelances E-Code montrant un prompt de revue client, les fichiers générés du portail et un état local du projet mis à jour dans la Webview.',
      },
      cta: {
        label: 'Inspecter le run capturé du projet client',
        ariaLabel: 'Inspecter la génération E-Code capturée du portail client et son état de revue local',
      },
    },
    deliverables: {
      eyebrow: 'Ce que vous recevez',
      title: 'Un projet client que vous pouvez relire, livrer et transmettre',
      intro:
        'Le projet reste inspectable du premier fichier généré jusqu’à l’aperçu et l’export. Les liens d’aperçu partageables portent la revue ; le transfert de la source exportée réduit la dépendance du client à votre workspace.',
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
          title: 'Aperçu responsive pour la revue',
          body: 'Le projet compatible tourne dans l’aperçu sur desktop, tablette et mobile, pour donner au client une interface courante unique à relire plutôt qu’un dossier de captures.',
        },
        {
          title: 'Publication guidée des projets statiques',
          body: 'Les sites et frontends statiques pris en charge suivent le parcours de publication guidée E-Code, avec contenu final, domaines, analytics et validation client traités comme des étapes de livraison nommées.',
        },
        {
          title: 'URL statique en ligne et relais runtime',
          body: 'Un build statique pris en charge reçoit une URL en ligne hébergée par E-Code pour la revue ou la livraison. Les apps avec logique serveur restent exportables et exigent le runtime, les comptes, les secrets et l’exploitation choisis par le client.',
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
          title: 'Responsive par défaut',
          body: 'Les mises en page s’adaptent du grand écran au téléphone sans build mobile séparé.',
        },
        {
          title: 'Fichiers projet exportables',
          body: 'Exportez le projet ou publiez les builds pris en charge ; les droits de propriété et de réutilisation du client suivent votre accord et les conditions E-Code applicables.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Qui construit avec',
      title: 'Les bases de projets que les freelances préparent pour revue et transfert',
      intro:
        'D’un portail client à une page de lancement, la boucle produit une source responsive et une interface active ; validation client, partage externe, branchements de services et transfert final restent des étapes de livraison vérifiables.',
      items: [
        {
          title: 'Apps web et portails clients',
          body: 'Interfaces de tableau de bord et de connexion livrées sous forme de fichiers modifiables, l’identité et les contrôles serveur restant du travail d’intégration explicite.',
        },
        {
          title: 'Pages vitrines et d’atterrissage',
          body: 'Sites responsives avec interface de formulaire validée et point d’envoi, prêts pour revue avant tout branchement à un service de soumission actif.',
        },
        {
          title: 'Outils internes pour clients',
          body: 'Petites interfaces de back-office qui modélisent un workflow client tout en rendant visibles les frontières de persistance, d’identité et d’autorisation.',
        },
        {
          title: 'Prototypes pour propositions',
          body: 'Un lien d’aperçu actif pour relire le parcours proposé ; ouverture et validation par le client se confirment hors de la démo scénarisée de la page.',
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
          body: 'Vous partagez un lien d’aperçu actif pour que le client relise la vraie application à chaque tour, et vous itérez selon ses retours dans le même workspace.',
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
          body: 'Le code généré est le vôtre à étendre et à brancher à des services externes. La démonstration intégrée de cette page utilise des données fictives et aucun backend connecté.',
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
