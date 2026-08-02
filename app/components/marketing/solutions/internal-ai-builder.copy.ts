import type { SolutionCopyByLanguage } from './solution-copy';

/**
 * SOL — Internal AI Builder. Dedicated HR-procedure assistant story in EN and
 * FR. All procedures and employee details are fictional and labeled; proof claims
 * stop at the captured Agent exchange, generated files, Webview, and local search.
 */
export const INTERNAL_AI_BUILDER_COPY = {
  en: {
    seo: {
      title: 'Internal AI Builder with Real Code | E-Code',
      description:
        'Describe the internal assistant your team needs. E-Code creates an editable project that models procedure sources, approval states, access rules, and audit events. Connect identity and private data, then complete security testing before deployment.',
    },
    hero: {
      eyebrow: 'Internal AI Builder for private team tools',
      title: 'Structure an internal assistant before you connect private company data',
      subtitle:
        'Describe the internal workflow you want to automate — policy questions, approval routing, procedure lookup. E-Code turns that scope into editable source code with source adapters, roles, states, and audit-event models you can inspect. Run the interface in Preview, then connect identity, storage, private procedures, and review every control before rollout.',
      primaryCta: { label: 'Describe your assistant', ariaLabel: 'Describe your internal AI assistant with E-Code' },
      secondaryCta: {
        label: 'See how it builds',
        ariaLabel: 'See how E-Code builds the internal assistant from a prompt',
      },
      microcopy:
        'Start from the internal task your team repeats every week. Source files, the running interface, and proposed access rules remain visible while the tool evolves.',
    },
    languageSwitch: { label: 'Choose the Internal AI Builder page language', english: 'English', french: 'Français' },
    demo: {
      badge: 'Fictional demo data',
      brand: 'PeopleOps Assistant',
      brandType: 'Scripted HR interface',
      nav: ['Ask', 'Approvals', 'Audit'],
      eyebrow: 'Local procedure demo',
      title: 'Review a policy-search and approval interface before connecting internal systems.',
      intro:
        'A local interface that demonstrates procedure answers and approval states with fictional fixtures; no employee identity, private corpus, or workflow engine is connected.',
      primaryHeading: 'Fictional request states',
      primaryRows: [
        { label: 'Parental leave — policy', meta: 'Sample requester · Sales', status: 'UI: approved' },
        { label: 'Remote work — exception', meta: 'Sample requester · Support' },
        { label: 'Expense limit — clarification', meta: 'Sample requester · Finance' },
      ],
      asideHeading: 'Governance placeholders',
      asideRows: [
        { label: 'Access controls', value: 'UI concept' },
        { label: 'Audit view', value: 'Sample entries' },
        { label: 'Procedure data', value: 'Local fixtures' },
      ],
      asideCta: 'Review sample audit view',
      disclaimer:
        'Scripted local interface · fictional HR requests and controls · no authentication, private corpus, approval workflow, or audit service · not a generation record',
      caption: {
        title: 'An internal-tool scenario with explicit identity and data boundaries',
        body: 'This local interface demonstrates a request list, approval-state UI, and governance panel without claiming real access enforcement or workflow execution.',
      },
      alt: 'Scripted local HR-assistant interface with fictional requests and sample access, audit, and data control labels.',
    },
    problem: {
      eyebrow: 'From scattered procedures to a governed internal tool',
      title: 'Internal AI looks easy until private context, access, and audit get real',
      intro:
        'A team wants an assistant that uses its procedures and routes work to the right owner. A generic chat surface does not automatically connect trusted internal sources, enforce company identity, or create the durable audit record an internal tool needs.',
      obstacles: [
        {
          title: 'Generic assistants ignore your context',
          body: 'Without an explicit, tested source connection, a model does not know which approved procedure applies and may answer outside the company’s operating rules.',
        },
        {
          title: 'Hosted tools impose their data path',
          body: 'A vendor platform brings its own storage, retention, and access model. Security teams still need to verify where documents go and who can retrieve them.',
        },
        {
          title: 'Governance is an afterthought',
          body: 'Access control, approval routing, and an audit trail get bolted on late, if at all, and the underlying logic is rarely yours to inspect.',
        },
      ],
      bridge:
        'E-Code starts from the workflow you describe and creates an internal-assistant project in real source files. You inspect the modeled source, access, routing, and audit paths in Preview, then connect the systems and enforce the controls required by your environment.',
    },
    build: {
      eyebrow: 'One prompt starts the assistant',
      title: 'Describe the workflow, not the plumbing',
      intro:
        'The request below reads like a note from an operations lead. The four items map its implementation scope in real source files, with governance in view from the start.',
      label: 'Example prompt',
      promptText: 'Build an internal agent that searches our HR procedures, available only to my teams.',
      outputs: [
        {
          title: 'Private context grounding',
          body: 'A source-adapter boundary models where approved procedures enter the assistant. Your documents are not connected by this page; choose the source, permissions, and retrieval checks before use.',
        },
        {
          title: 'Approval routing',
          body: 'Requests are modeled with owners, states, and a routing path. Connect persistence and notifications, then test reassignment, retries, and failure handling.',
        },
        {
          title: 'Access and audit',
          body: 'Role checks and audit events are represented in source code for review. They are not proof of enforced authentication, immutable logging, or authorization coverage.',
        },
        {
          title: 'Preview and export',
          body: 'E-Code runs the project interface in Preview across screen sizes and keeps the source exportable. Preview does not certify a private or production-ready deployment.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'HR workflow → Agent → internal-tool Webview',
      title: 'Inspect the procedure assistant generated inside E-Code',
      body: 'These dedicated captures show the HR-procedure prompt, the Agent exchange, the generated search and workflow files, and the internal-assistant interface running in Webview with fictional local procedures.',
      galleryLabel: 'Captured HR-assistant generation and local procedure search inside E-Code',
      disclaimer:
        'Captured E-Code generation · fictional HR procedures and requests · local sample search only · no private document source, RAG pipeline, authentication, enforced roles, immutable audit log, or production deployment is demonstrated',
      openFullSizeLabel: 'Open the HR-assistant capture at full size',
      preview: {
        title: 'Procedure search runs beside the generated workflow files',
        body: 'The first capture keeps the operations brief and Agent activity visible while Webview renders the PeopleOps search, sample procedure cards, and request-routing interface from local fictional data.',
        alt: 'Real E-Code Internal AI Builder workspace showing an HR-procedure prompt, Agent activity, generated workflow files, and a PeopleOps procedure-search interface running in Webview.',
      },
      iteration: {
        title: 'A local procedure query exposes the result state',
        body: 'The follow-up capture shows the next instruction beside updated local search results and their generated source. It proves the interface interaction and Agent iteration, not access enforcement, private retrieval, or audit integrity.',
        alt: 'Real E-Code Internal AI Builder iteration showing a follow-up prompt, generated HR-assistant files, and updated local procedure-search results in Webview.',
      },
      cta: {
        label: 'Inspect the captured HR-assistant run',
        ariaLabel: 'Inspect the captured E-Code HR-assistant generation and local procedure search',
      },
    },
    deliverables: {
      eyebrow: 'What you receive',
      title: 'A traceable internal-tool project with honest deployment boundaries',
      intro:
        'The generated project exposes its source, procedure-adapter seam, responsive workspace, and release options. A static review surface can publish through E-Code; private data operations still belong in a separately secured runtime.',
      items: [
        {
          title: 'Reviewable, portable project files',
          body: 'Components, routes, workflow state, and policy structures remain readable and exportable for your repository and review process.',
        },
        {
          title: 'Procedure adapter in plain sight',
          body: 'The connection seam for approved procedures is visible in the source. Add the real store only after defining permissions and validating retrieval against your own documents.',
        },
        {
          title: 'Responsive workspace running in Preview',
          body: 'Review request and policy screens across mobile, tablet, and desktop. Preview demonstrates the interface, not connected private documents, company authentication, or enforced authorization.',
        },
        {
          title: 'Guided release for supported static builds',
          body: 'E-Code guides publishing when the generated internal-tool surface is a supported static build. That path does not turn modeled data or security rules into running backend services.',
        },
        {
          title: 'E-Code URL for static review',
          body: 'Put a compatible static review surface on an E-Code live URL. Any private lookup, approval write, identity check, or durable event requires the exported code and a backend runtime deployed under the required controls.',
        },
        {
          title: 'Agent conversation as the change loop',
          body: 'Describe the next policy or workflow adjustment, review the affected source files, and verify the updated interface in Preview before advancing.',
        },
      ],
    },
    features: {
      eyebrow: 'Built for private internal tools',
      title: 'The internal workflow in code, with security work kept explicit',
      intro:
        'The Internal AI Builder path keeps source boundaries, governance rules, and iteration visible without claiming that a Preview supplies production security.',
      items: [
        {
          title: 'Procedure-grounded answers',
          body: 'A retrieval boundary identifies the connection point for approved procedures; grounding quality still requires evaluation against your corpus.',
        },
        {
          title: 'Approval routing',
          body: 'Owners and states express the intended path; persistence, notifications, and failure recovery remain integrations to test.',
        },
        {
          title: 'Access-rule scaffolding',
          body: 'Define who may ask, approve, and read as inspectable policy logic, then enforce it through real authentication and server checks.',
        },
        {
          title: 'Audit event scaffolding',
          body: 'Model the events that matter, then route them to tamper-resistant storage with the retention and access rules your organization requires.',
        },
        {
          title: 'Responsive by default',
          body: 'The interface adapts from wide desktop to phone without a separate mobile build.',
        },
        {
          title: 'Exportable source',
          body: 'Export the project for your chosen hosting path, then apply your organization’s deployment, privacy, and security controls.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Who builds with it',
      title: 'Four internal workflows to structure before rollout',
      intro:
        'From HR procedure search to request intake, these scenarios define inspectable starting points; governance becomes real only after identity, data, audit, and security validation.',
      items: [
        {
          title: 'HR procedures assistant',
          body: 'Model policy-search results and leave, exception, and approval routes before connecting the private corpus and workflow engine.',
        },
        {
          title: 'Internal help desk',
          body: 'Structure IT, finance, and operations procedure views with an explicit, still-unconnected owner-routing boundary.',
        },
        {
          title: 'Onboarding and knowledge tools',
          body: 'Build the guided process interface, then connect approved documentation and validate access before employee use.',
        },
        {
          title: 'Approval and request flows',
          body: 'Model request paths, owners, states, and audit-event shapes without presenting them as persisted or enforced.',
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
          body: 'You get editable source files for components, routes, policy logic, and content that you can read, version, and export. Connected models, identity providers, data stores, and hosts keep their own terms and constraints.',
        },
        {
          title: 'How does it use our private procedures?',
          body: 'The project can model an adapter for procedure retrieval, but this page connects no documents, model, or data source. You choose the corpus and provider, restrict access, and evaluate retrieval and answers before employees use it.',
        },
        {
          title: 'Can I control access and see an audit trail?',
          body: 'The project can model roles, policy checks, and audit events as inspectable code. That is scaffolding, not enforced authentication or an immutable audit trail; connect the required services and test every server-side authorization path.',
        },
        {
          title: 'Is my data private?',
          body: 'Not by default. Privacy depends on the model, storage, identity, logging, network, and hosting choices in your deployment. The page demo contains only fictional data, and E-Code does not claim a compliance certification for your resulting system.',
        },
        {
          title: 'How do I change the assistant later?',
          body: 'Edit the files directly or ask the Agent for the next change and review the diff against the running Preview.',
        },
      ],
    },
    finalCta: {
      title: 'Describe your assistant and see it running',
      body: 'Turn the internal workflow you have in mind into an editable project, run its interface in Preview, and inspect source, access rules, and audit events before connecting private data or rolling it out.',
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
        'Décrivez l’assistant interne attendu. E-Code crée un projet modifiable qui modélise les sources de procédures, les états d’approbation, les règles d’accès et les événements d’audit. Connectez l’identité et les données privées, puis terminez les tests de sécurité avant déploiement.',
    },
    hero: {
      eyebrow: 'Générateur d’IA interne pour des outils d’équipe privés',
      title: 'Structurez un assistant interne avant de brancher les données privées de l’entreprise',
      subtitle:
        'Décrivez le flux interne à automatiser — questions de politique, approbations, recherche de procédures. E-Code transforme ce périmètre en code source modifiable avec adaptateurs de sources, rôles, états et modèles d’événements d’audit. Exécutez l’interface dans l’aperçu, puis branchez identité, stockage et procédures privées, et relisez chaque contrôle avant le déploiement.',
      primaryCta: { label: 'Décrivez votre assistant', ariaLabel: 'Décrivez votre assistant IA interne avec E-Code' },
      secondaryCta: {
        label: 'Voir la construction',
        ariaLabel: 'Voir comment E-Code construit l’assistant interne à partir d’un prompt',
      },
      microcopy:
        'Partez de la tâche interne répétée chaque semaine. Les fichiers source, l’interface active et les règles d’accès proposées restent visibles à mesure que l’outil évolue.',
    },
    languageSwitch: {
      label: 'Choisir la langue de la page Générateur d’IA interne',
      english: 'English',
      french: 'Français',
    },
    demo: {
      badge: 'Données fictives',
      brand: 'PeopleOps Assistant',
      brandType: 'Interface RH scénarisée',
      nav: ['Demander', 'Approbations', 'Audit'],
      eyebrow: 'Démo locale de procédures',
      title: 'Relisez une interface de recherche et d’approbation avant de connecter les systèmes internes.',
      intro:
        'Une interface locale qui démontre des réponses de procédure et des états d’approbation sur des fixtures fictives ; aucune identité employé, corpus privé ni moteur de workflow connecté.',
      primaryHeading: 'États de demandes fictifs',
      primaryRows: [
        { label: 'Congé parental — politique', meta: 'Demandeur fictif · Ventes', status: 'UI : approuvé' },
        { label: 'Télétravail — exception', meta: 'Demandeur fictif · Support' },
        { label: 'Plafond de dépenses — clarification', meta: 'Demandeur fictif · Finance' },
      ],
      asideHeading: 'Repères de gouvernance',
      asideRows: [
        { label: 'Contrôles d’accès', value: 'Concept UI' },
        { label: 'Vue d’audit', value: 'Entrées d’exemple' },
        { label: 'Données procédure', value: 'Fixtures locales' },
      ],
      asideCta: 'Relire la vue d’audit d’exemple',
      disclaimer:
        'Interface locale scénarisée · demandes et contrôles RH fictifs · aucune authentification, corpus privé, approbation ni service d’audit · pas une trace de génération',
      caption: {
        title: 'Un scénario d’outil interne aux frontières d’identité et de données explicites',
        body: 'Cette interface locale présente une liste de demandes, des états visuels d’approbation et un panneau de gouvernance sans prétendre appliquer des accès ni exécuter un workflow réel.',
      },
      alt: 'Interface locale scénarisée d’assistant RH avec demandes fictives et libellés d’exemple pour les contrôles d’accès, d’audit et de données.',
    },
    problem: {
      eyebrow: 'Des procédures éparses à un outil interne gouverné',
      title: 'L’IA interne paraît simple jusqu’à ce que le contexte privé, l’accès et l’audit deviennent réels',
      intro:
        'Une équipe veut un assistant qui utilise ses procédures et achemine le travail au bon responsable. Une interface de chat générique ne connecte pas automatiquement des sources internes fiables, n’applique pas l’identité de l’entreprise et ne crée pas le journal durable qu’un outil interne exige.',
      obstacles: [
        {
          title: 'Les assistants génériques ignorent votre contexte',
          body: 'Sans connexion aux sources explicite et testée, un modèle ignore quelle procédure approuvée s’applique et peut répondre hors des règles opérationnelles de l’entreprise.',
        },
        {
          title: 'Les outils hébergés imposent leur chemin de données',
          body: 'Une plateforme éditeur apporte son propre stockage, sa rétention et son modèle d’accès. L’équipe sécurité doit toujours vérifier où vont les documents et qui peut les récupérer.',
        },
        {
          title: 'La gouvernance passe après',
          body: 'Contrôle d’accès, acheminement des approbations et journal d’audit s’ajoutent tard, s’ils s’ajoutent, et la logique sous-jacente est rarement la vôtre à inspecter.',
        },
      ],
      bridge:
        'E-Code part du flux décrit et crée un projet d’assistant interne dans de vrais fichiers source. Vous inspectez les chemins modélisés de sources, d’accès, d’acheminement et d’audit dans l’aperçu, puis branchez les systèmes et appliquez les contrôles requis par votre environnement.',
    },
    build: {
      eyebrow: 'Un prompt lance l’assistant',
      title: 'Décrivez le flux, pas la tuyauterie',
      intro:
        'La demande ci-dessous se lit comme un mot d’un responsable des opérations. Les quatre éléments cartographient son périmètre d’implémentation dans de vrais fichiers source, avec la gouvernance en vue dès le départ.',
      label: 'Exemple de prompt',
      promptText: 'Un agent interne qui cherche dans nos procédures RH, réservé à mes équipes.',
      outputs: [
        {
          title: 'Ancrage au contexte privé',
          body: 'Une frontière d’adaptateur modélise l’entrée des procédures approuvées dans l’assistant. Cette page ne connecte pas vos documents : choisissez la source, les permissions et les vérifications de récupération avant usage.',
        },
        {
          title: 'Acheminement des approbations',
          body: 'Les demandes sont modélisées avec responsables, états et parcours. Branchez la persistance et les notifications, puis testez réattribution, reprises et gestion des échecs.',
        },
        {
          title: 'Accès et audit',
          body: 'Les contrôles de rôle et événements d’audit sont représentés dans le code source pour relecture. Ils ne prouvent ni authentification appliquée, ni journal immuable, ni couverture complète des autorisations.',
        },
        {
          title: 'Aperçu et export',
          body: 'E-Code exécute l’interface du projet dans l’aperçu à toutes les tailles d’écran et garde la source exportable. L’aperçu ne certifie ni confidentialité ni aptitude à la production.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Workflow RH → Agent → Webview de l’outil interne',
      title: 'Inspectez l’assistant de procédures généré dans E-Code',
      body: 'Ces captures dédiées montrent le prompt sur les procédures RH, l’échange avec l’Agent, les fichiers de recherche et de workflow générés et l’interface de l’assistant interne active dans la Webview avec des procédures locales fictives.',
      galleryLabel: 'Génération capturée de l’assistant RH et recherche locale dans E-Code',
      disclaimer:
        'Génération E-Code capturée · procédures et demandes RH fictives · recherche locale d’exemple uniquement · aucune source documentaire privée, pipeline RAG, authentification, rôle appliqué, piste d’audit immuable ni production démontré',
      openFullSizeLabel: 'Ouvrir la capture de l’assistant RH en grand',
      preview: {
        title: 'La recherche de procédures tourne à côté des fichiers du workflow',
        body: 'La première capture conserve le brief des opérations et l’activité de l’Agent pendant que la Webview affiche la recherche PeopleOps, des fiches de procédure d’exemple et le parcours des demandes à partir de données locales fictives.',
        alt: 'Vrai workspace Internal AI Builder E-Code montrant un prompt de procédures RH, l’activité de l’Agent, les fichiers de workflow générés et une interface de recherche PeopleOps active dans la Webview.',
      },
      iteration: {
        title: 'Une requête locale expose l’état des résultats',
        body: 'La capture de suivi montre l’instruction suivante auprès des résultats locaux mis à jour et de leur source générée. Elle prouve l’interaction de l’interface et l’itération de l’Agent, pas l’application des accès, la recherche privée ni l’intégrité d’un audit.',
        alt: 'Vraie itération Internal AI Builder E-Code montrant un prompt de suivi, les fichiers de l’assistant RH et des résultats locaux de procédure mis à jour dans la Webview.',
      },
      cta: {
        label: 'Inspecter le run capturé de l’assistant RH',
        ariaLabel: 'Inspecter la génération E-Code capturée de l’assistant RH et sa recherche locale de procédures',
      },
    },
    deliverables: {
      eyebrow: 'Ce que vous recevez',
      title: 'Un projet d’outil interne traçable, avec des limites de déploiement franches',
      intro:
        'Le projet généré expose sa source, la jonction vers les procédures, l’espace responsive et ses options de mise en ligne. Une surface statique de revue se publie via E-Code ; les opérations sur données privées restent dans un runtime sécurisé séparément.',
      items: [
        {
          title: 'Fichiers de projet relisibles et transportables',
          body: 'Composants, routes, états de flux et structures de politique restent lisibles et exportables vers votre dépôt et votre processus de revue.',
        },
        {
          title: 'Adaptateur de procédures visible dans la source',
          body: 'La jonction vers les procédures approuvées apparaît dans le code. Ajoutez le vrai stockage seulement après avoir défini les permissions et validé la récupération sur vos documents.',
        },
        {
          title: 'Espace responsive actif dans l’aperçu',
          body: 'Examinez les écrans de demande et de politique sur mobile, tablette et desktop. L’aperçu démontre l’interface, pas des documents privés connectés, l’authentification d’entreprise ni des autorisations appliquées.',
        },
        {
          title: 'Mise en ligne guidée pour les builds statiques compatibles',
          body: 'E-Code accompagne la publication lorsque la surface générée de l’outil interne constitue un build statique pris en charge. Ce parcours ne transforme pas les données ou règles de sécurité modélisées en services backend actifs.',
        },
        {
          title: 'URL E-Code consacrée à la revue statique',
          body: 'Placez une surface statique compatible sur une URL E-Code active. Recherche privée, écriture d’approbation, contrôle d’identité et événement durable exigent le code exporté et un runtime backend déployé avec les contrôles requis.',
        },
        {
          title: 'Conversation avec l’Agent comme boucle de changement',
          body: 'Décrivez l’ajustement suivant de politique ou de flux, relisez les fichiers source concernés et vérifiez l’interface actualisée dans l’aperçu avant d’avancer.',
        },
      ],
    },
    features: {
      eyebrow: 'Pensé pour des outils internes privés',
      title: 'Le flux interne dans le code, avec le travail de sécurité explicite',
      intro:
        'Le parcours Générateur d’IA interne garde frontières de sources, règles de gouvernance et itération visibles, sans prétendre qu’un aperçu fournit la sécurité de production.',
      items: [
        {
          title: 'Réponses ancrées aux procédures',
          body: 'Une frontière de récupération indique où brancher les procédures approuvées ; la qualité de l’ancrage reste à évaluer sur votre corpus.',
        },
        {
          title: 'Acheminement des approbations',
          body: 'Responsables et états expriment le chemin prévu ; persistance, notifications et reprise sur erreur restent des intégrations à tester.',
        },
        {
          title: 'Structure des règles d’accès',
          body: 'Définissez qui peut demander, approuver et lire dans une logique inspectable, puis appliquez-la avec une vraie authentification et des contrôles serveur.',
        },
        {
          title: 'Structure des événements d’audit',
          body: 'Modélisez les événements utiles, puis acheminez-les vers un stockage résistant à l’altération avec la rétention et les accès exigés par votre organisation.',
        },
        {
          title: 'Responsive par défaut',
          body: 'L’interface s’adapte du grand écran au téléphone sans build mobile séparé.',
        },
        {
          title: 'Source exportable',
          body: 'Exportez le projet vers l’hébergement choisi, puis appliquez les contrôles de déploiement, de confidentialité et de sécurité de votre organisation.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Qui construit avec',
      title: 'Quatre flux internes à structurer avant le déploiement aux équipes',
      intro:
        'De la recherche de procédures RH à la saisie de demandes, ces scénarios fournissent des bases inspectables ; la gouvernance devient réelle après validation de l’identité, des données, de l’audit et de la sécurité.',
      items: [
        {
          title: 'Assistant de procédures RH',
          body: 'Modélisez les résultats de recherche et les parcours de congé, d’exception et d’approbation avant de brancher le corpus privé et le moteur de workflow.',
        },
        {
          title: 'Help desk interne',
          body: 'Structurez les vues de procédures IT, finance et opérations avec une frontière explicite, encore non connectée, vers le bon responsable.',
        },
        {
          title: 'Outils d’onboarding et de savoir',
          body: 'Construisez l’interface guidée, puis branchez la documentation approuvée et validez les accès avant tout usage employé.',
        },
        {
          title: 'Flux d’approbation et de demande',
          body: 'Modélisez parcours, responsables, états et formes d’événements d’audit sans les présenter comme persistés ou appliqués.',
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
          body: 'Vous obtenez des fichiers source modifiables pour les composants, routes, règles et contenus, que vous lisez, versionnez et exportez. Les modèles, fournisseurs d’identité, bases et hébergeurs connectés conservent leurs propres conditions et contraintes.',
        },
        {
          title: 'Comment utilise-t-il nos procédures privées ?',
          body: 'Le projet peut modéliser un adaptateur de recherche dans les procédures, mais cette page ne connecte ni documents, ni modèle, ni source de données. Vous choisissez corpus et fournisseur, limitez les accès, puis évaluez récupération et réponses avant usage par les équipes.',
        },
        {
          title: 'Puis-je contrôler l’accès et voir un journal d’audit ?',
          body: 'Le projet peut modéliser rôles, contrôles de politique et événements d’audit dans du code inspectable. Il s’agit d’une structure, pas d’une authentification appliquée ni d’un journal immuable : branchez les services requis et testez chaque autorisation côté serveur.',
        },
        {
          title: 'Mes données sont-elles privées ?',
          body: 'Pas par défaut. La confidentialité dépend du modèle, du stockage, de l’identité, des journaux, du réseau et de l’hébergement choisis. La démo de cette page contient seulement des données fictives et E-Code ne revendique aucune certification pour le système obtenu.',
        },
        {
          title: 'Comment modifier l’assistant ensuite ?',
          body: 'Modifiez les fichiers directement ou demandez le changement suivant à l’Agent et relisez le diff face à l’aperçu actif.',
        },
      ],
    },
    finalCta: {
      title: 'Décrivez votre assistant et voyez-le tourner',
      body: 'Transformez le flux interne envisagé en un projet modifiable, exécutez son interface dans l’aperçu et inspectez sources, règles d’accès et événements d’audit avant de connecter des données privées ou de le déployer aux équipes.',
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
