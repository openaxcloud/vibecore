import { data as json } from 'react-router';

export async function loader() {
  return json({
    features: {
      autonomous: {
        title: 'Autonomous Agent',
        description: 'AI that plans, codes, and deploys full applications independently with multi-step reasoning.',
        icon: 'Brain',
        details: [
          'Multi-step task planning and execution',
          'Automatic error detection and self-correction',
          'Parallel task decomposition for faster delivery',
          'Full application scaffolding from a single prompt',
        ],
      },
      multilingual: {
        title: '28+ Languages',
        description: 'Expert-level support for Python, TypeScript, Rust, Go, Java, C++, and 22 more languages.',
        icon: 'Languages',
        details: [
          'Real-time syntax highlighting and IntelliSense',
          'Language-specific best practices and patterns',
          'Cross-language refactoring and migration',
          'Framework-aware code generation',
        ],
      },
      intelligent: {
        title: 'Intelligent Context',
        description: 'Understands your entire codebase - files, dependencies, Git history - to generate precise code.',
        icon: 'Sparkles',
        details: [
          'Repository-wide context awareness (1M token window)',
          'Dependency graph analysis',
          'Git history for informed suggestions',
          'Memory bank for persistent project knowledge',
        ],
      },
      realtime: {
        title: 'Real-Time Streaming',
        description: 'See code appear instantly via SSE streaming. No waiting - your AI works at the speed of thought.',
        icon: 'Zap',
        details: [
          'Token-by-token SSE streaming output',
          'Live preview auto-refresh',
          'Incremental file edits (no full rewrites)',
          'WebSocket-based collaborative editing',
        ],
      },
    },
    useCases: [
      {
        title: 'Full-Stack Applications',
        description: 'Build complete web apps with React, Node.js, and PostgreSQL from a single prompt.',
        icon: 'Globe',
        example: '"Create a SaaS dashboard with authentication and Stripe billing"',
      },
      {
        title: 'API Development',
        description: 'Generate REST or GraphQL APIs with validation, auth, and OpenAPI docs automatically.',
        icon: 'Code2',
        example: '"Build a REST API with JWT auth, rate limiting, and Swagger docs"',
      },
      {
        title: 'AI-Powered Testing',
        description: 'Auto-generate unit, integration, and E2E test suites with full coverage reports.',
        icon: 'Shield',
        example: '"Generate Playwright E2E tests for my checkout flow"',
      },
      {
        title: 'Code Review & Refactor',
        description: 'Deep code analysis with security scanning, performance profiling, and refactoring suggestions.',
        icon: 'Search',
        example: '"Review my authentication module for security vulnerabilities"',
      },
    ],
    aiTools: [
      { name: 'Autonomous Agent', icon: 'Brain', description: 'Fully autonomous multi-step task execution' },
      { name: 'Code Completion', icon: 'Code2', description: 'Context-aware inline completions in the editor' },
      { name: 'Inline Actions', icon: 'Zap', description: 'Explain, debug, test, optimize with one click' },
      { name: 'Voice Vibe Coding', icon: 'Mic', description: 'Speak your idea - AI writes the code' },
      { name: 'Memory Bank', icon: 'Database', description: 'Persistent project context across sessions' },
      { name: 'Checkpoint & Rollback', icon: 'History', description: 'Atomic snapshots at every AI step' },
    ],

    /*
     * Supported providers for the public marketing page. `available` must NOT be
     * derived from platform API-key presence: this endpoint is unauthenticated,
     * so doing so leaked which provider credentials are configured in prod (an
     * infra-config oracle). List the platform-supported set instead.
     */
    providers: [
      { name: 'OpenAI', models: ['GPT-4o', 'GPT-4o Mini', 'o1', 'o3'], available: true },
      {
        name: 'Anthropic',
        models: ['Claude 3 Opus', 'Claude 3.5 Sonnet', 'Claude 3.5 Haiku'],
        available: true,
      },
      {
        name: 'Google Gemini',
        models: ['Gemini 3.5 Flash', 'Gemini 2.5 Pro', 'Gemini 2.5 Flash'],
        available: true,
      },
      { name: 'xAI', models: ['Grok 2'], available: true },
      { name: 'Moonshot (Kimi)', models: ['Kimi K2 Thinking', 'Kimi K2 Turbo'], available: true },
    ],
  });
}
