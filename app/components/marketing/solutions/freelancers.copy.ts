import type { CapturedSolutionCopyByLanguage } from './solution-copy';

/**
 * SOL — Freelancers. Dedicated Studio Ferro delivery-workspace story in EN and
 * FR. All clients, projects, deliverables, feedback, commercial records, time,
 * and approvals are fictional and labeled; proof claims stop at the captured
 * Agent exchange, generated files, Webview, and local delivery-review interaction.
 */
export const FREELANCERS_COPY = {
  en: {
    seo: {
      title: 'Deliver Client Projects with a Clean Handoff | E-Code for Freelancers',
      description:
        'Describe Studio Ferro. E-Code generates an editable delivery workspace with Preview and export; client reviews, payments, approvals, and email stay unconnected.',
      ogImageAlt:
        'E-Code Freelancers workspace with Studio Ferro files and a fictional client-delivery view in Webview.',
    },
    hero: {
      eyebrow: 'E-Code for freelancers and independent studios',
      title: 'Deliver client projects with a handoff that stays clean',
      subtitle:
        'Describe the client brief once and E-Code turns it into a working app in editable source code. Start from your own repeatable patterns, share a preview link for review, iterate through the Agent, and hand off an exported project the client can inspect and continue.',
      primaryCta: { label: 'Start a client project', ariaLabel: 'Start a client project with E-Code' },
      secondaryCta: {
        label: 'See the client-delivery flow',
        ariaLabel: 'See how E-Code builds a client project from a prompt',
      },
      microcopy:
        'Begin from the brief you already have. Source files, the running Preview, and a shareable preview link stay visible as the work moves toward handoff.',
    },
    demo: {
      badge: 'Fictional demo data',
      brand: 'Studio Ferro',
      brandType: 'Local freelance delivery workspace',
      nav: ['Project', 'Deliverables', 'Business'],
      eyebrow: 'Fictional client workspace',
      title: 'Keep the deliverable, feedback, invoice, and approval in one view.',
      intro:
        'A responsive local Studio Ferro scenario with project status, deliverables, feedback threads, a proposal, invoice status, time log, and client-approval states.',
      primaryHeading: 'Fictional delivery state',
      primaryRows: [
        { label: 'Brand system — final pack', meta: 'fictional deliverable · v3', status: 'Review requested' },
        { label: 'Client feedback thread', meta: 'local sample comments' },
        { label: 'Project status', meta: 'fictional timeline state' },
      ],
      asideHeading: 'Freelance records',
      asideRows: [
        { label: 'Proposal', value: 'Local sample' },
        { label: 'Invoice', value: 'Status only' },
        { label: 'Time log', value: 'Fictional entries' },
      ],
      asideCta: 'Review delivery',
      disclaimer:
        'Scripted local interface · fictional client, project, deliverables, feedback, invoice, time, and approval states · no payment, signature, email, client authentication, or external acceptance · not a generation record',
      caption: {
        title: 'A client-delivery workspace without invented client activity',
        body: 'This local interface demonstrates a deliverable review, feedback, commercial statuses, time entries, and approval controls without claiming that a real client acted.',
      },
      alt: 'Scripted Studio Ferro freelancer workspace with fictional project status, deliverables, feedback, proposal, invoice status, time entries, and local approval controls.',
    },
    problem: {
      eyebrow: 'From one-off builds to a repeatable delivery path',
      title: 'Client work is fast to start and slow to hand off cleanly',
      intro:
        'A freelancer depends on efficient delivery and client trust. Rebuilding the same scaffolding for every client slows delivery, while a messy handoff — code the client cannot run, edit, or keep — erodes trust at the end of the project.',
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
      title: 'Describe the delivery workflow you repeat for every client',
      intro:
        'This freelancer brief becomes Studio Ferro in editable React and TypeScript files. E-Code runs the client-delivery workspace in Webview while every project and commercial record stays fictional and local.',
      label: 'Client-delivery brief',
      promptText:
        'Create Studio Ferro, a client delivery workspace for a freelance designer. Include project status, deliverables, feedback threads, proposal, invoice status, time log, and a client approval flow using realistic fictional local data. Do not claim real payments, signatures, emails, or client authentication. Build accessible responsive React and TypeScript with clay, ink, sage, and orange actions. No purple.',
      outputs: [
        {
          title: 'Project and deliverable overview',
          body: 'The Agent creates a responsive workspace with fictional project status and deliverable cards in editable project files.',
        },
        {
          title: 'Feedback and review states',
          body: 'Local threads keep sample feedback beside each deliverable. They do not send email, identify a real client, or record an external review.',
        },
        {
          title: 'Proposal, invoice status, and time log',
          body: 'Fictional commercial records and time entries provide project context without processing payment, issuing an invoice, collecting a signature, or synchronizing another service.',
        },
        {
          title: 'A local approval panel in Webview',
          body: 'Clicking “Review delivery” opens “Approval requested” with local approve and request-changes controls beside the Agent exchange and generated files. The capture proves the UI state, not client acceptance.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Studio Ferro prompt → Agent → delivery review in Webview',
      title: 'Inspect the freelance delivery workspace generated inside E-Code',
      body: 'These dedicated captures keep the Studio Ferro prompt, Agent activity, generated React and TypeScript project tree, and the local delivery workspace together. The second state opens “Approval requested” from “Review delivery.”',
      galleryLabel: 'Captured Studio Ferro generation and Approval requested interaction inside E-Code',
      disclaimer:
        'Captured E-Code generation · fictional local client, project, deliverables, feedback, proposal, invoice, time, and approval states · no payment, signature, email, client authentication, external review, or acceptance is demonstrated',
      openFullSizeLabel: 'Open the Studio Ferro capture at full size',
      preview: {
        title: 'Studio Ferro runs beside the files the Agent created',
        body: 'The first capture shows the real Agent exchange and generated project tree while Webview renders project status, deliverables, feedback, proposal, invoice status, time log, and the local-data disclosure.',
        alt: 'Real E-Code Freelancers workspace showing the Studio Ferro prompt, Agent activity, generated React and TypeScript files, and a fictional local client-delivery workspace in Webview.',
      },
      iteration: {
        title: 'A verified “Review delivery” click opens the local approval state',
        body: 'After the single generation, a verified click on “Review delivery” opens “Approval requested” with local approve and request-changes controls. It proves the interface transition, not a signature, payment, email, login, or real client decision.',
        alt: 'E-Code Freelancers capture after the verified Review delivery click, with Studio Ferro files and Approval requested in Webview.',
      },
      cta: {
        label: 'Inspect the captured Studio Ferro run',
        ariaLabel: 'Inspect the captured E-Code Studio Ferro generation and Approval requested Webview interaction',
      },
    },
    proofVisualAlts: {
      prompt:
        'E-Code Agent prompt requesting Studio Ferro with project status, deliverables, invoice, time, and approvals.',
      preview: 'E-Code workspace with generated Studio Ferro files and the fictional client-delivery view in Webview.',
      webviewOverview:
        'Studio Ferro in Webview with project status, deliverables, feedback, invoice, time, and approval controls.',
      iteration:
        'E-Code workspace after the verified Review delivery click, with Studio Ferro files and Approval requested.',
      webviewIteration:
        'Studio Ferro showing Approval requested with local approve and request-changes controls after the verified click.',
      files:
        'E-Code file tree for Studio Ferro with editable project, deliverable, invoice, time, and approval source.',
    },
    deliverables: {
      eyebrow: 'What the client handoff includes',
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
          title: 'Responsive client deliverables',
          body: 'Project status, feedback threads, invoice state, time logs, and approval controls remain usable in a desktop review or a client’s phone check.',
        },
        {
          title: 'Exportable project files',
          body: 'Export the project or publish supported builds; the client’s ownership and reuse rights follow your agreement and the applicable E-Code terms.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Client projects to deliver',
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
      eyebrow: 'Freelance-delivery questions',
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
      secondaryCta: {
        label: 'See the client-delivery flow',
        ariaLabel: 'See how E-Code builds a client project from a prompt',
      },
    },
    aria: {
      pageLabel: 'Freelancers solution page',
      heroLabel: 'Freelancers introduction',
      demoLabel: 'Freelancers product demonstration',
      problemLabel: 'The client delivery problem',
      buildLabel: 'How E-Code works for freelancers',
      outputListLabel: 'Client project build outputs',
      proofLinkLabel: 'Inspect the client-delivery IDE evidence',
      deliverablesLabel: 'What E-Code delivers for freelancers',
      featuresLabel: 'Freelancer delivery capabilities',
      useCasesLabel: 'Freelancer use cases',
      faqLabel: 'Freelancer questions',
      finalCtaLabel: 'Start your client project',
    },
  },
  fr: {
    seo: {
      title: 'Livrez vos projets clients avec une transmission propre | E-Code',
      description:
        'Décrivez Studio Ferro. E-Code génère un espace de livraison modifiable avec aperçu et export ; revues, paiements, validations et emails restent déconnectés.',
      ogImageAlt:
        'Workspace E-Code Freelancers avec fichiers Studio Ferro et espace fictif de livraison client dans la Webview.',
    },
    hero: {
      eyebrow: 'E-Code pour freelances et studios indépendants',
      title: 'Livrez vos projets clients avec une transmission qui reste propre',
      subtitle:
        'Décrivez le brief client une fois et E-Code en fait une application fonctionnelle sous forme de code source modifiable. Partez de vos propres modèles réutilisables, partagez un lien d’aperçu pour la revue, itérez avec l’Agent et transmettez un projet exporté que le client peut inspecter et poursuivre.',
      primaryCta: { label: 'Démarrer un projet client', ariaLabel: 'Démarrer un projet client avec E-Code' },
      secondaryCta: {
        label: 'Voir le parcours de livraison client',
        ariaLabel: 'Voir comment E-Code construit un projet client à partir d’un prompt',
      },
      microcopy:
        'Partez du brief que vous avez déjà. Les fichiers source, l’aperçu actif et un lien d’aperçu partageable restent visibles à mesure que le travail avance vers le transfert.',
    },
    demo: {
      badge: 'Données fictives',
      brand: 'Studio Ferro',
      brandType: 'Espace local de livraison freelance',
      nav: ['Projet', 'Livrables', 'Gestion'],
      eyebrow: 'Espace client fictif',
      title: 'Gardez livrable, retours, facture et validation dans la même vue.',
      intro:
        'Un scénario Studio Ferro local et responsive avec statut du projet, livrables, fils de commentaires, proposition, état de facture, suivi du temps et validation client.',
      primaryHeading: 'État de livraison fictif',
      primaryRows: [
        { label: 'Identité visuelle — lot final', meta: 'livrable fictif · v3', status: 'Revue demandée' },
        { label: 'Fil de commentaires client', meta: 'commentaires locaux d’exemple' },
        { label: 'Statut du projet', meta: 'état de planning fictif' },
      ],
      asideHeading: 'Fiches freelance',
      asideRows: [
        { label: 'Proposition', value: 'Exemple local' },
        { label: 'Facture', value: 'Statut seul' },
        { label: 'Temps', value: 'Entrées fictives' },
      ],
      asideCta: 'Examiner le livrable',
      disclaimer:
        'Interface locale scénarisée · client, projet, livrables, retours, facture, temps et validations fictifs · aucun paiement, signature, email, accès client ni accord externe · pas une trace de génération',
      caption: {
        title: 'Un espace de livraison sans activité client inventée',
        body: 'Cette interface locale présente la revue d’un livrable, les commentaires, les états commerciaux, le temps et les contrôles de validation sans prétendre qu’un vrai client a agi.',
      },
      alt: 'Espace freelance Studio Ferro scénarisé avec statut de projet, livrables, commentaires, proposition, état de facture, temps et contrôles locaux de validation fictifs.',
    },
    problem: {
      eyebrow: 'Des builds ponctuels à un parcours de livraison répétable',
      title: 'Le travail client démarre vite et se transmet lentement',
      intro:
        'Un freelance dépend d’une livraison efficace et de la confiance du client. Reconstruire le même échafaudage pour chaque mission ralentit la livraison, tandis qu’une transmission bâclée — un code que le client ne peut ni exécuter, ni modifier, ni conserver — entame la confiance en fin de projet.',
      obstacles: [
        {
          title: 'Chaque projet repart de zéro',
          body: 'Recâbler l’authentification, la mise en page et les mêmes écrans de base pour chaque nouveau client absorbe le temps à consacrer à ce qui rend le projet spécifique.',
        },
        {
          title: 'La revue se fait par captures d’écran',
          body: 'Envoyer des images et planifier des appels pour montrer l’avancement ralentit chaque cycle de retours, et le client ne voit la vraie application en fonctionnement que tard.',
        },
        {
          title: 'La transmission laisse des zones d’ombre',
          body: 'Une archive sans structure claire, ou un build que vous seul savez exécuter, transforme la livraison finale en tickets d’assistance et laisse le client dépendant de vous.',
        },
      ],
      bridge:
        'E-Code part des modèles que vous décrivez et produit une application fonctionnelle dans de vrais fichiers source. Vous partagez un lien d’aperçu pour la revue, itérez face à lui et transmettez une base de code exportée avec les informations d’installation nécessaires pour poursuivre.',
    },
    build: {
      eyebrow: 'Un prompt lance le projet client',
      title: 'Décrivez le parcours de livraison répété pour chaque client',
      intro:
        'Ce brief freelance devient Studio Ferro dans des fichiers React et TypeScript modifiables. E-Code exécute l’espace de livraison dans la Webview, avec chaque projet et fiche commerciale conservés en données locales fictives.',
      label: 'Brief de livraison client',
      promptText:
        'Créez Studio Ferro, un espace de livraison client pour un designer freelance. Ajoutez le statut du projet, les livrables, les fils de commentaires, la proposition, l’état de facture, le suivi du temps et le parcours de validation client avec des données locales fictives réalistes. Ne prétendez pas avoir de paiements, de signatures, d’emails ou d’authentification client réels. React et TypeScript accessibles et responsive, argile, encre, sauge et actions orange. Aucun violet.',
      outputs: [
        {
          title: 'Vue projet et livrables',
          body: 'L’Agent crée un espace responsive avec statut du projet et cartes de livrables fictifs dans des fichiers modifiables.',
        },
        {
          title: 'Commentaires et états de revue',
          body: 'Des fils locaux rattachent les commentaires d’exemple à chaque livrable. Ils n’envoient aucun email, n’identifient aucun vrai client et ne consignent aucune revue externe.',
        },
        {
          title: 'Proposition, état de facture et temps',
          body: 'Des fiches commerciales et entrées de temps fictives donnent le contexte sans traiter de paiement, émettre de facture, recueillir de signature ni synchroniser un autre service.',
        },
        {
          title: 'Panneau de validation local dans la Webview',
          body: 'Le clic sur « Examiner le livrable » ouvre « Validation demandée » avec des contrôles locaux pour approuver ou demander des modifications, à côté de l’Agent et des fichiers générés. La capture prouve l’état de l’interface, pas l’accord du client.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt Studio Ferro → Agent → revue dans la Webview',
      title: 'Inspectez l’espace de livraison freelance généré dans E-Code',
      body: 'Ces captures dédiées réunissent le prompt Studio Ferro, l’activité de l’Agent, l’arborescence React et TypeScript générée et l’espace de livraison local. Le second état ouvre « Validation demandée » depuis « Examiner le livrable ».',
      galleryLabel: 'Génération Studio Ferro capturée et interaction Validation demandée dans E-Code',
      disclaimer:
        'Génération E-Code capturée · client, projet, livrables, commentaires, proposition, facture, temps et validations locaux fictifs · aucun paiement, signature, email, accès client, revue externe ni accord démontré',
      openFullSizeLabel: 'Ouvrir la capture Studio Ferro en grand',
      preview: {
        title: 'Studio Ferro tourne à côté des fichiers créés par l’Agent',
        body: 'La première capture montre le vrai échange avec l’Agent et l’arborescence générée pendant que la Webview affiche statut, livrables, commentaires, proposition, état de facture, temps et avertissement sur les données locales.',
        alt: 'Vrai workspace Freelances E-Code montrant le prompt Studio Ferro, l’activité de l’Agent, les fichiers React et TypeScript générés et un espace local fictif de livraison client dans la Webview.',
      },
      iteration: {
        title: 'Un clic vérifié sur « Examiner le livrable » ouvre la validation locale',
        body: 'Après la génération unique, un clic vérifié sur « Examiner le livrable » ouvre « Validation demandée » avec les contrôles « Approuver » et « Demander des modifications ». La capture prouve la transition de l’interface, pas une signature, un paiement, un email, une connexion ni une décision client réelle.',
        alt: 'Capture E-Code Freelancers après le clic vérifié sur Examiner le livrable, avec fichiers Studio Ferro et Validation demandée dans la Webview.',
      },
      cta: {
        label: 'Inspecter l’exécution Studio Ferro capturée',
        ariaLabel:
          'Inspecter la génération Studio Ferro capturée dans E-Code et l’état Validation demandée dans la Webview',
      },
    },
    proofVisualAlts: {
      prompt: 'Prompt de l’Agent E-Code demandant Studio Ferro avec projet, livrables, facture, temps et validations.',
      preview:
        'Workspace E-Code avec fichiers Studio Ferro générés et espace fictif de livraison client dans la Webview.',
      webviewOverview:
        'Studio Ferro dans la Webview avec projet, livrables, commentaires, facture, temps et validations.',
      iteration: 'Workspace E-Code après le clic vérifié sur Examiner le livrable, avec l’état Validation demandée.',
      webviewIteration: 'Studio Ferro affichant Validation demandée et les contrôles locaux après le clic vérifié.',
      files:
        'Arborescence E-Code de Studio Ferro avec sources modifiables du projet, des livrables, du temps et des validations.',
    },
    deliverables: {
      eyebrow: 'Ce que comprend le transfert client',
      title: 'Un projet client que vous pouvez relire, livrer et transmettre',
      intro:
        'Le projet reste inspectable du premier fichier généré jusqu’à l’aperçu et l’export. Les liens d’aperçu partageables servent de support à la revue ; la transmission de la source exportée réduit la dépendance du client à votre workspace.',
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
          body: 'Le projet compatible tourne dans l’aperçu sur ordinateur, tablette et mobile, pour donner au client une interface courante unique à relire plutôt qu’un dossier de captures.',
        },
        {
          title: 'Publication guidée des projets statiques',
          body: 'Les sites et frontends statiques pris en charge suivent le parcours de publication guidée E-Code, avec contenu final, domaines, outils d’analyse et validation client traités comme des étapes de livraison nommées.',
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
          body: 'Partagez une URL d’aperçu active pour que les clients relisent la vraie application, pas une maquette.',
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
          title: 'Livrables client responsives',
          body: 'Statut du projet, fils de commentaires, état de facture, temps et contrôles de validation restent utilisables en revue sur ordinateur ou sur le téléphone du client.',
        },
        {
          title: 'Fichiers projet exportables',
          body: 'Exportez le projet ou publiez les builds pris en charge ; les droits de propriété et de réutilisation du client suivent votre accord et les conditions E-Code applicables.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Projets clients à livrer',
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
          body: 'Petites interfaces de back-office qui modélisent un processus client tout en rendant visibles les frontières de persistance, d’identité et d’autorisation.',
        },
        {
          title: 'Prototypes pour propositions',
          body: 'Un lien d’aperçu actif pour relire le parcours proposé ; ouverture et validation par le client se confirment hors de la démo scénarisée de la page.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions sur la livraison freelance',
      title: 'E-Code pour freelances, en toute honnêteté',
      intro: 'Ce que produit le parcours Freelances, et où sont ses limites.',
      items: [
        {
          title: 'Le client obtient-il un code source modifiable ou un projet verrouillé ?',
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
      body: 'Transformez un brief client en une application fonctionnelle sous forme de code source modifiable, partagez un lien d’aperçu pour la revue et transmettez un projet modifiable et exporté.',
      primaryCta: { label: 'Démarrer un projet client', ariaLabel: 'Démarrer un projet client avec E-Code' },
      secondaryCta: {
        label: 'Voir le parcours de livraison client',
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
      proofLinkLabel: 'Inspecter la preuve IDE de livraison client',
      deliverablesLabel: 'Ce que livre E-Code pour les freelances',
      featuresLabel: 'Capacités de livraison pour freelances',
      useCasesLabel: 'Cas d’usage freelances',
      faqLabel: 'Questions freelances',
      finalCtaLabel: 'Démarrer votre projet client',
    },
  },
} as const satisfies CapturedSolutionCopyByLanguage;
