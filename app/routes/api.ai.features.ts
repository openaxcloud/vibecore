import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';

function envValue(context: LoaderFunctionArgs['context'], key: string) {
  const cloudflareEnv = (context as unknown as { cloudflare?: { env?: Record<string, string | undefined> } })
    ?.cloudflare?.env;

  return cloudflareEnv?.[key] || process.env[key];
}

export async function loader({ context }: LoaderFunctionArgs) {
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
    providers: [
      {
        name: 'OpenAI',
        models: ['GPT-4o', 'GPT-4o Mini', 'o1', 'o3'],
        available: Boolean(envValue(context, 'OPENAI_API_KEY')),
      },
      {
        name: 'Anthropic',
        models: ['Claude 3 Opus', 'Claude 3.5 Sonnet', 'Claude 3.5 Haiku'],
        available: Boolean(envValue(context, 'ANTHROPIC_API_KEY')),
      },
      {
        name: 'Google Gemini',
        models: ['Gemini 2.5 Flash', 'Gemini 2.0 Flash', 'Gemini 1.5 Pro'],
        available: Boolean(envValue(context, 'GEMINI_API_KEY')),
      },
      { name: 'xAI', models: ['Grok 2'], available: Boolean(envValue(context, 'XAI_API_KEY')) },
      {
        name: 'Moonshot (Kimi)',
        models: ['Kimi K2 Thinking', 'Kimi K2 Turbo'],
        available: Boolean(envValue(context, 'MOONSHOT_API_KEY')),
      },
    ],
  });
}
