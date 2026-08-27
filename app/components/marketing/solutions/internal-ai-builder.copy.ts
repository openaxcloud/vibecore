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
      eyebrow: 'Prompt → agent → Preview',
      title: 'Use a documented E-Code run as workflow evidence, not as an internal-security claim',
      body: 'These IDE captures belong to the real App Builder salon-booking run. They show a prompt, Agent activity, generated files, Preview, and a correction cycle inside E-Code. The PeopleOps Assistant shown above is a scripted, fictional interface and was not captured from an internal-AI generation.',
      galleryLabel: 'Documented App Builder salon workspace used as Internal AI Builder workflow evidence',
      disclaimer:
        'Workflow reference from the real E-Code salon run · salon records fictional · PeopleOps scenario and HR records fictional · not an internal-agent generation record · no private source or identity provider demonstrated',
      openFullSizeLabel: 'Inspect the full-size salon workflow capture',
      preview: {
        title: 'The real workspace keeps the request, files, and running app in view',
        body: 'This salon App Builder capture verifies the E-Code workspace and its generated booking Preview. It does not demonstrate an HR assistant, a private-document connection, authentication, role enforcement, or a production audit store.',
        alt: 'Documented E-Code App Builder salon workspace with the booking request, generated files, and application Preview; it provides no evidence of private HR data or access controls.',
      },
      iteration: {
        title: 'The captured run also records a runtime correction',
        body: 'A second App Builder image shows the Agent receiving a router-error follow-up beside the salon project. That is evidence of an inspectable repair loop, not evidence that the fictional PeopleOps access and audit flows were generated or security-tested.',
        alt: 'Documented E-Code salon-run correction with a router-error follow-up, project files, and booking Preview; no internal AI security flow is depicted.',
      },
      cta: { label: 'See the real IDE proof', ariaLabel: 'See the real E-Code IDE proof on the App Builder page' },
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
      disclaimer: 'Démonstration adaptative intégrée · données RH fictives · pas une trace de génération',
      caption: {
        title: 'Un assistant privé qui se lit comme un vrai outil interne',
        body: 'Cette démonstration intégrée présente une liste de demandes, une vue des approbations et un panneau de gouvernance dans une mise en page adaptative.',
      },
      alt: 'Démonstration d’assistant RH interne avec une liste de demandes récentes et un panneau de gouvernance affichant les contrôles d’accès, d’audit et de données.',
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
          body: 'Une frontière d’adaptateur modélise l’entrée des procédures approuvées dans l’assistant. Cette page ne connecte pas vos documents : choisissez la source, les autorisations et les vérifications de récupération avant usage.',
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
      eyebrow: 'Prompt → agent → aperçu',
      title: 'Prenez un run E-Code documenté comme preuve du flux, pas comme promesse de sécurité interne',
      body: 'Ces captures IDE appartiennent au véritable run Générateur d’applications de réservation du salon. Elles montrent dans E-Code un prompt, l’activité de l’Agent, les fichiers générés, l’aperçu et un cycle de correction. PeopleOps Assistant ci-dessus reste une interface scénarisée et fictive, non capturée lors d’une génération d’IA interne.',
      galleryLabel:
        'Espace de travail salon Générateur d’applications documenté, utilisé comme preuve du flux Générateur d’IA interne',
      disclaimer:
        'Référence tirée du vrai run salon E-Code · données salon fictives · scénario PeopleOps et données RH fictifs · pas une trace de génération d’agent interne · aucune source privée ni fournisseur d’identité démontré',
      openFullSizeLabel: 'Examiner la capture complète du flux salon',
      preview: {
        title: 'Le vrai espace de travail garde demande, fichiers et application active dans la même vue',
        body: 'Cette capture salon Générateur d’applications vérifie l’espace E-Code et son aperçu de réservation généré. Elle ne démontre ni assistant RH, ni connexion à des documents privés, ni authentification, ni application des rôles, ni stockage d’audit de production.',
        alt: 'Espace de travail salon E-Code Générateur d’applications documenté avec la demande de réservation, les fichiers générés et l’aperçu de l’application ; aucune donnée RH privée ni contrôle d’accès n’y est prouvé.',
      },
      iteration: {
        title: 'Le run capturé consigne aussi une correction d’exécution',
        body: 'Une seconde image Générateur d’applications montre l’Agent recevant un suivi d’erreur de routeur auprès du projet salon. Elle prouve une boucle de réparation inspectable, pas la génération ni les tests de sécurité des flux fictifs d’accès et d’audit PeopleOps.',
        alt: 'Correction documentée du run salon E-Code avec suivi d’erreur de routeur, fichiers du projet et aperçu de réservation ; aucun flux de sécurité IA interne n’est représenté.',
      },
      cta: {
        label: 'Voir la preuve IDE réelle',
        ariaLabel: 'Voir la preuve IDE réelle E-Code sur la page Générateur d’applications',
      },
    },
    deliverables: {
      eyebrow: 'Ce que vous recevez',
      title: 'Un projet d’outil interne traçable, avec des limites de déploiement franches',
      intro:
        'Le projet généré expose sa source, la jonction vers les procédures, l’espace adaptatif et ses options de mise en ligne. Une surface statique de revue se publie via E-Code ; les opérations sur données privées restent dans un environnement d’exécution sécurisé séparément.',
      items: [
        {
          title: 'Fichiers de projet relisibles et transportables',
          body: 'Composants, routes, états de flux et structures de politique restent lisibles et exportables vers votre dépôt et votre processus de revue.',
        },
        {
          title: 'Adaptateur de procédures visible dans la source',
          body: 'La jonction vers les procédures approuvées apparaît dans le code. Ajoutez le vrai stockage seulement après avoir défini les autorisations et validé la récupération sur vos documents.',
        },
        {
          title: 'Espace adaptatif actif dans l’aperçu',
          body: 'Examinez les écrans de demande et de politique sur mobile, tablette et desktop. L’aperçu démontre l’interface, pas des documents privés connectés, l’authentification d’entreprise ni des autorisations appliquées.',
        },
        {
          title: 'Mise en ligne guidée pour les compilations statiques compatibles',
          body: 'E-Code accompagne la publication lorsque la surface générée de l’outil interne constitue une compilation statique prise en charge. Ce parcours ne transforme pas les données ou règles de sécurité modélisées en services service applicatif actifs.',
        },
        {
          title: 'URL E-Code consacrée à la revue statique',
          body: 'Placez une surface statique compatible sur une URL E-Code active. Recherche privée, écriture d’approbation, contrôle d’identité et événement durable exigent le code exporté et un environnement d’exécution serveur déployé avec les contrôles requis.',
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
          title: 'Adaptatif par défaut',
          body: 'L’interface s’adapte du grand écran au téléphone sans compilation mobile séparée.',
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
          body: 'Répondez aux questions de politique et acheminez les demandes de congé, d’exception et d’approbation.',
        },
        {
          title: 'Help desk interne',
          body: 'Faites remonter les procédures IT, finance et opérations avec acheminement vers le bon responsable.',
        },
        {
          title: 'Outils de prise en main et de savoir',
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
