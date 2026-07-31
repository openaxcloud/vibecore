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
        'Describe the assistant you need. E-Code turns it into a conversational agent in editable source files — reviewable prompts, tools, memory, and audit boundaries — that answers from your knowledge base and hands off to a human when unsure.',
    },
    hero: {
      eyebrow: 'Chatbot & AI Agent Builder for real assistants',
      title: 'Turn your documentation into a support assistant you fully own',
      subtitle:
        'Describe how the assistant should answer, which sources it can use, and when it should escalate. E-Code turns that into a conversational agent in editable source code — with reviewable prompts, tools, memory, and audit boundaries. Inspect every file, run it in Preview, refine it through the Agent, and keep the logic yours.',
      primaryCta: { label: 'Describe your assistant', ariaLabel: 'Describe your chatbot with E-Code' },
      secondaryCta: { label: 'See how it builds', ariaLabel: 'See how E-Code builds the assistant from a prompt' },
      microcopy:
        'Start from the questions your team already answers. The prompt, the tools, the memory, and the running Preview stay visible as the assistant evolves.',
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
        'E-Code starts from the assistant you describe and produces its prompt, tools, memory, and escalation rules in real source files. You inspect the logic, run it in Preview, and request the next change without leaving the code behind.',
    },
    build: {
      eyebrow: 'One prompt starts the assistant',
      title: 'Describe the behavior, not the framework',
      intro:
        'The request below reads like a note from a support lead. The four items map its implementation scope in real source files, not a locked bot builder.',
      label: 'Example prompt',
      promptText: 'Build a support chatbot that answers from our documentation and hands off to a human when unsure.',
      outputs: [
        {
          title: 'Reviewable prompt and tools',
          body: 'The system prompt, the tools the assistant may call, and their boundaries live in editable files the team can read and constrain.',
        },
        {
          title: 'Knowledge base answers',
          body: 'The assistant retrieves from a modeled documentation source and cites what it used, so every answer traces back to a document.',
        },
        {
          title: 'Human handoff on low confidence',
          body: 'Escalation is a working rule: when confidence is low or the question is out of scope, the conversation hands off to a human agent.',
        },
        {
          title: 'Preview and audit boundaries',
          body: 'E-Code runs the assistant in Preview across screen sizes. Memory, sources, and escalation logic stay inspectable rather than hidden in a closed service.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt → agent → Preview',
      title: 'Want to see a real E-Code build end to end?',
      body: 'The App Builder page shows a captured, real E-Code workspace — the prompt, the agent’s plan, the generated files, and the running Preview — for a booking application. The same build loop applies to a conversational assistant like this one.',
      cta: { label: 'See the real IDE proof', ariaLabel: 'See the real E-Code IDE proof on the App Builder page' },
    },
    deliverables: {
      eyebrow: 'What you receive',
      title: 'An assistant you own, inspect, and keep evolving',
      intro:
        'The project stays inspectable from the first generated file through Preview and export. Prompts, tools, memory, and escalation rules are code you can read, version, and change.',
      items: [
        {
          title: 'Editable source files',
          body: 'Real prompt, tools, memory, and routing you can read, version, and change directly.',
        },
        {
          title: 'Knowledge base model',
          body: 'A documentation source modeled as content the assistant retrieves from and cites.',
        },
        {
          title: 'Reviewable tool boundaries',
          body: 'Every tool the assistant can call is declared in code you can audit and constrain.',
        },
        {
          title: 'Human handoff flow',
          body: 'Escalation to a human on low confidence, defined as a rule you can test and adjust.',
        },
        {
          title: 'Responsive chat surface',
          body: 'Desktop, tablet, and mobile chat layouts verified in Preview before you publish.',
        },
        {
          title: 'Agent-ready iteration',
          body: 'Ask the Agent for the next change and review the diff against the running assistant.',
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
          body: 'Retrieve from a modeled knowledge base and cite the documents used in each reply.',
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
          body: 'Conversation and context memory is modeled explicitly, never a hidden black box.',
        },
        { title: 'Human handoff', body: 'Escalate to an agent when confidence is low or the request is out of scope.' },
        {
          title: 'Own the code',
          body: 'Export the project or keep building — the prompt, tools, and logic stay yours.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Who builds with it',
      title: 'Assistants teams ship with the Chatbot Builder',
      intro:
        'From a documentation copilot to an internal task agent, the same loop produces a real, reviewable assistant.',
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
          body: 'You get editable source files — the prompt, tools, memory, and routing — that you can read, version, and export. There is no proprietary bot lock-in.',
        },
        {
          title: 'Does it answer from my own documentation?',
          body: 'The generated assistant is modeled to retrieve from a knowledge base and cite what it used. The inline demonstration on this page uses fictional data and no connected model or backend.',
        },
        {
          title: 'Can it hand off to a human?',
          body: 'Yes. Escalation on low confidence or out-of-scope questions is a rule defined in code, so you can test and adjust when the assistant hands off.',
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
      body: 'Turn the questions your team answers into a conversational assistant in real source code — with reviewable prompts, tools, memory, and handoff — and run it in Preview.',
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
        'Décrivez l’assistant dont vous avez besoin. E-Code en fait un agent conversationnel dans des fichiers source modifiables — prompts, outils, mémoire et limites d’audit relisibles — qui répond à partir de votre base de connaissances et transfère à un humain en cas de doute.',
    },
    hero: {
      eyebrow: 'Générateur de chatbot et d’agent IA pour de vrais assistants',
      title: 'Transformez votre documentation en un assistant de support que vous possédez',
      subtitle:
        'Décrivez comment l’assistant doit répondre, quelles sources il peut utiliser et quand il doit escalader. E-Code en fait un agent conversationnel dans un vrai code source modifiable — avec des prompts, des outils, une mémoire et des limites d’audit relisibles. Inspectez chaque fichier, exécutez-le dans l’aperçu, affinez-le avec l’Agent et gardez la logique vôtre.',
      primaryCta: { label: 'Décrivez votre assistant', ariaLabel: 'Décrivez votre chatbot avec E-Code' },
      secondaryCta: {
        label: 'Voir la construction',
        ariaLabel: 'Voir comment E-Code construit l’assistant à partir d’un prompt',
      },
      microcopy:
        'Partez des questions auxquelles votre équipe répond déjà. Le prompt, les outils, la mémoire et l’aperçu actif restent visibles à mesure que l’assistant évolue.',
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
      disclaimer: 'Démonstration responsive intégrée · données d’assistant fictives · pas une trace de génération',
      caption: {
        title: 'Un assistant de support qui se lit comme un vrai produit',
        body: 'Cette démonstration intégrée présente un fil de conversation avec des réponses citées, un transfert en cas de confiance faible et un panneau des sources de la réponse dans une mise en page responsive.',
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
        'E-Code part de l’assistant que vous décrivez et produit son prompt, ses outils, sa mémoire et ses règles d’escalade dans de vrais fichiers source. Vous inspectez la logique, l’exécutez dans l’aperçu et demandez le changement suivant sans abandonner le code.',
    },
    build: {
      eyebrow: 'Un prompt lance l’assistant',
      title: 'Décrivez le comportement, pas le framework',
      intro:
        'La demande ci-dessous se lit comme un mot d’un responsable support. Les quatre éléments cartographient son périmètre d’implémentation dans de vrais fichiers source, pas un créateur de bot verrouillé.',
      label: 'Exemple de prompt',
      promptText:
        'Construis un chatbot de support qui répond à partir de notre documentation et transfère à un humain en cas de doute.',
      outputs: [
        {
          title: 'Prompt et outils relisibles',
          body: 'Le prompt système, les outils que l’assistant peut appeler et leurs limites vivent dans des fichiers modifiables que l’équipe peut lire et contraindre.',
        },
        {
          title: 'Réponses depuis la base de connaissances',
          body: 'L’assistant récupère depuis une source de documentation modélisée et cite ce qu’il a utilisé, pour que chaque réponse remonte à un document.',
        },
        {
          title: 'Transfert humain en cas de doute',
          body: 'L’escalade est une règle fonctionnelle : quand la confiance est faible ou la question hors périmètre, la conversation est transférée à un agent humain.',
        },
        {
          title: 'Aperçu et limites d’audit',
          body: 'E-Code exécute l’assistant dans l’aperçu à toutes les tailles d’écran. Mémoire, sources et logique d’escalade restent inspectables plutôt que masquées dans un service fermé.',
        },
      ],
    },
    proofLink: {
      eyebrow: 'Prompt → agent → aperçu',
      title: 'Envie de voir une vraie génération E-Code de bout en bout ?',
      body: 'La page App Builder montre un vrai workspace E-Code capturé — le prompt, le plan de l’agent, les fichiers générés et l’aperçu actif — pour une application de réservation. La même boucle de construction s’applique à un assistant conversationnel comme celui-ci.',
      cta: {
        label: 'Voir la preuve IDE réelle',
        ariaLabel: 'Voir la preuve IDE réelle E-Code sur la page App Builder',
      },
    },
    deliverables: {
      eyebrow: 'Ce que vous recevez',
      title: 'Un assistant que vous possédez, inspectez et faites évoluer',
      intro:
        'Le projet reste inspectable du premier fichier généré jusqu’à l’aperçu et l’export. Prompts, outils, mémoire et règles d’escalade sont du code que vous lisez, versionnez et modifiez.',
      items: [
        {
          title: 'Fichiers source modifiables',
          body: 'De vrais prompt, outils, mémoire et routage que vous lisez, versionnez et modifiez directement.',
        },
        {
          title: 'Modèle de base de connaissances',
          body: 'Une source de documentation modélisée comme un contenu que l’assistant récupère et cite.',
        },
        {
          title: 'Limites d’outils relisibles',
          body: 'Chaque outil que l’assistant peut appeler est déclaré dans un code que vous auditez et contraignez.',
        },
        {
          title: 'Parcours de transfert humain',
          body: 'Escalade vers un humain en cas de confiance faible, définie comme une règle que vous testez et ajustez.',
        },
        {
          title: 'Surface de chat responsive',
          body: 'Mises en page de chat desktop, tablette et mobile vérifiées dans l’aperçu avant publication.',
        },
        {
          title: 'Itération avec l’Agent',
          body: 'Demandez le changement suivant à l’Agent et relisez le diff face à l’assistant actif.',
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
          body: 'Récupérez depuis une base de connaissances modélisée et citez les documents utilisés dans chaque réponse.',
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
          body: 'La mémoire de conversation et de contexte est modélisée explicitement, jamais une boîte noire cachée.',
        },
        {
          title: 'Transfert humain',
          body: 'Escaladez vers un agent quand la confiance est faible ou la demande hors périmètre.',
        },
        {
          title: 'Possédez le code',
          body: 'Exportez le projet ou continuez à construire — le prompt, les outils et la logique restent les vôtres.',
        },
      ],
    },
    useCases: {
      eyebrow: 'Qui construit avec',
      title: 'Les assistants que les équipes livrent avec le Générateur de chatbot',
      intro:
        'D’un copilote de documentation à un agent de tâches interne, la même boucle produit un vrai assistant relisible.',
      items: [
        {
          title: 'Bots de support documentation',
          body: 'Répondez aux questions clients à partir des docs produit et escaladez en cas de doute.',
        },
        {
          title: 'Help desks internes',
          body: 'Des assistants qui répondent aux questions IT, RH ou ops depuis des bases de connaissances internes.',
        },
        {
          title: 'Agents de tâches et de workflow',
          body: 'Des agents qui appellent des outils bornés pour réaliser des étapes et rendre compte pour relecture.',
        },
        {
          title: 'Assistants d’onboarding',
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
          body: 'Vous obtenez des fichiers source modifiables — le prompt, les outils, la mémoire et le routage — que vous lisez, versionnez et exportez. Aucun verrouillage propriétaire.',
        },
        {
          title: 'Répond-il à partir de ma propre documentation ?',
          body: 'L’assistant généré est modélisé pour récupérer depuis une base de connaissances et citer ce qu’il a utilisé. La démonstration intégrée de cette page utilise des données fictives, sans modèle ni backend connecté.',
        },
        {
          title: 'Peut-il transférer à un humain ?',
          body: 'Oui. L’escalade en cas de confiance faible ou de question hors périmètre est une règle définie dans le code, que vous testez et ajustez quand l’assistant transfère.',
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
      body: 'Transformez les questions auxquelles votre équipe répond en un assistant conversationnel dans du vrai code source — avec prompts, outils, mémoire et transfert relisibles — et exécutez-le dans l’aperçu.',
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
