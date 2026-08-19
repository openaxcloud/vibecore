import type { SupportedLanguage } from '~/lib/i18n/language';

type ActionCopy = Readonly<{
  label: string;
  ariaLabel: string;
}>;

type ContentItem = Readonly<{
  title: string;
  body: string;
}>;

type VisualItem = ContentItem &
  Readonly<{
    alt: string;
  }>;

type ThreeItems = readonly [ContentItem, ContentItem, ContentItem];
type FourItems = readonly [ContentItem, ContentItem, ContentItem, ContentItem];
type SixItems = readonly [ContentItem, ContentItem, ContentItem, ContentItem, ContentItem, ContentItem];
type ThreeVisualItems = readonly [VisualItem, VisualItem, VisualItem];

export type AppBuilderCopy = Readonly<{
  seo: Readonly<{
    title: string;
    description: string;
  }>;
  hero: Readonly<{
    eyebrow: string;
    title: string;
    subtitle: string;
    primaryCta: ActionCopy;
    secondaryCta: ActionCopy;
    microcopy: string;
  }>;
  languageSwitch: Readonly<{
    label: string;
    english: string;
    french: string;
  }>;
  problem: Readonly<{
    eyebrow: string;
    title: string;
    intro: string;
    obstacles: ThreeItems;
    bridge: string;
  }>;
  prompt: Readonly<{
    eyebrow: string;
    title: string;
    intro: string;
    label: string;
    text: string;
    outputs: FourItems;
    demoLabels: Readonly<{
      previewLabel: string;
      calendar: Readonly<{
        title: string;
        date: string;
        slots: readonly [
          Readonly<{ time: string; label: string; status: string }>,
          Readonly<{ time: string; label: string; status: string }>,
          Readonly<{ time: string; label: string; status: string }>,
        ];
      }>;
      database: Readonly<{
        title: string;
        tables: readonly [
          Readonly<{ name: string; fields: string }>,
          Readonly<{ name: string; fields: string }>,
          Readonly<{ name: string; fields: string }>,
        ];
      }>;
      statuses: Readonly<{
        title: string;
        items: readonly [string, string, string, string];
      }>;
    }>;
  }>;
  proof: Readonly<{
    eyebrow: string;
    title: string;
    intro: string;
    steps: ThreeItems;
    disclaimer: string;
    openFullSizeLabel: string;
    preview: VisualItem;
    iteration: VisualItem;
  }>;
  visuals: Readonly<{
    galleryLabel: string;
    disclaimer: string;
    items: ThreeVisualItems;
    system: VisualItem;
  }>;
  deliverables: Readonly<{
    eyebrow: string;
    title: string;
    intro: string;
    items: SixItems;
  }>;
  features: Readonly<{
    eyebrow: string;
    title: string;
    intro: string;
    items: SixItems;
  }>;
  useCases: Readonly<{
    eyebrow: string;
    title: string;
    intro: string;
    items: FourItems;
  }>;
  faq: Readonly<{
    eyebrow: string;
    title: string;
    intro: string;
    items: readonly [
      Readonly<{ question: string; answer: string }>,
      Readonly<{ question: string; answer: string }>,
      Readonly<{ question: string; answer: string }>,
      Readonly<{ question: string; answer: string }>,
      Readonly<{ question: string; answer: string }>,
      Readonly<{ question: string; answer: string }>,
    ];
  }>;
  finalCta: Readonly<{
    title: string;
    body: string;
    primaryCta: ActionCopy;
    secondaryCta: ActionCopy;
  }>;
  aria: Readonly<{
    pageLabel: string;
    heroLabel: string;
    problemLabel: string;
    promptLabel: string;
    promptCodeLabel: string;
    outputListLabel: string;
    demoLabel: string;
    ideProofLabel: string;
    deliverablesLabel: string;
    featuresLabel: string;
    useCasesLabel: string;
    faqLabel: string;
    finalCtaLabel: string;
  }>;
}>;

