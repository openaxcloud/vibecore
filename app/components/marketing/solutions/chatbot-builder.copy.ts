import type { SolutionCopyByLanguage } from './solution-copy';

/**
 * SOL — Chatbot / AI Agent Builder. Dedicated documentation-support story in
 * EN and FR. All support content is fictional and labeled; proof claims stop at
 * the captured Agent exchange, generated files, Webview, and scripted local reply.
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
      brandType: 'Scripted support prototype',
      nav: ['Chat', 'Sources', 'Handoff'],
      eyebrow: 'Scripted conversation',
      title: 'Sample replies with source labels',
      intro:
        'A local interface that presents prewritten replies, fictional source labels, and a handoff UI state without calling a model, corpus, or support queue.',
      primaryHeading: 'Scripted local replies',
      primaryRows: [
        { label: 'Your plan renews on the 1st of each month.', meta: 'sample source label: billing.md' },
        { label: 'Reset your API key from Settings → Security.', meta: 'sample source label: api-keys.md' },
        {
          label: 'I’m not fully sure — show the handoff option.',
          meta: 'scripted low-confidence state',
          status: 'UI only',
        },
      ],
      asideHeading: 'Local demo state',
      asideRows: [
        { label: 'Sources', value: 'Sample files' },
        { label: 'Reply mode', value: 'Scripted' },
        { label: 'Handoff', value: 'UI state only' },
      ],
      asideCta: 'Preview handoff state',
      disclaimer:
        'Scripted local interface · fictional replies and source labels · no model, retrieval, live documents, or support handoff · not a generation record',
      caption: {
        title: 'A support-assistant interface with every external boundary exposed',
        body: 'This local scenario demonstrates a conversation, sample source labels, and a handoff UI state without presenting scripted output as model reasoning or retrieval.',
      },
      alt: 'Scripted local support-assistant interface with fictional replies, sample source labels, and a handoff UI state only.',
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
      eyebrow: 'Support brief → Agent → assistant Webview',
      title: 'Inspect the support assistant generated for this page',
      body: 'These dedicated E-Code captures show the customer-support prompt, the Agent exchange, the generated conversation and documentation files, and the assistant interface running in Webview.',
      galleryLabel: 'Captured support-assistant generation and local conversation inside E-Code',
      disclaimer:
        'Captured E-Code generation · fictional help articles and conversations · answers run from scripted local sample data · no connected language model, RAG pipeline, live documentation source, or support handoff is demonstrated',
      openFullSizeLabel: 'Open the support-assistant capture at full size',
      preview: {
        title: 'The assistant interface runs beside its prompt and files',
        body: 'The first capture keeps the support request and Agent activity beside the generated source while Webview renders the conversation, suggested questions, and fictional documentation references.',
        alt: 'Real E-Code Chatbot Builder workspace showing a documentation-support prompt, Agent activity, generated assistant files, and a customer-help conversation running in Webview.',
      },
      iteration: {
        title: 'A local question exposes the answer state for review',
        body: 'The follow-up capture shows the next instruction and a scripted local answer with its sample references in the same Webview. It proves the generated interaction and iteration loop, not model reasoning or document retrieval.',
        alt: 'Real E-Code Chatbot Builder iteration showing a follow-up prompt, generated assistant files, and a scripted local support answer with sample references in Webview.',
      },
      cta: {
        label: 'Inspect the captured assistant run',
        ariaLabel: 'Inspect the captured E-Code support-assistant generation and scripted local reply',
      },
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
          body: 'Model source-backed replies and a low-confidence branch, then connect and evaluate retrieval and support delivery.',
        },
        {
          title: 'Internal help desks',
          body: 'Structure IT, HR, or operations answer flows around an explicit knowledge adapter and access boundary.',
        },
        {
          title: 'Task and workflow agents',
          body: 'Declare bounded tool contracts and review states before connecting any system that performs a real action.',
        },
        {
          title: 'Onboarding assistants',
          body: 'Build a guided setup interface with sample citations, then connect and verify the approved onboarding sources.',
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
      brandType: 'Prototype de support scénarisé',
      nav: ['Conversation', 'Sources', 'Transfert'],
      eyebrow: 'Conversation scénarisée',
      title: 'Réponses d’exemple avec libellés de sources',
      intro:
        'Une interface locale qui présente des réponses préécrites, des libellés de sources fictifs et un état visuel de transfert sans appeler de modèle, de corpus ni de file support.',
      primaryHeading: 'Réponses locales scénarisées',
      primaryRows: [
        {
          label: 'Votre offre se renouvelle le 1er de chaque mois.',
          meta: 'libellé de source d’exemple : billing.md',
        },
        {
          label: 'Réinitialisez votre clé API depuis Réglages → Sécurité.',
          meta: 'libellé de source d’exemple : api-keys.md',
        },
        {
          label: 'Je ne suis pas certain — afficher l’option de transfert.',
          meta: 'état de faible confiance scénarisé',
          status: 'Interface seule',
        },
      ],
      asideHeading: 'État local de la démo',
      asideRows: [
        { label: 'Sources', value: 'Fichiers d’exemple' },
        { label: 'Mode de réponse', value: 'Scénarisé' },
        { label: 'Transfert', value: 'État visuel seul' },
      ],
      asideCta: 'Prévisualiser le transfert',
      disclaimer:
        'Interface locale scénarisée · réponses et sources fictives · aucun modèle, recherche, document actif ni transfert au support · pas une trace de génération',
      caption: {
        title: 'Une interface d’assistant dont chaque frontière externe reste explicite',
        body: 'Ce scénario local présente une conversation, des libellés de sources d’exemple et un état visuel de transfert sans faire passer les réponses scénarisées pour du raisonnement ou de la recherche.',
      },
      alt: 'Interface locale scénarisée d’assistant support avec réponses fictives, libellés de sources d’exemple et simple état visuel de transfert.',
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
      eyebrow: 'Brief support → Agent → Webview de l’assistant',
      title: 'Inspectez l’assistant support généré pour cette page',
      body: 'Ces captures E-Code dédiées montrent le prompt du support client, l’échange avec l’Agent, les fichiers de conversation et de documentation générés et l’interface de l’assistant active dans la Webview.',
      galleryLabel: 'Génération capturée de l’assistant support et conversation locale dans E-Code',
      disclaimer:
        'Génération E-Code capturée · articles d’aide et conversations fictifs · réponses issues de données locales scénarisées · aucun modèle de langage, pipeline RAG, corpus documentaire actif ni transfert au support connecté démontré',
      openFullSizeLabel: 'Ouvrir la capture de l’assistant support en taille réelle',
      preview: {
        title: 'L’interface de l’assistant tourne à côté de son prompt et de ses fichiers',
        body: 'La première capture conserve la demande support et l’activité de l’Agent auprès de la source générée pendant que la Webview affiche la conversation, les questions suggérées et les références documentaires fictives.',
        alt: 'Vrai workspace Chatbot Builder E-Code montrant un prompt d’assistant documentaire, l’activité de l’Agent, les fichiers générés et une conversation d’aide client active dans la Webview.',
      },
      iteration: {
        title: 'Une question locale expose l’état de réponse à relire',
        body: 'La capture de suivi montre l’instruction suivante et une réponse locale scénarisée avec ses références d’exemple dans la même Webview. Elle prouve l’interaction générée et la boucle d’itération, pas le raisonnement d’un modèle ni la recherche documentaire.',
        alt: 'Vraie itération Chatbot Builder E-Code montrant un prompt de suivi, les fichiers de l’assistant et une réponse support locale scénarisée avec des références d’exemple dans la Webview.',
      },
      cta: {
        label: 'Inspecter le run capturé de l’assistant',
        ariaLabel: 'Inspecter la génération E-Code capturée de l’assistant support et sa réponse locale scénarisée',
      },
    },
    deliverables: {
      eyebrow: 'Ce que vous recevez',
      title: 'Un projet d’assistant relisible, du code jusqu’à l’interface statique en ligne',
      intro:
        'La source, la frontière de l’adaptateur documentaire, l’aperçu responsive et le chemin de publication restent visibles. Les interfaces statiques suivent la publication prise en charge par E-Code ; un chatbot relié à un modèle exige encore ses services et son runtime.',
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
          title: 'Publication assistée des builds statiques pris en charge',
          body: 'Quand la surface de l’assistant correspond à un build statique pris en charge, E-Code guide sa construction et sa publication sans présenter un comportement serveur non connecté comme déployé.',
        },
        {
          title: 'URL E-Code pour l’interface, runtime séparé pour l’agent',
          body: 'Publiez l’interface statique compatible sur une URL E-Code. Un chatbot qui appelle un modèle, lit des documents ou conserve des échanges requiert le projet exporté et un runtime backend adapté réellement déployé.',
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
          title: 'Réponses depuis vos docs',
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
          body: 'Définissez la branche pour les demandes incertaines ou hors périmètre, puis connectez et testez la vraie file de support.',
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
          body: 'Modélisez les réponses sourcées et une branche de doute, puis branchez et évaluez la recherche et la livraison au support.',
        },
        {
          title: 'Help desks internes',
          body: 'Structurez les parcours de réponse IT, RH ou ops autour d’un adaptateur de connaissances et d’une frontière d’accès explicites.',
        },
        {
          title: 'Agents de tâches et de workflow',
          body: 'Déclarez les contrats d’outils bornés et les états de revue avant de connecter un système qui exécute une action réelle.',
        },
        {
          title: 'Assistants d’onboarding',
          body: 'Construisez une interface guidée avec citations d’exemple, puis branchez et vérifiez les sources d’onboarding approuvées.',
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
          body: 'L’assistant généré est modélisé pour récupérer depuis une base de connaissances et citer ce qu’il a utilisé. La démonstration intégrée de cette page utilise des données fictives, sans modèle ni backend connecté.',
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
