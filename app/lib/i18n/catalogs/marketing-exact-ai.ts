import { resolveMarketingLanguage } from './marketing';

export type ExactAiAgentShotId = 'agent-editor' | 'git-workflow' | 'deployments';
export type ExactAiAgentReelId = 'agent' | 'git' | 'deploy' | 'mobile';
export type ExactAiAgentUseCaseId = 'business' | 'personal' | 'education' | 'games';
export type ExactAiFeatureId = 'autonomous' | 'multilingual' | 'intelligent' | 'realtime';
export type ExactAiToolId = 'code' | 'visual' | 'search' | 'terminal' | 'dependencies' | 'git';
export type ExactAiUseCaseId = 'beginner' | 'prototype' | 'learning' | 'internal';
export type ExactAiDemoHighlightId = 'scaffold' | 'dashboard' | 'deploy';

interface ExactAiAgentCopy {
  badge: string;
  heroTitle: string;
  heroAccent: string;
  heroDescription: string;
  launchStudio: string;
  watchLiveDemo: string;
  proof: readonly string[];
  heroImageAlt: string;
  heroCaptions: readonly string[];
  stepsIntro: { title: string; description: string };
  steps: readonly { title: string; description: string }[];
  capture: {
    title: string;
    description: string;
    badge: string;
    imageAlt: string;
    body: string;
    action: string;
  };
  demoIntro: { title: string; description: string };
  shots: readonly {
    id: ExactAiAgentShotId;
    title: string;
    description: string;
    label: string;
    previewAlt: string;
  }[];
  exploreTitle: string;
  viewing: string;
  lookingTitle: string;
  lookingItems: readonly string[];
  reels: readonly {
    id: ExactAiAgentReelId;
    title: string;
    description: string;
    label: string;
  }[];
  moreIntro: { title: string; description: string };
  tabs: Record<'overview' | 'capabilities' | 'examples' | 'comparison', string>;
  capabilities: readonly {
    title: string;
    description: string;
    examples: readonly string[];
  }[];
  languageSupport: { title: string; description: string; technologies: readonly string[]; more: string };
  architecture: { title: string; description: string; points: readonly string[] };
  speed: {
    title: string;
    description: string;
    metrics: readonly { label: string; value: string }[];
  };
  useCases: readonly {
    id: ExactAiAgentUseCaseId;
    heading: string;
    apps: readonly { id: string; name: string; time: string }[];
  }[];
  comparison: {
    traditionalTitle: string;
    traditionalItems: readonly string[];
    agentTitle: string;
    agentItems: readonly string[];
    ctaTitle: string;
    ctaDescription: string;
    ctaAction: string;
  };
  stats: readonly { value: string; label: string }[];
  finalCta: { title: string; description: string; action: string };
}

interface ExactAiPageCopy {
  badge: string;
  heroPrefix: string;
  heroAccent: string;
  heroDescription: string;
  startBuilding: string;
  watchDemo: string;
  highlights: readonly { id: string; value: string; label: string }[];
  workspaceTitle: string;
  heroImageAlt: string;
  modelsIntro: string;
  demoIntro: { title: string; description: string };
  video: {
    fallback: string;
    badge: string;
    title: string;
    description: string;
    points: readonly string[];
    pauseAria: string;
    playAria: string;
    pause: string;
    play: string;
    jumpPrefix: string;
    jumpSuffix: string;
    jumpAction: string;
  };
  demoHighlights: readonly {
    id: ExactAiDemoHighlightId;
    title: string;
    description: string;
  }[];
  howItWorks: {
    title: string;
    description: string;
    steps: readonly { title: string; description: string }[];
  };
  featuresIntro: { title: string; description: string };
  features: readonly {
    id: ExactAiFeatureId;
    title: string;
    description: string;
    details: readonly string[];
  }[];
  toolsIntro: { title: string; description: string };
  tools: readonly {
    id: ExactAiToolId;
    name: string;
    description: string;
  }[];
  workspace: {
    badge: string;
    title: string;
    description: string;
    points: readonly string[];
    gitTitle: string;
    gitImageAlt: string;
  };
  useCasesIntro: { title: string; description: string };
  useCases: readonly {
    id: ExactAiUseCaseId;
    title: string;
    description: string;
    example: string;
  }[];
  tryIt: {
    title: string;
    description: string;
    promptsLabel: string;
    prompts: readonly { id: string; query: string; label: string }[];
    openAgent: string;
  };
  finalCta: { title: string; description: string; primary: string; secondary: string };
}

export interface MarketingExactAiCopy {
  exactAi: {
    aiAgent: ExactAiAgentCopy;
    ai: ExactAiPageCopy;
  };
}