export const APP_BUILDER_COPY = {
  en: {
    seo: {
      title: 'Business App Builder with Real Code | E-Code',
      description:
        'Describe your workflow, users, data, and rules. E-Code turns it into editable source files with connected screens, a running Preview, project export, and publishing for supported static builds.',
    },
    hero: {
      eyebrow: 'App Builder for real business workflows',
      title: 'Turn the way your business works into a real application',
      subtitle:
        'Describe the people who use it, the information they handle, and the rules that move work forward. E-Code turns that context into connected screens and routes inside editable source code. Inspect every file, run the app in Preview, continue through the Agent, and export the project for the hosting path it needs.',
      primaryCta: {
        label: 'Describe your app',
        ariaLabel: 'Describe your business application with E-Code',
      },
      secondaryCta: {
        label: 'See the functional salon demo',
        ariaLabel: 'Review the functional salon booking demonstration and its implementation scope',
      },
      microcopy:
        'Start with the process you already know. Project files, the running Preview, build output, and export controls stay visible as the application evolves.',
    },
    languageSwitch: {
      label: 'Choose the App Builder page language',
      english: 'English',
      french: 'Français',
    },
    problem: {
      eyebrow: 'From scattered process to working app',
      title: 'Your workflow outgrows spreadsheets long before custom software arrives',
      intro:
        'A process begins in a spreadsheet, a form, or an inbox because those tools are close at hand. As more people, records, approvals, and exceptions appear, the team repeats data entry, loses context between systems, and waits for software that matches the work.',
      obstacles: [
        {
          title: 'Work lives across disconnected tools',
          body: 'Forms collect one part of the request, spreadsheets hold another, and decisions remain buried in messages. People re-enter the same information because no shared application owns the full state.',
        },
        {
          title: 'Off-the-shelf software reshapes the process',
          body: 'Fixed fields, roles, and flows force the business into someone else’s operating model. No-code tools reach their limit when the workflow needs precise rules, connected data, or an exception the template never anticipated.',
        },
        {
          title: 'Traditional delivery separates intent from implementation',
          body: 'Requirements cross multiple handoffs before they reach working software, while developer time raises the cost of every clarification. The person who understands the process waits on a backlog and remains dependent on someone else to change the code.',
        },
      ],
      bridge:
        'E-Code starts from the workflow in everyday language. You describe what people do, inspect a running application and its real code, then request the next change without translating every decision into a technical specification.',
    },
    prompt: {
      eyebrow: 'One prompt starts the build',
      title: 'Describe the service, not the software architecture',
      intro:
        'The request below reads like a message from a salon owner. The four items map its implementation scope; the browser captures show a scripted functional demonstration authored for this page with fictional salon data, not a record of an E-Code generation.',
      label: 'Example prompt',
      text: 'Create a booking app for my hair salon, with a calendar, customer accounts, and email reminders.',
      outputs: [
        {
          title: 'Booking screens',
          body: 'The requested journey covers service selection, an available time, account creation, appointment confirmation, and upcoming visits across responsive screens.',
        },
        {
          title: 'Booking database',
          body: 'The requested data model covers clients, services, staff members, availability, appointments, and reminder state, with explicit relationships between each record.',
        },
        {
          title: 'Working booking rules',
          body: 'The implementation scope includes availability checks, account access, appointment creation, rescheduling, cancellation, confirmation, and reminder triggers.',
        },
        {
          title: 'Preview and deployment',
          body: 'E-Code runs the generated project in Preview for inspection across screen sizes. Supported static builds continue through guided publishing to a live URL; other projects remain exportable for their own hosting workflow.',
        },
      ],
      demoLabels: {
        previewLabel: 'salon-booking / live preview',
        calendar: {
          title: 'Appointment calendar',
          date: 'Tuesday, 14 May',
          slots: [
            { time: '09:00', label: 'Cut and finish', status: 'Confirmed' },
            { time: '11:30', label: 'Colour consultation', status: 'Awaiting confirmation' },
            { time: '14:00', label: 'Open booking slot', status: 'Available' },
          ],
        },
        database: {
          title: 'Booking data model',
          tables: [
            { name: 'Clients', fields: 'Identifier · Full name · Email address' },
            { name: 'Services', fields: 'Identifier · Service name · Duration · Price' },
            { name: 'Appointments', fields: 'Client · Service · Staff member · Start time · Status' },
          ],
        },
        statuses: {
          title: 'Demonstration coverage',
          items: [
            'Implementation scope mapped',
            'Booking journey demonstrated',
            'Responsive browser demo captured',
            'Deployment workflow documented',
          ],
        },
      },
    },
    proof: {
      eyebrow: 'Prompt → agent → Preview',
      title: 'Watch the app take shape inside E-Code',
      intro:
        'This is a real E-Code workspace captured after the agent ran the salon booking prompt. The E-Code UI, generated project files, and running Preview are real. The salon identity and records are fictional, and this captured project uses a local in-memory adapter; it has no external database, authentication provider, or email delivery service connected.',
      steps: [
        {
          title: 'Describe the result',
          body: 'The salon owner writes the workflow in everyday language: booking calendar, customer accounts, and email reminders. There is no component list or software architecture to prepare first.',
        },
        {
          title: 'Follow the agent’s work',
          body: 'The Agent panel keeps the original request and its implementation plan visible while the Library shows the generated routes, pages, components, styles, and project configuration.',
        },
        {
          title: 'Test the app in Preview',
          body: 'The Webview tab runs the same project beside the conversation. You inspect the dashboard, calendar, booking journey, and account screens without leaving the E-Code workspace.',
        },
      ],
      disclaimer:
        'Real E-Code UI, generated files, and running Preview · fictional salon data · local in-memory adapter · no external database, authentication provider, or email delivery service connected',
      openFullSizeLabel: 'Open full-size IDE capture',
      preview: {
        title: 'The prompt, agent, files, and running app share one workspace',
        body: 'This capture shows the real E-Code UI, generated project tree, and booking dashboard running in Preview. It does not demonstrate server logic or a connected external database, authentication provider, or email delivery service.',
        alt: 'E-Code IDE showing the salon booking prompt in the Agent panel, generated project files, and the booking application running in the Webview Preview tab.',
      },
      iteration: {
        title: 'When Preview exposes an error, ask the agent to repair it',
        body: 'This correction follow-up asks the agent to inspect a router runtime error, preserve every route, and verify the booking dashboard again. The exported project later passed typecheck and a production build independently; the red Problems badge records local Preview startup diagnostics, not a claim that every generation is error-free on the first pass.',
        alt: 'E-Code IDE showing a follow-up prompt to repair a router runtime error beside the updated salon project and its running booking dashboard in the Webview Preview tab.',
      },
    },
    visuals: {
      galleryLabel: 'Scripted functional salon booking demonstration authored for this App Builder page',
      disclaimer: 'Scripted functional page demo · fictional salon data · not a generation record',
      items: [
        {
          title: 'Choose and book from a phone',
          body: 'The client selects a service, sees available times, and confirms the visit without calling the salon.',
          alt: 'Mobile salon booking journey showing service selection, available times, and appointment confirmation.',
        },
        {
          title: 'Run the day from one calendar',
          body: 'The team sees appointments, open capacity, and booking status in a schedule shaped around the working day.',
          alt: 'Salon team calendar showing appointments for several stylists alongside open booking slots.',
        },
        {
          title: 'Review reminder context beside the client',
          body: 'The demonstration places contact details, appointment history, and the next scheduled reminder state in one customer view.',
          alt: 'Functional demonstration showing a customer profile, appointment history, and a scheduled email reminder state.',
        },
      ],
      system: {
        title: 'Explore the functional booking demonstration',
        body: 'This page-specific browser demonstration presents services, available times, customer details, and confirmation in one interactive booking flow.',
        alt: 'Functional English salon booking demonstration showing services, available appointment times, customer details, and the booking summary.',
      },
    },
    deliverables: {
      eyebrow: 'What you receive',
      title: 'A working application you own and keep evolving',
      intro:
        'The project remains inspectable from the first generated file through Preview and export. For supported static builds, guided publishing adds a live release without hiding the code or build output.',
      items: [
        {
          title: 'Real source code',
          body: 'Whatever the agent generates—frontend components, routes, validation, configuration, and any server modules—lives in readable project files that you review, edit, version, and export.',
        },
        {
          title: 'A visible data layer',
          body: 'Inspect the types, state, adapters, schemas, and queries the generated project actually contains. Supported database connections live in protected project secrets and expose schema inspection and read-query tools.',
        },
        {
          title: 'Running preview',
          body: 'The application runs beside the project so you click through its flows and review the experience across phone, tablet, and desktop layouts while the code changes.',
        },
        {
          title: 'Guided static publishing',
          body: 'For supported static builds, move the reviewed output through the E-Code deployment wizard, where configuration, publication, status, and logs remain visible.',
        },
        {
          title: 'A live URL for static builds',
          body: 'A supported static release receives a shareable E-Code address. Server-backed projects remain exportable so you can deploy them with the runtime and hosting workflow they require.',
        },
        {
          title: 'Conversation-led iteration',
          body: 'Ask for a shorter form, a new field, a changed approval rule, or a different route. The agent works from the existing files and keeps every change inside the same project.',
        },
      ],
    },
    features: {
      eyebrow: 'An inspectable application project',
      title: 'Every working part stays visible',
      intro:
        'E-Code keeps screens, code, data connections, Preview, and build output in one project so you can inspect what exists before release.',
      items: [
        {
          title: 'Connected screens and routes',
          body: 'Turn each step into the right view: lists, forms, records, account areas, administration screens, and the routes that move every user through the application.',
        },
        {
          title: 'Data models you inspect',
          body: 'Review the types, state, adapters, schemas, and queries the generated project actually contains. Add supported database connections through protected project secrets, then inspect their schema before wiring production flows.',
        },
        {
          title: 'Protected project secrets',
          body: 'Store database credentials and runtime values outside prompts and source files. E-Code encrypts saved project secrets and injects them into the workspace when the application runs.',
        },
        {
          title: 'Import, version, and export',
          body: 'Open an E-Code project or import ZIP or GitHub files, keep changes in the project history, and export the current source as an archive when you need another workflow.',
        },
        {
          title: 'Multi-screen preview',
          body: 'Run the application while it is built, inspect complete journeys, and verify layouts at phone, tablet, laptop, and wide desktop sizes before release.',
        },
        {
          title: 'Iteration on the existing codebase',
          body: 'Continue the conversation to change a screen, field, rule, or route. The agent reads the current project and edits the implementation already in place.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Applications shaped around the work',
      title: 'Build the exact tool your users need to complete a job',
      intro:
        'Each application starts with different records, roles, and actions. The prompt defines that operating model instead of forcing every business into the same template.',
      items: [
        {
          title: 'Salon booking application',
          body: 'Bring service selection, staff availability, customer records, and appointment changes into one booking journey. Treat account authentication and real email delivery as explicit integrations to implement and test before launch.',
        },
        {
          title: 'Customer portal for a service business',
          body: 'Model request intake, document uploads, progress, deliverables, and team contact in one portal. Define and test authentication and document-access rules in the application code before production.',
        },
        {
          title: 'Inventory and order tracker',
          body: 'Track products, stock movements, suppliers, purchase orders, fulfilment state, and low-stock actions from operational screens built around the real process.',
        },
        {
          title: 'Member area',
          body: 'Organise registration, plans, resources, event access, account settings, and administration for a community, with authentication and authorization kept explicit in the code review.',
        },
      ],
    },
    faq: {
      eyebrow: 'Practical answers',
      title: 'What happens after you describe the app',
      intro: 'You stay in control of the code, data connections, and release decisions throughout the build.',
      items: [
        {
          question: 'Do I need to know how to code?',
          answer:
            'No coding knowledge is required to describe the workflow or request changes. E-Code writes and updates the project files. You still see the code, preview, and build output, and a developer may review or extend the same project whenever you want deeper technical control.',
        },
        {
          question: 'Can I export the source code?',
          answer:
            'Yes. The application lives as real project files rather than a locked visual configuration. You review, edit, version, and export those files for your own repository or handoff process.',
        },
        {
          question: 'Where is the application hosted?',
          answer:
            'The project runs first in E-Code Preview. The current deployment wizard publishes supported static builds and returns a live E-Code URL. For a server-backed application, export the source and use the runtime and hosting workflow it requires.',
        },
        {
          question: 'Can I connect my existing database?',
          answer:
            'Yes. Add a supported connection URL through protected project secrets, never inside the prompt. E-Code detects PostgreSQL, MySQL, MongoDB, and Redis connections and exposes schema inspection and read-query tools. Review and test the application mapping and every write operation before production.',
        },
        {
          question: 'Can I continue from an existing application?',
          answer:
            'Yes. Open an existing E-Code project or import the project files, then explain the screen, workflow, or integration you want to add or change. The agent works from the current structure instead of replacing the application with an unrelated starter.',
        },
        {
          question: 'How do I protect users and application data?',
          answer:
            'Connection credentials live in encrypted project secrets. Authentication and role enforcement for the generated application remain part of its source code: state the requirements, then inspect and test every generated route and data check before production. A prompt is not a security review.',
        },
      ],
    },
    finalCta: {
      title: 'Describe the application your business is missing',
      body: 'Explain the workflow, users, data, and rules in your own words. E-Code turns that context into connected screens, working code, and a project you inspect, run, export, and continue improving.',
      primaryCta: {
        label: 'Describe your app',
        ariaLabel: 'Start describing your business application',
      },
      secondaryCta: {
        label: 'Review the salon example',
        ariaLabel: 'Return to the salon booking example prompt',
      },
    },
    aria: {
      pageLabel: 'E-Code App Builder for business applications',
      heroLabel: 'Business application builder introduction',
      problemLabel: 'Problems caused by fragmented business workflows',
      promptLabel: 'Prompt to salon booking application demonstration',
      promptCodeLabel: 'Example salon booking application prompt',
      outputListLabel: 'Implementation scope mapped from the example prompt',
      demoLabel: 'Salon booking application product demonstration',
      ideProofLabel: 'Real E-Code IDE generation and correction captures',
      deliverablesLabel: 'Deliverables available in an E-Code business application project',
      featuresLabel: 'Business application builder features',
      useCasesLabel: 'Business application use cases',
      faqLabel: 'Frequently asked questions about building a business application',
      finalCtaLabel: 'Start building a business application',
    },
  },
  fr: {
    seo: {
      title: 'Générateur d’applications métier à code source réel | E-Code',
      description:
        'Décrivez votre processus, vos utilisateurs, vos données et vos règles. E-Code les transforme en fichiers source modifiables, écrans reliés, aperçu actif, export et publication des compilations statiques prises en charge.',
    },
    hero: {
      eyebrow: 'Générateur d’applications pour les processus métier réels',
      title: 'Transformez le fonctionnement de votre activité en une vraie application',
      subtitle:
        'Décrivez les personnes qui l’utilisent, les informations qu’elles manipulent et les règles qui font avancer le travail. E-Code transforme ce contexte en écrans et routes dans un vrai code source modifiable. Inspectez chaque fichier, exécutez l’application dans l’aperçu, poursuivez avec l’Agent et exportez le projet vers l’hébergement adapté.',
      primaryCta: {
        label: 'Décrivez votre application',
        ariaLabel: 'Décrire votre application métier avec E-Code',
      },
      secondaryCta: {
        label: 'Voir la démo fonctionnelle du salon',
        ariaLabel: 'Examiner la démonstration fonctionnelle de réservation et son périmètre d’implémentation',
      },
      microcopy:
        'Commencez par le processus que vous connaissez déjà. Les fichiers du projet, l’aperçu actif, la sortie de compilation et les contrôles d’export restent visibles à mesure que l’application évolue.',
    },
    languageSwitch: {
      label: 'Choisir la langue de la page Générateur d’applications',
      english: 'English',
      french: 'Français',
    },
    problem: {
      eyebrow: 'Du processus dispersé à l’application fonctionnelle',
      title: 'Votre processus dépasse les tableurs bien avant l’arrivée d’un logiciel sur mesure',
      intro:
        'Un processus commence dans un tableur, un formulaire ou une boîte mail parce que ces outils sont immédiatement disponibles. Quand les utilisateurs, les dossiers, les validations et les exceptions se multiplient, l’équipe ressaisit les mêmes données, perd le contexte entre les systèmes et attend un logiciel adapté au travail réel.',
      obstacles: [
        {
          title: 'Le travail se disperse entre des outils déconnectés',
          body: 'Un formulaire collecte une partie de la demande, un tableur en conserve une autre et les décisions restent enfouies dans les messages. Chacun ressaisit les mêmes informations, faute d’application commune qui porte tout l’état du dossier.',
        },
        {
          title: 'Les logiciels prêts à l’emploi déforment le processus',
          body: 'Des champs, rôles et parcours figés imposent le modèle d’une autre entreprise. Le no-code atteint sa limite dès que le processus exige des règles précises, des données reliées ou une exception absente du modèle.',
        },
        {
          title: 'Le développement classique sépare l’intention de l’exécution',
          body: 'Les besoins passent par plusieurs relais avant de devenir un logiciel fonctionnel, tandis que chaque précision consomme du budget développeur. La personne qui connaît le processus attend dans une file d’attente et dépend d’un tiers pour modifier le code.',
        },
      ],
      bridge:
        'E-Code part du processus exprimé avec des mots simples. Vous décrivez ce que font les utilisateurs, inspectez une application active et son vrai code, puis demandez l’évolution suivante sans traduire chaque décision en spécification technique.',
    },
    prompt: {
      eyebrow: 'Un prompt lance la construction',
      title: 'Décrivez le service, pas l’architecture logicielle',
      intro:
        'La demande ci-dessous ressemble au message d’un propriétaire de salon. Les quatre éléments en détaillent le périmètre d’implémentation ; les captures montrent une démonstration fonctionnelle scénarisée pour cette page avec des données fictives, pas la trace d’une génération E-Code.',
      label: 'Exemple de prompt',
      text: 'Crée une application de réservation pour mon salon de coiffure, avec agenda, comptes clients et rappels par email.',
      outputs: [
        {
          title: 'Écrans de réservation',
          body: 'Le parcours demandé couvre le choix d’une prestation, d’un créneau libre, la création du compte, la confirmation du rendez-vous et les prochaines visites sur des écrans adaptatifs.',
        },
        {
          title: 'Base de réservation',
          body: 'Le modèle demandé couvre les clients, prestations, membres de l’équipe, disponibilités, rendez-vous et états des rappels, avec des relations explicites entre chaque enregistrement.',
        },
        {
          title: 'Règles de réservation actives',
          body: 'Le périmètre d’implémentation comprend le contrôle des disponibilités, l’accès aux comptes, la création, le déplacement, l’annulation, la confirmation et le déclenchement des rappels.',
        },
        {
          title: 'Aperçu et déploiement',
          body: 'E-Code exécute le projet généré dans l’aperçu pour vérifier chaque format d’écran. Les compilations statiques prises en charge passent ensuite par une publication guidée vers une URL live ; les autres projets restent exportables vers leur propre hébergement.',
        },
      ],
      demoLabels: {
        previewLabel: 'salon-reservation / aperçu live',
        calendar: {
          title: 'Agenda des rendez-vous',
          date: 'Mardi 14 mai',
          slots: [
            { time: '09:00', label: 'Coupe et coiffage', status: 'Confirmé' },
            { time: '11:30', label: 'Consultation couleur', status: 'En attente de confirmation' },
            { time: '14:00', label: 'Créneau ouvert à la réservation', status: 'Disponible' },
          ],
        },
        database: {
          title: 'Modèle de données des réservations',
          tables: [
            { name: 'Clients', fields: 'Identifiant · Nom complet · Adresse email' },
            { name: 'Prestations', fields: 'Identifiant · Nom · Durée · Tarif' },
            { name: 'Rendez-vous', fields: 'Client · Prestation · Membre de l’équipe · Heure de début · État' },
          ],
        },
        statuses: {
          title: 'Périmètre de la démonstration',
          items: [
            'Périmètre d’implémentation défini',
            'Parcours de réservation démontré',
            'Démo navigateur adaptatif capturée',
            'Flux de déploiement documenté',
          ],
        },
      },
    },
    proof: {
      eyebrow: 'Prompt → agent → aperçu',
      title: 'Regardez l’application prendre forme dans E-Code',
      intro:
        'Voici un véritable espace de travail E-Code, capturé après l’exécution du prompt de réservation par l’agent. L’interface E-Code, les fichiers générés et l’aperçu actif sont réels. L’identité du salon et ses données sont fictives, et ce projet capturé utilise un adaptateur local en mémoire ; aucune base externe, aucun fournisseur d’authentification ni aucun service d’envoi d’emails n’y est connecté.',
      steps: [
        {
          title: 'Décrivez le résultat',
          body: 'Le propriétaire du salon décrit le processus avec ses mots : agenda de réservation, comptes clients et rappels par email. Il ne prépare ni liste de composants ni architecture logicielle.',
        },
        {
          title: 'Suivez le travail de l’agent',
          body: 'Le panneau Agent conserve la demande initiale et son plan d’implémentation, tandis que la bibliothèque affiche les routes, pages, composants, styles et fichiers de configuration générés.',
        },
        {
          title: 'Testez l’application dans l’aperçu',
          body: 'L’onglet Webview exécute le même projet à côté de la conversation. Vous parcourez le tableau de bord, l’agenda, la réservation et les comptes sans quitter l’espace de travail E-Code.',
        },
      ],
      disclaimer:
        'Interface E-Code, fichiers générés et aperçu actif réels · données fictives · adaptateur local en mémoire · aucune base externe, authentification ni service d’envoi d’emails connecté',
      openFullSizeLabel: 'Ouvrir la capture IDE en taille réelle',
      preview: {
        title: 'Le prompt, l’agent, les fichiers et l’application restent dans le même espace',
        body: 'Cette capture montre l’interface E-Code réelle, l’arborescence générée et le tableau de bord actif dans l’aperçu. Elle ne démontre ni logique serveur, ni base externe, ni fournisseur d’authentification, ni service d’envoi d’emails connecté.',
        alt: 'IDE E-Code affichant le prompt de réservation dans le panneau Agent, les fichiers générés du projet et l’application de réservation active dans l’onglet Webview d’aperçu.',
      },
      iteration: {
        title: 'Si l’aperçu révèle une erreur, demandez sa correction à l’agent',
        body: 'Cette correction demande à l’agent d’examiner une erreur de routeur, de préserver toutes les pages et de revérifier le tableau de bord. La vérification indépendante de l’export confirme ensuite le passage de la vérification des types et de la compilation de production ; la capture documente l’itération, pas une réussite parfaite dès le premier essai.',
        alt: 'IDE E-Code affichant un prompt de suivi en français pour corriger une erreur de routeur, les fichiers mis à jour du projet et le tableau de bord de réservation actif dans l’onglet Webview d’aperçu.',
      },
    },
    visuals: {
      galleryLabel: 'Démonstration fonctionnelle scénarisée de réservation pour cette page Générateur d’applications',
      disclaimer: 'Démo fonctionnelle de page scénarisée · données fictives · pas une trace de génération',
      items: [
        {
          title: 'Choisir et réserver depuis son mobile',
          body: 'Le client sélectionne une prestation, voit les créneaux disponibles et confirme sans appeler le salon.',
          alt: 'Parcours mobile de réservation du salon avec choix de la prestation, créneaux disponibles et confirmation du rendez-vous.',
        },
        {
          title: 'Piloter la journée dans un seul agenda',
          body: 'L’équipe voit les rendez-vous, les disponibilités et leur état dans un planning adapté à sa journée de travail.',
          alt: 'Agenda de l’équipe du salon avec les rendez-vous de plusieurs coiffeurs et les créneaux encore ouverts.',
        },
        {
          title: 'Voir le contexte du rappel avec le client',
          body: 'La démonstration réunit les coordonnées, l’historique des visites et l’état du prochain rappel programmé dans une même fiche client.',
          alt: 'Démonstration fonctionnelle montrant une fiche client, l’historique des rendez-vous et l’état programmé d’un rappel par email.',
        },
      ],
      system: {
        title: 'Explorez la démonstration fonctionnelle de réservation',
        body: 'Cette démonstration navigateur créée pour la page présente les prestations, créneaux disponibles, coordonnées du client et confirmation dans un parcours interactif.',
        alt: 'Démonstration fonctionnelle française de réservation montrant les prestations, les créneaux disponibles, les coordonnées du client et le récapitulatif.',
      },
    },
    deliverables: {
      eyebrow: 'Ce que vous obtenez',
      title: 'Une application fonctionnelle que vous possédez et faites évoluer',
      intro:
        'Le projet reste inspectable depuis le premier fichier généré jusqu’à l’aperçu et l’export. Pour les compilations statiques prises en charge, la publication guidée ajoute une version en ligne sans masquer le code ni la sortie de compilation.',
      items: [
        {
          title: 'Code source réel',
          body: 'Tout ce que l’agent génère — composants d’interface, routes, validation, configuration et éventuels modules serveur — vit dans des fichiers lisibles que vous relisez, modifiez, versionnez et exportez.',
        },
        {
          title: 'Couche de données visible',
          body: 'Inspectez les types, états, adaptateurs, schémas et requêtes réellement présents dans le projet généré. Les connexions de base prises en charge passent par les secrets protégés et donnent accès à l’inspection du schéma et aux requêtes de lecture.',
        },
        {
          title: 'Aperçu actif',
          body: 'L’application s’exécute à côté du projet pour parcourir ses flux et vérifier l’expérience sur mobile, tablette et ordinateur pendant que le code évolue.',
        },
        {
          title: 'Publication statique guidée',
          body: 'Pour les compilations statiques prises en charge, faites avancer la sortie relue dans l’assistant E-Code, où la configuration, la publication, l’état et les journaux restent visibles.',
        },
        {
          title: 'URL live pour les compilations statiques',
          body: 'Une version statique prise en charge reçoit une adresse E-Code partageable. Les projets avec serveur restent exportables vers l’environnement d’exécution et le processus d’hébergement dont ils ont besoin.',
        },
        {
          title: 'Itération par la conversation',
          body: 'Demandez un formulaire plus court, un nouveau champ, une autre règle de validation ou une route différente. L’agent travaille depuis les fichiers existants et conserve chaque changement dans le même projet.',
        },
      ],
    },
    features: {
      eyebrow: 'Un projet applicatif inspectable',
      title: 'Chaque élément fonctionnel reste visible',
      intro:
        'E-Code réunit les écrans, le code, les connexions de données, l’aperçu et la sortie de compilation dans un même projet afin de vérifier ce qui existe avant la mise en ligne.',
      items: [
        {
          title: 'Écrans et routes reliés',
          body: 'Transformez chaque étape en vue adaptée : listes, formulaires, fiches, espaces personnels, écrans d’administration et routes qui guident chaque utilisateur dans l’application.',
        },
        {
          title: 'Modèles de données inspectables',
          body: 'Relisez les types, états, adaptateurs, schémas et requêtes réellement présents. Ajoutez les connexions prises en charge dans les secrets du projet, puis inspectez leur schéma avant de relier les flux de production.',
        },
        {
          title: 'Secrets de projet protégés',
          body: 'Conservez les identifiants de base et les valeurs d’exécution hors des prompts et du code source. E-Code chiffre les secrets enregistrés et les injecte dans l’espace de travail lorsque l’application s’exécute.',
        },
        {
          title: 'Import, versionnement et export',
          body: 'Ouvrez un projet E-Code ou importez des fichiers ZIP ou GitHub, conservez les changements dans l’historique du projet et exportez le code actuel en archive pour poursuivre ailleurs.',
        },
        {
          title: 'Aperçu multi-écran',
          body: 'Exécutez l’application pendant sa construction, parcourez les flux complets et vérifiez les interfaces sur mobile, tablette, ordinateur portable et écran large avant la mise en ligne.',
        },
        {
          title: 'Itération sur le code existant',
          body: 'Poursuivez la conversation pour modifier un écran, un champ, une règle ou une route. L’agent lit le projet actuel et intervient sur l’implémentation déjà en place.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Des applications façonnées par le travail',
      title: 'Construisez l’outil exact dont vos utilisateurs ont besoin',
      intro:
        'Chaque application part de données, de rôles et d’actions différents. Le prompt décrit ce modèle de fonctionnement au lieu de forcer toutes les activités dans le même modèle.',
      items: [
        {
          title: 'Application de réservation pour salon',
          body: 'Réunissez le choix des prestations, les disponibilités de l’équipe, les fiches clients et la modification des rendez-vous dans un parcours. Traitez l’authentification et l’envoi réel d’emails comme des intégrations explicites à implémenter et tester avant le lancement.',
        },
        {
          title: 'Portail client pour une entreprise de services',
          body: 'Modelez les demandes, documents, étapes, livrables et échanges avec l’équipe dans un portail. Définissez puis testez l’authentification et les règles d’accès aux documents dans le code avant la production.',
        },
        {
          title: 'Suivi des stocks et des commandes',
          body: 'Suivez les produits, mouvements de stock, fournisseurs, bons de commande, états de préparation et actions de réapprovisionnement depuis des écrans adaptés aux opérations.',
        },
        {
          title: 'Espace membre',
          body: 'Organisez l’inscription, les formules, les ressources, l’accès aux événements, les réglages de compte et l’administration d’une communauté, avec l’authentification et les autorisations explicitement relues dans le code.',
        },
      ],
    },
    faq: {
      eyebrow: 'Réponses pratiques',
      title: 'Ce qui se passe après la description de l’application',
      intro:
        'Vous gardez la maîtrise du code, des connexions de données et des décisions de mise en ligne pendant toute la construction.',
      items: [
        {
          question: 'Faut-il savoir coder ?',
          answer:
            'Aucune connaissance en code n’est nécessaire pour décrire le processus ou demander une évolution. E-Code écrit et met à jour les fichiers du projet. Le code, l’aperçu et la sortie de compilation restent visibles, et un développeur reprend ou étend le même projet lorsque vous souhaitez un contrôle technique plus poussé.',
        },
        {
          question: 'Puis-je exporter le code source ?',
          answer:
            'Oui. L’application existe sous forme de vrais fichiers de projet, pas comme une configuration visuelle verrouillée. Vous relisez, modifiez, versionnez et exportez ces fichiers vers votre dépôt ou votre processus de transmission.',
        },
        {
          question: 'Où l’application est-elle hébergée ?',
          answer:
            'Le projet s’exécute d’abord dans l’aperçu E-Code. L’assistant actuel publie les compilations statiques prises en charge et renvoie une URL E-Code live. Pour une application avec serveur, exportez le code vers l’environnement d’exécution et le processus d’hébergement nécessaires.',
        },
        {
          question: 'Puis-je connecter ma base de données existante ?',
          answer:
            'Oui. Ajoutez une URL de connexion prise en charge dans les secrets protégés du projet, jamais dans le prompt. E-Code détecte PostgreSQL, MySQL, MongoDB et Redis, puis fournit l’inspection du schéma et des requêtes de lecture. Relisez et testez la correspondance applicative et chaque opération d’écriture avant la production.',
        },
        {
          question: 'Puis-je reprendre une application existante ?',
          answer:
            'Oui. Ouvrez un projet E-Code existant ou importez ses fichiers, puis expliquez l’écran, le processus ou l’intégration à ajouter ou modifier. L’agent travaille depuis la structure actuelle au lieu de remplacer l’application par un modèle de départ sans rapport.',
        },
        {
          question: 'Comment protéger les utilisateurs et les données ?',
          answer:
            'Les identifiants de connexion vivent dans des secrets de projet chiffrés. L’authentification et l’application des rôles dans l’application générée restent du code à relire : décrivez les exigences, puis inspectez et testez chaque route et contrôle de données avant la production. Un prompt ne remplace pas une revue de sécurité.',
        },
      ],
    },
    finalCta: {
      title: 'Décrivez l’application qui manque à votre activité',
      body: 'Expliquez le processus, les utilisateurs, les données et les règles avec vos propres mots. E-Code transforme ce contexte en écrans reliés, code fonctionnel et projet que vous inspectez, exécutez, exportez et améliorez en continu.',
      primaryCta: {
        label: 'Décrivez votre application',
        ariaLabel: 'Commencer à décrire votre application métier',
      },
      secondaryCta: {
        label: 'Relire l’exemple du salon',
        ariaLabel: 'Revenir au prompt d’exemple de réservation de salon',
      },
    },
    aria: {
      pageLabel: 'Générateur d’applications E-Code pour les applications métier',
      heroLabel: 'Présentation du créateur d’applications métier',
      problemLabel: 'Problèmes causés par des processus métier dispersés',
      promptLabel: 'Démonstration du prompt vers une application de réservation',
      promptCodeLabel: 'Exemple de prompt pour une application de réservation de salon',
      outputListLabel: 'Périmètre d’implémentation défini à partir du prompt d’exemple',
      demoLabel: 'Démonstration produit de l’application de réservation de salon',
      ideProofLabel: 'Captures réelles de génération et de correction dans l’IDE E-Code',
      deliverablesLabel: 'Livrables disponibles dans un projet d’application métier E-Code',
      featuresLabel: 'Fonctionnalités du créateur d’applications métier',
      useCasesLabel: 'Cas d’usage des applications métier',
      faqLabel: 'Questions fréquentes sur la création d’une application métier',
      finalCtaLabel: 'Commencer la création d’une application métier',
    },
  },
  es: {
    seo: {
      title: 'Creador de aplicaciones de negocio con código real | E-Code',
      description:
        'Describe tu proceso, usuarios, datos y reglas. E-Code los convierte en archivos fuente editables, pantallas conectadas, Preview activa, exportación del proyecto y publicación para builds estáticos compatibles.',
    },
    hero: {
      eyebrow: 'App Builder para flujos de negocio reales',
      title: 'Convierte la forma de trabajar de tu negocio en una aplicación real',
      subtitle:
        'Describe quién la utiliza, qué información gestiona y qué reglas hacen avanzar el trabajo. E-Code convierte ese contexto en pantallas y rutas dentro de código fuente editable. Inspecciona cada archivo, ejecuta la app en Preview, continúa con el Agente y exporta el proyecto al alojamiento que necesita.',
      primaryCta: {
        label: 'Describe tu aplicación',
        ariaLabel: 'Describir tu aplicación de negocio con E-Code',
      },
      secondaryCta: {
        label: 'Ver la demo funcional del salón',
        ariaLabel: 'Revisar la demostración funcional de reservas y su alcance de implementación',
      },
      microcopy:
        'Empieza por el proceso que ya conoces. Los archivos del proyecto, la Preview activa, el resultado del build y los controles de exportación permanecen visibles mientras evoluciona la aplicación.',
    },
    languageSwitch: {
      label: 'Elegir el idioma de la página App Builder',
      english: 'English',
      french: 'Français',
    },
    problem: {
      eyebrow: 'Del proceso disperso a la aplicación funcional',
      title: 'Tu proceso supera las hojas de cálculo mucho antes de que llegue el software a medida',
      intro:
        'Un proceso empieza en una hoja de cálculo, un formulario o una bandeja de entrada porque esas herramientas están al alcance. Cuando aumentan los usuarios, registros, aprobaciones y excepciones, el equipo vuelve a introducir los mismos datos, pierde el contexto entre sistemas y espera un software que encaje con el trabajo real.',
      obstacles: [
        {
          title: 'El trabajo vive en herramientas desconectadas',
          body: 'Un formulario recoge una parte de la solicitud, una hoja guarda otra y las decisiones quedan enterradas en mensajes. El equipo repite la entrada de datos porque ninguna aplicación compartida conserva el estado completo.',
        },
        {
          title: 'El software estándar deforma el proceso',
          body: 'Los campos, roles y recorridos fijos obligan al negocio a seguir el modelo operativo de otra empresa. El no-code alcanza su límite cuando el flujo exige reglas precisas, datos conectados o una excepción que la plantilla no contempla.',
        },
        {
          title: 'La entrega tradicional separa la intención de la ejecución',
          body: 'Las necesidades pasan por varios traspasos antes de convertirse en software funcional, mientras cada aclaración consume presupuesto de desarrollo. Quien conoce el proceso espera en una lista y depende de otra persona para modificar el código.',
        },
      ],
      bridge:
        'E-Code parte del flujo expresado con lenguaje cotidiano. Describes lo que hacen los usuarios, inspeccionas una aplicación activa y su código real, y pides el siguiente cambio sin convertir cada decisión en una especificación técnica.',
    },
    prompt: {
      eyebrow: 'Un prompt inicia la construcción',
      title: 'Describe el servicio, no la arquitectura del software',
      intro:
        'La petición siguiente suena como un mensaje escrito por la persona que dirige la peluquería. Los cuatro elementos detallan su alcance de implementación; las capturas de navegador muestran una demostración funcional guionizada para esta página con datos ficticios, no el registro de una generación de E-Code.',
      label: 'Prompt de ejemplo',
      text: 'Crea una aplicación de reservas para mi peluquería, con agenda, cuentas de clientes y recordatorios por correo electrónico.',
      outputs: [
        {
          title: 'Pantallas de reserva',
          body: 'El recorrido solicitado cubre la selección del servicio y de un horario disponible, la creación de la cuenta, la confirmación de la cita y las próximas visitas en pantallas adaptables.',
        },
        {
          title: 'Base de datos de reservas',
          body: 'El modelo solicitado cubre clientes, servicios, profesionales, disponibilidad, citas y estado de los recordatorios, con relaciones explícitas entre cada registro.',
        },
        {
          title: 'Reglas de reserva operativas',
          body: 'El alcance de implementación incluye comprobar la disponibilidad, acceder a cuentas, crear, reprogramar, cancelar y confirmar citas, y activar recordatorios.',
        },
        {
          title: 'Vista previa y despliegue',
          body: 'E-Code ejecuta el proyecto generado en Preview para revisarlo en distintos tamaños. Los builds estáticos compatibles pasan después por una publicación guiada hacia una URL activa; los demás proyectos se exportan a su propio flujo de alojamiento.',
        },
      ],
      demoLabels: {
        previewLabel: 'reservas-peluqueria / vista previa activa',
        calendar: {
          title: 'Agenda de citas',
          date: 'Martes, 14 de mayo',
          slots: [
            { time: '09:00', label: 'Corte y peinado', status: 'Confirmada' },
            { time: '11:30', label: 'Consulta de color', status: 'Pendiente de confirmación' },
            { time: '14:00', label: 'Horario abierto para reservar', status: 'Disponible' },
          ],
        },
        database: {
          title: 'Modelo de datos de reservas',
          tables: [
            { name: 'Clientes', fields: 'Identificador · Nombre completo · Correo electrónico' },
            { name: 'Servicios', fields: 'Identificador · Nombre · Duración · Precio' },
            { name: 'Citas', fields: 'Cliente · Servicio · Profesional · Hora de inicio · Estado' },
          ],
        },
        statuses: {
          title: 'Cobertura de la demostración',
          items: [
            'Alcance de implementación definido',
            'Recorrido de reservas demostrado',
            'Demo adaptable capturada en el navegador',
            'Flujo de despliegue documentado',
          ],
        },
      },
    },
    proof: {
      eyebrow: 'Prompt → agente → vista previa',
      title: 'Observa cómo toma forma la aplicación dentro de E-Code',
      intro:
        'Este es un espacio de trabajo real de E-Code, capturado después de que el agente ejecutara el prompt de reservas. La interfaz de E-Code, los archivos generados y la vista previa en ejecución son reales. La identidad y los datos del salón son ficticios, y este proyecto capturado utiliza un adaptador local en memoria; no tiene conectados una base de datos externa, un proveedor de autenticación ni un servicio de envío de emails.',
      steps: [
        {
          title: 'Describe el resultado',
          body: 'La persona que dirige el salón explica el proceso con lenguaje cotidiano: agenda de reservas, cuentas de clientes y recordatorios por email. No prepara una lista de componentes ni una arquitectura técnica.',
        },
        {
          title: 'Sigue el trabajo del agente',
          body: 'El panel Agent conserva la petición y el plan de implementación, mientras la biblioteca muestra las rutas, páginas, componentes, estilos y archivos de configuración generados.',
        },
        {
          title: 'Prueba la aplicación en Preview',
          body: 'La pestaña Webview ejecuta el mismo proyecto junto a la conversación. Recorres el panel, la agenda, el flujo de reservas y las cuentas sin abandonar el espacio de E-Code.',
        },
      ],
      disclaimer:
        'Interfaz de E-Code, archivos generados y Preview en ejecución reales · datos ficticios · adaptador local en memoria · sin base externa, proveedor de autenticación ni servicio de envío de emails conectado',
      openFullSizeLabel: 'Abrir la captura del IDE a tamaño completo',
      preview: {
        title: 'El prompt, el agente, los archivos y la aplicación comparten el espacio',
        body: 'Esta captura muestra la interfaz real de E-Code, el árbol de archivos generado y el panel de reservas ejecutándose en Preview. No demuestra lógica de servidor ni una base externa, un proveedor de autenticación o un servicio de envío de emails conectado.',
        alt: 'IDE E-Code en inglés con el prompt de reservas en el panel Agent, los archivos generados y la aplicación de reservas ejecutándose en la pestaña Preview.',
      },
      iteration: {
        title: 'Si Preview muestra un error, pide al agente que lo corrija',
        body: 'Esta corrección encarga al agente revisar un error del enrutador, conservar todas las rutas y comprobar de nuevo el panel. Después, el proyecto exportado superó de forma independiente el typecheck y el build de producción; el indicador rojo Problems registra diagnósticos locales de arranque de Preview, no una promesa de acierto perfecto al primer intento.',
        alt: 'IDE E-Code en inglés con un prompt de seguimiento para corregir un error del enrutador junto al proyecto actualizado y el panel de reservas activo.',
      },
    },
    visuals: {
      galleryLabel: 'Demostración funcional guionizada de reservas para esta página App Builder',
      disclaimer: 'Demo funcional de página guionizada · datos ficticios · no es un registro de generación',
      items: [
        {
          title: 'Elegir y reservar desde el móvil',
          body: 'El cliente elige un servicio, consulta los horarios disponibles y confirma la visita sin llamar a la peluquería.',
          alt: 'Recorrido móvil de reserva para la peluquería con selección de servicio, horarios disponibles y confirmación de cita.',
        },
        {
          title: 'Organizar el día desde una sola agenda',
          body: 'El equipo ve las citas, los huecos disponibles y cada estado en un horario adaptado a la jornada de trabajo.',
          alt: 'Agenda del equipo de la peluquería con citas de varios profesionales y horarios todavía disponibles.',
        },
        {
          title: 'Revisar el recordatorio junto al cliente',
          body: 'La demostración coloca los datos de contacto, el historial de citas y el estado del siguiente recordatorio programado en una sola ficha.',
          alt: 'Demostración funcional con la ficha de un cliente, su historial de citas y el estado programado de un recordatorio por email.',
        },
      ],
      system: {
        title: 'Explora la demostración funcional de reservas',
        body: 'Esta demostración de navegador creada para la página presenta servicios, horarios disponibles, datos del cliente y confirmación en un recorrido interactivo.',
        alt: 'Demostración funcional en inglés de reservas con servicios, horarios disponibles, datos del cliente y resumen de la cita.',
      },
    },
    deliverables: {
      eyebrow: 'Lo que recibes',
      title: 'Una aplicación funcional que conservas y sigues mejorando',
      intro:
        'El proyecto permanece visible desde el primer archivo generado hasta Preview y la exportación. Para los builds estáticos compatibles, la publicación guiada añade una versión activa sin ocultar el código ni el resultado del build.',
      items: [
        {
          title: 'Código fuente real',
          body: 'Todo lo que genera el agente —componentes de interfaz, rutas, validación, configuración y cualquier módulo de servidor— vive en archivos legibles que revisas, editas, versionas y exportas.',
        },
        {
          title: 'Una capa de datos visible',
          body: 'Inspecciona los tipos, estados, adaptadores, esquemas y consultas que contiene realmente el proyecto generado. Las conexiones de base compatibles se guardan en secretos protegidos y ofrecen inspección del esquema y consultas de lectura.',
        },
        {
          title: 'Vista previa activa',
          body: 'La aplicación se ejecuta junto al proyecto para recorrer sus flujos y revisar la experiencia en móvil, tableta y ordenador mientras cambia el código.',
        },
        {
          title: 'Publicación estática guiada',
          body: 'Para los builds estáticos compatibles, lleva el resultado revisado por el asistente de E-Code, donde permanecen visibles la configuración, la publicación, el estado y los registros.',
        },
        {
          title: 'URL activa para builds estáticos',
          body: 'Una versión estática compatible recibe una dirección compartible de E-Code. Los proyectos con servidor siguen siendo exportables al runtime y al flujo de alojamiento que necesitan.',
        },
        {
          title: 'Iteración mediante conversación',
          body: 'Pide un formulario más corto, un campo nuevo, otra regla de aprobación o una ruta diferente. El agente trabaja sobre los archivos existentes y mantiene cada cambio dentro del mismo proyecto.',
        },
      ],
    },
    features: {
      eyebrow: 'Un proyecto de aplicación inspeccionable',
      title: 'Cada pieza funcional permanece visible',
      intro:
        'E-Code reúne pantallas, código, conexiones de datos, Preview y resultado del build en un solo proyecto para que compruebes qué existe antes de publicar.',
      items: [
        {
          title: 'Pantallas y rutas conectadas',
          body: 'Convierte cada paso en la vista adecuada: listas, formularios, fichas, áreas personales, pantallas de administración y rutas que guían a cada usuario por la aplicación.',
        },
        {
          title: 'Modelos de datos que inspeccionas',
          body: 'Revisa los tipos, estados, adaptadores, esquemas y consultas realmente presentes. Añade conexiones compatibles mediante secretos protegidos e inspecciona su esquema antes de enlazar flujos de producción.',
        },
        {
          title: 'Secretos de proyecto protegidos',
          body: 'Mantén las credenciales de base y los valores de ejecución fuera de los prompts y del código fuente. E-Code cifra los secretos guardados y los inyecta en el workspace cuando se ejecuta la aplicación.',
        },
        {
          title: 'Importación, versiones y exportación',
          body: 'Abre un proyecto de E-Code o importa archivos ZIP o GitHub, conserva los cambios en el historial del proyecto y exporta el código actual como archivo para continuar en otro flujo.',
        },
        {
          title: 'Vista previa en varias pantallas',
          body: 'Ejecuta la aplicación mientras se construye, recorre los flujos completos y revisa las interfaces en móvil, tableta, portátil y escritorio amplio antes de publicar.',
        },
        {
          title: 'Iteración sobre el código existente',
          body: 'Continúa la conversación para cambiar una pantalla, un campo, una regla o una ruta. El agente lee el proyecto actual y modifica la implementación que ya existe.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Aplicaciones adaptadas al trabajo',
      title: 'Construye la herramienta exacta que necesitan tus usuarios',
      intro:
        'Cada aplicación parte de registros, roles y acciones diferentes. El prompt define ese modelo operativo en lugar de obligar a todos los negocios a seguir la misma plantilla.',
      items: [
        {
          title: 'Aplicación de reservas para peluquería',
          body: 'Reúne la selección de servicios, la disponibilidad del equipo, las fichas de clientes y los cambios de cita en un recorrido. Trata la autenticación y el envío real de emails como integraciones explícitas que debes implementar y probar antes del lanzamiento.',
        },
        {
          title: 'Portal de clientes para una empresa de servicios',
          body: 'Modela solicitudes, documentos, avances, entregas y contacto con el equipo en un portal. Define y prueba la autenticación y las reglas de acceso a documentos en el código antes de producción.',
        },
        {
          title: 'Control de inventario y pedidos',
          body: 'Sigue productos, movimientos de existencias, proveedores, órdenes de compra, estados de preparación y reposiciones desde pantallas adaptadas a la operación.',
        },
        {
          title: 'Área de miembros',
          body: 'Organiza el registro, los planes, los recursos, el acceso a eventos, los ajustes de cuenta y la administración de una comunidad, con autenticación y autorización explícitas en la revisión del código.',
        },
      ],
    },
    faq: {
      eyebrow: 'Respuestas prácticas',
      title: 'Qué ocurre después de describir la aplicación',
      intro:
        'Mantienes el control del código, las conexiones de datos y las decisiones de publicación durante toda la construcción.',
      items: [
        {
          question: '¿Necesito saber programar?',
          answer:
            'No necesitas conocimientos de programación para describir el proceso o pedir cambios. E-Code escribe y actualiza los archivos del proyecto. El código, la vista previa y el resultado de la compilación siguen visibles, y un desarrollador retoma o amplía el mismo proyecto cuando buscas un control técnico más profundo.',
        },
        {
          question: '¿Puedo exportar el código fuente?',
          answer:
            'Sí. La aplicación existe como archivos reales de proyecto, no como una configuración visual bloqueada. Revisas, editas, versionas y exportas esos archivos hacia tu repositorio o proceso de entrega.',
        },
        {
          question: '¿Dónde se aloja la aplicación?',
          answer:
            'El proyecto se ejecuta primero en Preview de E-Code. El asistente actual publica los builds estáticos compatibles y devuelve una URL activa de E-Code. Para una aplicación con servidor, exporta el código al runtime y al flujo de alojamiento que necesita.',
        },
        {
          question: '¿Puedo conectar mi base de datos actual?',
          answer:
            'Sí. Añade una URL de conexión compatible mediante secretos protegidos del proyecto, nunca dentro del prompt. E-Code detecta PostgreSQL, MySQL, MongoDB y Redis, y ofrece inspección del esquema y consultas de lectura. Revisa y prueba el mapeo de la aplicación y cada operación de escritura antes de producción.',
        },
        {
          question: '¿Puedo continuar desde una aplicación existente?',
          answer:
            'Sí. Abre un proyecto existente de E-Code o importa sus archivos, y explica la pantalla, el proceso o la integración que quieres añadir o cambiar. El agente trabaja desde la estructura actual en vez de sustituir la aplicación por un proyecto inicial sin relación.',
        },
        {
          question: '¿Cómo protejo a los usuarios y los datos?',
          answer:
            'Las credenciales de conexión viven en secretos de proyecto cifrados. La autenticación y la aplicación de roles dentro de la app generada siguen siendo código que debes revisar: define los requisitos e inspecciona y prueba cada ruta y control de datos antes de producción. Un prompt no sustituye una revisión de seguridad.',
        },
      ],
    },
    finalCta: {
      title: 'Describe la aplicación que le falta a tu negocio',
      body: 'Explica el proceso, los usuarios, los datos y las reglas con tus propias palabras. E-Code transforma ese contexto en pantallas conectadas, código funcional y un proyecto que revisas, ejecutas, exportas y sigues mejorando.',
      primaryCta: {
        label: 'Describe tu aplicación',
        ariaLabel: 'Empezar a describir tu aplicación de negocio',
      },
      secondaryCta: {
        label: 'Revisar el ejemplo de la peluquería',
        ariaLabel: 'Volver al prompt de ejemplo de reservas para peluquería',
      },
    },
    aria: {
      pageLabel: 'App Builder de E-Code para aplicaciones de negocio',
      heroLabel: 'Presentación del creador de aplicaciones de negocio',
      problemLabel: 'Problemas causados por flujos de negocio dispersos',
      promptLabel: 'Demostración del prompt a la aplicación de reservas',
      promptCodeLabel: 'Prompt de ejemplo para una aplicación de reservas de peluquería',
      outputListLabel: 'Resultados de la aplicación producidos desde el prompt de ejemplo',
      demoLabel: 'Demostración del producto de reservas para peluquería',
      ideProofLabel: 'Capturas reales de generación y corrección en el IDE E-Code',
      deliverablesLabel: 'Entregables incluidos con la aplicación de negocio generada',
      featuresLabel: 'Funciones del creador de aplicaciones de negocio',
      useCasesLabel: 'Casos de uso de aplicaciones de negocio',
      faqLabel: 'Preguntas frecuentes sobre la creación de una aplicación de negocio',
      finalCtaLabel: 'Empezar a crear una aplicación de negocio',
    },
  },
  ar: {
    seo: {
      title: 'منشئ تطبيقات أعمال بكود مصدري حقيقي | E-Code',
      description:
        'صِف سير العمل والمستخدمين والبيانات والقواعد. يحوّلها E-Code إلى ملفات مصدر قابلة للتعديل وشاشات مترابطة ومعاينة عاملة وتصدير للمشروع ونشر للإصدارات الثابتة المدعومة.',
    },
    hero: {
      eyebrow: 'منشئ تطبيقات لسير العمل الفعلي',
      title: 'حوّل طريقة عمل نشاطك إلى تطبيق حقيقي',
      subtitle:
        'صِف الأشخاص الذين يستخدمونه والمعلومات التي يتعاملون معها والقواعد التي تدفع العمل إلى الأمام. يحوّل E-Code هذا السياق إلى شاشات ومسارات داخل كود مصدري قابل للتعديل. افحص كل ملف وشغّل التطبيق في المعاينة وواصل العمل مع الوكيل ثم صدّر المشروع إلى بيئة الاستضافة المناسبة.',
      primaryCta: {
        label: 'صِف تطبيقك',
        ariaLabel: 'صِف تطبيق الأعمال الذي تريده باستخدام E-Code',
      },
      secondaryCta: {
        label: 'شاهد عرض الصالون الوظيفي',
        ariaLabel: 'راجع العرض الوظيفي لحجز مواعيد الصالون ونطاق تنفيذه',
      },
      microcopy:
        'ابدأ بسير العمل الذي تعرفه. تظل ملفات المشروع والمعاينة العاملة ونتيجة البناء وعناصر التصدير ظاهرة أمامك مع تطور التطبيق.',
    },
    languageSwitch: {
      label: 'اختر لغة صفحة منشئ التطبيقات',
      english: 'English',
      french: 'Français',
    },
    problem: {
      eyebrow: 'من عملية متفرقة إلى تطبيق يعمل',
      title: 'يتجاوز سير عملك جداول البيانات قبل وصول البرنامج المخصص بوقت طويل',
      intro:
        'تبدأ العملية في جدول بيانات أو نموذج أو صندوق بريد لأنها أدوات متاحة فورًا. ومع زيادة المستخدمين والسجلات والموافقات والاستثناءات، يعيد الفريق إدخال البيانات نفسها ويفقد السياق بين الأنظمة وينتظر برنامجًا يطابق طريقة العمل الفعلية.',
      obstacles: [
        {
          title: 'يتوزع العمل بين أدوات غير مترابطة',
          body: 'يجمع النموذج جزءًا من الطلب ويحفظ جدول البيانات جزءًا آخر، بينما تبقى القرارات مدفونة في الرسائل. يعيد الفريق إدخال المعلومات لأن تطبيقًا مشتركًا لا يجمع الحالة الكاملة للعمل.',
        },
        {
          title: 'البرامج الجاهزة تغيّر العملية لتناسبها',
          body: 'تفرض الحقول والأدوار والمسارات الثابتة نموذج تشغيل يخص شركة أخرى. وتصل أدوات البرمجة من دون كود إلى حدودها عندما يحتاج سير العمل إلى قواعد دقيقة أو بيانات مترابطة أو استثناء لا يتضمنه القالب.',
        },
        {
          title: 'التسليم التقليدي يفصل الفكرة عن التنفيذ',
          body: 'تمر المتطلبات بين أطراف متعددة قبل أن تصبح برنامجًا يعمل، بينما يرفع وقت المطور تكلفة كل توضيح. ينتظر الشخص الذي يفهم العملية في قائمة المهام ويظل معتمدًا على غيره لتعديل الكود.',
        },
      ],
      bridge:
        'يبدأ E-Code من سير العمل الموصوف بلغة يومية. تشرح ما يفعله المستخدمون، وتفحص تطبيقًا عاملًا وكوده الحقيقي، ثم تطلب التعديل التالي من دون تحويل كل قرار إلى مواصفة تقنية.',
    },
    prompt: {
      eyebrow: 'وصف واحد يبدأ البناء',
      title: 'صِف الخدمة بدل هندسة البرنامج',
      intro:
        'يبدو الطلب التالي كرسالة يكتبها صاحب صالون. توضح العناصر الأربعة نطاق التنفيذ؛ وتعرض لقطات المتصفح عرضًا وظيفيًا بسيناريو مُعدّ مسبقًا لهذه الصفحة وبيانات صالون خيالية، وليس سجلًا لعملية إنشاء في E-Code.',
      label: 'مثال على الوصف',
      text: 'أنشئ تطبيقًا لحجز المواعيد لصالون تصفيف الشعر الخاص بي، مع جدول مواعيد وحسابات للعملاء وتذكيرات عبر البريد الإلكتروني.',
      outputs: [
        {
          title: 'شاشات الحجز',
          body: 'يشمل المسار المطلوب اختيار الخدمة والموعد المتاح وإنشاء حساب وتأكيد الحجز ومراجعة الزيارات القادمة عبر شاشات متجاوبة.',
        },
        {
          title: 'قاعدة بيانات الحجوزات',
          body: 'يشمل نموذج البيانات المطلوب العملاء والخدمات وأعضاء الفريق وأوقات التوفر والمواعيد وحالة التذكيرات، مع علاقات واضحة بين السجلات.',
        },
        {
          title: 'قواعد حجز فعالة',
          body: 'يشمل نطاق التنفيذ فحص التوفر والوصول إلى الحسابات وإنشاء الموعد وتعديله وإلغائه وتأكيده وتشغيل التذكيرات.',
        },
        {
          title: 'المعاينة والنشر',
          body: 'يشغّل E-Code المشروع المُنشأ في المعاينة لمراجعته عبر أحجام الشاشات. تنتقل الإصدارات الثابتة المدعومة بعدها عبر نشر موجّه إلى رابط مباشر، بينما تبقى المشاريع الأخرى قابلة للتصدير إلى مسار استضافتها.',
        },
      ],
      demoLabels: {
        previewLabel: 'حجز-الصالون / معاينة مباشرة',
        calendar: {
          title: 'جدول المواعيد',
          date: 'الثلاثاء، 14 مايو',
          slots: [
            { time: '09:00', label: 'قص وتصفيف', status: 'مؤكد' },
            { time: '11:30', label: 'استشارة صبغة', status: 'بانتظار التأكيد' },
            { time: '14:00', label: 'موعد مفتوح للحجز', status: 'متاح' },
          ],
        },
        database: {
          title: 'نموذج بيانات الحجوزات',
          tables: [
            { name: 'العملاء', fields: 'المعرّف · الاسم الكامل · البريد الإلكتروني' },
            { name: 'الخدمات', fields: 'المعرّف · اسم الخدمة · المدة · السعر' },
            { name: 'المواعيد', fields: 'العميل · الخدمة · عضو الفريق · وقت البدء · الحالة' },
          ],
        },
        statuses: {
          title: 'نطاق العرض الوظيفي',
          items: ['تحديد نطاق التنفيذ', 'عرض رحلة الحجز', 'التقاط عرض متصفح متجاوب', 'توثيق مسار النشر'],
        },
      },
    },
    proof: {
      eyebrow: 'الوصف → الوكيل → المعاينة',
      title: 'شاهد التطبيق يتشكل داخل E-Code',
      intro:
        'هذه مساحة عمل حقيقية في E-Code جرى التقاطها بعد تنفيذ الوكيل لوصف تطبيق الحجز. واجهة E-Code وملفات المشروع المُنشأة والمعاينة العاملة حقيقية. أما هوية الصالون وبياناته فخيالية، ويستخدم هذا المشروع المُصوّر محوّل بيانات محليًا في الذاكرة؛ ولا يتصل بقاعدة بيانات خارجية أو مزوّد مصادقة أو خدمة إرسال بريد إلكتروني.',
      steps: [
        {
          title: 'صِف النتيجة المطلوبة',
          body: 'يكتب صاحب الصالون سير العمل بلغته اليومية: جدول للحجوزات وحسابات للعملاء وتذكيرات بالبريد الإلكتروني. لا يحتاج أولًا إلى إعداد قائمة مكونات أو هندسة تقنية.',
        },
        {
          title: 'تابع عمل الوكيل',
          body: 'يحتفظ قسم Agent بالطلب الأصلي وخطة التنفيذ أمامك، بينما تعرض المكتبة المسارات والصفحات والمكونات والأنماط وملفات إعداد المشروع التي تم إنشاؤها.',
        },
        {
          title: 'اختبر التطبيق في المعاينة',
          body: 'تشغّل علامة Webview المشروع نفسه بجوار المحادثة. تتصفح لوحة المتابعة والجدول ومسار الحجز والحسابات من دون مغادرة مساحة عمل E-Code.',
        },
      ],
      disclaimer:
        'واجهة E-Code والملفات المُنشأة والمعاينة العاملة حقيقية · بيانات خيالية · محوّل محلي في الذاكرة · بلا قاعدة خارجية أو مصادقة أو خدمة بريد متصلة',
      openFullSizeLabel: 'افتح لقطة بيئة التطوير بالحجم الكامل',
      preview: {
        title: 'يجتمع الوصف والوكيل والملفات والتطبيق في مساحة واحدة',
        body: 'تعرض هذه اللقطة واجهة E-Code الحقيقية وشجرة الملفات المُنشأة ولوحة الحجز تعمل في Preview. ولا تثبت منطق خادم أو اتصالًا بقاعدة خارجية أو مزوّد مصادقة أو خدمة إرسال بريد.',
        alt: 'بيئة E-Code بواجهة إنجليزية تعرض وصف تطبيق الحجز في قسم Agent وملفات المشروع المُنشأة وتطبيق الحجز يعمل داخل علامة Preview.',
      },
      iteration: {
        title: 'عندما تكشف المعاينة خطأً، اطلب من الوكيل إصلاحه',
        body: 'يوثق هذا التصحيح طلب فحص خطأ في الموجّه والحفاظ على جميع المسارات ثم التحقق من اللوحة مجددًا. اجتاز المشروع المُصدَّر لاحقًا فحص الأنواع وبناء الإنتاج بصورة مستقلة؛ وتسجل شارة Problems الحمراء تشخيصات محلية لبدء Preview، لا وعدًا بأن كل إنشاء ينجح من المحاولة الأولى.',
        alt: 'بيئة E-Code بواجهة إنجليزية تعرض طلب متابعة لإصلاح خطأ في الموجّه بجانب مشروع الصالون المحدّث ولوحة الحجز العاملة في Preview.',
      },
    },
    visuals: {
      galleryLabel: 'عرض وظيفي بسيناريو مُعدّ مسبقًا لحجز الصالون في صفحة App Builder',
      disclaimer: 'عرض وظيفي بسيناريو مُعدّ مسبقًا · بيانات خيالية · ليس سجلًا لعملية إنشاء',
      items: [
        {
          title: 'اختيار الموعد وحجزه من الهاتف',
          body: 'يختار العميل الخدمة ويرى المواعيد المتاحة ويؤكد الزيارة من دون الاتصال بالصالون.',
          alt: 'رحلة حجز صالون على الهاتف تعرض اختيار الخدمة والمواعيد المتاحة وتأكيد الموعد.',
        },
        {
          title: 'إدارة اليوم من جدول واحد',
          body: 'يرى الفريق المواعيد والأوقات المتاحة وحالة كل حجز في جدول يناسب يوم العمل.',
          alt: 'جدول فريق الصالون يعرض مواعيد عدة مصففين إلى جانب الأوقات المفتوحة للحجز.',
        },
        {
          title: 'مراجعة سياق التذكير بجانب العميل',
          body: 'يضع العرض الوظيفي بيانات التواصل وسجل المواعيد وحالة التذكير المجدول التالي في ملف واحد.',
          alt: 'عرض وظيفي لملف عميل وسجل مواعيده وحالة تذكير مجدول عبر البريد.',
        },
      ],
      system: {
        title: 'استكشف العرض الوظيفي للحجز',
        body: 'يعرض هذا العرض المتصفحي المُنشأ للصفحة الخدمات والمواعيد المتاحة وبيانات العميل وتأكيد الحجز في مسار تفاعلي.',
        alt: 'عرض وظيفي باللغة الإنجليزية لحجز الصالون يعرض الخدمات والمواعيد وبيانات العميل وملخص الحجز.',
      },
    },
    deliverables: {
      eyebrow: 'ما تحصل عليه',
      title: 'تطبيق عامل تملكه وتواصل تطويره',
      intro:
        'يبقى المشروع قابلًا للفحص منذ أول ملف مُنشأ حتى المعاينة والتصدير. وللإصدارات الثابتة المدعومة يضيف النشر الموجّه نسخة مباشرة من دون إخفاء الكود أو نتيجة البناء.',
      items: [
        {
          title: 'كود مصدري حقيقي',
          body: 'كل ما ينشئه الوكيل — من مكونات الواجهة والمسارات والتحقق والإعدادات وأي وحدات خادم — يوجد في ملفات مقروءة تراجعها وتعدلها وتحفظ إصداراتها وتصدرها.',
        },
        {
          title: 'طبقة بيانات ظاهرة',
          body: 'افحص الأنواع والحالة والمحوّلات والمخططات والاستعلامات الموجودة فعلًا في المشروع المُنشأ. تُحفظ اتصالات قواعد البيانات المدعومة في أسرار محمية وتوفر فحص المخطط واستعلامات القراءة.',
        },
        {
          title: 'معاينة عاملة',
          body: 'يعمل التطبيق بجانب المشروع لتجربة مساراته ومراجعة الواجهة على الهاتف والجهاز اللوحي والكمبيوتر أثناء تغير الكود.',
        },
        {
          title: 'نشر ثابت موجّه',
          body: 'للإصدارات الثابتة المدعومة، انقل نتيجة البناء التي راجعتها عبر معالج E-Code، حيث تظل الإعدادات والنشر والحالة والسجلات ظاهرة.',
        },
        {
          title: 'رابط مباشر للإصدارات الثابتة',
          body: 'يحصل الإصدار الثابت المدعوم على عنوان E-Code قابل للمشاركة. وتبقى المشاريع التي تتضمن خادمًا قابلة للتصدير إلى بيئة التشغيل ومسار الاستضافة المناسبين.',
        },
        {
          title: 'تطوير مستمر بالمحادثة',
          body: 'اطلب نموذجًا أقصر أو حقلًا جديدًا أو قاعدة موافقة مختلفة أو مسارًا آخر. يعمل الوكيل على الملفات الحالية ويحفظ كل تعديل داخل المشروع نفسه.',
        },
      ],
    },
    features: {
      eyebrow: 'مشروع تطبيق قابل للفحص',
      title: 'يبقى كل جزء عامل ظاهرًا',
      intro:
        'يجمع E-Code الشاشات والكود واتصالات البيانات والمعاينة ونتيجة البناء في مشروع واحد حتى تتحقق مما يوجد قبل النشر.',
      items: [
        {
          title: 'شاشات ومسارات مترابطة',
          body: 'حوّل كل خطوة إلى الواجهة المناسبة: قوائم ونماذج وسجلات ومساحات حساب وشاشات إدارة ومسارات تنقل كل مستخدم داخل التطبيق.',
        },
        {
          title: 'نماذج بيانات تفحصها',
          body: 'راجع الأنواع والحالة والمحوّلات والمخططات والاستعلامات الموجودة فعلًا. أضف الاتصالات المدعومة عبر أسرار المشروع ثم افحص مخططها قبل ربط تدفقات الإنتاج.',
        },
        {
          title: 'أسرار مشروع محمية',
          body: 'احتفظ ببيانات اتصال القاعدة وقيم التشغيل خارج الأوصاف والكود المصدري. يشفّر E-Code أسرار المشروع المحفوظة ويحقنها في مساحة العمل عند تشغيل التطبيق.',
        },
        {
          title: 'استيراد وحفظ إصدارات وتصدير',
          body: 'افتح مشروع E-Code أو استورد ملفات ZIP أو GitHub، واحتفظ بالتغييرات في سجل المشروع، ثم صدّر الكود الحالي في أرشيف عندما تحتاج إلى مسار آخر.',
        },
        {
          title: 'معاينة على أحجام شاشات متعددة',
          body: 'شغّل التطبيق أثناء بنائه، واختبر المسارات الكاملة، وراجع الواجهات على الهاتف والجهاز اللوحي والكمبيوتر المحمول والشاشة الواسعة قبل النشر.',
        },
        {
          title: 'تطوير مستمر على الكود الحالي',
          body: 'واصل المحادثة لتغيير شاشة أو حقل أو قاعدة أو مسار. يقرأ الوكيل المشروع الحالي ويعدّل التنفيذ الموجود بالفعل.',
        },
      ],
    },
    useCases: {
      eyebrow: 'تطبيقات تتشكل حول العمل',
      title: 'ابنِ الأداة الدقيقة التي يحتاج إليها المستخدمون',
      intro:
        'يبدأ كل تطبيق بسجلات وأدوار وإجراءات مختلفة. يحدد الوصف نموذج التشغيل هذا بدل إجبار جميع الأنشطة على القالب نفسه.',
      items: [
        {
          title: 'تطبيق حجز مواعيد لصالون',
          body: 'اجمع اختيار الخدمات وتوفر الفريق وسجلات العملاء وتعديل المواعيد في رحلة واحدة. تعامل مع المصادقة وإرسال البريد الفعلي كتكاملات واضحة تنفذها وتختبرها قبل الإطلاق.',
        },
        {
          title: 'بوابة عملاء لشركة خدمات',
          body: 'نمذج الطلبات والمستندات والتقدم والتسليمات والتواصل مع الفريق في بوابة واحدة. حدّد المصادقة وقواعد الوصول إلى المستندات واختبرها في الكود قبل الإنتاج.',
        },
        {
          title: 'متابعة المخزون والطلبات',
          body: 'تابع المنتجات وحركات المخزون والموردين وأوامر الشراء وحالات التجهيز وإجراءات إعادة الطلب من شاشات تعكس التشغيل الفعلي.',
        },
        {
          title: 'مساحة أعضاء',
          body: 'نظّم التسجيل والخطط والموارد والوصول إلى الفعاليات وإعدادات الحساب وإدارة المجتمع، مع إبقاء المصادقة والصلاحيات واضحة في مراجعة الكود.',
        },
      ],
    },
    faq: {
      eyebrow: 'إجابات عملية',
      title: 'ما الذي يحدث بعد وصف التطبيق',
      intro: 'تحتفظ بالتحكم في الكود واتصالات البيانات وقرارات النشر طوال عملية البناء.',
      items: [
        {
          question: 'هل أحتاج إلى معرفة البرمجة؟',
          answer:
            'لا تحتاج إلى خبرة برمجية لوصف سير العمل أو طلب التعديلات. يكتب E-Code ملفات المشروع ويحدثها. يظل الكود والمعاينة ونتيجة البناء ظاهرًا، ويستطيع مطور مراجعة المشروع نفسه أو توسيعه عندما تحتاج إلى تحكم تقني أعمق.',
        },
        {
          question: 'هل أستطيع تصدير الكود المصدري؟',
          answer:
            'نعم. يوجد التطبيق في ملفات مشروع حقيقية، وليس في إعداد بصري مغلق. تراجع هذه الملفات وتعدلها وتحفظ نسخها وتصدرها إلى مستودعك أو مسار التسليم الذي تتبعه.',
        },
        {
          question: 'أين تتم استضافة التطبيق؟',
          answer:
            'يعمل المشروع أولًا في معاينة E-Code. ينشر المعالج الحالي الإصدارات الثابتة المدعومة ويعيد رابط E-Code مباشرًا. أما التطبيق الذي يتضمن خادمًا فتصدّر كوده إلى بيئة التشغيل ومسار الاستضافة اللذين يحتاج إليهما.',
        },
        {
          question: 'هل أستطيع ربط قاعدة بياناتي الحالية؟',
          answer:
            'نعم. أضف رابط اتصال مدعومًا عبر أسرار المشروع المحمية، ولا تضعه في الوصف. يكتشف E-Code اتصالات PostgreSQL وMySQL وMongoDB وRedis ويوفر فحص المخطط واستعلامات القراءة. راجع ربط التطبيق واختبر كل عملية كتابة قبل الإنتاج.',
        },
        {
          question: 'هل أستطيع متابعة العمل على تطبيق موجود؟',
          answer:
            'نعم. افتح مشروع E-Code موجودًا أو استورد ملفاته، ثم اشرح الشاشة أو سير العمل أو التكامل الذي تريد إضافته أو تغييره. يعمل الوكيل انطلاقًا من البنية الحالية بدل استبدال التطبيق بمشروع بداية غير مرتبط به.',
        },
        {
          question: 'كيف أحمي المستخدمين والبيانات؟',
          answer:
            'توجد بيانات الاتصال في أسرار مشروع مشفّرة. وتبقى المصادقة وتطبيق الأدوار داخل التطبيق المُنشأ جزءًا من الكود الذي تراجعه: حدّد المتطلبات ثم افحص واختبر كل مسار وفحص للبيانات قبل الإنتاج. لا يحل الوصف محل مراجعة الأمان.',
        },
      ],
    },
    finalCta: {
      title: 'صِف التطبيق الذي يحتاج إليه نشاطك',
      body: 'اشرح سير العمل والمستخدمين والبيانات والقواعد بكلماتك. يحوّل E-Code هذا السياق إلى شاشات مترابطة وكود عامل ومشروع تفحصه وتشغله وتصدّره وتواصل تحسينه.',
      primaryCta: {
        label: 'صِف تطبيقك',
        ariaLabel: 'ابدأ وصف تطبيق الأعمال الذي تريده',
      },
      secondaryCta: {
        label: 'راجع مثال الصالون',
        ariaLabel: 'عُد إلى مثال وصف تطبيق حجز الصالون',
      },
    },
    aria: {
      pageLabel: 'منشئ تطبيقات E-Code لتطبيقات الأعمال',
      heroLabel: 'مقدمة منشئ تطبيقات الأعمال',
      problemLabel: 'مشكلات سير العمل المتفرق',
      promptLabel: 'عرض تحويل الوصف إلى تطبيق حجز مواعيد',
      promptCodeLabel: 'مثال وصف لتطبيق حجز مواعيد الصالون',
      outputListLabel: 'مخرجات التطبيق الناتجة عن مثال الوصف',
      demoLabel: 'عرض منتج تطبيق حجز مواعيد الصالون',
      ideProofLabel: 'لقطات حقيقية للإنشاء والتصحيح داخل بيئة E-Code',
      deliverablesLabel: 'العناصر المسلّمة مع تطبيق الأعمال المُنشأ',
      featuresLabel: 'وظائف منشئ تطبيقات الأعمال',
      useCasesLabel: 'حالات استخدام تطبيقات الأعمال',
      faqLabel: 'الأسئلة الشائعة حول بناء تطبيق أعمال',
      finalCtaLabel: 'ابدأ بناء تطبيق أعمال',
    },
  },
} as const satisfies Record<SupportedLanguage, AppBuilderCopy>;
