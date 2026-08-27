import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const apiAiFeaturesEn = {
  'apiAiFeatures.features.autonomous.title': 'Autonomous Agent',
  'apiAiFeatures.features.autonomous.description':
    'AI that plans, codes, and deploys full applications independently with multi-step reasoning.',
  'apiAiFeatures.features.autonomous.detail0': 'Multi-step task planning and execution',
  'apiAiFeatures.features.autonomous.detail1': 'Automatic error detection and self-correction',
  'apiAiFeatures.features.autonomous.detail2': 'Parallel task decomposition for faster delivery',
  'apiAiFeatures.features.autonomous.detail3': 'Full application scaffolding from a single prompt',
  'apiAiFeatures.features.multilingual.title': '28+ Languages',
  'apiAiFeatures.features.multilingual.description':
    'Expert-level support for Python, TypeScript, Rust, Go, Java, C++, and 22 more languages.',
  'apiAiFeatures.features.multilingual.detail0': 'Real-time syntax highlighting and IntelliSense',
  'apiAiFeatures.features.multilingual.detail1': 'Language-specific best practices and patterns',
  'apiAiFeatures.features.multilingual.detail2': 'Cross-language refactoring and migration',
  'apiAiFeatures.features.multilingual.detail3': 'Framework-aware code generation',
  'apiAiFeatures.features.intelligent.title': 'Intelligent Context',
  'apiAiFeatures.features.intelligent.description':
    'Understands your entire codebase - files, dependencies, Git history - to generate precise code.',
  'apiAiFeatures.features.intelligent.detail0': 'Repository-wide context awareness (1M token window)',
  'apiAiFeatures.features.intelligent.detail1': 'Dependency graph analysis',
  'apiAiFeatures.features.intelligent.detail2': 'Git history for informed suggestions',
  'apiAiFeatures.features.intelligent.detail3': 'Memory bank for persistent project knowledge',
  'apiAiFeatures.features.realtime.title': 'Real-Time Streaming',
  'apiAiFeatures.features.realtime.description':
    'See code appear instantly via SSE streaming. No waiting - your AI works at the speed of thought.',
  'apiAiFeatures.features.realtime.detail0': 'Token-by-token SSE streaming output',
  'apiAiFeatures.features.realtime.detail1': 'Live preview auto-refresh',
  'apiAiFeatures.features.realtime.detail2': 'Incremental file edits (no full rewrites)',
  'apiAiFeatures.features.realtime.detail3': 'WebSocket-based collaborative editing',
  'apiAiFeatures.useCases.fullStack.title': 'Full-Stack Applications',
  'apiAiFeatures.useCases.fullStack.description':
    'Build complete web apps with React, Node.js, and PostgreSQL from a single prompt.',
  'apiAiFeatures.useCases.fullStack.example': '"Create a SaaS dashboard with authentication and Stripe billing"',
  'apiAiFeatures.useCases.apiDevelopment.title': 'API Development',
  'apiAiFeatures.useCases.apiDevelopment.description':
    'Generate REST or GraphQL APIs with validation, auth, and OpenAPI docs automatically.',
  'apiAiFeatures.useCases.apiDevelopment.example': '"Build a REST API with JWT auth, rate limiting, and Swagger docs"',
  'apiAiFeatures.useCases.testing.title': 'AI-Powered Testing',
  'apiAiFeatures.useCases.testing.description':
    'Auto-generate unit, integration, and E2E test suites with full coverage reports.',
  'apiAiFeatures.useCases.testing.example': '"Generate Playwright E2E tests for my checkout flow"',
  'apiAiFeatures.useCases.review.title': 'Code Review & Refactor',
  'apiAiFeatures.useCases.review.description':
    'Deep code analysis with security scanning, performance profiling, and refactoring suggestions.',
  'apiAiFeatures.useCases.review.example': '"Review my authentication module for security vulnerabilities"',
  'apiAiFeatures.tools.autonomous.name': 'Autonomous Agent',
  'apiAiFeatures.tools.autonomous.description': 'Fully autonomous multi-step task execution',
  'apiAiFeatures.tools.completion.name': 'Code Completion',
  'apiAiFeatures.tools.completion.description': 'Context-aware inline completions in the editor',
  'apiAiFeatures.tools.inlineActions.name': 'Inline Actions',
  'apiAiFeatures.tools.inlineActions.description': 'Explain, debug, test, optimize with one click',
  'apiAiFeatures.tools.voice.name': 'Voice Vibe Coding',
  'apiAiFeatures.tools.voice.description': 'Speak your idea - AI writes the code',
  'apiAiFeatures.tools.memory.name': 'Memory Bank',
  'apiAiFeatures.tools.memory.description': 'Persistent project context across sessions',
  'apiAiFeatures.tools.checkpoint.name': 'Checkpoint & Rollback',
  'apiAiFeatures.tools.checkpoint.description': 'Atomic snapshots at every AI step',
} as const;

export type ApiAiFeaturesKey = keyof typeof apiAiFeaturesEn;
export type ApiAiFeaturesCopy = Readonly<Record<ApiAiFeaturesKey, string>>;

