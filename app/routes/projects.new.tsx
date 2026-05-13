import type { MetaFunction } from '@remix-run/cloudflare';
import { Form, useActionData, useNavigation } from '@remix-run/react';
import {
  BarChart3,
  Code2,
  Cog,
  FileText,
  Gamepad2,
  Github,
  Globe2,
  Layers,
  Loader2,
  Palette,
  PenTool,
  Play,
  Presentation,
  RefreshCw,
  Rocket,
  Search,
  Send,
  Smartphone,
  Sparkles,
  Star,
  Table2,
  Terminal,
  Upload,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { AppShell, LinkButton, TemplateGallery } from '~/components/dashboard/SaaSLayout';
import { ECODE_PROJECT_REQUIREMENT_LINES } from '~/lib/common/prompts/ecode-requirements';
import {
  apiRequest,
  firstOrganization,
  formObject,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_LIST } from '~/utils/constants';

export const meta: MetaFunction = () => [{ title: 'Create project - VibeCore' }];

type Project = { id: string };
type ArtifactCategory = {
  id: string;
  label: string;
  icon: LucideIcon;
  prompts: string[];
  framework: string;
  generationHint: string;
};

const artifactCategories: ArtifactCategory[] = [
  {
    id: 'web',
    label: 'Web',
    icon: Globe2,
    framework: 'React + Vite + TypeScript',
    generationHint:
      'Build this as a production React/Vite web application with TypeScript, modular components, realistic data, routing-ready structure, and a live preview that starts with npm run dev.',
    prompts: [
      'Build a SaaS dashboard with billing, admin pages, and project analytics',
      'Create a polished portfolio with case studies, blog posts, and contact forms',
      'Build an ecommerce storefront with filters, cart, checkout, and order tracking',
    ],
  },
  {
    id: 'mobile',
    label: 'Mobile',
    icon: Smartphone,
    framework: 'Expo + React Native',
    generationHint:
      'Build this as a mobile-first Expo/React Native compatible PWA experience with polished navigation, touch-first interactions, realistic lists, and web preview compatibility.',
    prompts: [
      'Build a responsive habit tracker with streaks, reminders, and mobile navigation',
      'Create a fitness PWA with workout logs, charts, and offline support',
      'Build a recipe app with saved meals, shopping lists, and mobile-first cards',
    ],
  },
  {
    id: 'slides',
    label: 'Slides',
    icon: Presentation,
    framework: 'Reveal.js-style React deck',
    generationHint:
      'Build this as an executive-grade presentation app with responsive slides, speaker-ready narrative, charts, agenda controls, and polished boardroom visual hierarchy.',
    prompts: [
      'Create a startup pitch deck with market, product, traction, and financial slides',
      'Build a technical presentation with code examples and speaker notes',
      'Create an investor update deck with charts, timeline, and next milestones',
    ],
  },
  {
    id: 'animation',
    label: 'Animation',
    icon: Play,
    framework: 'React + CSS motion',
    generationHint:
      'Build this as an interactive animation project with performant CSS/React motion, timeline controls, reduced-motion support, and smooth 60fps interactions.',
    prompts: [
      'Build an interactive particle animation playground with exportable presets',
      'Create a scroll animation showcase with reveal effects and timeline controls',
      'Build a motion landing page with subtle transitions and responsive sections',
    ],
  },
  {
    id: 'design',
    label: 'Design',
    icon: Palette,
    framework: 'React design canvas',
    generationHint:
      'Build this as a visual design tool or design system with real controls, token panels, accessible component states, export-oriented UI, and premium craft.',
    prompts: [
      'Create a design system page with tokens, components, and usage examples',
      'Build a color palette generator with contrast checks and export tools',
      'Create a brand kit generator with logos, typography, and social previews',
    ],
  },
  {
    id: 'data',
    label: 'Data Viz',
    icon: BarChart3,
    framework: 'React + chart components',
    generationHint:
      'Build this as a data visualization app with executive dashboards, charts, filters, import/API-ready data adapters, and explicit loading/empty/error/success states.',
    prompts: [
      'Build a real-time analytics dashboard with charts, filters, and alerts',
      'Create a finance dashboard with category breakdowns and forecast charts',
      'Build a product metrics dashboard with funnels, cohorts, and retention graphs',
    ],
  },
  {
    id: 'automation',
    label: 'Automation',
    icon: Cog,
    framework: 'Node.js workflow UI',
    generationHint:
      'Build this as an automation workflow app with job states, logs, retries, configuration, auditability, queue health, and operational status views.',
    prompts: [
      'Build an automation console for scheduled jobs, logs, retries, and alerts',
      'Create a file processing workflow with uploads, validation, and status tracking',
      'Build an email digest generator with settings, previews, and history',
    ],
  },
  {
    id: 'game',
    label: '3D Game',
    icon: Gamepad2,
    framework: 'Three.js + React',
    generationHint:
      'Build this as an interactive game or 3D scene with working controls, visible gameplay, optimized rendering, responsive canvas sizing, and a clear HUD.',
    prompts: [
      'Build a Three.js racing prototype with controls, checkpoints, and lap timing',
      'Create a tower defense game with waves, upgrades, and a scoreboard',
      'Build a 3D product configurator with lighting, camera controls, and presets',
    ],
  },
  {
    id: 'document',
    label: 'Document',
    icon: PenTool,
    framework: 'React document editor',
    generationHint:
      'Build this as a document editor or writing tool with editing, preview, version/status UI, export-oriented controls, and robust empty/error states.',
    prompts: [
      'Build a markdown editor with live preview, file tree, and export controls',
      'Create a resume builder with templates, sections, and PDF export',
      'Build a collaborative notes app with tags, comments, and version history',
    ],
  },
  {
    id: 'spreadsheet',
    label: 'Spreadsheet',
    icon: Table2,
    framework: 'React data grid',
    generationHint:
      'Build this as a spreadsheet/data-grid app with editable cells, formulas or table operations, filters, validation, keyboard-friendly controls, and realistic datasets.',
    prompts: [
      'Build a budget spreadsheet with formulas, charts, and CSV import',
      'Create an inventory table with filters, bulk edit, and stock alerts',
      'Build a project timeline grid with milestones, owners, and progress views',
    ],
  },
];

const preferredProviderOrder = [
  'Anthropic',
  'OpenAI',
  'Google',
  'Github',
  'OpenRouter',
  'Mistral',
  'Deepseek',
  'Groq',
  'Together',
  'Cerebras',
  'Fireworks',
  'XAI',
  'Moonshot',
  'ZAI',
  'Perplexity',
  'AmazonBedrock',
  'Ollama',
  'LMStudio',
  'OpenAILike',
];

const providerIconByName: Record<string, LucideIcon> = {
  Anthropic: Sparkles,
  OpenAI: Zap,
  Google: Star,
  Github,
  OpenRouter: Globe2,
  Mistral: Terminal,
  Deepseek: Code2,
  Groq: Zap,
  Together: Layers,
  Cerebras: Cog,
  Fireworks: Rocket,
  XAI: Star,
  Moonshot: Globe2,
  ZAI: Sparkles,
  Perplexity: Search,
  AmazonBedrock: Layers,
  Ollama: Terminal,
  LMStudio: Terminal,
  OpenAILike: Code2,
};

const providerOptions = PROVIDER_LIST.filter((provider) => provider.staticModels?.length > 0).sort((left, right) => {
  const leftIndex = preferredProviderOrder.indexOf(left.name);
  const rightIndex = preferredProviderOrder.indexOf(right.name);

  return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
});

const fallbackProvider =
  providerOptions.find((provider) => provider.staticModels.some((model) => model.name === DEFAULT_MODEL)) ??
  providerOptions.find((provider) => provider.name === DEFAULT_PROVIDER.name) ??
  providerOptions[0];
const fallbackModel =
  fallbackProvider?.staticModels.find((model) => model.name === DEFAULT_MODEL) ?? fallbackProvider?.staticModels[0];

function providerForName(providerName?: string) {
  return providerOptions.find((provider) => provider.name === providerName) ?? fallbackProvider;
}

function modelForProvider(providerName?: string, modelName?: string) {
  const provider = providerForName(providerName);
  const model = provider?.staticModels.find((candidate) => candidate.name === modelName) ?? provider?.staticModels[0];

  return { provider, model };
}

function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  }

  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}k`;
  }

  return String(tokens);
}

const importCards = [
  {
    to: '/import-github',
    label: 'Import GitHub',
    description: 'Connect an existing repository and continue in the IDE.',
    icon: Github,
  },
  {
    to: '/import-zip',
    label: 'Import zip',
    description: 'Upload a local project archive and preserve its structure.',
    icon: Upload,
  },
  {
    to: '/dashboard/templates',
    label: 'Browse templates',
    description: 'Open the full private template catalog.',
    icon: Layers,
  },
];

function projectNameFromPrompt(prompt: string) {
  const normalized = prompt
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join(' ');

  return normalized || 'AI project';
}

function projectPromptForArtifact(prompt: string, category: ArtifactCategory) {
  return [
    `Artifact type: ${category.label}`,
    `Preferred framework: ${category.framework}`,
    category.generationHint,
    '',
    'Production quality bar:',
    ...ECODE_PROJECT_REQUIREMENT_LINES,
    '- Build a complete, previewable app, not a landing placeholder or static mockup.',
    '- Target Fortune 500 / enterprise polish: credible information architecture, restrained premium visual design, precise spacing, professional typography, and real workflow density.',
    '- Include realistic domain data, meaningful copy, charts/tables/cards where relevant, and visible states for loading, empty, error, success, and disabled controls.',
    '- Every visible button, tab, filter, menu, toggle, form control, and navigation item must have real client-side behavior using React state; no decorative dead controls.',
    '- Include at least one complete primary workflow with input, validation, optimistic/success feedback, error handling, empty state recovery, and disabled/submitting states.',
    '- For dashboards and SaaS products, build an operational product UI with dense but readable information architecture, not a marketing landing page.',
    '- Make the first screen immediately useful inside the Preview tab with no blank splash, no external setup, and no hidden critical interaction.',
    '- Use React + Vite + TypeScript for web-style artifacts unless the selected artifact explicitly requires another framework.',
    '- Split React code into purposeful components, typed local fixtures, derived metrics, and handlers; avoid a single static JSX mockup.',
    '- Always create a runnable package.json with dev, build, and preview scripts; include index.html, src/main.tsx, and Vite config when using React/Vite.',
    '- Keep runtime dependencies lean and browser-compatible; avoid native binaries, heavy assets, unnecessary frameworks, and API calls that can fail in preview.',
    '- Optimize for performance: memoize expensive derived data, avoid layout thrash, use CSS transforms for motion, lazy-load heavy views when useful, and respect prefers-reduced-motion.',
    '- Build responsive layouts for desktop, tablet, and mobile with stable dimensions so content does not jump or overlap.',
    '- Meet WCAG AA basics: semantic HTML, labels, keyboard focus states, ARIA where needed, contrast, and touch targets.',
    '- Before finishing, self-audit the generated files: there must be no visible dead buttons, no inert tabs, no nonfunctional forms, and no placeholder-only panels.',
    '- Finish with a start action so the live preview can attach automatically.',
    '',
    'User prompt:',
    prompt,
  ].join('\n');
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  await firstOrganization(request);
  return null;
}

export async function action({ request }: EnterpriseActionArgs) {
  const organization = await firstOrganization(request);

  const body = formObject(await request.formData()) as {
    name?: string;
    prompt?: string;
    artifactType?: string;
    model?: string;
    provider?: string;
  };

  const prompt = body.prompt?.trim();

  const artifactCategory =
    artifactCategories.find((category) => category.id === body.artifactType) ?? artifactCategories[0];

  const selected = modelForProvider(body.provider, body.model);
  const selectedProvider = selected.provider?.name ?? DEFAULT_PROVIDER.name;
  const selectedModel = selected.model?.name ?? DEFAULT_MODEL;
  const generationPrompt = prompt ? projectPromptForArtifact(prompt, artifactCategory) : '';
  const name = body.name?.trim() || (prompt ? projectNameFromPrompt(prompt) : '');

  if (!name) {
    return { error: 'Project name is required' };
  }

  let result: { project: Project };
  let aiGenerationFailed = false;
  let aiGenerationError: string | undefined;

  if (prompt) {
    try {
      result = await apiRequest<{ project: Project }>(request, `/orgs/${organization.id}/projects/from-ai`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          prompt: generationPrompt,
          artifactType: artifactCategory.id,
          framework: artifactCategory.framework,
          provider: selectedProvider,
          model: selectedModel,
        }),
      });
    } catch (error) {
      aiGenerationFailed = true;
      aiGenerationError = error instanceof Error ? error.message : 'AI generation failed';

      // Fall back to creating an empty project so the user keeps their prompt and can retry inside the IDE.
      result = await apiRequest<{ project: Project }>(request, `/orgs/${organization.id}/projects`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
    }
  } else {
    result = await apiRequest<{ project: Project }>(request, `/orgs/${organization.id}/projects`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  const ideParams = new URLSearchParams();

  if (prompt) {
    ideParams.set('prompt', generationPrompt);
    ideParams.set('model', selectedModel);
    ideParams.set('provider', selectedProvider);
  }

  if (aiGenerationFailed) {
    ideParams.set('aiFallback', 'true');

    if (aiGenerationError) {
      ideParams.set('aiFallbackReason', aiGenerationError.slice(0, 240));
    }
  }

  const ideUrl = `/projects/${result.project.id}/ide${ideParams.size ? `?${ideParams.toString()}` : ''}`;

  return redirect(ideUrl);
}

export default function NewProjectPage() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const [prompt, setPrompt] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(artifactCategories[0].id);
  const [promptSeed, setPromptSeed] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState(fallbackProvider?.name ?? 'Anthropic');
  const [selectedModel, setSelectedModel] = useState(fallbackModel?.name ?? DEFAULT_MODEL);

  const activeCategory =
    artifactCategories.find((category) => category.id === selectedCategory) ?? artifactCategories[0];

  const activeProvider = providerForName(selectedProvider);
  const activeModels = activeProvider?.staticModels ?? [];
  const activeModel = activeModels.find((model) => model.name === selectedModel) ?? activeModels[0] ?? fallbackModel;
  const ActiveProviderIcon = providerIconByName[activeProvider?.name ?? ''] ?? Sparkles;
  const ActiveCategoryIcon = activeCategory.icon;

  const examplePrompts = useMemo(() => {
    const prompts = activeCategory.prompts;
    const offset = promptSeed % prompts.length;

    return [...prompts.slice(offset), ...prompts.slice(0, offset)];
  }, [activeCategory, promptSeed]);

  return (
    <AppShell
      title="Create project"
      description="Create a persistent E-code project from a template, AI prompt, GitHub repository or zip archive."
      hideHeader
    >
      <div className="vc-create-page space-y-10 lg:space-y-12">
        <section className="vc-create-hero">
          <div className="vc-create-hero-inner">
            <div className="relative mx-auto max-w-3xl text-center">
              <div className="vc-create-icon mx-auto mb-4">
                <Sparkles className="h-5 w-5" aria-hidden />
              </div>
              <p className="vc-create-label mb-2 text-[11px] font-medium uppercase tracking-[0.4px]">
                AI workspace builder
              </p>
              <h2 className="vc-create-title text-[30px] font-semibold leading-tight tracking-normal sm:text-[40px]">
                What do you want to create?
              </h2>
              <p className="vc-create-copy mx-auto mt-3 max-w-xl text-[13px] leading-6">
                Create a persistent E-code project from a template, AI prompt, GitHub repository or zip archive.
                Everything still creates a real project and opens the E-code IDE.
              </p>

              <Form
                method="post"
                className="mx-auto mt-7 max-w-3xl space-y-4 text-left"
                aria-label="Create project form"
              >
                <input type="hidden" name="model" value={activeModel?.name ?? DEFAULT_MODEL} />
                <input type="hidden" name="provider" value={activeProvider?.name ?? DEFAULT_PROVIDER.name} />
                <input type="hidden" name="artifactType" value={selectedCategory} />
                <input type="hidden" name="framework" value={activeCategory.framework} />

                {actionData?.error ? <p className="vc-create-error px-3 py-2 text-[12px]">{actionData.error}</p> : null}

                <div className="vc-create-composer">
                  <textarea
                    name="prompt"
                    value={prompt}
                    onChange={(event) => setPrompt(event.currentTarget.value)}
                    placeholder="Build me a todo app with drag-and-drop, dark mode, and local storage..."
                    rows={5}
                    className="vc-create-textarea min-h-[150px] w-full resize-none bg-transparent px-4 py-4 text-[13px] leading-6 outline-none"
                    disabled={isSubmitting}
                    aria-label="AI prompt"
                  />
                  <div className="vc-create-divider flex flex-wrap items-center gap-2 border-t px-3 py-2">
                    <span className="vc-create-label text-[10px] font-medium uppercase tracking-[0.4px]">Context</span>
                    <span className="vc-create-pill is-accent inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium">
                      <ActiveCategoryIcon className="h-3 w-3" aria-hidden />
                      {activeCategory.label}
                    </span>
                    <span className="vc-create-pill inline-flex h-7 items-center rounded-md px-2.5 text-[11px]">
                      Framework: {activeCategory.framework}
                    </span>
                  </div>
                  <div className="vc-create-divider grid gap-3 border-t px-3 py-3 lg:grid-cols-[minmax(180px,0.8fr)_minmax(260px,1.2fr)_auto] lg:items-end">
                    <label className="block min-w-0">
                      <span className="vc-create-label mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.4px]">
                        <ActiveProviderIcon className="h-3 w-3" aria-hidden />
                        Provider
                      </span>
                      <select
                        value={activeProvider?.name ?? ''}
                        onChange={(event) => {
                          const nextProvider = providerForName(event.currentTarget.value);
                          setSelectedProvider(nextProvider?.name ?? event.currentTarget.value);
                          setSelectedModel(nextProvider?.staticModels[0]?.name ?? DEFAULT_MODEL);
                        }}
                        className="vc-create-select h-9 w-full rounded-md px-2.5 text-[12px] font-medium outline-none transition-colors focus:border-[var(--vc-ide-accent-action)] focus:ring-2 focus:ring-[var(--vc-ide-accent-action)]"
                        disabled={isSubmitting}
                        aria-label="AI provider"
                      >
                        {providerOptions.map((provider) => (
                          <option key={provider.name} value={provider.name}>
                            {provider.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block min-w-0">
                      <span className="vc-create-label mb-1.5 block text-[10px] font-medium uppercase tracking-[0.4px]">
                        Model
                      </span>
                      <select
                        value={activeModel?.name ?? ''}
                        onChange={(event) => setSelectedModel(event.currentTarget.value)}
                        className="vc-create-select h-9 w-full rounded-md px-2.5 text-[12px] font-medium outline-none transition-colors focus:border-[var(--vc-ide-accent-action)] focus:ring-2 focus:ring-[var(--vc-ide-accent-action)]"
                        disabled={isSubmitting || activeModels.length === 0}
                        aria-label="AI model"
                      >
                        {activeModels.map((model: ModelInfo) => (
                          <option key={model.name} value={model.name}>
                            {model.label || model.name}
                            {model.maxTokenAllowed ? ` — ${formatContextWindow(model.maxTokenAllowed)} ctx` : ''}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="submit"
                      disabled={isSubmitting || !prompt.trim()}
                      className="vc-create-submit inline-flex h-9 items-center justify-center gap-2 rounded-md px-5 text-[12px] font-semibold transition-[filter,opacity] focus:outline-none focus:ring-2 focus:ring-[var(--vc-ide-accent-action)] focus:ring-offset-2 focus:ring-offset-[var(--vc-ide-bg-panel)] disabled:cursor-not-allowed disabled:opacity-40 lg:justify-self-end"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Send className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Create project
                    </button>
                  </div>
                </div>

                <div className="vc-create-type-picker relative -mt-2 p-2 backdrop-blur-xl">
                  <div className="mb-2 flex items-center justify-between gap-3 px-1">
                    <span className="vc-create-label text-[11px] font-medium uppercase tracking-[0.4px]">
                      Artifact type
                    </span>
                    <span className="vc-create-label hidden text-[10px] sm:inline">
                      Added to the prompt context and framework selection
                    </span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {artifactCategories.map((category) => {
                      const Icon = category.icon;
                      const selected = selectedCategory === category.id;

                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => setSelectedCategory(category.id)}
                          className={[
                            'vc-create-chip inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--vc-ide-accent-action)]',
                            selected ? 'is-selected' : '',
                          ].join(' ')}
                          aria-pressed={selected}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden />
                          {category.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Form>

              <div className="mx-auto mt-4 max-w-3xl text-left">
                <div className="mb-2 flex items-center justify-between">
                  <span className="vc-create-label text-[11px] font-medium uppercase tracking-[0.4px]">
                    Try an example prompt
                  </span>
                  <button
                    type="button"
                    onClick={() => setPromptSeed((value) => value + 1)}
                    className="vc-create-refresh inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--vc-ide-accent-action)]"
                    aria-label="Refresh example prompts"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {examplePrompts.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => {
                        setPrompt(example);
                      }}
                      className="vc-create-example rounded-xl px-3 py-2 text-left text-[11px] leading-5 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--vc-ide-accent-action)]"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-3 md:gap-x-4 md:gap-y-7">
          <aside className="contents">
            {importCards.map((card) => {
              const Icon = card.icon;

              return (
                <LinkButton key={card.to} to={card.to} variant="outline">
                  <span className="flex w-full items-center gap-3 text-left">
                    <span className="vc-create-import-card flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="vc-create-card-title block text-[13px] font-medium">{card.label}</span>
                      <span className="vc-create-label mt-0.5 block text-[11px] leading-4">{card.description}</span>
                    </span>
                  </span>
                </LinkButton>
              );
            })}

            <div className="vc-create-panel mt-1 p-4 md:col-span-3 md:mt-3">
              <div className="mb-3 flex items-center gap-2">
                <Rocket className="h-4 w-4 text-[var(--vc-ide-accent-action)]" aria-hidden />
                <h3 className="vc-create-heading text-[13px] font-semibold">What stays connected</h3>
              </div>
              <div className="vc-create-copy space-y-2 text-[12px] leading-5">
                <div className="flex gap-2">
                  <Code2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--vc-ide-accent-action)]" aria-hidden />
                  <span>Projects open in the preserved Bolt IDE with files, terminal, preview, and agent tools.</span>
                </div>
                <div className="flex gap-2">
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--vc-ide-accent-warning)]" aria-hidden />
                  <span>Templates, GitHub import, zip import, and private workspace routes remain available.</span>
                </div>
                <div className="flex gap-2">
                  <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--vc-ide-accent-success)]" aria-hidden />
                  <span>AI prompts are submitted to the existing backend flow, then restored in the agent panel.</span>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <section className="vc-create-panel p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="vc-create-label text-[11px] font-medium uppercase tracking-[0.4px]">Templates</p>
              <h3 className="vc-create-heading mt-1 text-[15px] font-semibold">Start from the existing catalog</h3>
            </div>
            <p className="vc-create-copy max-w-xl text-[12px] leading-5">
              This is the same authenticated template flow already wired to project creation.
            </p>
          </div>
          <TemplateGallery compact mode="authenticated" />
        </section>
      </div>
    </AppShell>
  );
}