export const marketingExactAiEn = {
  exactAi: {
    aiAgent: {
      badge: 'E-CODE AGENT 2.0 POWERED',
      heroTitle: 'AI Agent v2',
      heroAccent: 'Build Apps with Natural Language',
      heroDescription:
        'Describe your idea. Watch it build. Deploy instantly. No coding required—our AI handles everything.',
      launchStudio: 'Launch Agent Studio',
      watchLiveDemo: 'Watch Live Demo',
      proof: ['No credit card required', '100+ languages supported', 'Deploy in one click'],
      heroImageAlt:
        'The E-Code Agent building an app inside the IDE — agent panel, code editor, file tree and run/publish bar',
      heroCaptions: ['Agent + Editor, captured live', 'Run & Publish from one bar'],
      stepsIntro: {
        title: 'Building apps is now as easy as having a conversation',
        description: 'Just describe what you want. Watch it come to life.',
      },
      steps: [
        {
          title: '1. Describe Your Idea',
          description: 'Describe what you want in any language. “Build me a recipe app with search and favorites.”',
        },
        {
          title: '2. AI Builds Everything',
          description: 'Watch as the AI creates files, writes code, and sets up your entire project.',
        },
        {
          title: '3. Your App is Ready',
          description: 'In under a minute, your app is running and ready to share with the world.',
        },
      ],
      capture: {
        title: 'The E-Code Agent, inside the IDE',
        description:
          'A real capture: the agent chats on the left while it writes files in the editor and watches the file tree update in real time.',
        badge: 'Live capture',
        imageAlt: 'E-Code in-IDE Deployments panel — publish to a live URL without leaving the editor',
        body: 'Everything you see is the live product: the agent drafts requirements, generates the UI, wires up the backend, and exposes a one-click Run and Publish bar—no manual commands.',
        action: 'See the Git workflow',
      },
      demoIntro: {
        title: 'Watch AI Agent v2 in Action',
        description: 'Real-time demonstrations of AI building production-ready applications from natural language.',
      },
      shots: [
        {
          id: 'agent-editor',
          title: 'Agent + Editor',
          description: 'The agent chats on the left while it writes code in the editor and updates the file tree live.',
          label: 'IDE workspace',
          previewAlt: 'Agent and editor preview',
        },
        {
          id: 'git-workflow',
          title: 'Built-in Git workflow',
          description: 'Real Git panel: branch, working tree, the orange Commit button, and the commit graph.',
          label: 'Version control',
          previewAlt: 'Built-in Git workflow preview',
        },
        {
          id: 'deployments',
          title: 'In-IDE Deployments',
          description: 'Ship to the cloud straight from the Deployments panel—no terminal, no context switch.',
          label: 'Deploy',
          previewAlt: 'In-IDE Deployments preview',
        },
      ],
      exploreTitle: 'Explore the IDE',
      viewing: 'Viewing',
      lookingTitle: 'What you’re looking at',
      lookingItems: [
        'An Agent panel that builds alongside you, in plain language.',
        'A real code editor and file tree—edit anything by hand at any point.',
        'Built-in Git: branches, working tree, and one-click commits.',
        'Deploy to the cloud from the same window, no terminal required.',
      ],
      reels: [
        {
          id: 'agent',
          title: 'Agent Panel',
          description: 'Conversational building, right next to your code.',
          label: 'Live',
        },
        {
          id: 'git',
          title: 'Git Workflow',
          description: 'Branches, working tree, and one-click commits.',
          label: 'Source',
        },
        {
          id: 'deploy',
          title: 'Instant Deploy',
          description: 'Publish to the cloud from the Deployments panel.',
          label: 'Deploy',
        },
        {
          id: 'mobile',
          title: 'On Mobile',
          description: 'The full app, responsive down to 390px.',
          label: 'Mobile',
        },
      ],
      moreIntro: {
        title: 'More than just code generation',
        description: 'A complete development partner that thinks, designs, and builds.',
      },
      tabs: {
        overview: 'Overview',
        capabilities: 'Capabilities',
        examples: 'Examples',
        comparison: 'Why E-Code?',
      },
      capabilities: [
        {
          title: 'Natural Language Understanding',
          description: 'Just tell it what you want in any language.',
          examples: [
            '“Build a todo app with dark mode”',
            '“Create a portfolio website with animations”',
            '“Make a chat app with real-time messages”',
            '“Build an e-commerce store with cart”',
          ],
        },
        {
          title: 'Complete Project Generation',
          description: 'Creates entire project structures automatically.',
          examples: [
            'Generates all necessary files and folders',
            'Sets up proper project configuration',
            'Installs required dependencies',
            'Creates responsive layouts',
          ],
        },
        {
          title: 'Smart Code Decisions',
          description: 'Makes intelligent architectural choices.',
          examples: [
            'Chooses the right framework for your needs',
            'Implements best practices automatically',
            'Adds error handling and validation',
            'Optimizes for performance',
          ],
        },
        {
          title: 'Continuous Improvement',
          description: 'Refines and updates based on feedback.',
          examples: [
            '“Add a search feature to the app”',
            '“Make the design more colorful”',
            '“Add user authentication”',
            '“Connect it to a database”',
          ],
        },
      ],
      languageSupport: {
        title: 'Multi-Language Support',
        description: 'Builds apps in any language or framework.',
        technologies: ['JavaScript', 'Python', 'HTML/CSS', 'React', 'Node.js'],
        more: 'More…',
      },
      architecture: {
        title: 'Smart Architecture',
        description: 'Makes intelligent decisions about structure.',
        points: [
          'Proper file organization',
          'Best practice patterns',
          'Scalable architecture',
          'Security considerations',
        ],
      },
      speed: {
        title: 'Lightning Fast',
        description: 'Complete apps in under a minute.',
        metrics: [
          { label: 'Simple apps', value: '20–30s' },
          { label: 'Complex apps', value: '45–60s' },
          { label: 'With database', value: '+15s' },
        ],
      },
      useCases: [
        {
          id: 'business',
          heading: 'Business Apps',
          apps: [
            { id: 'landing', name: 'Landing Pages', time: '30s' },
            { id: 'contact', name: 'Contact Forms', time: '20s' },
            { id: 'admin', name: 'Admin Dashboards', time: '45s' },
            { id: 'analytics', name: 'Analytics Tools', time: '40s' },
          ],
        },
        {
          id: 'personal',
          heading: 'Personal Apps',
          apps: [
            { id: 'portfolio', name: 'Portfolio Sites', time: '35s' },
            { id: 'blog', name: 'Blogs', time: '25s' },
            { id: 'tasks', name: 'Task Managers', time: '30s' },
            { id: 'budget', name: 'Budget Trackers', time: '35s' },
          ],
        },
        {
          id: 'education',
          heading: 'Education Apps',
          apps: [
            { id: 'quiz', name: 'Quiz Apps', time: '40s' },
            { id: 'flashcards', name: 'Flashcards', time: '25s' },
            { id: 'timer', name: 'Study Timers', time: '20s' },
            { id: 'notes', name: 'Note Takers', time: '30s' },
          ],
        },
        {
          id: 'games',
          heading: 'Games Apps',
          apps: [
            { id: 'memory', name: 'Memory Games', time: '35s' },
            { id: 'puzzle', name: 'Puzzle Games', time: '40s' },
            { id: 'word', name: 'Word Games', time: '30s' },
            { id: 'drawing', name: 'Drawing Apps', time: '45s' },
          ],
        },
      ],
      comparison: {
        traditionalTitle: 'Traditional Coding',
        traditionalItems: [
          'Months to learn programming basics',
          'Hours to set up a development environment',
          'Days to build a simple app',
          'Constant debugging and error fixing',
        ],
        agentTitle: 'E-Code AI Agent',
        agentItems: [
          'Zero coding knowledge required',
          'Instant setup, no installation needed',
          'Complete apps in under a minute',
          'Clean, working code every time',
        ],
        ctaTitle: 'Ready to build something amazing?',
        ctaDescription: 'Join thousands who are building apps without writing code.',
        ctaAction: 'Start Building Now',
      },
      stats: [
        { value: '50K+', label: 'Apps Built' },
        { value: '30s', label: 'Average Build Time' },
        { value: '100%', label: 'No Code Required' },
        { value: '24/7', label: 'AI Available' },
      ],
      finalCta: {
        title: 'Stop dreaming. Start building.',
        description: 'Your ideas deserve to exist. Let our AI bring them to life.',
        action: 'Build Your First App',
      },
    },
    ai: {
      badge: 'THE E-CODE AI AGENT',
      heroPrefix: 'AI That',
      heroAccent: 'Builds Your App',
      heroDescription:
        'Describe what you want and the E-Code agent writes the code, runs it in a live cloud workspace, and ships it—all from one prompt.',
      startBuilding: 'Start Building Now',
      watchDemo: 'Watch Demo',
      highlights: [
        { id: 'languages', value: '100+', label: 'Languages you can prompt in' },
        { id: 'models', value: 'Multi-model', label: 'Anthropic, OpenAI, Google & more' },
        { id: 'workspace', value: 'Live', label: 'Cloud workspace per project' },
        { id: 'deploy', value: '1-click', label: 'Deploy to a shareable URL' },
      ],
      workspaceTitle: 'E-Code Workspace — AI Agent',
      heroImageAlt: 'The E-Code IDE with the AI Agent panel, code editor, file tree and live preview in one workspace',
      modelsIntro: 'Powered by the leading AI models — choose the one that fits your build',
      demoIntro: {
        title: 'See the AI Agent in Action',
        description: 'Watch a full app go from a single prompt to a deployed, shareable URL.',
      },
      video: {
        fallback: 'Your browser does not support the video tag.',
        badge: 'Live Platform Demo',
        title: 'From prompt to production in one session',
        description:
          'Follow along as the AI agent scaffolds a SaaS dashboard, configures infrastructure, and ships to the cloud.',
        points: ['Multi-step planning', 'Edits code in place', '1-click deployment'],
        pauseAria: 'Pause demo video',
        playAria: 'Play demo video',
        pause: 'Pause Demo',
        play: 'Play Demo',
        jumpPrefix: 'Jump to',
        jumpSuffix: 'in the demo',
        jumpAction: 'Jump to this chapter',
      },
      demoHighlights: [
        {
          id: 'scaffold',
          title: 'Scaffolding the app',
          description: 'Watch the AI agent plan the build and generate a production-ready project structure.',
        },
        {
          id: 'dashboard',
          title: 'Wiring the dashboard',
          description: 'The agent assembles a full analytics dashboard with real-time data visualization.',
        },
        {
          id: 'deploy',
          title: 'Shipping to the cloud',
          description: 'Infrastructure is configured and the app is deployed with a single click.',
        },
      ],
      howItWorks: {
        title: 'How the AI Agent Works',
        description: 'From idea to deployed app in three simple steps.',
        steps: [
          {
            title: '1. Describe Your Idea',
            description: 'Tell the agent what you want to build in plain language—any language you prefer.',
          },
          {
            title: '2. AI Builds Everything',
            description: 'Watch as the agent creates files, writes code, and sets up your project in a live workspace.',
          },
          {
            title: '3. Deploy Instantly',
            description: 'Ship to a live, shareable URL in one click—no extra configuration or setup needed.',
          },
        ],
      },
      featuresIntro: {
        title: 'AI Agent Capabilities',
        description: 'Powerful features that make building effortless.',
      },
      features: [
        {
          id: 'autonomous',
          title: 'Autonomous Building',
          description:
            'Describe what you want and the AI agent plans the build, writes the files, and wires it together.',
          details: [
            'Understands plain-language prompts in many languages',
            'Generates a complete project structure automatically',
            'Creates the files, routes, and configuration it needs',
            'Installs dependencies and provisions a live workspace',
            'Deploys to a shareable URL with one click',
          ],
        },
        {
          id: 'multilingual',
          title: 'Build in Your Language',
          description:
            'Prompt the agent in your native language and get responses, comments, and docs back the same way.',
          details: [
            'Describe your ideas in the language you think in',
            'Receive explanations in your preferred language',
            'Code comments written in your language',
            'Documentation generated alongside the code',
            'Accessible to developers around the world',
          ],
        },
        {
          id: 'intelligent',
          title: 'Production-Ready Code',
          description:
            'The agent writes clean, conventional code and iterates with you instead of dumping a black box.',
          details: [
            'Clean, maintainable file and folder structure',
            'Follows framework and language conventions',
            'Adds error handling as it builds',
            'Edits and refactors existing code in place',
            'Explains the changes it makes as it makes them',
          ],
        },
        {
          id: 'realtime',
          title: 'A Live Workspace',
          description:
            'Every build runs in a real cloud workspace with an editor, terminal, and live preview side by side.',
          details: [
            'Edit alongside the agent in a full code editor',
            'Run commands in an integrated terminal',
            'See a live preview update as files change',
            'Connect Git and push from inside the IDE',
            'Pick up the same project from desktop or mobile',
          ],
        },
      ],
      toolsIntro: {
        title: 'Tools the Agent Can Use',
        description:
          'The agent reaches for real platform capabilities while it builds—the same ones you have in the IDE.',
      },
      tools: [
        { id: 'code', name: 'Code Generation', description: 'Scaffold and edit files across your project' },
        { id: 'visual', name: 'Visual Editor', description: 'Point at the preview to describe UI changes' },
        { id: 'search', name: 'Codebase Search', description: 'Read and reason over your existing code' },
        { id: 'terminal', name: 'Integrated Terminal', description: 'Run scripts, tests, and CLI tools' },
        { id: 'dependencies', name: 'Dependency Install', description: 'Add and manage packages on the fly' },
        { id: 'git', name: 'Git & Deploy', description: 'Commit, push, and ship to production' },
      ],
      workspace: {
        badge: 'Inside the workspace',
        title: 'Not a black box—a real IDE',
        description:
          'The agent works in the same editor, terminal, and Git panel you do. Review every change, commit and push to your own repository, then deploy—all without leaving E-Code.',
        points: [
          'Inspect and edit every file the agent touches',
          'Connect GitHub or GitLab and push from the IDE',
          'Run tests and scripts in the integrated terminal',
        ],
        gitTitle: 'Git — E-Code IDE',
        gitImageAlt: 'The E-Code IDE Git panel showing source control changes ready to commit and push',
      },
      useCasesIntro: {
        title: 'Who Builds with the AI Agent?',
        description: 'From complete beginners to experienced developers.',
      },
      useCases: [
        {
          id: 'beginner',
          title: 'Complete Beginners',
          description: 'Never coded before? Describe your app idea and watch it come to life.',
          example: '“A website to track my daily habits with simple charts”',
        },
        {
          id: 'prototype',
          title: 'Rapid Prototyping',
          description: 'Turn an idea into a working prototype in minutes, not days.',
          example: '“A marketplace landing page for selling handmade crafts”',
        },
        {
          id: 'learning',
          title: 'Learning by Building',
          description: 'Learn as you go—the agent explains the code it generates.',
          example: '“Build a Tetris-style game and explain how it works”',
        },
        {
          id: 'internal',
          title: 'Internal Tools',
          description: 'Create dashboards and internal apps without a dedicated dev team.',
          example: '“A dashboard to track our sales and inventory”',
        },
      ],
      tryIt: {
        title: 'Try the AI Agent Now',
        description: 'See how easy it is to build your first app.',
        promptsLabel: 'Example prompts to try:',
        prompts: [
          {
            id: 'portfolio',
            query: 'Build a personal portfolio website with dark mode',
            label: '“Build a personal portfolio website with dark mode”',
          },
          {
            id: 'quiz',
            query: 'Create a quiz app with score tracking',
            label: '“Create a quiz app with score tracking”',
          },
          { id: 'chinese', query: '做一个待办事项应用', label: '“做一个待办事项应用” (Chinese)' },
        ],
        openAgent: 'Open AI Agent',
      },
      finalCta: {
        title: 'Start building with AI today',
        description: 'No credit card required. Spin up your first app on the free tier and ship it from your browser.',
        primary: 'Get Started Free',
        secondary: 'View Pricing',
      },
    },
  },
} as const satisfies MarketingExactAiCopy;

