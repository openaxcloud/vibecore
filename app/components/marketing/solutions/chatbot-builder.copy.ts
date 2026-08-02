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
        'Describe the support-assistant experience you need. E-Code generates an editable React interface with suggested questions, deterministic local replies, source cards, and an escalation state running in Webview.',
    },
    hero: {
      eyebrow: 'Chatbot & AI Agent Builder for real assistants',
      title: 'Build the support flow before you connect a model to customer questions',
      subtitle:
        'Describe the questions, answer layout, cited source cards, and escalation state. E-Code generates HelpDesk Copilot in editable React and TypeScript, opens it in Webview, and keeps the Agent conversation beside the files. The captured answer is deterministic and local; it does not call a language model, vector database, live corpus, or support queue.',
      primaryCta: { label: 'Describe your assistant', ariaLabel: 'Describe your chatbot with E-Code' },
      secondaryCta: { label: 'See how it builds', ariaLabel: 'See how E-Code builds the assistant from a prompt' },
      microcopy:
        'Start from the questions your team already answers. The creation prompt, generated conversation source, and running local interface remain visible while you iterate.',
    },
    languageSwitch: { label: 'Choose the Chatbot Builder page language', english: 'English', french: 'Français' },
    demo: {
      badge: 'Fictional demo data',
      brand: 'HelpDesk Copilot',
      brandType: 'Scripted support prototype',
      nav: ['Chat', 'Sources', 'Handoff'],
      eyebrow: 'Deterministic local conversation',
      title: 'Password-reset answer with a cited sample source',
      intro:
        'A local interface that turns one suggested question into a scripted answer, an “Account access” source card, and an escalation option without calling a model, corpus, or support queue.',
      primaryHeading: 'Scripted local replies',
      primaryRows: [
        { label: 'How do I reset my password?', meta: 'suggested local question' },
        { label: 'Open Account settings and choose Reset password.', meta: 'deterministic sample answer' },
        {
          label: 'Account access',
          meta: 'fictional cited source card',
          status: 'Local source',
        },
      ],
      asideHeading: 'Local demo state',
      asideRows: [
        { label: 'Documentation', value: 'Fictional local set' },
        { label: 'Reply mode', value: 'Deterministic' },
        { label: 'Escalation', value: 'UI option only' },
      ],
      asideCta: 'Preview handoff state',
      disclaimer:
        'Scripted local interface · fictional “Account access” source and answer · no model, retrieval, live documents, or support handoff · not a generation record',
      caption: {
        title: 'A support-assistant interface with every external boundary exposed',
        body: 'This local scenario demonstrates the password-reset conversation, fictional “Account access” source, and escalation UI without presenting scripted output as model reasoning or retrieval.',
      },
      alt: 'Scripted local HelpDesk Copilot interface with a password-reset reply, fictional Account access source, and escalation UI only.',
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
          body: 'An uncertain answer needs a human handoff, but closed tools rarely let the team define, audit, or test that escalation.',
        },
      ],
      bridge:
        'E-Code starts from the support experience you describe and produces its suggested-question, conversation, citation-card, and escalation interface in real source files. You inspect the project, run its deterministic local answer in Preview, and request the next change without presenting a scripted prototype as a connected AI service.',
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
          title: 'A generated support interface',
          body: 'HelpDesk Copilot’s suggested questions, conversation view, source cards, and escalation option live in editable React and TypeScript files.',
        },
        {
          title: 'A deterministic local answer',
          body: 'Clicking “How do I reset my password?” produces a scripted browser-local reply and cites the fictional “Account access” source.',
        },
        {
          title: 'An escalation interface state',
          body: 'The answer exposes an escalation option for review. It is an interface state only and sends nothing to a person or support platform.',
        },
        {
          title: 'Agent, files, and Webview together',
          body: 'E-Code shows the customer-support prompt and Agent work beside the generated files while the verified question-to-answer interaction runs in the real Webview.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Support brief → Agent → assistant Webview',
      title: 'Inspect the support assistant generated for this page',
      body: 'These dedicated E-Code captures show the HelpDesk Copilot prompt, the Agent exchange, the generated conversation source, and the deterministic local support interface running in Webview.',
      galleryLabel: 'Captured support-assistant generation and local conversation inside E-Code',
      disclaimer:
        'Captured E-Code generation · fictional help articles and conversations · answers run from scripted local sample data · no connected language model, RAG pipeline, live documentation source, or support handoff is demonstrated',
      openFullSizeLabel: 'Open the support-assistant capture at full size',
      preview: {
        title: 'The assistant interface runs beside its prompt and files',
        body: 'The first capture keeps the HelpDesk Copilot request and Agent activity beside the generated source while Webview renders the suggested questions, conversation layout, fictional local documentation notice, source area, and escalation state.',
        alt: 'Real E-Code Chatbot Builder workspace showing the HelpDesk Copilot prompt, Agent activity, generated React files, and the local support interface with suggested questions in Webview.',
      },
      iteration: {
        title: 'One suggested question opens its cited local answer',
        body: 'The follow-up asks for the exact “How do I reset my password?” control. The capture shows its deterministic answer, cited “Account access” source, and escalation option after the verified click; it does not prove model reasoning, retrieval, or a support handoff.',
        alt: 'Real E-Code Chatbot Builder iteration showing the password-reset prompt, generated HelpDesk Copilot files, and the deterministic local answer citing Account access in Webview.',
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
        'HelpDesk Copilot’s interface source, fictional local documents, deterministic reply state, and responsive Preview stay visible. A model-backed assistant still needs separately connected and tested services and runtime.',
      items: [
        {
          title: 'Source you can inspect and export',
          body: 'Suggested questions, conversation UI, local reply state, source cards, and escalation controls live in editable files you can review, version, and take outside E-Code.',
        },
        {
          title: 'Fictional local documentation in plain sight',
          body: 'The sample help content and its “Account access” citation stay visible in code. No corpus, retrieval pipeline, vector store, or language model is attached.',
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
      eyebrow: 'Built to inspect the support flow',
      title: 'A support conversation prototype with every external boundary visible',
      intro:
        'The Chatbot Builder path keeps HelpDesk Copilot’s local content, generated states, and running Webview in one inspectable workflow.',
      items: [
        {
          title: 'Suggested support questions',
          body: 'Visible question controls let a reviewer enter the scripted support flow without typing or calling a model.',
        },
        {
          title: 'Deterministic local reply',
          body: 'The password-reset question produces the same browser-local answer on every run for a reproducible interface test.',
        },
        {
          title: 'Cited sample source',
          body: 'The answer displays a fictional “Account access” source card without claiming document retrieval.',
        },
        {
          title: 'Conversation state you can inspect',
          body: 'The local question, reply, and citation state lives in the generated frontend source and stores no production conversation.',
        },
        {
          title: 'Escalation option, UI only',
          body: 'The interface exposes the handoff decision point but does not contact a person or external helpdesk.',
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
        'These are practical interface prototypes built from local scripted content; each needs its own source connection, model evaluation, and operational testing before customer use.',
      items: [
        {
          title: 'Help-center answer prototypes',
          body: 'Test suggested questions, cited-answer presentation, and escalation copy before connecting retrieval or delivery.',
        },
        {
          title: 'Account-access support flows',
          body: 'Prototype password-reset guidance and the “Account access” source treatment with fictional local content.',
        },
        {
          title: 'Escalation-state reviews',
          body: 'Review where the conversation exposes a human option before wiring any support queue or ticket action.',
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
          body: 'You get editable React and TypeScript source for the conversation, local reply state, citations, and escalation controls. The captured project contains no connected chatbot runtime.',
        },
        {
          title: 'Does it answer from my own documentation?',
          body: 'Not in this captured run. HelpDesk Copilot reads a small fictional dataset stored locally and returns a deterministic answer. Connect and evaluate your own corpus and retrieval stack separately.',
        },
        {
          title: 'Can it hand off to a human?',
          body: 'The generated interface shows an escalation option. It does not send a ticket or message; a real handoff requires a support connection with tested delivery, ownership, retries, and failure states.',
        },
        {
          title: 'Can I connect a real model or knowledge base?',
          body: 'Yes, in the exported source you extend. Nothing in these captures connects a language model, vector store, live document source, or RAG pipeline.',
        },
        {
          title: 'How do I change the assistant later?',
          body: 'Edit the generated conversation source directly or ask the E-Code Agent for the next question, answer state, citation layout, or escalation change, then verify it in Webview.',
        },
      ],
    },
    finalCta: {
      title: 'Describe your assistant and see it running',
      body: 'Turn one real support question into an editable conversation interface, verify its local answer, source card, and escalation state in Webview, then connect and test the services required for customer use.',
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
        'Décrivez l’expérience d’assistant support recherchée. E-Code génère une interface React modifiable avec questions suggérées, réponses locales déterministes, cartes sources et état d’escalade actif dans la Webview.',
    },
    hero: {
      eyebrow: 'Générateur de chatbot et d’agent IA pour de vrais assistants',
      title: 'Construisez le parcours support avant de connecter un modèle aux questions clients',
      subtitle:
        'Décrivez les questions, la mise en page de la réponse, les cartes sources citées et l’état d’escalade. E-Code génère HelpDesk Copilot en React et TypeScript modifiables, l’ouvre dans la Webview et garde la conversation avec l’Agent auprès des fichiers. La réponse capturée est déterministe et locale ; elle n’appelle ni modèle de langage, ni base vectorielle, ni corpus actif, ni file support.',
      primaryCta: { label: 'Décrivez votre assistant', ariaLabel: 'Décrivez votre chatbot avec E-Code' },
      secondaryCta: {
        label: 'Voir la construction',
        ariaLabel: 'Voir comment E-Code construit l’assistant à partir d’un prompt',
      },
      microcopy:
        'Partez des questions auxquelles votre équipe répond déjà. Le prompt de création, la source générée de la conversation et l’interface locale active restent visibles pendant l’itération.',
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
      eyebrow: 'Conversation locale déterministe',
      title: 'Réponse de réinitialisation avec source fictive citée',
      intro:
        'Une interface locale qui transforme une question suggérée en réponse scénarisée, carte source « Accès au compte » et option d’escalade sans appeler de modèle, corpus ni file support.',
      primaryHeading: 'Réponses locales scénarisées',
      primaryRows: [
        { label: 'Comment réinitialiser mon mot de passe ?', meta: 'question locale suggérée' },
        {
          label: 'Ouvrez les réglages du compte puis choisissez Réinitialiser.',
          meta: 'réponse d’exemple déterministe',
        },
        {
          label: 'Accès au compte',
          meta: 'carte source fictive citée',
          status: 'Source locale',
        },
      ],
      asideHeading: 'État local de la démo',
      asideRows: [
        { label: 'Documentation', value: 'Jeu local fictif' },
        { label: 'Mode de réponse', value: 'Déterministe' },
        { label: 'Escalade', value: 'Option visuelle seule' },
      ],
      asideCta: 'Prévisualiser le transfert',
      disclaimer:
        'Interface locale scénarisée · réponse et source « Accès au compte » fictives · aucun modèle, recherche, document actif ni transfert au support · pas une trace de génération',
      caption: {
        title: 'Une interface d’assistant dont chaque frontière externe reste explicite',
        body: 'Ce scénario local présente la conversation de réinitialisation, la source fictive « Accès au compte » et l’état d’escalade sans faire passer la réponse scénarisée pour du raisonnement ou de la recherche.',
      },
      alt: 'Interface locale scénarisée HelpDesk Copilot avec réponse de réinitialisation, source fictive Accès au compte et simple état visuel d’escalade.',
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
          body: 'Une réponse incertaine exige un transfert humain, mais les outils fermés permettent rarement à l’équipe de définir, auditer ou tester cette escalade.',
        },
      ],
      bridge:
        'E-Code part de l’expérience support décrite et produit ses questions suggérées, sa conversation, ses cartes de citation et son option d’escalade dans de vrais fichiers source. Vous inspectez le projet, exécutez sa réponse locale déterministe dans l’aperçu et demandez le changement suivant sans faire passer un prototype scénarisé pour un service IA connecté.',
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
          title: 'Une interface support générée',
          body: 'Questions suggérées, conversation, cartes sources et option d’escalade de HelpDesk Copilot vivent dans des fichiers React et TypeScript modifiables.',
        },
        {
          title: 'Une réponse locale déterministe',
          body: 'Le clic sur « Comment réinitialiser mon mot de passe ? » produit une réponse scénarisée dans le navigateur et cite la source fictive « Accès au compte ».',
        },
        {
          title: 'Un état visuel d’escalade',
          body: 'La réponse expose une option d’escalade à relire. Cet état d’interface n’envoie rien à une personne ni à une plateforme de support.',
        },
        {
          title: 'Agent, fichiers et Webview réunis',
          body: 'E-Code montre le prompt du support client et le travail de l’Agent auprès des fichiers générés pendant que l’interaction vérifiée entre question et réponse tourne dans la vraie Webview.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Brief support → Agent → Webview de l’assistant',
      title: 'Inspectez l’assistant support généré pour cette page',
      body: 'Ces captures E-Code dédiées montrent le prompt HelpDesk Copilot, l’échange avec l’Agent, la source de conversation générée et l’interface support locale déterministe active dans la Webview.',
      galleryLabel: 'Génération capturée de l’assistant support et conversation locale dans E-Code',
      disclaimer:
        'Génération E-Code capturée · articles d’aide et conversations fictifs · réponses issues de données locales scénarisées · aucun modèle de langage, pipeline RAG, corpus documentaire actif ni transfert au support connecté démontré',
      openFullSizeLabel: 'Ouvrir la capture de l’assistant support en taille réelle',
      preview: {
        title: 'L’interface de l’assistant tourne à côté de son prompt et de ses fichiers',
        body: 'La première capture conserve la demande HelpDesk Copilot et l’activité de l’Agent auprès de la source générée pendant que la Webview affiche les questions suggérées, la conversation, la limite documentaire locale, la zone Sources et l’état d’escalade.',
        alt: 'Vrai workspace Chatbot Builder E-Code montrant le prompt HelpDesk Copilot, l’activité de l’Agent, les fichiers React générés et l’interface support locale avec questions suggérées dans la Webview.',
      },
      iteration: {
        title: 'Une question suggérée ouvre sa réponse locale citée',
        body: 'Le suivi demande le contrôle exact « Comment réinitialiser mon mot de passe ? ». La capture montre sa réponse déterministe, la source « Accès au compte » et l’option d’escalade après le clic vérifié ; elle ne prouve ni raisonnement modèle, ni recherche, ni transfert au support.',
        alt: 'Vraie itération Chatbot Builder E-Code montrant le prompt de réinitialisation, les fichiers HelpDesk Copilot et la réponse locale déterministe citant Accès au compte dans la Webview.',
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
        'La source de HelpDesk Copilot, les documents locaux fictifs, l’état de réponse déterministe et l’aperçu responsive restent visibles. Un assistant relié à un modèle exige encore des services et un runtime connectés et testés séparément.',
      items: [
        {
          title: 'Source ouverte à la relecture et à l’export',
          body: 'Questions suggérées, interface de conversation, réponse locale, cartes sources et contrôles d’escalade vivent dans des fichiers modifiables que vous relisez, versionnez et emportez hors d’E-Code.',
        },
        {
          title: 'Documentation locale fictive bien visible',
          body: 'Le contenu d’aide d’exemple et sa citation « Accès au compte » restent visibles dans le code. Aucun corpus, pipeline de recherche, stockage vectoriel ni modèle de langage n’est branché.',
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
      eyebrow: 'Pensé pour inspecter le parcours support',
      title: 'Un prototype de conversation support dont chaque frontière externe reste visible',
      intro:
        'Le parcours Générateur de chatbot garde le contenu local, les états générés et la Webview active de HelpDesk Copilot dans un seul flux inspectable.',
      items: [
        {
          title: 'Questions support suggérées',
          body: 'Des contrôles visibles lancent le parcours scénarisé sans saisie ni appel à un modèle.',
        },
        {
          title: 'Réponse locale déterministe',
          body: 'La question de réinitialisation produit la même réponse locale à chaque run pour un test d’interface reproductible.',
        },
        {
          title: 'Source fictive citée',
          body: 'La réponse affiche une carte « Accès au compte » fictive sans prétendre avoir effectué une recherche documentaire.',
        },
        {
          title: 'État de conversation inspectable',
          body: 'Question, réponse et citation locales vivent dans la source frontend générée et ne stockent aucune conversation de production.',
        },
        {
          title: 'Option d’escalade, interface seule',
          body: 'L’interface expose le point de décision sans contacter une personne ni un helpdesk externe.',
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
        'Ces scénarios sont des prototypes d’interface fondés sur un contenu local scénarisé ; chacun exige sa connexion aux sources, son évaluation modèle et ses tests d’exploitation avant tout usage client.',
      items: [
        {
          title: 'Prototypes de réponses help center',
          body: 'Testez questions suggérées, présentation des citations et texte d’escalade avant toute connexion de recherche ou de livraison.',
        },
        {
          title: 'Parcours support d’accès au compte',
          body: 'Prototypez les instructions de réinitialisation et le traitement de la source « Accès au compte » avec un contenu local fictif.',
        },
        {
          title: 'Revue des états d’escalade',
          body: 'Relisez où la conversation propose une option humaine avant de brancher une file support ou une action de ticket.',
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
          body: 'Vous obtenez une source React et TypeScript modifiable pour la conversation, la réponse locale, les citations et les contrôles d’escalade. Le projet capturé ne contient aucun runtime de chatbot connecté.',
        },
        {
          title: 'Répond-il à partir de ma propre documentation ?',
          body: 'Pas dans ce run capturé. HelpDesk Copilot lit un petit jeu fictif stocké localement et renvoie une réponse déterministe. Branchez et évaluez séparément votre corpus et votre recherche.',
        },
        {
          title: 'Peut-il transférer à un humain ?',
          body: 'L’interface générée affiche une option d’escalade. Elle n’envoie ni ticket ni message ; un vrai transfert exige une connexion support avec livraison, attribution, reprises et états d’échec testés.',
        },
        {
          title: 'Puis-je connecter un vrai modèle ou une base de connaissances ?',
          body: 'Oui, en étendant la source exportée. Ces captures ne connectent aucun modèle de langage, stockage vectoriel, corpus actif ni pipeline RAG.',
        },
        {
          title: 'Comment modifier l’assistant ensuite ?',
          body: 'Modifiez directement la source de conversation générée ou demandez à l’Agent E-Code la question, l’état de réponse, la mise en page des citations ou l’escalade suivante, puis vérifiez-la dans la Webview.',
        },
      ],
    },
    finalCta: {
      title: 'Décrivez votre assistant et voyez-le tourner',
      body: 'Transformez une vraie question support en interface conversationnelle modifiable, vérifiez sa réponse locale, sa carte source et son état d’escalade dans la Webview, puis branchez et testez les services nécessaires à un usage client.',
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
