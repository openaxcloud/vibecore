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
        'Describe PeopleOps. E-Code generates local procedure search with cited answers in editable source; identity, private data, and permissions require testing.',
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
      brand: 'PeopleOps',
      brandType: 'Local HR search demo',
      nav: ['Search', 'History', 'Feedback'],
      eyebrow: 'Fictional local policy library',
      title: 'Find the annual-leave procedure and keep its citation visible.',
      intro:
        'A responsive PeopleOps scenario with deterministic answers, cited procedure cards, search history, and feedback controls. Every procedure stays in fictional local fixtures.',
      primaryHeading: 'Fictional procedure cards',
      primaryRows: [
        { label: 'Annual leave policy', meta: 'Local procedure · HR-04', status: 'Suggested query' },
        { label: 'Remote work policy', meta: 'Local procedure · HR-11' },
        { label: 'Expense policy', meta: 'Local procedure · FIN-02' },
      ],
      asideHeading: 'Visible boundaries',
      asideRows: [
        { label: 'Policy library', value: 'Local fixtures' },
        { label: 'Permissions', value: 'UI demo only' },
        { label: 'Answer path', value: 'Deterministic' },
      ],
      asideCta: 'Open annual-leave result',
      disclaimer:
        'Scripted local interface · fictional HR procedures · no authentication, RAG, SSO, external document connection, or production deployment · not a generation record',
      caption: {
        title: 'A procedure-search scenario with the source boundary in plain sight',
        body: 'This local interface demonstrates a suggested query, cited procedure result, history, and feedback state without presenting fictional fixtures as a connected company corpus.',
      },
      alt: 'Scripted PeopleOps interface with fictional local HR procedure cards, an annual-leave query, a cited HR-04 result, and demo-only permissions.',
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
        'The request below states the starting need. The captured Agent prompt scopes it as PeopleOps with a fictional local library and explicit demo-permission limits before E-Code creates the editable React and TypeScript files and running Webview.',
      label: 'Example prompt',
      promptText: 'Build an internal agent that searches our HR procedures, available only to my teams.',
      outputs: [
        {
          title: 'PeopleOps search workspace',
          body: 'The Agent creates the responsive search interface in editable React and TypeScript files, with suggested procedure questions and a conversation result area.',
        },
        {
          title: 'Cited local procedure cards',
          body: 'Fictional policies live in local fixtures and appear as cited cards. No company document source, vector store, or retrieval pipeline is connected.',
        },
        {
          title: 'History, feedback, and demo permissions',
          body: 'The project renders search history, a feedback control, and permissions as interface states. Those states do not enforce identity, team access, or SSO.',
        },
        {
          title: 'A verifiable Webview interaction',
          body: 'Clicking “Annual leave policy” in Webview reveals the deterministic HR-04 answer and its feedback control beside the generated files. The interaction proves the local UI path, not private retrieval.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'PeopleOps prompt → Agent → HR-04 in Webview',
      title: 'Inspect the PeopleOps procedure search generated inside E-Code',
      body: 'These dedicated captures keep the HR search prompt, Agent activity, generated React and TypeScript project tree, and the PeopleOps Webview together. The second state opens the “Annual leave policy” result and cites local procedure HR-04.',
      galleryLabel: 'Captured PeopleOps generation and annual-leave procedure interaction inside E-Code',
      disclaimer:
        'Captured E-Code generation · fictional local HR library and deterministic answers · permissions are an interface demo · no authentication, RAG, SSO, external documents, enforced team access, or production deployment is demonstrated',
      openFullSizeLabel: 'Open the PeopleOps capture at full size',
      preview: {
        title: 'PeopleOps runs beside the files the Agent created',
        body: 'The first capture shows the real E-Code Agent exchange and generated project tree while Webview renders PeopleOps with suggested questions, cited local procedures, search history, and the local-library disclosure.',
        alt: 'Real E-Code Internal AI Builder workspace showing the PeopleOps prompt, Agent activity, generated React and TypeScript files, and the fictional local HR search interface in Webview.',
      },
      iteration: {
        title: 'One click opens the cited HR-04 answer',
        body: 'The follow-up capture keeps the Agent’s iteration beside Webview after “Annual leave policy” is selected. The deterministic answer cites HR-04 and exposes a feedback control; it does not prove a private corpus, RAG, authentication, or enforced permissions.',
        alt: 'Real E-Code Internal AI Builder iteration showing generated PeopleOps files and the Annual leave policy interaction with a cited HR-04 result and feedback control in Webview.',
      },
      cta: {
        label: 'Inspect the captured PeopleOps run',
        ariaLabel: 'Inspect the captured E-Code PeopleOps generation and HR-04 Webview interaction',
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
        'Décrivez PeopleOps. E-Code génère une recherche locale de procédures avec réponses citées ; identité, sources privées et droits exigent connexion et tests.',
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
      brand: 'PeopleOps',
      brandType: 'Démo locale de recherche RH',
      nav: ['Recherche', 'Historique', 'Feedback'],
      eyebrow: 'Bibliothèque locale fictive',
      title: 'Trouvez la politique de congés annuels et gardez sa citation visible.',
      intro:
        'Un scénario PeopleOps responsive avec réponses déterministes, cartes de procédures citées, historique et contrôles de feedback. Chaque procédure reste une fixture locale fictive.',
      primaryHeading: 'Cartes de procédures fictives',
      primaryRows: [
        { label: 'Politique de congés annuels', meta: 'Procédure locale · RH-04', status: 'Question suggérée' },
        { label: 'Politique de télétravail', meta: 'Procédure locale · RH-11' },
        { label: 'Politique de dépenses', meta: 'Procédure locale · FIN-02' },
      ],
      asideHeading: 'Limites visibles',
      asideRows: [
        { label: 'Bibliothèque', value: 'Fixtures locales' },
        { label: 'Permissions', value: 'Démo UI seule' },
        { label: 'Réponse', value: 'Déterministe' },
      ],
      asideCta: 'Ouvrir le résultat congés',
      disclaimer:
        'Interface locale scénarisée · procédures RH fictives · aucune authentification, RAG, SSO, connexion documentaire externe ni production · pas une trace de génération',
      caption: {
        title: 'Un scénario de recherche dont la frontière documentaire reste explicite',
        body: 'Cette interface locale présente une question suggérée, un résultat cité, un historique et un feedback sans faire passer les fixtures fictives pour un corpus d’entreprise connecté.',
      },
      alt: 'Interface PeopleOps scénarisée avec cartes de procédures RH locales fictives, question sur les congés annuels, résultat RH-04 cité et permissions de démonstration.',
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
        'La demande ci-dessous pose le besoin initial. Le prompt Agent capturé le cadre comme PeopleOps avec une bibliothèque locale fictive et des permissions limitées à la démo, avant la création des fichiers React et TypeScript modifiables et de la Webview active.',
      label: 'Exemple de prompt',
      promptText: 'Un agent interne qui cherche dans nos procédures RH, réservé à mes équipes.',
      outputs: [
        {
          title: 'Espace de recherche PeopleOps',
          body: 'L’Agent crée l’interface de recherche responsive dans des fichiers React et TypeScript modifiables, avec questions suggérées et zone de résultat conversationnelle.',
        },
        {
          title: 'Cartes de procédures locales citées',
          body: 'Des politiques fictives vivent dans des fixtures locales et apparaissent en cartes citées. Aucune source documentaire d’entreprise, base vectorielle ni chaîne de récupération n’est connectée.',
        },
        {
          title: 'Historique, feedback et permissions de démo',
          body: 'Le projet affiche un historique, un contrôle de feedback et des permissions comme états d’interface. Ces états n’appliquent ni identité, ni accès d’équipe, ni SSO.',
        },
        {
          title: 'Interaction vérifiable dans la Webview',
          body: 'Le clic sur « Politique de congés annuels » affiche la réponse déterministe RH-04 et son contrôle de feedback à côté des fichiers générés. L’interaction prouve le parcours UI local, pas une recherche privée.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt PeopleOps → Agent → RH-04 dans la Webview',
      title: 'Inspectez la recherche de procédures PeopleOps générée dans E-Code',
      body: 'Ces captures dédiées réunissent le prompt RH, l’activité de l’Agent, l’arborescence React et TypeScript générée et la Webview PeopleOps. Le second état ouvre « Politique de congés annuels » et cite la procédure locale RH-04.',
      galleryLabel: 'Génération PeopleOps capturée et interaction sur la procédure de congés dans E-Code',
      disclaimer:
        'Génération E-Code capturée · bibliothèque RH locale fictive et réponses déterministes · permissions en démo d’interface · aucune authentification, RAG, SSO, source externe, restriction d’équipe appliquée ni production démontrée',
      openFullSizeLabel: 'Ouvrir la capture PeopleOps en grand',
      preview: {
        title: 'PeopleOps tourne à côté des fichiers créés par l’Agent',
        body: 'La première capture montre le vrai échange avec l’Agent et l’arborescence générée pendant que la Webview affiche PeopleOps, ses questions suggérées, procédures locales citées, historique et avertissement sur la bibliothèque locale.',
        alt: 'Vrai workspace Internal AI Builder E-Code montrant le prompt PeopleOps, l’activité de l’Agent, les fichiers React et TypeScript générés et la recherche RH locale fictive dans la Webview.',
      },
      iteration: {
        title: 'Un clic ouvre la réponse RH-04 citée',
        body: 'La capture de suivi conserve l’itération de l’Agent à côté de la Webview après le clic sur « Politique de congés annuels ». La réponse déterministe cite RH-04 et affiche un feedback ; elle ne prouve ni corpus privé, ni RAG, ni authentification, ni permissions appliquées.',
        alt: 'Vraie itération Internal AI Builder E-Code montrant les fichiers PeopleOps générés et l’interaction Politique de congés annuels avec résultat RH-04 cité et feedback dans la Webview.',
      },
      cta: {
        label: 'Inspecter le run PeopleOps capturé',
        ariaLabel: 'Inspecter la génération PeopleOps capturée dans E-Code et l’interaction RH-04 dans la Webview',
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