export const marketingExactAiFr = {
  exactAi: {
    aiAgent: {
      badge: 'PROPULSÉ PAR E-CODE AGENT 2.0',
      heroTitle: 'Agent IA v2',
      heroAccent: 'Créez des applications en langage naturel',
      heroDescription:
        'Décrivez votre idée. Regardez-la prendre vie. Déployez-la instantanément. Aucun code requis : notre IA s’occupe de tout.',
      launchStudio: 'Ouvrir le studio de l’agent',
      watchLiveDemo: 'Voir la démonstration en direct',
      proof: ['Aucune carte bancaire requise', 'Plus de 100 langages pris en charge', 'Déploiement en un clic'],
      heroImageAlt:
        'L’agent E-Code crée une application dans l’IDE, avec le panneau de l’agent, l’éditeur de code, l’arborescence et la barre d’exécution et de publication',
      heroCaptions: ['Agent et éditeur, capturés en direct', 'Exécutez et publiez depuis une seule barre'],
      stepsIntro: {
        title: 'Créer une application devient aussi simple que tenir une conversation',
        description: 'Décrivez simplement ce que vous souhaitez. Regardez votre idée prendre vie.',
      },
      steps: [
        {
          title: '1. Décrivez votre idée',
          description:
            'Décrivez ce que vous souhaitez dans la langue de votre choix. « Créez une application de recettes avec recherche et favoris. »',
        },
        {
          title: '2. L’IA construit tout',
          description: 'Regardez l’IA créer les fichiers, écrire le code et configurer l’intégralité de votre projet.',
        },
        {
          title: '3. Votre application est prête',
          description:
            'En moins d’une minute, votre application fonctionne et peut être partagée avec le monde entier.',
        },
      ],
      capture: {
        title: 'L’agent E-Code, au cœur de l’IDE',
        description:
          'Une capture réelle : l’agent échange à gauche pendant qu’il écrit les fichiers dans l’éditeur et met à jour l’arborescence en temps réel.',
        badge: 'Capture en direct',
        imageAlt:
          'Panneau Déploiements de l’IDE E-Code permettant de publier vers une URL en ligne sans quitter l’éditeur',
        body: 'Tout ce que vous voyez provient du produit en production : l’agent définit les exigences, génère l’interface, connecte le service applicatif et affiche une barre Exécuter et Publier en un clic, sans commande manuelle.',
        action: 'Voir le flux Git',
      },
      demoIntro: {
        title: 'Découvrez l’agent IA v2 à l’œuvre',
        description:
          'Des démonstrations en temps réel où l’IA crée des applications prêtes pour la production à partir du langage naturel.',
      },
      shots: [
        {
          id: 'agent-editor',
          title: 'Agent et éditeur',
          description:
            'L’agent échange à gauche pendant qu’il écrit le code dans l’éditeur et met à jour l’arborescence en direct.',
          label: 'Espace de travail IDE',
          previewAlt: 'Aperçu de l’agent et de l’éditeur',
        },
        {
          id: 'git-workflow',
          title: 'Flux Git intégré',
          description: 'Un véritable panneau Git : branche, changements, bouton Commit orange et graphe des commits.',
          label: 'Gestion de versions',
          previewAlt: 'Aperçu du flux Git intégré',
        },
        {
          id: 'deployments',
          title: 'Déploiements dans l’IDE',
          description:
            'Publiez dans le cloud directement depuis le panneau Déploiements, sans terminal ni changement de contexte.',
          label: 'Déployer',
          previewAlt: 'Aperçu des déploiements dans l’IDE',
        },
      ],
      exploreTitle: 'Explorez l’IDE',
      viewing: 'Affiché',
      lookingTitle: 'Ce que vous voyez',
      lookingItems: [
        'Un panneau Agent qui crée à vos côtés, en langage courant.',
        'Un véritable éditeur de code et une arborescence : modifiez tout manuellement à tout moment.',
        'Git intégré : branches, changements et commits en un clic.',
        'Déployez dans le cloud depuis la même fenêtre, sans terminal.',
      ],
      reels: [
        {
          id: 'agent',
          title: 'Panneau Agent',
          description: 'Créez par la conversation, juste à côté de votre code.',
          label: 'En direct',
        },
        {
          id: 'git',
          title: 'Flux Git',
          description: 'Branches, changements et commits en un clic.',
          label: 'Source',
        },
        {
          id: 'deploy',
          title: 'Déploiement instantané',
          description: 'Publiez dans le cloud depuis le panneau Déploiements.',
          label: 'Déployer',
        },
        {
          id: 'mobile',
          title: 'Sur mobile',
          description: 'L’application complète, adaptative jusqu’à 390 px.',
          label: 'Mobile',
        },
      ],
      moreIntro: {
        title: 'Bien plus que de la génération de code',
        description: 'Un partenaire de développement complet qui réfléchit, conçoit et crée.',
      },
      tabs: {
        overview: 'Vue d’ensemble',
        capabilities: 'Capacités',
        examples: 'Exemples',
        comparison: 'Pourquoi E-Code ?',
      },
      capabilities: [
        {
          title: 'Compréhension du langage naturel',
          description: 'Dites-lui simplement ce que vous souhaitez, dans la langue de votre choix.',
          examples: [
            '« Créez une application de tâches avec un mode sombre »',
            '« Créez un site portfolio avec des animations »',
            '« Créez une application de chat avec des messages en temps réel »',
            '« Créez une boutique en ligne avec un panier »',
          ],
        },
        {
          title: 'Génération de projets complets',
          description: 'Crée automatiquement des structures de projet complètes.',
          examples: [
            'Génère tous les fichiers et dossiers nécessaires',
            'Configure correctement le projet',
            'Installe les dépendances requises',
            'Crée des mises en page adaptatives',
          ],
        },
        {
          title: 'Décisions de code intelligentes',
          description: 'Prend des décisions d’architecture pertinentes.',
          examples: [
            'Choisit le framework adapté à vos besoins',
            'Applique automatiquement les bonnes pratiques',
            'Ajoute la gestion des erreurs et la validation',
            'Optimise les performances',
          ],
        },
        {
          title: 'Amélioration continue',
          description: 'Affine et met à jour le projet selon vos retours.',
          examples: [
            '« Ajoutez une fonctionnalité de recherche »',
            '« Rendez le design plus coloré »',
            '« Ajoutez l’authentification utilisateur »',
            '« Connectez l’application à une base de données »',
          ],
        },
      ],
      languageSupport: {
        title: 'Prise en charge multilangage',
        description: 'Crée des applications dans tous les langages et frameworks.',
        technologies: ['JavaScript', 'Python', 'HTML/CSS', 'React', 'Node.js'],
        more: 'Et plus…',
      },
      architecture: {
        title: 'Architecture intelligente',
        description: 'Prend des décisions pertinentes sur la structure.',
        points: [
          'Organisation cohérente des fichiers',
          'Modèles fondés sur les bonnes pratiques',
          'Architecture évolutive',
          'Prise en compte de la sécurité',
        ],
      },
      speed: {
        title: 'Une rapidité fulgurante',
        description: 'Des applications complètes en moins d’une minute.',
        metrics: [
          { label: 'Applications simples', value: '20 à 30 s' },
          { label: 'Applications complexes', value: '45 à 60 s' },
          { label: 'Avec base de données', value: '+15 s' },
        ],
      },
      useCases: [
        {
          id: 'business',
          heading: 'Applications professionnelles',
          apps: [
            { id: 'landing', name: 'Pages de destination', time: '30 s' },
            { id: 'contact', name: 'Formulaires de contact', time: '20 s' },
            { id: 'admin', name: 'Tableaux de bord administrateur', time: '45 s' },
            { id: 'analytics', name: 'Outils analytiques', time: '40 s' },
          ],
        },
        {
          id: 'personal',
          heading: 'Applications personnelles',
          apps: [
            { id: 'portfolio', name: 'Sites portfolio', time: '35 s' },
            { id: 'blog', name: 'Blogs', time: '25 s' },
            { id: 'tasks', name: 'Gestionnaires de tâches', time: '30 s' },
            { id: 'budget', name: 'Suivis de budget', time: '35 s' },
          ],
        },
        {
          id: 'education',
          heading: 'Applications éducatives',
          apps: [
            { id: 'quiz', name: 'Applications de quiz', time: '40 s' },
            { id: 'flashcards', name: 'Cartes mémoire', time: '25 s' },
            { id: 'timer', name: 'Minuteurs d’étude', time: '20 s' },
            { id: 'notes', name: 'Prise de notes', time: '30 s' },
          ],
        },
        {
          id: 'games',
          heading: 'Applications de jeu',
          apps: [
            { id: 'memory', name: 'Jeux de mémoire', time: '35 s' },
            { id: 'puzzle', name: 'Jeux de réflexion', time: '40 s' },
            { id: 'word', name: 'Jeux de lettres', time: '30 s' },
            { id: 'drawing', name: 'Applications de dessin', time: '45 s' },
          ],
        },
      ],
      comparison: {
        traditionalTitle: 'Développement traditionnel',
        traditionalItems: [
          'Des mois pour apprendre les bases de la programmation',
          'Des heures pour configurer un environnement de développement',
          'Des jours pour créer une application simple',
          'Des débogages et corrections d’erreurs constants',
        ],
        agentTitle: 'Agent IA E-Code',
        agentItems: [
          'Aucune connaissance en programmation requise',
          'Configuration instantanée, sans installation',
          'Des applications complètes en moins d’une minute',
          'Un code propre et fonctionnel à chaque fois',
        ],
        ctaTitle: 'Prêt à créer quelque chose d’exceptionnel ?',
        ctaDescription: 'Rejoignez les milliers de personnes qui créent des applications sans écrire de code.',
        ctaAction: 'Commencer à créer',
      },
      stats: [
        { value: '50 k+', label: 'Applications créées' },
        { value: '30 s', label: 'Temps de création moyen' },
        { value: '100 %', label: 'Aucun code requis' },
        { value: '24 h/24', label: 'IA disponible' },
      ],
      finalCta: {
        title: 'Arrêtez de rêver. Commencez à créer.',
        description: 'Vos idées méritent d’exister. Laissez notre IA leur donner vie.',
        action: 'Créer votre première application',
      },
    },
    ai: {
      badge: 'L’AGENT IA E-CODE',
      heroPrefix: 'Une IA qui',
      heroAccent: 'crée votre application',
      heroDescription:
        'Décrivez ce que vous souhaitez : l’agent E-Code écrit le code, l’exécute dans un espace cloud en direct et le publie, à partir d’un seul prompt.',
      startBuilding: 'Commencer à créer',
      watchDemo: 'Voir la démonstration',
      highlights: [
        { id: 'languages', value: '100+', label: 'Langues disponibles pour vos prompts' },
        { id: 'models', value: 'Multi-modèle', label: 'Anthropic, OpenAI, Google et plus' },
        { id: 'workspace', value: 'En direct', label: 'Un espace cloud par projet' },
        { id: 'deploy', value: '1 clic', label: 'Déploiement vers une URL partageable' },
      ],
      workspaceTitle: 'Espace de travail E-Code — Agent IA',
      heroImageAlt:
        'L’IDE E-Code réunit le panneau de l’agent IA, l’éditeur de code, l’arborescence et l’aperçu en direct dans un même espace de travail',
      modelsIntro: 'Propulsé par les principaux modèles d’IA : choisissez celui qui convient à votre projet',
      demoIntro: {
        title: 'Découvrez l’agent IA à l’œuvre',
        description: 'Regardez une application complète passer d’un prompt unique à une URL déployée et partageable.',
      },
      video: {
        fallback: 'Votre navigateur ne prend pas en charge la vidéo.',
        badge: 'Démonstration en direct',
        title: 'Du prompt à la production en une seule session',
        description:
          'Suivez l’agent IA pendant qu’il structure un tableau de bord SaaS, configure l’infrastructure et le publie dans le cloud.',
        points: ['Planification en plusieurs étapes', 'Modification du code en place', 'Déploiement en un clic'],
        pauseAria: 'Mettre la démonstration vidéo en pause',
        playAria: 'Lire la démonstration vidéo',
        pause: 'Mettre en pause',
        play: 'Lire la démonstration',
        jumpPrefix: 'Accéder à',
        jumpSuffix: 'dans la démonstration',
        jumpAction: 'Accéder à ce chapitre',
      },
      demoHighlights: [
        {
          id: 'scaffold',
          title: 'Structuration de l’application',
          description:
            'Regardez l’agent IA planifier la création et générer une structure de projet prête pour la production.',
        },
        {
          id: 'dashboard',
          title: 'Connexion du tableau de bord',
          description:
            'L’agent assemble un tableau de bord analytique complet avec une visualisation des données en temps réel.',
        },
        {
          id: 'deploy',
          title: 'Publication dans le cloud',
          description: 'L’infrastructure est configurée et l’application est déployée en un seul clic.',
        },
      ],
      howItWorks: {
        title: 'Comment fonctionne l’agent IA',
        description: 'De l’idée à l’application déployée en trois étapes simples.',
        steps: [
          {
            title: '1. Décrivez votre idée',
            description:
              'Expliquez à l’agent ce que vous souhaitez créer en langage courant, dans la langue de votre choix.',
          },
          {
            title: '2. L’IA construit tout',
            description:
              'Regardez l’agent créer les fichiers, écrire le code et configurer votre projet dans un espace en direct.',
          },
          {
            title: '3. Déployez instantanément',
            description:
              'Publiez vers une URL partageable en un clic, sans configuration ni installation supplémentaire.',
          },
        ],
      },
      featuresIntro: {
        title: 'Capacités de l’agent IA',
        description: 'Des fonctionnalités puissantes qui simplifient la création.',
      },
      features: [
        {
          id: 'autonomous',
          title: 'Création autonome',
          description: 'Décrivez votre besoin : l’agent IA planifie le projet, écrit les fichiers et relie l’ensemble.',
          details: [
            'Comprend les prompts en langage courant dans de nombreuses langues',
            'Génère automatiquement une structure de projet complète',
            'Crée les fichiers, routes et configurations nécessaires',
            'Installe les dépendances et prépare un espace de travail en direct',
            'Déploie vers une URL partageable en un clic',
          ],
        },
        {
          id: 'multilingual',
          title: 'Créez dans votre langue',
          description:
            'Adressez-vous à l’agent dans votre langue et recevez les réponses, commentaires et documents dans cette même langue.',
          details: [
            'Décrivez vos idées dans la langue dans laquelle vous pensez',
            'Recevez les explications dans votre langue préférée',
            'Obtenez des commentaires de code dans votre langue',
            'Générez la documentation en parallèle du code',
            'Rendez le développement accessible partout dans le monde',
          ],
        },
        {
          id: 'intelligent',
          title: 'Code prêt pour la production',
          description:
            'L’agent écrit un code propre et conventionnel, puis itère avec vous au lieu de livrer une boîte noire.',
          details: [
            'Structure de fichiers et de dossiers propre et maintenable',
            'Respect des conventions du framework et du langage',
            'Ajout de la gestion des erreurs pendant la création',
            'Modification et refactorisation du code existant sur place',
            'Explication des changements au fur et à mesure',
          ],
        },
        {
          id: 'realtime',
          title: 'Un espace de travail en direct',
          description:
            'Chaque projet s’exécute dans un véritable espace cloud réunissant l’éditeur, le terminal et l’aperçu en direct.',
          details: [
            'Modifiez le code aux côtés de l’agent dans un éditeur complet',
            'Exécutez des commandes dans un terminal intégré',
            'Suivez l’aperçu en direct pendant la modification des fichiers',
            'Connectez Git et poussez vos changements depuis l’IDE',
            'Reprenez le même projet sur ordinateur ou mobile',
          ],
        },
      ],
      toolsIntro: {
        title: 'Outils à la disposition de l’agent',
        description:
          'Pendant la création, l’agent utilise les capacités réelles de la plateforme, les mêmes que celles de votre IDE.',
      },
      tools: [
        { id: 'code', name: 'Génération de code', description: 'Structure et modifie les fichiers de votre projet' },
        {
          id: 'visual',
          name: 'Éditeur visuel',
          description: 'Ciblez l’aperçu pour décrire les changements d’interface',
        },
        { id: 'search', name: 'Recherche dans le code', description: 'Lit et analyse votre code existant' },
        { id: 'terminal', name: 'Terminal intégré', description: 'Exécute les scripts, tests et outils CLI' },
        {
          id: 'dependencies',
          name: 'Installation des dépendances',
          description: 'Ajoute et gère les packages à la volée',
        },
        { id: 'git', name: 'Git et déploiement', description: 'Crée des commits, pousse et publie en production' },
      ],
      workspace: {
        badge: 'Dans l’espace de travail',
        title: 'Pas une boîte noire : un véritable IDE',
        description:
          'L’agent travaille dans le même éditeur, terminal et panneau Git que vous. Examinez chaque modification, créez un commit, poussez vers votre dépôt, puis déployez, sans quitter E-Code.',
        points: [
          'Examinez et modifiez chaque fichier touché par l’agent',
          'Connectez GitHub ou GitLab et poussez depuis l’IDE',
          'Exécutez les tests et scripts dans le terminal intégré',
        ],
        gitTitle: 'Git — IDE E-Code',
        gitImageAlt:
          'Le panneau Git de l’IDE E-Code affiche les changements prêts à être ajoutés à un commit et poussés',
      },
      useCasesIntro: {
        title: 'Qui crée avec l’agent IA ?',
        description: 'Des grands débutants aux développeurs expérimentés.',
      },
      useCases: [
        {
          id: 'beginner',
          title: 'Grands débutants',
          description: 'Vous n’avez jamais codé ? Décrivez votre idée et regardez-la prendre vie.',
          example: '« Un site pour suivre mes habitudes quotidiennes avec des graphiques simples »',
        },
        {
          id: 'prototype',
          title: 'Prototypage rapide',
          description:
            'Transformez une idée en prototype fonctionnel en quelques minutes plutôt qu’en plusieurs jours.',
          example: '« Une page de marketplace pour vendre des créations artisanales »',
        },
        {
          id: 'learning',
          title: 'Apprendre en créant',
          description: 'Apprenez au fil de la création : l’agent explique le code qu’il génère.',
          example: '« Créez un jeu inspiré de Tetris et expliquez son fonctionnement »',
        },
        {
          id: 'internal',
          title: 'Outils internes',
          description: 'Créez des tableaux de bord et applications internes sans équipe de développement dédiée.',
          example: '« Un tableau de bord pour suivre nos ventes et nos stocks »',
        },
      ],
      tryIt: {
        title: 'Essayez l’agent IA maintenant',
        description: 'Découvrez comme il est simple de créer votre première application.',
        promptsLabel: 'Exemples de prompts à essayer :',
        prompts: [
          {
            id: 'portfolio',
            query: 'Créez un site portfolio personnel avec un mode sombre',
            label: '« Créez un site portfolio personnel avec un mode sombre »',
          },
          {
            id: 'quiz',
            query: 'Créez une application de quiz avec suivi du score',
            label: '« Créez une application de quiz avec suivi du score »',
          },
          { id: 'chinese', query: '做一个待办事项应用', label: '« 做一个待办事项应用 » (chinois)' },
        ],
        openAgent: 'Ouvrir l’agent IA',
      },
      finalCta: {
        title: 'Commencez à créer avec l’IA dès aujourd’hui',
        description:
          'Aucune carte bancaire requise. Créez votre première application avec l’offre gratuite et publiez-la depuis votre navigateur.',
        primary: 'Commencer gratuitement',
        secondary: 'Voir les tarifs',
      },
    },
  },
} as const satisfies MarketingExactAiCopy;

export function getMarketingExactAiCopy(language?: string | null): MarketingExactAiCopy {
  return resolveMarketingLanguage(language) === 'fr' ? marketingExactAiFr : marketingExactAiEn;
}