export const apiAiFeaturesFr: ApiAiFeaturesCopy = {
  'apiAiFeatures.features.autonomous.title': 'Agent autonome',
  'apiAiFeatures.features.autonomous.description':
    'Une IA qui planifie, code et déploie des applications complètes de façon autonome grâce à un raisonnement en plusieurs étapes.',
  'apiAiFeatures.features.autonomous.detail0': 'Planification et exécution de tâches en plusieurs étapes',
  'apiAiFeatures.features.autonomous.detail1': 'Détection automatique des erreurs et autocorrection',
  'apiAiFeatures.features.autonomous.detail2': 'Décomposition parallèle des tâches pour accélérer la livraison',
  'apiAiFeatures.features.autonomous.detail3':
    'Génération de la structure complète d’une application à partir d’un seul prompt',
  'apiAiFeatures.features.multilingual.title': 'Plus de 28 langages',
  'apiAiFeatures.features.multilingual.description':
    'Prise en charge de niveau expert de Python, TypeScript, Rust, Go, Java, C++ et de 22 autres langages.',
  'apiAiFeatures.features.multilingual.detail0': 'Coloration syntaxique et IntelliSense en temps réel',
  'apiAiFeatures.features.multilingual.detail1': 'Bonnes pratiques et modèles propres à chaque langage',
  'apiAiFeatures.features.multilingual.detail2': 'Refactorisation et migration multilangages',
  'apiAiFeatures.features.multilingual.detail3': 'Génération de code adaptée aux frameworks',
  'apiAiFeatures.features.intelligent.title': 'Contexte intelligent',
  'apiAiFeatures.features.intelligent.description':
    'Comprend l’ensemble de votre base de code — fichiers, dépendances et historique Git — afin de générer un code précis.',
  'apiAiFeatures.features.intelligent.detail0':
    'Compréhension du contexte à l’échelle du dépôt (fenêtre d’un million de jetons)',
  'apiAiFeatures.features.intelligent.detail1': 'Analyse du graphe de dépendances',
  'apiAiFeatures.features.intelligent.detail2': 'Historique Git pour des suggestions mieux informées',
  'apiAiFeatures.features.intelligent.detail3': 'Mémoire persistante des connaissances du projet',
  'apiAiFeatures.features.realtime.title': 'Streaming en temps réel',
  'apiAiFeatures.features.realtime.description':
    'Voyez le code apparaître instantanément grâce au streaming SSE. Sans attente : votre IA travaille à la vitesse de la pensée.',
  'apiAiFeatures.features.realtime.detail0': 'Sortie SSE diffusée jeton par jeton',
  'apiAiFeatures.features.realtime.detail1': 'Actualisation automatique de l’aperçu en direct',
  'apiAiFeatures.features.realtime.detail2': 'Modifications incrémentales des fichiers, sans réécriture complète',
  'apiAiFeatures.features.realtime.detail3': 'Édition collaborative via WebSocket',
  'apiAiFeatures.useCases.fullStack.title': 'Applications complètes',
  'apiAiFeatures.useCases.fullStack.description':
    'Créez des applications web complètes avec React, Node.js et PostgreSQL à partir d’un seul prompt.',
  'apiAiFeatures.useCases.fullStack.example':
    '"Créez un tableau de bord SaaS avec authentification et facturation Stripe"',
  'apiAiFeatures.useCases.apiDevelopment.title': 'Développement d’API',
  'apiAiFeatures.useCases.apiDevelopment.description':
    'Générez automatiquement des API REST ou GraphQL avec validation, authentification et documentation OpenAPI.',
  'apiAiFeatures.useCases.apiDevelopment.example':
    '"Créez une API REST avec authentification JWT, limitation du débit et documentation Swagger"',
  'apiAiFeatures.useCases.testing.title': 'Tests assistés par IA',
  'apiAiFeatures.useCases.testing.description':
    'Générez automatiquement des suites de tests unitaires, d’intégration et E2E avec des rapports de couverture complets.',
  'apiAiFeatures.useCases.testing.example': '"Générez des tests E2E Playwright pour mon parcours de paiement"',
  'apiAiFeatures.useCases.review.title': 'Revue et refactorisation du code',
  'apiAiFeatures.useCases.review.description':
    'Analysez le code en profondeur avec détection des failles, profilage des performances et suggestions de refactorisation.',
  'apiAiFeatures.useCases.review.example': '"Analysez les vulnérabilités de sécurité de mon module d’authentification"',
  'apiAiFeatures.tools.autonomous.name': 'Agent autonome',
  'apiAiFeatures.tools.autonomous.description': 'Exécution entièrement autonome de tâches en plusieurs étapes',
  'apiAiFeatures.tools.completion.name': 'Complétion de code',
  'apiAiFeatures.tools.completion.description': 'Complétions intégrées à l’éditeur et adaptées au contexte',
  'apiAiFeatures.tools.inlineActions.name': 'Actions intégrées',
  'apiAiFeatures.tools.inlineActions.description': 'Expliquez, déboguez, testez et optimisez en un clic',
  'apiAiFeatures.tools.voice.name': 'Vibe Coding vocal',
  'apiAiFeatures.tools.voice.description': 'Dictez votre idée : l’IA écrit le code',
  'apiAiFeatures.tools.memory.name': 'Mémoire persistante',
  'apiAiFeatures.tools.memory.description': 'Contexte du projet conservé entre les sessions',
  'apiAiFeatures.tools.checkpoint.name': 'Points de contrôle et retour arrière',
  'apiAiFeatures.tools.checkpoint.description': 'Instantanés atomiques à chaque étape de l’IA',
};

export function getApiAiFeaturesCopy(language?: string | null): ApiAiFeaturesCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? apiAiFeaturesFr : apiAiFeaturesEn;
}
