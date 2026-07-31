import type { SolutionCopyByLanguage } from './solution-copy';

/**
 * SOL — Internal AI Builder. Declined from the App Builder gabarit, centered on a
 * fictional private HR procedures assistant. All demo data is fictional and
 * labeled; the one real captured E-Code IDE proof lives on /solutions/app-builder.
 */
export const INTERNAL_AI_BUILDER_COPY = {
  en: {
    seo: {
      title: 'Internal AI Builder with Real Code | E-Code',
      description:
        'Describe the internal assistant your team needs. E-Code turns it into a private AI tool in editable source files, with secure project context, approval routing, and enterprise observability — running in Preview and exportable as code you own.',
    },
    hero: {
      eyebrow: 'Internal AI Builder for private team tools',
      title: 'Bring a private AI assistant to your team, in code you own',
      subtitle:
        'Describe the internal workflow you want to automate — answering policy questions, routing approvals, surfacing procedures. E-Code turns it into a private AI tool in editable source code, wired to your project context. Inspect every file, run it in Preview, refine it through the Agent, and keep governance and audit visible throughout.',
      primaryCta: { label: 'Describe your assistant', ariaLabel: 'Describe your internal AI assistant with E-Code' },
      secondaryCta: {
        label: 'See how it builds',
        ariaLabel: 'See how E-Code builds the internal assistant from a prompt',
      },
      microcopy:
        'Start from the internal task your team repeats every week. Source files, the running Preview, and access controls stay visible as the tool evolves.',
    },
    languageSwitch: { label: 'Choose the Internal AI Builder page language', english: 'English', french: 'Français' },
    demo: {
      badge: 'Fictional demo data',
      brand: 'PeopleOps Assistant',
      brandType: 'Internal HR tool',
      nav: ['Ask', 'Approvals', 'Audit'],
      eyebrow: 'Private workspace',
      title: 'Answer HR policy questions and route approvals in one place.',
      intro:
        'A private internal assistant that answers procedure questions and moves approval requests to the right owner.',
      primaryHeading: 'Recent requests',
      primaryRows: [
        { label: 'Parental leave — policy', meta: 'M. Dubois · Sales', status: 'Approved' },
        { label: 'Remote work — exception', meta: 'A. Laurent · Support' },
        { label: 'Expense limit — clarification', meta: 'S. Moreau · Finance' },
      ],
      asideHeading: 'Governance',
      asideRows: [
        { label: 'Access', value: 'Role-based' },
        { label: 'Audit log', value: 'On' },
        { label: 'Data', value: 'Private only' },
      ],
      asideCta: 'Open audit trail',
      disclaimer: 'Inline responsive demonstration · fictional HR data · not a generation record',
      caption: {
        title: 'A private assistant that reads like a real internal tool',
        body: 'This inline demonstration shows a request list, an approvals view, and a governance panel in one responsive layout.',
      },
      alt: 'Internal HR assistant demonstration with a recent requests list and a governance panel showing access, audit, and data controls.',
    },
    problem: {
      eyebrow: 'From scattered procedures to a governed internal tool',
      title: 'Internal AI looks easy until private context, access, and audit get real',
      intro:
        'A team wants an assistant that answers from its own procedures and routes work to the right owner. Generic chatbots ignore private context, off-the-shelf tools hold your data on their terms, and neither gives you the access controls and audit trail an internal tool needs.',
      obstacles: [
        {
          title: 'Generic assistants ignore your context',
          body: 'A public model answers from the open web, not your procedures, so its answers drift from how your team actually works.',
        },
        {
          title: 'Off-the-shelf tools own your data',
          body: 'Internal documents flow into a vendor platform on its terms, and you inherit its access model rather than defining your own.',
        },
        {
          title: 'Governance is an afterthought',
          body: 'Access control, approval routing, and an audit trail get bolted on late, if at all, and the underlying logic is rarely yours to inspect.',
        },
      ],
      bridge:
        'E-Code starts from the workflow you describe and produces a private assistant in real source files, wired to your project context. You inspect the logic, run it in Preview, and keep access and audit visible as the tool evolves.',
    },
    build: {
      eyebrow: 'One prompt starts the assistant',
      title: 'Describe the workflow, not the plumbing',
      intro:
        'The request below reads like a note from an operations lead. The four items map its implementation scope in real source files, with governance in view from the start.',
      label: 'Example prompt',
      promptText:
        'Build an internal assistant that answers HR policy questions and routes approval requests, using our private procedures.',
      outputs: [
        {
          title: 'Private context grounding',
          body: 'The assistant is wired to answer from your own procedures as project context, so responses reflect your team, not the open web.',
        },
        {
          title: 'Approval routing',
          body: 'Requests are modeled with owners, states, and a routing path, so an approval moves to the right person rather than stalling.',
        },
        {
          title: 'Access and audit',
          body: 'Role-based access and an audit log are modeled into the tool, so who can ask, approve, and read stays governed and traceable.',
        },
        {
          title: 'Preview and export',
          body: 'E-Code runs the assistant in Preview across screen sizes. The project stays exportable as source you host under your own controls.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt → agent → Preview',
      title: 'Want to see a real E-Code build end to end?',
      body: 'The App Builder page shows a captured, real E-Code workspace — the prompt, the agent’s plan, the generated files, and the running Preview — for a booking application. The same build loop applies to an internal tool like this one.',
      cta: { label: 'See the real IDE proof', ariaLabel: 'See the real E-Code IDE proof on the App Builder page' },
    },
    deliverables: {
      eyebrow: 'What you receive',
      title: 'A private assistant you own and keep evolving',
      intro:
        'The project stays inspectable from the first generated file through Preview and export. Access, routing, and audit are modeled in code you can read, not hidden behind a vendor console.',
      items: [
        {
          title: 'Editable source files',
          body: 'Real components, routes, logic, and content you can read, version, and change directly.',
        },
        {
          title: 'Private context wiring',
          body: 'The assistant is grounded in your procedures as project context, editable as code.',
        },
        {
          title: 'Approval workflows',
          body: 'Requests, owners, and states modeled so approvals route to the right person.',
        },
        {
          title: 'Role-based access',
          body: 'Who can ask, approve, and read is modeled into the tool, not bolted on later.',
        },
        { title: 'Audit trail', body: 'An audit log models a traceable record of requests, answers, and approvals.' },
        {
          title: 'Agent-ready iteration',
          body: 'Ask the Agent for the next change and review the diff against the running tool.',
        },
      ],
    },
    features: {
      eyebrow: 'Built for private internal tools',
      title: 'Everything an internal assistant needs, in code you control',
      intro:
        'The Internal AI Builder path keeps private context, governance, and iteration in one inspectable workflow.',
      items: [
        {
          title: 'Procedure-grounded answers',
          body: 'Responses draw on your own procedures as project context, not the open web.',
        },
        { title: 'Approval routing', body: 'Requests move through owners and states to the right decision-maker.' },
        { title: 'Role-based access', body: 'Define who can ask, approve, and read, as logic you can inspect.' },
        { title: 'Audit observability', body: 'An audit log models a traceable record of activity across the tool.' },
        {
          title: 'Responsive by default',
          body: 'The interface adapts from wide desktop to phone without a separate mobile build.',
        },
        {
          title: 'Own the code',
          body: 'Export the project and host it under your own controls — the source stays yours.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Who builds with it',
      title: 'Internal tools teams ship with the Internal AI Builder',
      intro: 'From an HR procedures assistant to an internal help desk, the same loop produces a real, governed tool.',
      items: [
        {
          title: 'HR procedures assistant',
          body: 'Answer policy questions and route leave, exception, and approval requests.',
        },
        {
          title: 'Internal help desk',
          body: 'Surface IT, finance, and operations procedures with routing to the right owner.',
        },
        {
          title: 'Onboarding and knowledge tools',
          body: 'Guide new hires through processes grounded in your internal documentation.',
        },
        {
          title: 'Approval and request flows',
          body: 'Model structured request paths with owners, states, and an audit trail.',
        },
      ],
    },
    faq: {
      eyebrow: 'Common questions',
      title: 'Internal AI Builder, answered honestly',
      intro: 'What the Internal AI Builder path produces, and where its boundaries are.',
      items: [
        {
          title: 'Do I get real code or a locked platform?',
          body: 'You get editable source files — components, routes, logic, and content — that you can read, version, and export. There is no proprietary platform lock-in.',
        },
        {
          title: 'How does it use our private procedures?',
          body: 'The generated assistant is wired to answer from your procedures as project context, editable as code. The inline demonstration on this page uses fictional data and no connected data source.',
        },
        {
          title: 'Can I control access and see an audit trail?',
          body: 'Role-based access and an audit log are modeled into the generated tool as logic you can inspect and extend. You define and host the controls yourself.',
        },
        {
          title: 'Is my data private?',
          body: 'The project is code you host under your own controls, so private data stays where you put it. E-Code does not claim any specific compliance certification for your deployment.',
        },
        {
          title: 'How do I change the assistant later?',
          body: 'Edit the files directly or ask the Agent for the next change and review the diff against the running Preview.',
        },
      ],
    },
    finalCta: {
      title: 'Describe your assistant and see it running',
      body: 'Turn the internal workflow you have in mind into a private AI tool in real source code, run it in Preview, and keep access and audit in view.',
      primaryCta: { label: 'Describe your assistant', ariaLabel: 'Describe your internal AI assistant with E-Code' },
      secondaryCta: {
        label: 'See how it builds',
        ariaLabel: 'See how E-Code builds the internal assistant from a prompt',
      },
    },
    aria: {
      pageLabel: 'Internal AI Builder solution page',
      heroLabel: 'Internal AI Builder introduction',
      demoLabel: 'Internal AI Builder product demonstration',
      problemLabel: 'The internal AI tooling problem',
      buildLabel: 'How the Internal AI Builder works',
      outputListLabel: 'Internal assistant build outputs',
      proofLinkLabel: 'See the real E-Code IDE proof',
      deliverablesLabel: 'What the Internal AI Builder delivers',
      featuresLabel: 'Internal AI Builder capabilities',
      useCasesLabel: 'Internal AI Builder use cases',
      faqLabel: 'Internal AI Builder questions',
      finalCtaLabel: 'Start building your internal assistant',
    },
  },
  fr: {
    seo: {
      title: 'Générateur d’IA interne avec vrai code | E-Code',
      description:
        'Décrivez l’assistant interne dont votre équipe a besoin. E-Code le transforme en un outil d’IA privé dans des fichiers source modifiables, avec un contexte projet sécurisé, l’acheminement des approbations et l’observabilité d’entreprise — exécuté dans l’aperçu et exportable comme un code que vous possédez.',
    },
    hero: {
      eyebrow: 'Générateur d’IA interne pour des outils d’équipe privés',
      title: 'Offrez à votre équipe un assistant IA privé, dans un code que vous possédez',
      subtitle:
        'Décrivez le flux interne que vous voulez automatiser — répondre aux questions de politique, acheminer les approbations, faire remonter les procédures. E-Code en fait un outil d’IA privé dans un vrai code source modifiable, câblé à votre contexte projet. Inspectez chaque fichier, exécutez-le dans l’aperçu, affinez-le avec l’Agent et gardez la gouvernance et l’audit visibles de bout en bout.',
      primaryCta: { label: 'Décrivez votre assistant', ariaLabel: 'Décrivez votre assistant IA interne avec E-Code' },
      secondaryCta: {
        label: 'Voir la construction',
        ariaLabel: 'Voir comment E-Code construit l’assistant interne à partir d’un prompt',
      },
      microcopy:
        'Partez de la tâche interne que votre équipe répète chaque semaine. Les fichiers source, l’aperçu actif et les contrôles d’accès restent visibles à mesure que l’outil évolue.',
    },
    languageSwitch: {
      label: 'Choisir la langue de la page Générateur d’IA interne',
      english: 'English',
      french: 'Français',
    },
    demo: {
      badge: 'Données fictives',
      brand: 'PeopleOps Assistant',
      brandType: 'Outil RH interne',
      nav: ['Demander', 'Approbations', 'Audit'],
      eyebrow: 'Espace privé',
      title: 'Répondez aux questions de politique RH et acheminez les approbations au même endroit.',
      intro:
        'Un assistant interne privé qui répond aux questions de procédure et achemine les demandes d’approbation vers le bon responsable.',
      primaryHeading: 'Demandes récentes',
      primaryRows: [
        { label: 'Congé parental — politique', meta: 'M. Dubois · Ventes', status: 'Approuvé' },
        { label: 'Télétravail — exception', meta: 'A. Laurent · Support' },
        { label: 'Plafond de dépenses — clarification', meta: 'S. Moreau · Finance' },
      ],
      asideHeading: 'Gouvernance',
      asideRows: [
        { label: 'Accès', value: 'Par rôle' },
        { label: 'Journal d’audit', value: 'Activé' },
        { label: 'Données', value: 'Privées uniquement' },
      ],
      asideCta: 'Ouvrir le journal d’audit',
      disclaimer: 'Démonstration responsive intégrée · données RH fictives · pas une trace de génération',
      caption: {
        title: 'Un assistant privé qui se lit comme un vrai outil interne',
        body: 'Cette démonstration intégrée présente une liste de demandes, une vue des approbations et un panneau de gouvernance dans une mise en page responsive.',
      },
      alt: 'Démonstration d’assistant RH interne avec une liste de demandes récentes et un panneau de gouvernance affichant les contrôles d’accès, d’audit et de données.',
    },
    problem: {
      eyebrow: 'Des procédures éparses à un outil interne gouverné',
      title: 'L’IA interne paraît simple jusqu’à ce que le contexte privé, l’accès et l’audit deviennent réels',
      intro:
        'Une équipe veut un assistant qui répond à partir de ses propres procédures et achemine le travail au bon responsable. Les chatbots génériques ignorent le contexte privé, les outils clés en main gardent vos données à leurs conditions, et aucun n’offre les contrôles d’accès et la traçabilité qu’un outil interne exige.',
      obstacles: [
        {
          title: 'Les assistants génériques ignorent votre contexte',
          body: 'Un modèle public répond à partir du web ouvert, pas de vos procédures, et ses réponses s’éloignent de la façon dont votre équipe travaille réellement.',
        },
        {
          title: 'Les outils clés en main possèdent vos données',
          body: 'Les documents internes partent dans une plateforme éditeur à ses conditions, et vous héritez de son modèle d’accès au lieu de définir le vôtre.',
        },
        {
          title: 'La gouvernance passe après',
          body: 'Contrôle d’accès, acheminement des approbations et journal d’audit s’ajoutent tard, s’ils s’ajoutent, et la logique sous-jacente est rarement la vôtre à inspecter.',
        },
      ],
      bridge:
        'E-Code part du flux que vous décrivez et produit un assistant privé dans de vrais fichiers source, câblé à votre contexte projet. Vous inspectez la logique, l’exécutez dans l’aperçu et gardez l’accès et l’audit visibles à mesure que l’outil évolue.',
    },
    build: {
      eyebrow: 'Un prompt lance l’assistant',
      title: 'Décrivez le flux, pas la tuyauterie',
      intro:
        'La demande ci-dessous se lit comme un mot d’un responsable des opérations. Les quatre éléments cartographient son périmètre d’implémentation dans de vrais fichiers source, avec la gouvernance en vue dès le départ.',
      label: 'Exemple de prompt',
      promptText:
        'Construis un assistant interne qui répond aux questions de politique RH et achemine les demandes d’approbation, à partir de nos procédures privées.',
      outputs: [
        {
          title: 'Ancrage au contexte privé',
          body: 'L’assistant est câblé pour répondre à partir de vos propres procédures comme contexte projet, pour des réponses qui reflètent votre équipe, pas le web ouvert.',
        },
        {
          title: 'Acheminement des approbations',
          body: 'Les demandes sont modélisées avec des responsables, des états et un parcours d’acheminement, pour qu’une approbation aille à la bonne personne plutôt que de stagner.',
        },
        {
          title: 'Accès et audit',
          body: 'Un accès par rôle et un journal d’audit sont modélisés dans l’outil, pour que qui peut demander, approuver et lire reste gouverné et traçable.',
        },
        {
          title: 'Aperçu et export',
          body: 'E-Code exécute l’assistant dans l’aperçu à toutes les tailles d’écran. Le projet reste exportable comme une source que vous hébergez sous vos propres contrôles.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt → agent → aperçu',
      title: 'Envie de voir une vraie génération E-Code de bout en bout ?',
      body: 'La page App Builder montre un vrai workspace E-Code capturé — le prompt, le plan de l’agent, les fichiers générés et l’aperçu actif — pour une application de réservation. La même boucle de construction s’applique à un outil interne comme celui-ci.',
      cta: {
        label: 'Voir la preuve IDE réelle',
        ariaLabel: 'Voir la preuve IDE réelle E-Code sur la page App Builder',
      },
    },
    deliverables: {
      eyebrow: 'Ce que vous recevez',
      title: 'Un assistant privé que vous possédez et faites évoluer',
      intro:
        'Le projet reste inspectable du premier fichier généré jusqu’à l’aperçu et l’export. Accès, acheminement et audit sont modélisés dans un code que vous lisez, pas cachés derrière une console éditeur.',
      items: [
        {
          title: 'Fichiers source modifiables',
          body: 'De vrais composants, routes, logiques et contenus que vous lisez, versionnez et modifiez directement.',
        },
        {
          title: 'Câblage du contexte privé',
          body: 'L’assistant est ancré dans vos procédures comme contexte projet, modifiable comme du code.',
        },
        {
          title: 'Flux d’approbation',
          body: 'Demandes, responsables et états modélisés pour que les approbations aillent à la bonne personne.',
        },
        {
          title: 'Accès par rôle',
          body: 'Qui peut demander, approuver et lire est modélisé dans l’outil, pas ajouté après coup.',
        },
        {
          title: 'Journal d’audit',
          body: 'Un journal d’audit modélise un enregistrement traçable des demandes, réponses et approbations.',
        },
        {
          title: 'Itération avec l’Agent',
          body: 'Demandez le changement suivant à l’Agent et relisez le diff face à l’outil actif.',
        },
      ],
    },
    features: {
      eyebrow: 'Pensé pour des outils internes privés',
      title: 'Tout ce dont un assistant interne a besoin, dans un code que vous maîtrisez',
      intro:
        'Le parcours Générateur d’IA interne garde le contexte privé, la gouvernance et l’itération dans un seul flux inspectable.',
      items: [
        {
          title: 'Réponses ancrées aux procédures',
          body: 'Les réponses s’appuient sur vos propres procédures comme contexte projet, pas sur le web ouvert.',
        },
        {
          title: 'Acheminement des approbations',
          body: 'Les demandes passent par des responsables et des états jusqu’au bon décideur.',
        },
        {
          title: 'Accès par rôle',
          body: 'Définissez qui peut demander, approuver et lire, comme une logique que vous inspectez.',
        },
        {
          title: 'Observabilité d’audit',
          body: 'Un journal d’audit modélise un enregistrement traçable de l’activité dans tout l’outil.',
        },
        {
          title: 'Responsive par défaut',
          body: 'L’interface s’adapte du grand écran au téléphone sans build mobile séparé.',
        },
        {
          title: 'Possédez le code',
          body: 'Exportez le projet et hébergez-le sous vos propres contrôles — la source reste la vôtre.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Qui construit avec',
      title: 'Les outils internes que les équipes livrent avec le Générateur d’IA interne',
      intro: 'D’un assistant de procédures RH à un help desk interne, la même boucle produit un vrai outil gouverné.',
      items: [
        {
          title: 'Assistant de procédures RH',
          body: 'Répondez aux questions de politique et acheminez les demandes de congé, d’exception et d’approbation.',
        },
        {
          title: 'Help desk interne',
          body: 'Faites remonter les procédures IT, finance et opérations avec acheminement vers le bon responsable.',
        },
        {
          title: 'Outils d’onboarding et de savoir',
          body: 'Guidez les nouvelles recrues à travers des processus ancrés dans votre documentation interne.',
        },
        {
          title: 'Flux d’approbation et de demande',
          body: 'Modélisez des parcours de demande structurés avec responsables, états et journal d’audit.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions fréquentes',
      title: 'Le Générateur d’IA interne, en toute honnêteté',
      intro: 'Ce que produit le parcours Générateur d’IA interne, et où sont ses limites.',
      items: [
        {
          title: 'J’obtiens du vrai code ou une plateforme verrouillée ?',
          body: 'Vous obtenez des fichiers source modifiables — composants, routes, logique et contenu — que vous lisez, versionnez et exportez. Aucun verrouillage propriétaire.',
        },
        {
          title: 'Comment utilise-t-il nos procédures privées ?',
          body: 'L’assistant généré est câblé pour répondre à partir de vos procédures comme contexte projet, modifiable comme du code. La démonstration intégrée de cette page utilise des données fictives et aucune source de données connectée.',
        },
        {
          title: 'Puis-je contrôler l’accès et voir un journal d’audit ?',
          body: 'Un accès par rôle et un journal d’audit sont modélisés dans l’outil généré comme une logique que vous inspectez et étendez. Vous définissez et hébergez les contrôles vous-même.',
        },
        {
          title: 'Mes données sont-elles privées ?',
          body: 'Le projet est un code que vous hébergez sous vos propres contrôles, donc les données privées restent où vous les placez. E-Code ne revendique aucune certification de conformité spécifique pour votre déploiement.',
        },
        {
          title: 'Comment modifier l’assistant ensuite ?',
          body: 'Modifiez les fichiers directement ou demandez le changement suivant à l’Agent et relisez le diff face à l’aperçu actif.',
        },
      ],
    },
    finalCta: {
      title: 'Décrivez votre assistant et voyez-le tourner',
      body: 'Transformez le flux interne que vous avez en tête en un outil d’IA privé dans du vrai code source, exécutez-le dans l’aperçu et gardez l’accès et l’audit en vue.',
      primaryCta: { label: 'Décrivez votre assistant', ariaLabel: 'Décrivez votre assistant IA interne avec E-Code' },
      secondaryCta: {
        label: 'Voir la construction',
        ariaLabel: 'Voir comment E-Code construit l’assistant interne à partir d’un prompt',
      },
    },
    aria: {
      pageLabel: 'Page solution Générateur d’IA interne',
      heroLabel: 'Introduction du Générateur d’IA interne',
      demoLabel: 'Démonstration produit du Générateur d’IA interne',
      problemLabel: 'Le problème de l’outillage IA interne',
      buildLabel: 'Comment fonctionne le Générateur d’IA interne',
      outputListLabel: 'Résultats de la génération de l’assistant interne',
      proofLinkLabel: 'Voir la preuve IDE réelle E-Code',
      deliverablesLabel: 'Ce que livre le Générateur d’IA interne',
      featuresLabel: 'Capacités du Générateur d’IA interne',
      useCasesLabel: 'Cas d’usage du Générateur d’IA interne',
      faqLabel: 'Questions sur le Générateur d’IA interne',
      finalCtaLabel: 'Commencer à construire votre assistant interne',
    },
  },
} as const satisfies SolutionCopyByLanguage;
