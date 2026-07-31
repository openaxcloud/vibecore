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
        'Describe the client brief once and E-Code turns it into a working app in editable source code. Start from your own repeatable patterns, share a preview link for review, iterate through the Agent, and hand off the source the client actually owns.',
      primaryCta: { label: 'Start a client project', ariaLabel: 'Start a client project with E-Code' },
      secondaryCta: { label: 'See how it builds', ariaLabel: 'See how E-Code builds a client project from a prompt' },
      microcopy:
        'Begin from the brief you already have. Source files, the running Preview, and a shareable preview link stay visible as the work moves toward handoff.',
    },
    languageSwitch: { label: 'Choose the Freelancers page language', english: 'English', french: 'Français' },
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
        'E-Code starts each project from the patterns you describe and produces a working app in real source files. You share a preview link for review, iterate against it, and hand off editable code the client can run and keep.',
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
          body: 'E-Code runs the app in Preview and exports the full project. Supported builds continue through guided publishing; the source stays the client’s to keep.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt → agent → Preview',
      title: 'Want to see a real E-Code build end to end?',
      body: 'The App Builder page shows a captured, real E-Code workspace — the prompt, the agent’s plan, the generated files, and the running Preview — for a booking application. The same build loop applies to a client project like this one.',
      cta: { label: 'See the real IDE proof', ariaLabel: 'See the real E-Code IDE proof on the App Builder page' },
    },
    deliverables: {
      eyebrow: 'What you receive',
      title: 'A client project you can review, ship, and hand off',
      intro:
        'The project stays inspectable from the first generated file through Preview and export. Shareable preview links carry review; the source-code handoff leaves the client independent.',
      items: [
        {
          title: 'Editable source files',
          body: 'Real components, routes, styles, and content the client can read, run, version, and keep.',
        },
        {
          title: 'Reusable project templates',
          body: 'Base structure and screens you can carry from one client engagement into the next.',
        },
        {
          title: 'Shareable preview links',
          body: 'A running preview URL to share for client review at each round of feedback.',
        },
        {
          title: 'Responsive layouts',
          body: 'Desktop, tablet, and mobile layouts verified in Preview before you deliver.',
        },
        {
          title: 'Clean handoff pack',
          body: 'Exported source, the preview link, and setup notes so the client can run it without you.',
        },
        {
          title: 'Agent-ready iteration',
          body: 'Ask the Agent for the next change and review the diff against the running app.',
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
          body: 'Export the full project so the client owns editable code they can run and change.',
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
          title: 'Own and export the code',
          body: 'Export any project or publish supported builds — the source stays the client’s.',
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
          body: 'Dashboards and sign-in flows delivered as editable code the client keeps.',
        },
        {
          title: 'Marketing and landing pages',
          body: 'Responsive sites with lead capture, shared for review before they go live.',
        },
        {
          title: 'Internal tools for clients',
          body: 'Small back-office apps that model a real workflow rather than a static mock.',
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
          body: 'They get editable source files — components, routes, styles, and content — that they can read, run, version, and export. There is no proprietary lock-in.',
        },
        {
          title: 'How do clients review the work?',
          body: 'You share a running preview link so the client reviews the real app at each round, and you iterate against their feedback in the same workspace.',
        },
        {
          title: 'What does the handoff include?',
          body: 'The exported source project, the preview link, and setup notes so the client can run and change it without depending on you.',
        },
        {
          title: 'Can I reuse a project across clients?',
          body: 'Yes. The generated structure is code you can lift into the next engagement. You are responsible for what you reuse and for each client’s own data.',
        },
        {
          title: 'Can I connect a database or external services?',
          body: 'The generated code is yours to extend and wire to external services. The inline demonstration on this page uses fictional data and no connected backend.',
        },
      ],
    },
    finalCta: {
      title: 'Start a client project and share it today',
      body: 'Turn a client brief into a working app in real source code, share a preview link for review, and hand off editable code the client owns.',
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
        'Décrivez le brief client une fois et E-Code en fait une application fonctionnelle dans un vrai code source modifiable. Partez de vos propres modèles réutilisables, partagez un lien d’aperçu pour la revue, itérez avec l’Agent et transmettez le code source que le client possède vraiment.',
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
      brandType: 'Développeur indépendant',
      nav: ['Projets', 'Aperçus', 'Transfert'],
      eyebrow: 'Livraison client',
      title: 'Livrez chaque projet client sur un parcours répétable jusqu’au transfert.',
      intro:
        'Une vue de livraison responsive qui suit les projets clients actifs, les liens d’aperçu partagés pour la revue et le dossier de transfert.',
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
        { label: 'Docs', value: 'Inclus' },
      ],
      asideCta: 'Envoyer le dossier de transfert',
      disclaimer: 'Démonstration responsive intégrée · données de freelance fictives · pas une trace de génération',
      caption: {
        title: 'Une vue de livraison qui se lit comme un vrai pipeline client',
        body: 'Cette démonstration intégrée présente les projets clients actifs, les liens d’aperçu partagés pour la revue et un dossier de transfert du code source dans une mise en page responsive.',
      },
      alt: 'Démonstration de livraison client pour freelance avec une liste de projets clients actifs et un panneau de transfert.',
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
        'E-Code part des modèles que vous décrivez et produit une application fonctionnelle dans de vrais fichiers source. Vous partagez un lien d’aperçu pour la revue, itérez face à lui et transmettez un code modifiable que le client peut exécuter et conserver.',
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
          body: 'E-Code exécute l’application dans l’aperçu et exporte le projet complet. Les builds pris en charge continuent via la publication guidée ; la source reste celle du client.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt → agent → aperçu',
      title: 'Envie de voir une vraie génération E-Code de bout en bout ?',
      body: 'La page App Builder montre un vrai workspace E-Code capturé — le prompt, le plan de l’agent, les fichiers générés et l’aperçu actif — pour une application de réservation. La même boucle de construction s’applique à un projet client comme celui-ci.',
      cta: {
        label: 'Voir la preuve IDE réelle',
        ariaLabel: 'Voir la preuve IDE réelle E-Code sur la page App Builder',
      },
    },
    deliverables: {
      eyebrow: 'Ce que vous recevez',
      title: 'Un projet client que vous pouvez relire, livrer et transmettre',
      intro:
        'Le projet reste inspectable du premier fichier généré jusqu’à l’aperçu et l’export. Les liens d’aperçu partageables portent la revue ; le transfert du code source rend le client indépendant.',
      items: [
        {
          title: 'Fichiers source modifiables',
          body: 'De vrais composants, routes, styles et contenus que le client lit, exécute, versionne et conserve.',
        },
        {
          title: 'Modèles de projet réutilisables',
          body: 'Structure et écrans de base que vous reprenez d’une mission client à la suivante.',
        },
        {
          title: 'Liens d’aperçu partageables',
          body: 'Une URL d’aperçu active à partager pour la revue client à chaque tour de retours.',
        },
        {
          title: 'Mises en page responsives',
          body: 'Desktop, tablette et mobile vérifiés dans l’aperçu avant la livraison.',
        },
        {
          title: 'Dossier de transfert propre',
          body: 'Source exportée, lien d’aperçu et notes d’installation pour que le client l’exécute sans vous.',
        },
        {
          title: 'Itération avec l’Agent',
          body: 'Demandez le changement suivant à l’Agent et relisez le diff face à l’application active.',
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
          body: 'Exportez le projet complet pour que le client possède un code modifiable qu’il peut exécuter et changer.',
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
          title: 'Possédez et exportez le code',
          body: 'Exportez tout projet ou publiez les builds pris en charge — la source reste celle du client.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Qui construit avec',
      title: 'Les projets que les freelances livrent avec E-Code',
      intro:
        'D’un portail client à une page de lancement, la même boucle produit une vraie application responsive prête à transmettre.',
      items: [
        {
          title: 'Apps web et portails clients',
          body: 'Tableaux de bord et parcours de connexion livrés en code modifiable que le client conserve.',
        },
        {
          title: 'Pages vitrines et d’atterrissage',
          body: 'Sites responsives avec capture de leads, partagés pour la revue avant la mise en ligne.',
        },
        {
          title: 'Outils internes pour clients',
          body: 'Petites applications de back-office qui modélisent un vrai workflow plutôt qu’une maquette statique.',
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
          body: 'Il obtient des fichiers source modifiables — composants, routes, styles et contenu — qu’il peut lire, exécuter, versionner et exporter. Aucun verrouillage propriétaire.',
        },
        {
          title: 'Comment les clients relisent-ils le travail ?',
          body: 'Vous partagez un lien d’aperçu actif pour que le client relise la vraie application à chaque tour, et vous itérez selon ses retours dans le même workspace.',
        },
        {
          title: 'Que contient le transfert ?',
          body: 'Le projet source exporté, le lien d’aperçu et les notes d’installation pour que le client l’exécute et le modifie sans dépendre de vous.',
        },
        {
          title: 'Puis-je réutiliser un projet entre clients ?',
          body: 'Oui. La structure générée est un code que vous reprenez dans la mission suivante. Vous restez responsable de ce que vous réutilisez et des données propres à chaque client.',
        },
        {
          title: 'Puis-je connecter une base ou des services externes ?',
          body: 'Le code généré est le vôtre à étendre et à brancher à des services externes. La démonstration intégrée de cette page utilise des données fictives et aucun backend connecté.',
        },
      ],
    },
    finalCta: {
      title: 'Démarrez un projet client et partagez-le aujourd’hui',
      body: 'Transformez un brief client en une application fonctionnelle dans du vrai code source, partagez un lien d’aperçu pour la revue et transmettez un code modifiable que le client possède.',
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
