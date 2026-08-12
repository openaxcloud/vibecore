import type { CapturedSolutionCopyByLanguage } from './solution-copy';

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
        'Describe HelpDesk Copilot. E-Code generates editable support flows, local answers, source cards, and escalation UI; no model or live corpus is connected.',
      ogImageAlt: 'E-Code Chatbot Builder workspace with HelpDesk Copilot files and a scripted answer in Webview.',
    },
    hero: {
      eyebrow: 'Chatbot & AI Agent Builder for real assistants',
      title: 'Build the support flow before you connect a model to customer questions',
      subtitle:
        'Describe the questions, answer layout, cited source cards, and escalation state. E-Code generates HelpDesk Copilot in editable React and TypeScript, opens it in Webview, and keeps the Agent conversation beside the files. The captured answer is deterministic and local; it does not call a language model, vector database, live corpus, or support queue.',
      primaryCta: { label: 'Describe your support assistant', ariaLabel: 'Describe your chatbot with E-Code' },
      secondaryCta: { label: 'See the support flow', ariaLabel: 'See how E-Code builds the assistant from a prompt' },
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
        { label: 'Reply mode', value: 'Deterministic reply' },
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
      eyebrow: 'One prompt starts the support flow',
      title: 'Describe the behavior, not the framework',
      intro:
        'The request below reads like a note from a support lead. The four items map its implementation scope in real source files, not a locked bot builder.',
      label: 'Customer-support brief',
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
          title: 'Support prompt, answer source, and Webview together',
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
        title: 'A verified question click opens its cited local answer',
        body: 'After the single generation, a verified click on “How do I reset my password?” shows the deterministic answer, cited “Account access” source, and escalation option. It does not prove model reasoning, retrieval, or a support handoff.',
        alt: 'E-Code Chatbot Builder capture after the verified reset-question click, with HelpDesk Copilot files and the cited answer in Webview.',
      },
      cta: {
        label: 'Inspect the captured assistant run',
        ariaLabel: 'Inspect the captured E-Code support-assistant generation and scripted local reply',
      },
    },
    proofVisualAlts: {
      prompt: 'E-Code Agent prompt requesting HelpDesk Copilot with cited answers and a visible human-handoff option.',
      preview: 'E-Code workspace with generated HelpDesk Copilot files and the local support interface in Webview.',
      webviewOverview:
        'HelpDesk Copilot in Webview with a suggested reset question, answer area, and fictional source.',
      iteration:
        'E-Code workspace after the verified reset-question click, with files and the cited Account access answer.',
      webviewIteration: 'Scripted password-reset answer citing Account access after the verified question interaction.',
      files: 'E-Code file tree for HelpDesk Copilot with editable conversation, question, and source-card files.',
    },
    deliverables: {
      eyebrow: 'What HelpDesk Copilot includes',
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
      eyebrow: 'Support flows to prototype',
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
      eyebrow: 'Support-assistant questions',
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
          title: 'How do I refine the support assistant later?',
          body: 'Edit the generated conversation source directly or ask the E-Code Agent for the next question, answer state, citation layout, or escalation change, then verify it in Webview.',
        },
      ],
    },
    finalCta: {
      title: 'Describe one support question and run the answer flow',
      body: 'Turn one real support question into an editable conversation interface, verify its local answer, source card, and escalation state in Webview, then connect and test the services required for customer use.',
      primaryCta: { label: 'Describe your support assistant', ariaLabel: 'Describe your chatbot with E-Code' },
      secondaryCta: { label: 'See the support flow', ariaLabel: 'See how E-Code builds the assistant from a prompt' },
    },
    aria: {
      pageLabel: 'Chatbot Builder solution page',
      heroLabel: 'Chatbot Builder introduction',
      demoLabel: 'Chatbot Builder product demonstration',
      problemLabel: 'The chatbot building problem',
      buildLabel: 'How the Chatbot Builder works',
      outputListLabel: 'Chatbot build outputs',
      proofLinkLabel: 'Inspect the support-assistant IDE evidence',
      deliverablesLabel: 'What the Chatbot Builder delivers',
      featuresLabel: 'Chatbot Builder capabilities',
      useCasesLabel: 'Chatbot Builder use cases',
      faqLabel: 'Chatbot Builder questions',
      finalCtaLabel: 'Start building your assistant',
    },
  },
  fr: {
    seo: {
      title: 'Générateur de chatbot et d’agent IA avec un code source modifiable | E-Code',
      description:
        'Décrivez HelpDesk Copilot. E-Code génère une interface d’assistance modifiable, des réponses locales, des sources et un parcours de transfert ; aucun modèle ni corpus n’est connecté.',
      ogImageAlt:
        'Workspace E-Code Chatbot Builder avec fichiers HelpDesk Copilot et réponse scénarisée dans la Webview.',
    },
    hero: {
      eyebrow: 'Générateur de chatbot et d’agent IA pour de vrais assistants',
      title: 'Construisez le parcours d’assistance avant de connecter un modèle aux questions de vos clients',
      subtitle:
        'Décrivez les questions, la mise en page de la réponse, les cartes de sources citées et l’état de transfert à un humain. E-Code génère HelpDesk Copilot dans des fichiers React et TypeScript modifiables, l’ouvre dans la Webview et garde la conversation avec l’Agent à côté des fichiers. La réponse capturée est déterministe et locale ; elle n’appelle ni modèle de langage, ni base vectorielle, ni corpus actif, ni file d’assistance.',
      primaryCta: {
        label: 'Décrivez votre assistant de service client',
        ariaLabel: 'Décrivez votre chatbot avec E-Code',
      },
      secondaryCta: {
        label: 'Voir le parcours d’assistance',
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
      brandType: 'Prototype d’assistance scénarisé',
      nav: ['Conversation', 'Sources', 'Transfert'],
      eyebrow: 'Conversation locale déterministe',
      title: 'Réponse de réinitialisation avec source fictive citée',
      intro:
        'Une interface locale qui transforme une question suggérée en réponse scénarisée, accompagnée de la carte source « Accès au compte » et d’une option de transfert, sans appeler de modèle, de corpus ni de file d’assistance.',
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
        { label: 'Base documentaire', value: 'Jeu local fictif' },
        { label: 'Mode de réponse', value: 'Réponse déterministe' },
        { label: 'Transfert humain', value: 'Option visuelle seule' },
      ],
      asideCta: 'Prévisualiser le transfert',
      disclaimer:
        'Interface locale scénarisée · réponse et source « Accès au compte » fictives · aucun modèle, recherche, document actif ni transfert vers un outil d’assistance · pas une trace de génération',
      caption: {
        title: 'Une interface d’assistant dont chaque frontière externe reste explicite',
        body: 'Ce scénario local présente la conversation de réinitialisation, la source fictive « Accès au compte » et l’état de transfert sans faire passer la réponse scénarisée pour du raisonnement ou de la recherche.',
      },
      alt: 'Interface locale scénarisée HelpDesk Copilot avec réponse de réinitialisation, source fictive Accès au compte et simple état visuel de transfert.',
    },
    problem: {
      eyebrow: 'D’un bot opaque à un assistant que vous pouvez auditer',
      title: 'Les créateurs de chatbot semblent magiques jusqu’à ce qu’il faille expliquer chaque réponse',
      intro:
        'Une équipe d’assistance a besoin d’un assistant qui répond à partir de sa propre documentation, montre ses sources et sait quand transférer la conversation à un humain. Les créateurs fermés masquent le prompt, les outils et la mémoire, si bien que personne ne peut relire les limites ni reproduire une mauvaise réponse.',
      obstacles: [
        {
          title: 'Le prompt et les outils sont masqués',
          body: 'Un créateur verrouillé décide comment l’assistant raisonne et ce qu’il peut appeler, et l’équipe ne peut ni lire, ni versionner, ni contraindre cette logique.',
        },
        {
          title: 'Les réponses s’écartent des sources',
          body: 'Sans base de connaissances relisible ni citations, le bot invente des réponses formulées avec assurance et rien ne permet de les retracer jusqu’à un document.',
        },
        {
          title: 'Aucune limite claire pour les réponses incertaines',
          body: 'Une réponse incertaine exige un transfert à un humain, mais les outils fermés permettent rarement à l’équipe de définir, d’auditer ou de tester ce transfert.',
        },
      ],
      bridge:
        'E-Code part de l’expérience d’assistance décrite et produit ses questions suggérées, sa conversation, ses cartes de citation et son option de transfert dans des fichiers source modifiables. Vous inspectez le projet, exécutez sa réponse locale déterministe dans l’aperçu et demandez le changement suivant sans faire passer un prototype scénarisé pour un service IA connecté.',
    },
    build: {
      eyebrow: 'Un prompt lance le parcours d’assistance',
      title: 'Décrivez le comportement, pas le framework',
      intro:
        'La demande ci-dessous se lit comme celle d’un responsable de l’assistance. Les quatre éléments en précisent le périmètre d’implémentation dans des fichiers source modifiables, pas dans un créateur de bot verrouillé.',
      label: 'Brief de l’assistance client',
      promptText: 'Un assistant qui répond aux questions de mes clients à partir de ma documentation.',
      outputs: [
        {
          title: 'Une interface d’assistance générée',
          body: 'Les questions suggérées, la conversation, les cartes de sources et l’option de transfert de HelpDesk Copilot se trouvent dans des fichiers React et TypeScript modifiables.',
        },
        {
          title: 'Une réponse locale déterministe',
          body: 'Le clic sur « Comment réinitialiser mon mot de passe ? » produit une réponse scénarisée dans le navigateur et cite la source fictive « Accès au compte ».',
        },
        {
          title: 'Un état visuel de transfert',
          body: 'La réponse expose une option de transfert à relire. Cet état d’interface n’envoie rien à une personne ni à une plateforme d’assistance.',
        },
        {
          title: 'Prompt d’assistance, source de réponse et Webview réunis',
          body: 'E-Code montre le prompt de l’assistance client et le travail de l’Agent à côté des fichiers générés pendant que l’interaction vérifiée entre la question et la réponse s’exécute dans la Webview réelle.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Brief d’assistance → Agent → Webview de l’assistant',
      title: 'Inspectez l’assistant de service client généré pour cette page',
      body: 'Ces captures E-Code dédiées montrent le prompt HelpDesk Copilot, l’échange avec l’Agent, la source de conversation générée et l’interface d’assistance locale déterministe active dans la Webview.',
      galleryLabel: 'Génération capturée de l’assistant de service client et conversation locale dans E-Code',
      disclaimer:
        'Génération E-Code capturée · articles d’aide et conversations fictifs · réponses issues de données locales scénarisées · aucun modèle de langage, pipeline RAG, corpus documentaire actif ni transfert vers un outil d’assistance connecté démontré',
      openFullSizeLabel: 'Ouvrir la capture de l’assistant de service client en taille réelle',
      preview: {
        title: 'L’interface de l’assistant s’exécute à côté de son prompt et de ses fichiers',
        body: 'La première capture conserve la demande HelpDesk Copilot et l’activité de l’Agent à côté de la source générée pendant que la Webview affiche les questions suggérées, la conversation, la limite documentaire locale, la zone Sources et l’état de transfert.',
        alt: 'Vrai workspace Chatbot Builder E-Code montrant le prompt HelpDesk Copilot, l’activité de l’Agent, les fichiers React générés et l’interface d’assistance locale avec questions suggérées dans la Webview.',
      },
      iteration: {
        title: 'Un clic vérifié sur la question ouvre sa réponse locale citée',
        body: 'Après la génération unique, un clic vérifié sur « Comment réinitialiser mon mot de passe ? » affiche la réponse déterministe, la source « Accès au compte » et l’option de transfert. Il ne prouve ni raisonnement produit par un modèle, ni recherche, ni transfert vers un outil d’assistance.',
        alt: 'Capture E-Code Chatbot Builder après le clic vérifié sur la question, avec fichiers HelpDesk Copilot et réponse citée dans la Webview.',
      },
      cta: {
        label: 'Inspecter l’exécution capturée de l’assistant',
        ariaLabel:
          'Inspecter la génération E-Code capturée de l’assistant de service client et sa réponse locale scénarisée',
      },
    },
    proofVisualAlts: {
      prompt: 'Prompt de l’Agent E-Code demandant HelpDesk Copilot avec réponses citées et transfert humain visible.',
      preview:
        'Workspace E-Code avec fichiers HelpDesk Copilot générés et interface d’assistance locale dans la Webview.',
      webviewOverview:
        'HelpDesk Copilot dans la Webview avec question de réinitialisation, réponse locale et source fictive.',
      iteration:
        'Workspace E-Code après le clic vérifié sur la question, avec fichiers et réponse citant Accès au compte.',
      webviewIteration:
        'Réponse de réinitialisation citant Accès au compte après l’interaction vérifiée sur la question.',
      files: 'Arborescence E-Code de HelpDesk Copilot avec fichiers modifiables de conversation, questions et sources.',
    },
    deliverables: {
      eyebrow: 'Ce que comprend HelpDesk Copilot',
      title: 'Un projet d’assistant relisible, du code jusqu’à l’interface statique en ligne',
      intro:
        'La source de HelpDesk Copilot, les documents locaux fictifs, l’état de réponse déterministe et l’aperçu responsive restent visibles. Un assistant relié à un modèle exige encore des services et un runtime connectés et testés séparément.',
      items: [
        {
          title: 'Source ouverte à la relecture et à l’export',
          body: 'Les questions suggérées, l’interface de conversation, la réponse locale, les cartes de sources et les contrôles de transfert se trouvent dans des fichiers modifiables que vous relisez, versionnez et emportez hors d’E-Code.',
        },
        {
          title: 'Documentation locale fictive bien visible',
          body: 'Le contenu d’aide d’exemple et sa citation « Accès au compte » restent visibles dans le code. Aucun corpus, pipeline de recherche, stockage vectoriel ni modèle de langage n’est branché.',
        },
        {
          title: 'Aperçu de conversation actif et adaptable',
          body: 'Testez l’interface du téléphone à l’ordinateur dans l’aperçu. Cela confirme le rendu du parcours, pas une recherche documentaire active, une réponse produite par un modèle, une authentification ni un transfert vers un outil d’assistance.',
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
      eyebrow: 'Pensé pour inspecter le parcours d’assistance',
      title: 'Un prototype de conversation d’assistance dont chaque frontière externe reste visible',
      intro:
        'Le parcours Générateur de chatbot garde le contenu local, les états générés et la Webview active de HelpDesk Copilot dans un seul flux inspectable.',
      items: [
        {
          title: 'Questions d’assistance suggérées',
          body: 'Des contrôles visibles lancent le parcours scénarisé sans saisie ni appel à un modèle.',
        },
        {
          title: 'Réponse locale déterministe',
          body: 'La question de réinitialisation produit la même réponse locale à chaque exécution pour un test d’interface reproductible.',
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
          title: 'Option de transfert, interface seule',
          body: 'L’interface expose le point de décision sans contacter une personne ni un outil d’assistance externe.',
        },
        {
          title: 'Projet exportable',
          body: 'Exportez les fichiers source ou poursuivez dans E-Code ; relisez les conditions de chaque modèle et service externe ajouté.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Parcours d’assistance à prototyper',
      title: 'Quatre scénarios d’assistance à structurer dans du code modifiable',
      intro:
        'Ces scénarios sont des prototypes d’interface fondés sur un contenu local scénarisé ; chacun exige sa connexion aux sources, son évaluation du modèle et ses tests d’exploitation avant tout usage client.',
      items: [
        {
          title: 'Prototypes de réponses de centre d’aide',
          body: 'Testez les questions suggérées, la présentation des citations et le libellé de transfert avant toute connexion à un service de recherche ou d’assistance.',
        },
        {
          title: 'Parcours d’assistance pour l’accès au compte',
          body: 'Prototypez les instructions de réinitialisation et le traitement de la source « Accès au compte » avec un contenu local fictif.',
        },
        {
          title: 'Revue des états de transfert',
          body: 'Relisez où la conversation propose un transfert à un humain avant de brancher une file d’assistance ou une action de ticket.',
        },
        {
          title: 'Assistants de prise en main',
          body: 'Construisez une interface guidée avec citations d’exemple, puis branchez et vérifiez les contenus approuvés pour la prise en main.',
        },
      ],
    },
    faq: {
      eyebrow: 'Questions sur l’assistant de service client',
      title: 'Le Générateur de chatbot, en toute honnêteté',
      intro: 'Ce que produit le parcours Générateur de chatbot, et où sont ses limites.',
      items: [
        {
          title: 'J’obtiens du code source modifiable ou un créateur de bot verrouillé ?',
          body: 'Vous obtenez des fichiers source React et TypeScript modifiables pour la conversation, la réponse locale, les citations et les contrôles de transfert. Le projet capturé ne contient aucun runtime de chatbot connecté.',
        },
        {
          title: 'Répond-il à partir de ma propre documentation ?',
          body: 'Pas dans cette exécution capturée. HelpDesk Copilot lit un petit jeu fictif stocké localement et renvoie une réponse déterministe. Connectez votre corpus, puis évaluez séparément la qualité de la recherche.',
        },
        {
          title: 'Peut-il transférer à un humain ?',
          body: 'L’interface générée affiche une option de transfert. Elle n’envoie ni ticket ni message ; un transfert réel exige une intégration à l’outil d’assistance, avec un acheminement, une attribution, de nouvelles tentatives et une gestion des échecs testés.',
        },
        {
          title: 'Puis-je connecter un vrai modèle ou une base de connaissances ?',
          body: 'Oui, en étendant la source exportée. Ces captures ne connectent aucun modèle de langage, stockage vectoriel, corpus actif ni pipeline RAG.',
        },
        {
          title: 'Comment faire évoluer l’assistant de service client ensuite ?',
          body: 'Modifiez directement la source de conversation générée ou demandez à l’Agent E-Code la question, l’état de réponse, la mise en page des citations ou le transfert suivant, puis vérifiez le résultat dans la Webview.',
        },
      ],
    },
    finalCta: {
      title: 'Décrivez une question d’assistance et exécutez le parcours de réponse',
      body: 'Transformez une vraie question d’assistance en interface conversationnelle modifiable, vérifiez sa réponse locale, sa carte source et son état de transfert dans la Webview, puis branchez et testez les services nécessaires à un usage client.',
      primaryCta: {
        label: 'Décrivez votre assistant de service client',
        ariaLabel: 'Décrivez votre chatbot avec E-Code',
      },
      secondaryCta: {
        label: 'Voir le parcours d’assistance',
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
      proofLinkLabel: 'Inspecter la preuve IDE de l’assistant de service client',
      deliverablesLabel: 'Ce que livre le Générateur de chatbot',
      featuresLabel: 'Capacités du Générateur de chatbot',
      useCasesLabel: 'Cas d’usage du Générateur de chatbot',
      faqLabel: 'Questions sur le Générateur de chatbot',
      finalCtaLabel: 'Commencer à construire votre assistant',
    },
  },
} as const satisfies CapturedSolutionCopyByLanguage;
