import type { SolutionCopyByLanguage } from './solution-copy';

/**
 * SOL — Chatbot / AI Agent Builder. Declined from the App Builder gabarit,
 * centered on a fictional documentation support assistant. All demo data is
 * fictional and labeled; the one real captured E-Code IDE proof lives on
 * /solutions/app-builder.
 */
export const CHATBOT_BUILDER_COPY = {
  en: {
    seo: {
      title: 'Chatbot & AI Agent Builder with Real Code | E-Code',
      description:
        'Describe the support assistant you need. E-Code creates an editable agent project with reviewable prompts, tool boundaries, source adapters, and handoff logic. Connect and test your own model, documentation, and support destination before launch.',
    },
    hero: {
      eyebrow: 'Chatbot & AI Agent Builder for real assistants',
      title: 'Shape a support assistant you can inspect before it answers customers',
      subtitle:
        'Describe how the assistant answers, which sources it may use, and when it hands off. E-Code structures that behavior in editable source code with prompts, tool contracts, a documentation adapter, and escalation states. Run the interface in Preview, inspect every file, then connect and test the model and services you choose.',
      primaryCta: { label: 'Describe your assistant', ariaLabel: 'Describe your chatbot with E-Code' },
      secondaryCta: { label: 'See how it builds', ariaLabel: 'See how E-Code builds the assistant from a prompt' },
      microcopy:
        'Start from the questions your team already answers. Prompts, tool contracts, modeled conversation state, and the running interface remain visible while you iterate.',
    },
    languageSwitch: { label: 'Choose the Chatbot Builder page language', english: 'English', french: 'Français' },
    demo: {
      badge: 'Fictional demo data',
      brand: 'HelpDesk Copilot',
      brandType: 'Support assistant',
      nav: ['Chat', 'Sources', 'Handoff'],
      eyebrow: 'Live conversation',
      title: 'Assistant replies with sources',
      intro:
        'A support assistant that answers from documentation, cites what it used, and escalates to a human when confidence is low.',
      primaryHeading: 'Assistant replies with sources',
      primaryRows: [
        { label: 'Your plan renews on the 1st of each month.', meta: 'cited: billing.md' },
        { label: 'Reset your API key from Settings → Security.', meta: 'cited: api-keys.md' },
        { label: 'I’m not fully sure — connecting you to an agent.', meta: 'confidence: low', status: 'Handoff' },
      ],
      asideHeading: 'Answer sources',
      asideRows: [
        { label: 'Documents', value: '128' },
        { label: 'Confidence', value: 'High' },
        { label: 'Escalations today', value: '4' },
      ],
      asideCta: 'Escalate to agent',
      disclaimer: 'Inline responsive demonstration · fictional assistant data · not a generation record',
      caption: {
        title: 'A support assistant that reads like a real product',
        body: 'This inline demonstration shows a conversation thread with cited answers, a handoff on low confidence, and an answer-sources panel in one responsive layout.',
      },
      alt: 'Support assistant demonstration with a conversation thread citing documentation and an answer-sources panel.',
    },
    problem: {
      eyebrow: 'From an opaque bot to an assistant you can audit',
      title: 'Chatbot builders feel magical until you need to know why it answered that',
      intro:
        'A support team needs an assistant that answers from its own documentation, shows its sources, and knows when to escalate. Closed builders hide the prompt, the tools, and the memory, so nobody can review the boundaries or reproduce a bad answer.',
      obstacles: [
        {
          title: 'The prompt and tools are hidden',
          body: 'A locked builder decides how the assistant reasons and what it can call, and the team cannot read, version, or constrain that logic.',
        },
        {
          title: 'Answers drift from the sources',
          body: 'Without a reviewable knowledge base and citations, the bot invents confident answers and there is no way to trace them back to a document.',
        },
        {
          title: 'No boundary between help and harm',
          body: 'When the assistant is unsure, it should hand off to a human — but closed tools rarely let you define, audit, or test that escalation.',
        },
      ],
      bridge:
        'E-Code starts from the assistant you describe and lays out its prompt, tool contracts, conversation state, and escalation branches in real source files. You inspect the project, run its interface in Preview, and request the next change without hiding the behavior in a closed builder.',
    },
    build: {
      eyebrow: 'One prompt starts the assistant',
      title: 'Describe the behavior, not the framework',
      intro:
        'The request below reads like a note from a support lead. The four items map its implementation scope in real source files, not a locked bot builder.',
      label: 'Example prompt',
      promptText: 'Build an assistant that answers my customers’ questions from my documentation.',
      outputs: [
        {
          title: 'Reviewable prompt and tools',
          body: 'The system prompt, the tools the assistant may call, and their boundaries live in editable files the team can read and constrain.',
        },
        {
          title: 'Knowledge base answers',
          body: 'A documentation adapter and citation UI model how answers map to sources. You still connect the real corpus and model, then test retrieval quality and citation accuracy.',
        },
        {
          title: 'Human handoff on low confidence',
          body: 'A routing branch models low-confidence and out-of-scope handoff. Connect it to the support destination your team uses and test that no conversation is lost.',
        },
        {
          title: 'Preview and audit boundaries',
          body: 'E-Code runs the project interface in Preview across screen sizes. This verifies the generated surface and flow, not a live model, document connection, or production support integration.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt → agent → Preview',
      title: 'See the workflow in a real E-Code run, without pretending this chatbot was captured',
      body: 'The two IDE images below come from the real App Builder salon-booking run. They document the E-Code loop — prompt, Agent plan, generated files, Preview, then correction — while the HelpDesk Copilot above remains a separately authored scenario with fictional data.',
      galleryLabel: 'Real IDE reference from the App Builder salon run for the Chatbot Builder workflow',
      disclaimer:
        'Reference captures: real E-Code App Builder salon run · fictional salon records · chatbot demonstration scripted with fictional data · not a chatbot generation record',
      openFullSizeLabel: 'Open the App Builder IDE reference at full size',
      preview: {
        title: 'A real prompt, generated file tree, and Preview shown together',
        body: 'This App Builder reference shows the salon prompt and generated booking project inside the real E-Code IDE. It proves the visible prompt-to-Preview workspace flow; it does not show a chatbot, a connected language model, document retrieval, or support handoff.',
        alt: 'Real E-Code App Builder IDE reference showing the salon booking prompt, generated project files, and booking dashboard in the Preview tab; no chatbot is shown.',
      },
      iteration: {
        title: 'A real correction request stays beside the running project',
        body: 'The second salon-run capture records a follow-up about a router runtime error and the updated booking Preview. It demonstrates visible Agent iteration, not a successful chatbot generation or a first-pass guarantee.',
        alt: 'Real E-Code App Builder iteration reference showing a router-error correction prompt beside salon project files and the booking Preview; this is not a chatbot generation.',
      },
      cta: { label: 'See the real IDE proof', ariaLabel: 'See the real E-Code IDE proof on the App Builder page' },
    },
    deliverables: {
      eyebrow: 'What you receive',
      title: 'A reviewable assistant project, from source to live static surface',
      intro:
        'Source, knowledge-adapter boundary, responsive Preview, and publishing path stay visible. Static interface builds follow E-Code’s supported publishing flow; a model-backed chatbot still needs its own connected services and runtime.',
      items: [
        {
          title: 'Source you can inspect and export',
          body: 'Prompts, conversation UI, state, and routing live in editable files you can review, version, and take outside E-Code.',
        },
        {
          title: 'Visible knowledge connection point',
          body: 'The documentation adapter and citation model remain explicit in code. No corpus or language model is attached by this page; connect yours and evaluate retrieval before use.',
        },
        {
          title: 'Running responsive Preview',
          body: 'Exercise the chat interface from phone to desktop in Preview. That confirms the rendered flow, not live document retrieval, model output, authentication, or support delivery.',
        },
        {
          title: 'Guided publishing for supported static builds',
          body: 'When the assistant surface qualifies as a supported static build, E-Code guides the build and publishing steps without presenting unconnected server behavior as deployed.',
        },
        {
          title: 'Live URL with a clear runtime boundary',
          body: 'Publish the supported static interface to an E-Code live URL. A chatbot that calls a model, reads documents, or stores conversations requires the exported project and an appropriate deployed backend runtime.',
        },
        {
          title: 'Iteration through the Agent conversation',
          body: 'Continue in plain language, inspect the resulting file changes, and rerun Preview after each adjustment to the assistant experience.',
        },
      ],
    },
    features: {
      eyebrow: 'Built for real assistants',
      title: 'Everything a support assistant needs, in code you control',
      intro: 'The Chatbot Builder path keeps prompt, tools, memory, and escalation in one inspectable workflow.',
      items: [
        {
          title: 'Answers from your docs',
          body: 'Start with a source-adapter contract and citation presentation, then connect your corpus and test every retrieval path.',
        },
        {
          title: 'Reviewable prompts',
          body: 'The system prompt and behavior rules live in editable files, not a locked builder.',
        },
        {
          title: 'Declared tools',
          body: 'Every tool the assistant may call is declared and bounded in code you can audit.',
        },
        {
          title: 'Memory you can inspect',
          body: 'Conversation state is modeled in the project so you can review what is retained and replace it with an appropriate store.',
        },
        {
          title: 'Human handoff',
          body: 'Define the branch for low-confidence or out-of-scope requests, then connect and test the real support queue.',
        },
        {
          title: 'Exportable project',
          body: 'Export the source files or keep building in E-Code; review the terms of every model and external service you add.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Who builds with it',
      title: 'Four support-assistant patterns to shape in editable code',
      intro:
        'These are practical starting points for an editable assistant project; each needs its own source connection, model evaluation, and operational testing.',
      items: [
        {
          title: 'Documentation support bots',
          body: 'Answer customer questions from product docs and escalate on low confidence.',
        },
        {
          title: 'Internal help desks',
          body: 'Assistants that answer IT, HR, or ops questions from internal knowledge bases.',
        },
        {
          title: 'Task and workflow agents',
          body: 'Agents that call bounded tools to complete steps and report back for review.',
        },
        {
          title: 'Onboarding assistants',
          body: 'Guided assistants that walk new users through setup with cited sources.',
        },
      ],
    },
    faq: {
      eyebrow: 'Common questions',
      title: 'Chatbot Builder, answered honestly',
      intro: 'What the Chatbot Builder path produces, and where its boundaries are.',
      items: [
        {
          title: 'Do I get real code or a locked bot builder?',
          body: 'You get editable source files for prompts, tools, state, and routing that you can read, version, and export. Any model, vector store, or support service you connect remains governed by that provider’s terms.',
        },
        {
          title: 'Does it answer from my own documentation?',
          body: 'The generated assistant is modeled to retrieve from a knowledge base and cite what it used. The inline demonstration on this page uses fictional data and no connected model or backend.',
        },
        {
          title: 'Can it hand off to a human?',
          body: 'The project can model escalation on low confidence or out-of-scope questions. A real handoff requires connecting your support destination and testing delivery, ownership, retries, and failure states.',
        },
        {
          title: 'Can I connect a real model or knowledge base?',
          body: 'The generated tools and knowledge model are code you can wire to your own model and sources. Nothing on this page is connected to a live model — the demo is fictional.',
        },
        {
          title: 'How do I change the assistant later?',
          body: 'Edit the prompt, tools, or rules directly, or ask the Agent for the next change and review the diff against the running Preview.',
        },
      ],
    },
    finalCta: {
      title: 'Describe your assistant and see it running',
      body: 'Turn the questions your team answers into an editable conversational project with reviewable prompts, tool contracts, state, and handoff logic. Preview the interface, then connect and test the external services it depends on.',
      primaryCta: { label: 'Describe your assistant', ariaLabel: 'Describe your chatbot with E-Code' },
      secondaryCta: { label: 'See how it builds', ariaLabel: 'See how E-Code builds the assistant from a prompt' },
    },
    aria: {
      pageLabel: 'Chatbot Builder solution page',
      heroLabel: 'Chatbot Builder introduction',
      demoLabel: 'Chatbot Builder product demonstration',
      problemLabel: 'The chatbot building problem',
      buildLabel: 'How the Chatbot Builder works',
      outputListLabel: 'Chatbot build outputs',
      proofLinkLabel: 'See the real E-Code IDE proof',
      deliverablesLabel: 'What the Chatbot Builder delivers',
      featuresLabel: 'Chatbot Builder capabilities',
      useCasesLabel: 'Chatbot Builder use cases',
      faqLabel: 'Chatbot Builder questions',
      finalCtaLabel: 'Start building your assistant',
    },
  },
  fr: {
    seo: {
      title: 'Générateur de chatbot et d’agent IA avec vrai code | E-Code',
      description:
        'Décrivez l’assistant de support recherché. E-Code crée un projet d’agent modifiable avec prompts, limites d’outils, adaptateurs de sources et logique de transfert relisibles. Connectez puis testez votre modèle, votre documentation et votre destination de support avant le lancement.',
    },
    hero: {
      eyebrow: 'Générateur de chatbot et d’agent IA pour de vrais assistants',
      title: 'Façonnez un assistant de support à relire avant qu’il réponde aux clients',
      subtitle:
        'Décrivez comment l’assistant répond, quelles sources il peut consulter et quand il transfère. E-Code structure ce comportement dans un code source modifiable avec prompts, contrats d’outils, adaptateur documentaire et états d’escalade. Exécutez l’interface dans l’aperçu, inspectez chaque fichier, puis branchez et testez le modèle et les services choisis.',
      primaryCta: { label: 'Décrivez votre assistant', ariaLabel: 'Décrivez votre chatbot avec E-Code' },
      secondaryCta: {
        label: 'Voir la construction',
        ariaLabel: 'Voir comment E-Code construit l’assistant à partir d’un prompt',
      },
      microcopy:
        'Partez des questions auxquelles votre équipe répond déjà. Prompts, contrats d’outils, état de conversation modélisé et interface active restent visibles pendant l’itération.',
    },
    languageSwitch: {
      label: 'Choisir la langue de la page Générateur de chatbot',
      english: 'English',
      french: 'Français',
    },
    demo: {
      badge: 'Données fictives',
      brand: 'HelpDesk Copilot',
      brandType: 'Assistant de support',
      nav: ['Conversation', 'Sources', 'Transfert'],
      eyebrow: 'Conversation en direct',
      title: 'L’assistant répond avec ses sources',
      intro:
        'Un assistant de support qui répond à partir de la documentation, cite ce qu’il a utilisé et escalade à un humain quand la confiance est faible.',
      primaryHeading: 'L’assistant répond avec ses sources',
      primaryRows: [
        { label: 'Votre offre se renouvelle le 1er de chaque mois.', meta: 'cité : billing.md' },
        { label: 'Réinitialisez votre clé API depuis Réglages → Sécurité.', meta: 'cité : api-keys.md' },
        {
          label: 'Je ne suis pas certain — je vous mets en relation avec un agent.',
          meta: 'confiance : faible',
          status: 'Transfert',
        },
      ],
      asideHeading: 'Sources de la réponse',
      asideRows: [
        { label: 'Documents', value: '128' },
        { label: 'Confiance', value: 'Élevée' },
        { label: 'Escalades aujourd’hui', value: '4' },
      ],
      asideCta: 'Escalader à un agent',
      disclaimer: 'Démonstration adaptative intégrée · données d’assistant fictives · pas une trace de génération',
      caption: {
        title: 'Un assistant de support qui se lit comme un vrai produit',
        body: 'Cette démonstration intégrée présente un fil de conversation avec des réponses citées, un transfert en cas de confiance faible et un panneau des sources de la réponse dans une mise en page adaptative.',
      },
      alt: 'Démonstration d’assistant de support avec un fil de conversation citant la documentation et un panneau des sources de la réponse.',
    },
    problem: {
      eyebrow: 'D’un bot opaque à un assistant que vous pouvez auditer',
      title: 'Les créateurs de chatbot semblent magiques jusqu’à ce qu’il faille savoir pourquoi il a répondu ça',
      intro:
        'Une équipe de support a besoin d’un assistant qui répond à partir de sa propre documentation, montre ses sources et sait quand escalader. Les créateurs fermés masquent le prompt, les outils et la mémoire, si bien que personne ne peut relire les limites ni reproduire une mauvaise réponse.',
      obstacles: [
        {
          title: 'Le prompt et les outils sont masqués',
          body: 'Un créateur verrouillé décide comment l’assistant raisonne et ce qu’il peut appeler, et l’équipe ne peut ni lire, ni versionner, ni contraindre cette logique.',
        },
        {
          title: 'Les réponses s’écartent des sources',
          body: 'Sans base de connaissances relisible ni citations, le bot invente des réponses assurées et rien ne permet de les retracer jusqu’à un document.',
        },
        {
          title: 'Aucune limite entre aide et dérapage',
          body: 'Quand l’assistant doute, il devrait transférer à un humain — mais les outils fermés permettent rarement de définir, auditer ou tester cette escalade.',
        },
      ],
      bridge:
        'E-Code part de l’assistant décrit et pose son prompt, ses contrats d’outils, son état de conversation et ses branches d’escalade dans de vrais fichiers source. Vous inspectez le projet, exécutez son interface dans l’aperçu et demandez le changement suivant sans masquer le comportement dans un créateur fermé.',
    },
    build: {
      eyebrow: 'Un prompt lance l’assistant',
      title: 'Décrivez le comportement, pas le framework',
      intro:
        'La demande ci-dessous se lit comme un mot d’un responsable support. Les quatre éléments cartographient son périmètre d’implémentation dans de vrais fichiers source, pas un créateur de bot verrouillé.',
      label: 'Exemple de prompt',
      promptText: 'Un assistant qui répond aux questions de mes clients à partir de ma documentation.',
      outputs: [
        {
          title: 'Prompt et outils relisibles',
          body: 'Le prompt système, les outils que l’assistant peut appeler et leurs limites vivent dans des fichiers modifiables que l’équipe peut lire et contraindre.',
        },
        {
          title: 'Réponses depuis la base de connaissances',
          body: 'Un adaptateur documentaire et une interface de citations modélisent le lien entre réponses et sources. Vous branchez encore le vrai corpus et le modèle, puis testez la qualité de récupération et l’exactitude des citations.',
        },
        {
          title: 'Transfert humain en cas de doute',
          body: 'Une branche de routage modélise le transfert quand la confiance est faible ou la question hors périmètre. Reliez-la à votre outil de support et vérifiez qu’aucune conversation ne se perd.',
        },
        {
          title: 'Aperçu et limites d’audit',
          body: 'E-Code exécute l’interface du projet dans l’aperçu à toutes les tailles d’écran. Cela vérifie la surface et le parcours générés, pas un modèle actif, une documentation connectée ni une intégration de support en production.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt → agent → aperçu',
      title: 'Observez le flux dans une vraie exécution E-Code, sans faire passer cette démo pour une capture',
      body: 'Les deux images IDE ci-dessous proviennent de la véritable exécution Générateur d’applications du salon de coiffure. Elles documentent la boucle E-Code — prompt, plan de l’Agent, fichiers générés, aperçu puis correction — tandis que HelpDesk Copilot reste un scénario créé séparément avec des données fictives.',
      galleryLabel:
        'Référence IDE réelle du run salon Générateur d’applications pour illustrer le flux Générateur de chatbot',
      disclaimer:
        'Captures de référence : vrai run salon dans E-Code Générateur d’applications · fiches salon fictives · démonstration chatbot scénarisée avec données fictives · pas une trace de génération chatbot',
      openFullSizeLabel: 'Ouvrir la référence IDE Générateur d’applications en taille réelle',
      preview: {
        title: 'Un vrai prompt, l’arborescence générée et l’aperçu réunis',
        body: 'Cette référence Générateur d’applications montre le prompt salon et le projet de réservation généré dans le véritable IDE E-Code. Elle prouve le flux visible du prompt vers l’aperçu ; elle ne montre ni chatbot, ni modèle de langage connecté, ni recherche documentaire, ni transfert au support.',
        alt: 'Référence IDE réelle E-Code Générateur d’applications montrant le prompt de réservation du salon, les fichiers générés et le tableau de bord dans l’onglet d’aperçu ; aucun chatbot n’est affiché.',
      },
      iteration: {
        title: 'Une vraie demande de correction reste visible auprès du projet actif',
        body: 'La seconde capture du run salon consigne le suivi d’une erreur d’exécution du routeur et l’aperçu de réservation mis à jour. Elle démontre l’itération visible avec l’Agent, pas la génération réussie d’un chatbot ni une garantie de réussite au premier essai.',
        alt: 'Référence d’itération E-Code réelle affichant une demande de correction d’erreur de routeur, les fichiers du projet salon et l’aperçu de réservation ; il ne s’agit pas d’une génération chatbot.',
      },
      cta: {
        label: 'Voir la preuve IDE réelle',
        ariaLabel: 'Voir la preuve IDE réelle E-Code sur la page Générateur d’applications',
      },
    },
    deliverables: {
      eyebrow: 'Ce que vous recevez',
      title: 'Un projet d’assistant relisible, du code jusqu’à l’interface statique en ligne',
      intro:
        'La source, la frontière de l’adaptateur documentaire, l’aperçu adaptatif et le chemin de publication restent visibles. Les interfaces statiques suivent la publication prise en charge par E-Code ; un chatbot relié à un modèle exige encore ses services et son environnement d’exécution.',
      items: [
        {
          title: 'Source ouverte à la relecture et à l’export',
          body: 'Prompts, interface de conversation, état et routage vivent dans des fichiers modifiables que vous relisez, versionnez et emportez hors d’E-Code.',
        },
        {
          title: 'Point de branchement documentaire explicite',
          body: 'L’adaptateur de documentation et le modèle de citations restent visibles dans le code. Cette page ne branche ni corpus ni modèle de langage : connectez les vôtres et évaluez la récupération avant usage.',
        },
        {
          title: 'Aperçu de conversation actif et adaptable',
          body: 'Testez l’interface du téléphone au desktop dans l’aperçu. Cela confirme le rendu du parcours, pas une recherche documentaire active, une réponse modèle, une authentification ou une livraison au support.',
        },
        {
          title: 'Publication assistée des compilations statiques prises en charge',
          body: 'Quand la surface de l’assistant correspond à une compilation statique prise en charge, E-Code guide sa construction et sa publication sans présenter un comportement serveur non connecté comme déployé.',
        },
        {
          title: 'URL E-Code pour l’interface, environnement d’exécution séparé pour l’agent',
          body: 'Publiez l’interface statique compatible sur une URL E-Code. Un chatbot qui appelle un modèle, lit des documents ou conserve des échanges requiert le projet exporté et un environnement d’exécution serveur adapté réellement déployé.',
        },
        {
          title: 'Itération en poursuivant l’échange avec l’Agent',
          body: 'Formulez la suite avec vos mots, examinez les fichiers modifiés et relancez l’aperçu après chaque ajustement de l’expérience conversationnelle.',
        },
      ],
    },
    features: {
      eyebrow: 'Pensé pour de vrais assistants',
      title: 'Tout ce dont un assistant de support a besoin, dans un code que vous maîtrisez',
      intro:
        'Le parcours Générateur de chatbot garde prompt, outils, mémoire et escalade dans un seul flux inspectable.',
      items: [
        {
          title: 'Réponses depuis votre documentation',
          body: 'Partez d’un contrat d’adaptateur de sources et d’un affichage de citations, puis branchez votre corpus et testez chaque chemin de récupération.',
        },
        {
          title: 'Prompts relisibles',
          body: 'Le prompt système et les règles de comportement vivent dans des fichiers modifiables, pas dans un créateur verrouillé.',
        },
        {
          title: 'Outils déclarés',
          body: 'Chaque outil que l’assistant peut appeler est déclaré et borné dans un code que vous auditez.',
        },
        {
          title: 'Mémoire inspectable',
          body: 'L’état de conversation est modélisé dans le projet afin de relire ce qui est conservé et de choisir un stockage adapté.',
        },
        {
          title: 'Transfert humain',
          body: 'Définissez la branche pour les demandes incertaines ou hors périmètre, puis connectez et testez la vraie file d’attente du support.',
        },
        {
          title: 'Projet exportable',
          body: 'Exportez les fichiers source ou poursuivez dans E-Code ; relisez les conditions de chaque modèle et service externe ajouté.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Qui construit avec',
      title: 'Quatre scénarios d’assistant de support à structurer dans du code modifiable',
      intro:
        'Ces scénarios constituent des points de départ concrets pour un projet d’assistant modifiable ; chacun demande sa connexion aux sources, son évaluation modèle et ses tests d’exploitation.',
      items: [
        {
          title: 'Bots de support documentation',
          body: 'Répondez aux questions clients à partir de la documentation produit et escaladez en cas de doute.',
        },
        {
          title: 'Help desks internes',
          body: 'Des assistants qui répondent aux questions IT, RH ou ops depuis des bases de connaissances internes.',
        },
        {
          title: 'Agents de tâches et de processus',
          body: 'Des agents qui appellent des outils bornés pour réaliser des étapes et rendre compte pour relecture.',
        },
        {
          title: 'Assistants de prise en main',
          body: 'Des assistants guidés qui accompagnent les nouveaux utilisateurs dans la configuration avec des sources citées.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions fréquentes',
      title: 'Le Générateur de chatbot, en toute honnêteté',
      intro: 'Ce que produit le parcours Générateur de chatbot, et où sont ses limites.',
      items: [
        {
          title: 'J’obtiens du vrai code ou un créateur de bot verrouillé ?',
          body: 'Vous obtenez des fichiers source modifiables pour les prompts, outils, états et routages, que vous lisez, versionnez et exportez. Tout modèle, stockage vectoriel ou service de support branché reste soumis aux conditions de son fournisseur.',
        },
        {
          title: 'Répond-il à partir de ma propre documentation ?',
          body: 'L’assistant généré est modélisé pour récupérer depuis une base de connaissances et citer ce qu’il a utilisé. La démonstration intégrée de cette page utilise des données fictives, sans modèle ni service applicatif connecté.',
        },
        {
          title: 'Peut-il transférer à un humain ?',
          body: 'Le projet peut modéliser une escalade quand la confiance est faible ou la question hors périmètre. Un transfert réel exige de brancher votre outil de support puis de tester livraison, attribution, reprises et états d’échec.',
        },
        {
          title: 'Puis-je connecter un vrai modèle ou une base de connaissances ?',
          body: 'Les outils et le modèle de connaissances générés sont du code que vous branchez à votre propre modèle et à vos sources. Rien sur cette page n’est connecté à un modèle réel — la démo est fictive.',
        },
        {
          title: 'Comment modifier l’assistant ensuite ?',
          body: 'Modifiez le prompt, les outils ou les règles directement, ou demandez le changement suivant à l’Agent et relisez le diff face à l’aperçu actif.',
        },
      ],
    },
    finalCta: {
      title: 'Décrivez votre assistant et voyez-le tourner',
      body: 'Transformez les questions traitées par votre équipe en un projet conversationnel modifiable avec prompts, contrats d’outils, état et logique de transfert relisibles. Prévisualisez l’interface, puis branchez et testez ses services externes.',
      primaryCta: { label: 'Décrivez votre assistant', ariaLabel: 'Décrivez votre chatbot avec E-Code' },
      secondaryCta: {
        label: 'Voir la construction',
        ariaLabel: 'Voir comment E-Code construit l’assistant à partir d’un prompt',
      },
    },
    aria: {
      pageLabel: 'Page solution Générateur de chatbot',
      heroLabel: 'Introduction du Générateur de chatbot',
      demoLabel: 'Démonstration produit du Générateur de chatbot',
      problemLabel: 'Le problème de la création de chatbot',
      buildLabel: 'Comment fonctionne le Générateur de chatbot',
      outputListLabel: 'Résultats de la génération de chatbot',
      proofLinkLabel: 'Voir la preuve IDE réelle E-Code',
      deliverablesLabel: 'Ce que livre le Générateur de chatbot',
      featuresLabel: 'Capacités du Générateur de chatbot',
      useCasesLabel: 'Cas d’usage du Générateur de chatbot',
      faqLabel: 'Questions sur le Générateur de chatbot',
      finalCtaLabel: 'Commencer à construire votre assistant',
    },
  },
} as const satisfies SolutionCopyByLanguage;
