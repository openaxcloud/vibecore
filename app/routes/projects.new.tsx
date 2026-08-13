import { useStore } from '@nanostores/react';
import {
  BarChart3,
  ChevronDown,
  Cog,
  Gamepad2,
  Github,
  Globe2,
  ImagePlus,
  Loader2,
  Palette,
  Paperclip,
  PenTool,
  Play,
  Presentation,
  RefreshCw,
  Rocket,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Table2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useLoaderData, useNavigation, useRouteError, useSubmit } from 'react-router';
import { AppShell, TemplateGallery } from '~/components/dashboard/SaaSLayout';
import { readPersistedModelId } from '~/components/marketing/ecode-exact/resolve-preferred-model';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui';
import { ECODE_PROJECT_REQUIREMENT_LINES } from '~/lib/common/prompts/ecode-requirements';
import {
  apiErrorMessage,
  apiRequest,
  firstOrganization,
  formObject,
  isApiResponse,
  json,
  loginRedirectFromRequest,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { formatUserAreaNumber } from '~/lib/i18n/user-area-locale';
import { LLMManager } from '~/lib/modules/llm/manager';
import { fetchAdminEnabledProviders } from '~/lib/modules/llm/provider-visibility.server';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { detectApplePlatform, submitShortcutLabel as resolveSubmitShortcutLabel } from '~/lib/platform-shortcut';
import { providersStore } from '~/lib/stores/settings';
import type { ProviderInfo } from '~/types/model';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_LIST } from '~/utils/constants';
import { clearModelHandoff, readModelHandoff, resolveHandoffModelSelection } from '~/utils/model-handoff';
import { projectIdePath } from '~/utils/project-url';
import { categorizeProjectsNewError, type ProjectsNewErrorDescriptor } from '~/utils/projects-new-error';
import {
  findRecentlyCreatedAiProject,
  mayHaveCreatedProject,
  type RecoverableProject,
} from '~/utils/projects-new-recover';
import { estimatePromptCost, formatEstimatedCost } from '~/utils/prompt-cost';
import { detectPromptLanguage } from '~/utils/prompt-language';
import { describeFlaggedCategories, moderateProjectPrompt } from '~/utils/prompt-moderation.server';
import { PROMPT_MAX_CHARS, validateProjectPrompt } from '~/utils/prompt-validation';

export const meta: MetaFunction = () => [{ title: 'Create project - E-Code' }];

type Project = { id: string; slug?: string };
type ProjectCreationResult = { project: Project };
type PendingProjectPrompt = {
  id: string;
  prompt: string;
  model: string;
  provider: string;
  createdAt: string;
  aiFallback?: boolean;
  aiFallbackReason?: string;
};
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
      'Create a booking site with a calendar, availability, and confirmation emails',
      'Build a help center with searchable articles, categories, and a ticket form',
      'Create a job board with listings, filters, applications, and an employer portal',
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
      'Create a budgeting app with accounts, categories, and monthly summaries',
      'Build a travel planner with itineraries, maps, and packing checklists',
      'Create a meditation app with timers, streaks, and a daily session picker',
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
      'Build a product launch deck with positioning, demo shots, and pricing tiers',
      'Create a quarterly business review deck with KPIs, wins, and risks',
      'Build a conference talk deck with an agenda, live-demo slides, and a summary',
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
      'Create an animated data-story page with charts that build in on scroll',
      'Build a loading/skeleton animation gallery with copyable snippets',
      'Create an SVG path-drawing animation demo with playback controls',
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
      'Build a typography scale explorer with pairings and live preview text',
      'Create a gradient and shadow studio with copyable CSS output',
      'Build an icon set browser with search, sizing, and SVG export',
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
      'Create a sales pipeline dashboard with stages, forecasts, and win rates',
      'Build a server monitoring dashboard with time-series charts and thresholds',
      'Create a survey results explorer with breakdowns, filters, and CSV export',
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
      'Create a webhook inspector with request logs, replay, and filtering',
      'Build a data-sync monitor with connectors, run history, and error triage',
      'Create an approval workflow with steps, assignees, and an audit trail',
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
      'Create an endless runner with obstacles, power-ups, and a high-score board',
      'Build a physics puzzle game with draggable objects and level progression',
      'Create a 3D solar-system explorer with orbit controls and planet facts',
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
      'Create an invoice generator with line items, totals, and PDF export',
      'Build a knowledge base editor with nested pages, search, and backlinks',
      'Create a contract editor with clause templates, variables, and preview',
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
      'Create an expense tracker grid with categories, receipts, and monthly totals',
      'Build a CRM contacts grid with tags, filters, and inline editing',
      'Create a grading sheet with weighted columns, averages, and CSV export',
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
  'xAI',
  'XAI',
  'Moonshot',
  'Z.ai',
  'ZAI',
  'Cohere',
  'HuggingFace',
  'Hyperbolic',
  'Perplexity',
  'AmazonBedrock',
  'Ollama',
  'LMStudio',
  'OpenAILike',
];

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
const PROJECT_QUOTA_EXCEEDED_MESSAGE =
  'Your workspace has reached its project limit. Upgrade the plan or ask an admin for a quota override before creating another project.';

function knownProviderForName(providerName?: string) {
  return PROVIDER_LIST.find((provider) => provider.name === providerName) ?? fallbackProvider ?? DEFAULT_PROVIDER;
}

type ModelsPayload = {
  modelList: ModelInfo[];
  providers: ProviderInfo[];
  defaultProvider: ProviderInfo;
};

const ROTATING_PLACEHOLDERS = [
  'Build a SaaS dashboard with…',
  'Create a portfolio with…',
  'Generate an e-commerce store with…',
];

const heroAttachShortcuts: Array<{
  to: string;
  icon: LucideIcon;
  label: string;
  hint: string;
}> = [
  {
    to: '/import-zip',
    icon: Paperclip,
    label: 'Attach',
    hint: 'Upload a zip archive (code, screenshots, images)',
  },
  {
    to: '/import-github',
    icon: Github,
    label: 'GitHub repo URL',
    hint: 'Import an existing GitHub repository',
  },
  {
    to: '/import-zip',
    icon: ImagePlus,
    label: 'Design palette',
    hint: 'Drop a Figma export or design screenshots inside a zip archive',
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

function createPendingPromptId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function queueProjectPrompt(request: Request, projectId: string, pendingPrompt: PendingProjectPrompt) {
  await apiRequest(request, `/projects/${projectId}/ide-state`, {
    method: 'PUT',
    body: JSON.stringify({
      state: {
        chat: {
          pendingPrompt,
        },
      },
    }),
  });
}

async function projectQuotaActionMessage(error: unknown) {
  if (!isApiResponse(error, 402) && !isApiResponse(error, 429)) {
    return undefined;
  }

  const message = await apiErrorMessage(error, '');

  return /quota exceeded for projects\.count/i.test(message) ? PROJECT_QUOTA_EXCEEDED_MESSAGE : undefined;
}

/*
 * Re-fetch the org's projects so a lost from-ai response can be reconciled
 * against what the server actually persisted. Best-effort: if this listing
 * itself fails we return an empty array and the caller falls back to its
 * normal empty-project path.
 */
async function listOrgProjects(request: Request, orgId: string): Promise<RecoverableProject[]> {
  try {
    const { projects } = await apiRequest<{ projects: RecoverableProject[] }>(request, `/orgs/${orgId}/projects`);

    return Array.isArray(projects) ? projects : [];
  } catch {
    return [];
  }
}

async function createProjectOrReturnQuotaError(
  request: Request,
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; result: ProjectCreationResult } | { ok: false; error: string; quota: true }> {
  try {
    return {
      ok: true,
      result: await apiRequest<ProjectCreationResult>(request, path, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    };
  } catch (error) {
    const quotaMessage = await projectQuotaActionMessage(error);

    if (quotaMessage) {
      return { ok: false, error: quotaMessage, quota: true };
    }

    throw error;
  }
}

type ProjectsNewActionError = { error: string; kind?: 'quota' };

/*
 * Builds the inline action-error payload from a failed creation attempt.
 * A quota failure carries a `kind:'quota'` flag so the form can render the
 * same actionable upgrade buttons the ErrorBoundary shows, instead of an
 * inert wall of text.
 */
function projectCreateActionError(failed: { error: string; quota: true }): ProjectsNewActionError {
  return { error: failed.error, kind: 'quota' };
}

async function requireFirstOrganization(request: Request) {
  try {
    return await firstOrganization(request);
  } catch (error) {
    if (isApiResponse(error, 401) || isApiResponse(error, 403)) {
      throw loginRedirectFromRequest(request);
    }

    throw error;
  }
}

export async function loader({ request, context }: EnterpriseLoaderArgs) {
  await requireFirstOrganization(request);

  /*
   * The homepage "Describe the app you want to build" form forwards its text as ?prompt=, and the
   * signup flow carries it through to here after registration. Seed the composer with it so a visitor
   * who typed an idea on the landing page doesn't have to retype it.
   */
  const requestedPrompt = new URL(request.url).searchParams.get('prompt') ?? '';
  const initialPrompt = requestedPrompt.trim().slice(0, PROMPT_MAX_CHARS);

  const serverEnv = context.cloudflare?.env as unknown as Record<string, string> | undefined;
  const llmManager = LLMManager.getInstance(serverEnv);
  const allProviders = llmManager.getAllProviders();
  const defaultProvider = llmManager.getDefaultProvider();

  const providers = allProviders.map((provider) => ({
    name: provider.name,
    staticModels: provider.staticModels,
    getApiKeyLink: provider.getApiKeyLink,
    labelForGetApiKey: provider.labelForGetApiKey,
    icon: provider.icon,
  }));

  /*
   * Hide providers an admin disabled (admin visibility toggle). Fail-open: a null
   * set (table broken/empty) or an empty filtered result leaves the full list so
   * the composer never ends up with zero selectable providers.
   */
  const adminEnabled = await fetchAdminEnabledProviders(request);
  const filteredProviders = adminEnabled ? providers.filter((provider) => adminEnabled.has(provider.name)) : providers;
  const visibleProviders = filteredProviders.length > 0 ? filteredProviders : providers;
  const fullModelList = llmManager.getStaticModelList();

  const visibleModelList =
    adminEnabled && filteredProviders.length > 0
      ? fullModelList.filter((model) => !model.provider || adminEnabled.has(model.provider))
      : fullModelList;

  return json<ModelsPayload & { initialPrompt: string }>({
    modelList: visibleModelList,
    providers: visibleProviders,
    defaultProvider: {
      name: defaultProvider.name,
      staticModels: defaultProvider.staticModels,
      getApiKeyLink: defaultProvider.getApiKeyLink,
      labelForGetApiKey: defaultProvider.labelForGetApiKey,
      icon: defaultProvider.icon,
    },
    initialPrompt,
  });
}

export async function action({ request, context }: EnterpriseActionArgs) {
  const organization = await requireFirstOrganization(request);

  const body = formObject(await request.formData()) as {
    name?: string;
    prompt?: string;
    artifactType?: string;
    model?: string;
    provider?: string;
  };

  /*
   * Defense in depth: even though the client form enforces maxLength and
   * surfaces validation warnings, the action re-runs the validator against
   * the submitted body. This protects against direct API hits and against
   * stale client bundles that pre-date a stricter limit.
   */
  const promptValidation = validateProjectPrompt(body.prompt, { allowEmpty: true });

  if (promptValidation.errors.length > 0) {
    return { error: promptValidation.errors[0].message };
  }

  const prompt = promptValidation.value || undefined;

  /*
   * Server-side content moderation via OpenAI's free `/v1/moderations`. The
   * helper fail-opens when no key is configured / OpenAI is unreachable so a
   * provider outage never blocks every project creation, but it returns
   * `checked: false` with a reason code we can log to telemetry. On a real
   * policy hit we surface the flagged category in the user-facing message.
   */
  const serverEnv = (context?.cloudflare?.env ?? {}) as unknown as Record<string, string | undefined>;

  const moderation = prompt
    ? await moderateProjectPrompt(prompt, { serverEnv, signal: AbortSignal.timeout(8_000) })
    : undefined;

  if (moderation && !moderation.allowed) {
    return {
      error: `Your prompt was flagged for ${describeFlaggedCategories(moderation.flaggedCategories)} and can't be used. Rephrase and try again.`,
      moderation: {
        flaggedCategories: moderation.flaggedCategories,
        checked: moderation.checked,
      },
    };
  }

  const artifactCategory =
    artifactCategories.find((category) => category.id === body.artifactType) ?? artifactCategories[0];

  const selectedProvider = knownProviderForName(body.provider).name;
  const selectedModel = body.model?.trim() || fallbackModel?.name || DEFAULT_MODEL;

  /*
   * Detect the user's language so the agent answers in it. Only the
   * "reliable" branch — known language + enough characters — feeds the
   * hint, so we don't push the agent toward Esperanto on borderline
   * inputs.
   */
  const detectedLanguage = prompt ? detectPromptLanguage(prompt) : undefined;

  const languagePrefix =
    detectedLanguage && detectedLanguage.reliable && detectedLanguage.name
      ? `[Language: ${detectedLanguage.name}]\n\n`
      : '';

  const generationPrompt = prompt ? `${languagePrefix}${projectPromptForArtifact(prompt, artifactCategory)}` : '';
  const name = body.name?.trim() || (prompt ? projectNameFromPrompt(prompt) : '');

  if (!name) {
    return { error: 'Project name is required' };
  }

  let result: ProjectCreationResult;
  let aiGenerationFailed = false;
  let aiGenerationError: string | undefined;

  /*
   * True only when AI generation failed AND we could not recover the
   * server-committed project, so we created an EMPTY project as a fallback. This
   * (not aiGenerationFailed alone) is what the IDE surfaces as a visible warning
   * toast — a recovered project still has its generated content and shouldn't be
   * labelled "created empty".
   */
  let createdEmptyAiFallback = false;

  if (prompt) {
    const attemptStartedAt = Date.now();

    try {
      const created = await createProjectOrReturnQuotaError(request, `/orgs/${organization.id}/projects/from-ai`, {
        name,
        prompt: generationPrompt,
        artifactType: artifactCategory.id,
        framework: artifactCategory.framework,
        provider: selectedProvider,
        model: selectedModel,
      });

      if (!created.ok) {
        return projectCreateActionError(created);
      }

      result = created.result;
    } catch (error) {
      aiGenerationFailed = true;
      aiGenerationError = error instanceof Error ? error.message : 'AI generation failed';

      /*
       * `from-ai` creates the project + consumes projects.count + returns 201
       * BEFORE the client reads the body. If the failure could have left a
       * project committed server-side (a lost response rather than an HTTP
       * error reply), re-fetch the org's projects and reuse the one this
       * request just created instead of creating a duplicate and
       * double-charging the quota.
       */
      const recovered = mayHaveCreatedProject(error)
        ? findRecentlyCreatedAiProject(await listOrgProjects(request, organization.id), { name, attemptStartedAt })
        : undefined;

      if (recovered) {
        result = { project: recovered };
      } else {
        // Fall back to creating an empty project so the user keeps their prompt and can retry inside the IDE.
        const created = await createProjectOrReturnQuotaError(request, `/orgs/${organization.id}/projects`, { name });

        if (!created.ok) {
          return projectCreateActionError(created);
        }

        result = created.result;
        createdEmptyAiFallback = true;
      }
    }
  } else {
    const created = await createProjectOrReturnQuotaError(request, `/orgs/${organization.id}/projects`, { name });

    if (!created.ok) {
      return projectCreateActionError(created);
    }

    result = created.result;
  }

  let promptQueueError: string | undefined;

  if (prompt) {
    const pendingPrompt: PendingProjectPrompt = {
      id: createPendingPromptId(),
      prompt: generationPrompt,
      model: selectedModel,
      provider: selectedProvider,
      createdAt: new Date().toISOString(),
      ...(aiGenerationFailed ? { aiFallback: true } : {}),
      ...(aiGenerationError ? { aiFallbackReason: aiGenerationError.slice(0, 240) } : {}),
    };

    try {
      await queueProjectPrompt(request, result.project.id, pendingPrompt);
    } catch (error) {
      promptQueueError = error instanceof Error ? error.message : 'Unable to queue the initial prompt';
    }
  }

  const ideParams = new URLSearchParams();

  if (promptQueueError) {
    ideParams.set('promptQueueError', promptQueueError.slice(0, 240));
  }

  /*
   * Surface AI-generation failure to the user: without these params the empty
   * fallback project loads silently and the user never learns generation failed
   * (they just see an empty IDE). Chat.client.tsx reads aiFallback/aiFallbackReason
   * and shows a warning toast on IDE mount.
   */
  if (createdEmptyAiFallback) {
    ideParams.set('aiFallback', 'true');

    if (aiGenerationError) {
      ideParams.set('aiFallbackReason', aiGenerationError.slice(0, 240));
    }
  }

  const ideUrl = projectIdePath(
    { id: result.project.id, slug: result.project.slug, organizationSlug: organization.slug },
    { searchParams: ideParams },
  );

  return redirect(ideUrl);
}

export default function NewProjectPage() {
  const initialModelsPayload = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ProjectsNewActionError | undefined;
  const navigation = useNavigation();
  const providersSettings = useStore(providersStore);
  const isSubmitting = navigation.state === 'submitting';
  const [prompt, setPrompt] = useState(initialModelsPayload.initialPrompt ?? '');
  const [selectedCategory, setSelectedCategory] = useState(artifactCategories[0].id);
  const [promptSeed, setPromptSeed] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [modelsPayload, setModelsPayload] = useState<ModelsPayload>(initialModelsPayload);
  const [, setModelsLoading] = useState(false);
  const [, setModelsError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const submit = useSubmit();
  const composerAutoSubmittedRef = useRef(false);

  /*
   * Homepage "Build Now" hand-off. The landing composer stashes the prompt in
   * sessionStorage (keeping it out of the URL) and navigates here with a
   * `composerBuildIntent` flag. On arrival — including the post-login return for
   * a logged-out visitor, since the loader bounces them through
   * /login?returnTo=/projects/new and same-origin sessionStorage survives the
   * redirect — seed the prompt and submit the create form once, so "Build Now"
   * creates the project and opens the IDE without a second click.
   *
   * A URL `?prompt=` (signup carry-through / shared link) is intentionally left
   * for manual review and never auto-submits. The ref + immediate sessionStorage
   * cleanup guarantee a single attempt, so a quota/validation error that returns
   * to this form doesn't re-fire an infinite create loop.
   */
  useEffect(() => {
    if (composerAutoSubmittedRef.current || initialModelsPayload.initialPrompt) {
      return;
    }

    let stashedPrompt: string | null = null;
    let intent: string | null = null;

    try {
      stashedPrompt = sessionStorage.getItem('pendingAppDescription');
      intent = sessionStorage.getItem('composerBuildIntent');
    } catch {
      return;
    }

    if (intent !== '1' || !stashedPrompt || !stashedPrompt.trim()) {
      return;
    }

    composerAutoSubmittedRef.current = true;

    /*
     * Resolve the visitor's chosen model from the same hand-off BEFORE clearing
     * it. The landing composer stashes `pendingModelId`/`pendingProvider`; if the
     * id maps to a model the loaded catalog actually offers we forward it in the
     * submit so generation uses the chosen model instead of DEFAULT_MODEL. This
     * MUST ride on the submit payload directly — the auto-submit posts a synthetic
     * body ({ prompt }) and never sees the form's hidden model/provider inputs, so
     * seeding React state alone would be dropped. A stale/unknown id resolves to
     * null and we simply omit it, preserving the old default behaviour.
     */
    const handoff = readModelHandoff();
    const candidateModelId = handoff.modelId || readPersistedModelId();

    const resolvedModel = candidateModelId
      ? resolveHandoffModelSelection(
          { modelId: candidateModelId, provider: handoff.provider },
          initialModelsPayload.modelList,
        )
      : null;

    try {
      sessionStorage.removeItem('composerBuildIntent');
      sessionStorage.removeItem('pendingAppDescription');
      sessionStorage.removeItem('pendingBuildMode');
      sessionStorage.removeItem('triggerBuildOnLanding');
    } catch {
      // best-effort cleanup; the ref above already prevents a re-submit
    }

    clearModelHandoff();

    const handoffPrompt = stashedPrompt.trim().slice(0, PROMPT_MAX_CHARS);
    setPrompt(handoffPrompt);

    const submitBody: Record<string, string> = { prompt: handoffPrompt };

    if (resolvedModel) {
      submitBody.model = resolvedModel.model;
      submitBody.provider = resolvedModel.provider;

      // Keep the visible dropdowns in sync in case navigation is slow.
      setSelectedProvider(resolvedModel.provider);
      setSelectedModel(resolvedModel.model);
    }

    submit(submitBody, { method: 'post' });
  }, [initialModelsPayload.initialPrompt, initialModelsPayload.modelList, submit]);

  /*
   * Seed the provider/model dropdowns from the landing hand-off (or a returning
   * visitor's saved preference) so the form's hidden model/provider inputs carry
   * the chosen model when the visitor reviews before submitting — the path the
   * auto-submit effect above does NOT cover. Runs once. Skipped when a `?model=`
   * override is present in the URL, and a no-op when the id isn't offered by the
   * loaded catalog (falls back to the default selection, never crashes).
   */
  const modelHandoffSeededRef = useRef(false);

  useEffect(() => {
    if (modelHandoffSeededRef.current || typeof window === 'undefined') {
      return;
    }

    modelHandoffSeededRef.current = true;

    try {
      if (new URLSearchParams(window.location.search).get('model')) {
        return;
      }
    } catch {
      // Malformed URL — fall through to the storage-based seed.
    }

    const handoff = readModelHandoff();
    const candidateModelId = handoff.modelId || readPersistedModelId();

    clearModelHandoff();

    if (!candidateModelId) {
      return;
    }

    const resolved = resolveHandoffModelSelection(
      { modelId: candidateModelId, provider: handoff.provider },
      initialModelsPayload.modelList,
    );

    if (resolved) {
      setSelectedProvider(resolved.provider);
      setSelectedModel(resolved.model);
    }
  }, [initialModelsPayload.modelList]);

  const activeCategory =
    artifactCategories.find((category) => category.id === selectedCategory) ?? artifactCategories[0];

  useEffect(() => {
    let cancelled = false;

    const refreshModels = async () => {
      setModelsLoading(true);
      setModelsError(null);

      try {
        const response = await fetch('/api/models');

        if (!response.ok) {
          throw new Error(`Failed to load models (${response.status})`);
        }

        const payload = (await response.json()) as ModelsPayload;

        if (!cancelled) {
          setModelsPayload(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setModelsError(error instanceof Error ? error.message : 'Failed to load models');
        }
      } finally {
        if (!cancelled) {
          setModelsLoading(false);
        }
      }
    };

    refreshModels();

    return () => {
      cancelled = true;
    };
  }, [providersSettings]);

  const enabledProviderNames = useMemo(() => {
    return new Set(
      Object.entries(providersSettings)
        .filter(([_name, provider]) => provider.settings.enabled)
        .map(([name]) => name),
    );
  }, [providersSettings]);

  const modelsByProvider = useMemo(() => {
    const map = new Map<string, ModelInfo[]>();

    for (const model of modelsPayload.modelList) {
      if (!model.provider || !model.name) {
        continue;
      }

      const current = map.get(model.provider) ?? [];
      current.push(model);
      map.set(model.provider, current);
    }

    for (const provider of modelsPayload.providers) {
      if (map.has(provider.name)) {
        continue;
      }

      const staticModels = provider.staticModels?.filter((model) => model.name) ?? [];

      if (staticModels.length > 0) {
        map.set(provider.name, staticModels);
      }
    }

    return map;
  }, [modelsPayload]);

  const availableProviders = useMemo(() => {
    const providersWithModels = modelsPayload.providers
      .filter((provider) => (modelsByProvider.get(provider.name)?.length ?? 0) > 0)
      .sort((left, right) => {
        const leftIndex = preferredProviderOrder.indexOf(left.name);
        const rightIndex = preferredProviderOrder.indexOf(right.name);

        return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
      });

    const enabledProviders = providersWithModels.filter((provider) => enabledProviderNames.has(provider.name));

    return enabledProviders.length > 0 ? enabledProviders : providersWithModels;
  }, [enabledProviderNames, modelsByProvider, modelsPayload.providers]);

  const activeProvider =
    availableProviders.find((provider) => provider.name === selectedProvider) ??
    availableProviders.find((provider) => provider.name === modelsPayload.defaultProvider.name) ??
    availableProviders[0] ??
    fallbackProvider ??
    DEFAULT_PROVIDER;

  const activeModels = activeProvider
    ? (modelsByProvider.get(activeProvider.name) ?? activeProvider.staticModels ?? [])
    : [];

  const activeModel =
    activeModels.find((model) => model.name === selectedModel) ??
    activeModels.find((model) => model.name === DEFAULT_MODEL) ??
    activeModels[0] ??
    fallbackModel;

  const promptValidation = useMemo(() => validateProjectPrompt(prompt, { allowEmpty: true }), [prompt]);
  const promptWordCount = promptValidation.wordCount;
  const promptCharacterCount = promptValidation.characterCount;
  const promptHasBlockingError = promptValidation.errors.length > 0;

  const promptCostEstimate = useMemo(
    () => estimatePromptCost(promptValidation.value, selectedModel),
    [promptValidation.value, selectedModel],
  );

  const canSubmit = !isSubmitting && promptWordCount >= 3 && !promptHasBlockingError;

  /**
   * Start as `false` so the first client render matches the server-rendered
   * output (where `navigator` is undefined). Resolving the real platform during
   * render would cause a hydration mismatch and flip the visible shortcut label
   * on first paint for Mac/iOS visitors, so detect it after mount instead.
   */
  const [isAppleHost, setIsAppleHost] = useState(false);

  useEffect(() => {
    setIsAppleHost(detectApplePlatform());
  }, []);

  const submitShortcutLabel = resolveSubmitShortcutLabel(isAppleHost);

  useEffect(() => {
    if (prompt.trim()) {
      return undefined;
    }

    const id = window.setInterval(() => {
      setPlaceholderIndex((index) => (index + 1) % ROTATING_PLACEHOLDERS.length);
    }, 3500);

    return () => window.clearInterval(id);
  }, [prompt]);

  useEffect(() => {
    if (!activeProvider?.name || selectedProvider === activeProvider.name) {
      return;
    }

    setSelectedProvider(activeProvider.name);
  }, [activeProvider?.name, selectedProvider]);

  useEffect(() => {
    if (!activeModel?.name || selectedModel === activeModel.name) {
      return;
    }

    setSelectedModel(activeModel.name);
  }, [activeModel?.name, selectedModel]);

  const examplePrompts = useMemo(() => {
    const prompts = activeCategory.prompts;
    const windowSize = Math.min(3, prompts.length);

    if (prompts.length <= windowSize) {
      return prompts;
    }

    /*
     * Show a rotating WINDOW of prompts. Each refresh (promptSeed++) advances the
     * window by its size so the visible set genuinely changes and cycles through
     * the whole pool before repeating — the old code rotated a 3-item array by an
     * offset, which just reordered the same three prompts.
     */
    const start = (promptSeed * windowSize) % prompts.length;

    return Array.from({ length: windowSize }, (_, index) => prompts[(start + index) % prompts.length]);
  }, [activeCategory, promptSeed]);

  return (
    <AppShell
      title="Create project"
      description="Describe your idea. E-Code creates a real workspace and opens the IDE."
      hideHeader
      mainClassName="vc-new-project-page"
      contentClassName="vc-new-project-content"
    >
      <div className="vc-new-project-hero">
        <header className="vc-new-project-header">
          <h1 className="vc-new-project-title">What do you want to build?</h1>
          <p className="vc-new-project-subtitle">
            Describe your idea. E-Code creates a real workspace and opens the IDE.
          </p>
        </header>

        <Form method="post" className="vc-new-project-form" aria-label="Create project form">
          {/* AGM: no model/provider in the create form — the server resolves the default. */}
          <input type="hidden" name="artifactType" value={selectedCategory} />
          <input type="hidden" name="framework" value={activeCategory.framework} />

          {actionData?.error ? (
            <div className="vc-new-project-error-block">
              <p className="vc-new-project-error" role="alert">
                {actionData.error}
              </p>
              {actionData.kind === 'quota' ? (
                <div className="vc-new-project-error-actions">
                  <Link to="/billing" className="vc-new-project-submit">
                    <Rocket className="h-4 w-4" aria-hidden />
                    <span>View billing</span>
                  </Link>
                  <Link to="/dashboard" className="vc-new-project-example">
                    Back to dashboard
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="vc-new-project-composer">
            <textarea
              name="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.currentTarget.value)}
              onKeyDown={(event) => {
                /*
                 * Power-user shortcut: Cmd-Enter on macOS / Ctrl-Enter elsewhere
                 * submits without reaching for the mouse. Plain Enter still
                 * inserts a newline because the textarea is for long briefs.
                 * IME composition (Japanese / Chinese / Korean) must be allowed
                 * to commit its first Enter without firing submit.
                 */
                if (event.key !== 'Enter') {
                  return;
                }

                if (!(event.metaKey || event.ctrlKey)) {
                  return;
                }

                if (event.nativeEvent.isComposing) {
                  return;
                }

                if (!canSubmit) {
                  return;
                }

                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }}
              placeholder={ROTATING_PLACEHOLDERS[placeholderIndex]}
              rows={6}
              maxLength={PROMPT_MAX_CHARS}
              className="vc-new-project-textarea"
              disabled={isSubmitting}
              aria-label="Describe your idea"
              aria-invalid={promptHasBlockingError || undefined}
              aria-describedby="vc-new-project-prompt-status"
            />
            <div className="vc-new-project-composer-footer">
              <div className="vc-new-project-attach-row" role="group" aria-label="Attach context">
                {heroAttachShortcuts.map((shortcut) => {
                  const Icon = shortcut.icon;
                  return (
                    <Link
                      key={`${shortcut.label}-${shortcut.to}`}
                      to={shortcut.to}
                      className="vc-new-project-attach"
                      aria-label={shortcut.hint}
                      title={shortcut.hint}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      <span className="sr-only">{shortcut.label}</span>
                    </Link>
                  );
                })}
              </div>
              <button
                type="submit"
                disabled={!canSubmit}
                className="vc-new-project-submit"
                aria-label="Create project"
                aria-keyshortcuts={isAppleHost ? 'Meta+Enter' : 'Control+Enter'}
                title="Create project"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden />
                )}
                <span>Create</span>
                <kbd className="vc-new-project-submit-shortcut" aria-hidden>
                  {submitShortcutLabel}
                </kbd>
              </button>
            </div>
          </div>
          <p
            id="vc-new-project-prompt-status"
            className="vc-new-project-word-count"
            aria-live="polite"
            data-state={promptHasBlockingError ? 'error' : promptValidation.warnings.length ? 'warn' : 'ok'}
          >
            {promptWordCount === 0 ? (
              <>
                Write a few sentences to unlock Create.
                <span className="vc-new-project-keyboard-hint"> Press {submitShortcutLabel} to send.</span>
              </>
            ) : promptWordCount < 3 ? (
              `${promptWordCount} word${promptWordCount === 1 ? '' : 's'} — keep going.`
            ) : (
              `${promptWordCount} words · ${formatUserAreaNumber(promptCharacterCount)}/${formatUserAreaNumber(PROMPT_MAX_CHARS)} chars`
            )}
            {promptWordCount >= 3 && promptCostEstimate.tokens > 0 ? (
              <span
                className="vc-new-project-prompt-estimate"
                title={
                  promptCostEstimate.hasPricing
                    ? `Estimate: ~${formatUserAreaNumber(promptCostEstimate.tokens)} input tokens`
                    : 'Token estimate only.'
                }
              >
                {' · '}
                {`~${formatUserAreaNumber(promptCostEstimate.tokens)} tokens`}
                {promptCostEstimate.hasPricing && promptCostEstimate.inputUsd !== null
                  ? ` · ~${formatEstimatedCost(promptCostEstimate.inputUsd)} input`
                  : ' · pricing unknown'}
              </span>
            ) : null}
            {promptValidation.errors.map((issue) => (
              <span key={issue.code} className="vc-new-project-prompt-issue" role="alert">
                {' · '}
                {issue.message}
              </span>
            ))}
            {promptValidation.warnings.map((issue) => (
              <span key={issue.code} className="vc-new-project-prompt-issue" data-kind="warn">
                {' · '}
                {issue.message}
              </span>
            ))}
          </p>

          <button
            type="button"
            className="vc-new-project-advanced-toggle"
            aria-expanded={advancedOpen}
            aria-controls="vc-new-project-advanced-content vc-new-project-templates"
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            <span className="vc-new-project-advanced-label">
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              Advanced options
            </span>
            {/* AGM: no model name anywhere — the summary shows the artifact type only. */}
            <span className="vc-new-project-advanced-summary">{activeCategory.label}</span>
            <ChevronDown className="vc-new-project-advanced-chevron h-4 w-4" aria-hidden />
          </button>

          <div
            id="vc-new-project-advanced-content"
            className="vc-new-project-advanced-content"
            data-open={advancedOpen ? 'true' : 'false'}
          >
            <section className="vc-new-project-meta" aria-label="Generation context">
              <div className="vc-new-project-meta-row">
                <span className="vc-new-project-meta-label">Artifact</span>
                <ToggleGroup
                  type="single"
                  value={selectedCategory}
                  onValueChange={(value) => {
                    if (value) {
                      setSelectedCategory(value);
                    }
                  }}
                  className="vc-new-project-chip-group"
                  aria-label="Artifact type"
                >
                  {artifactCategories.map((category) => {
                    const Icon = category.icon;

                    return (
                      <ToggleGroupItem
                        key={category.id}
                        value={category.id}
                        type="button"
                        className="vc-new-project-chip"
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                        {category.label}
                      </ToggleGroupItem>
                    );
                  })}
                </ToggleGroup>
              </div>

              {/*
               * AGM: no provider/model choice at project creation — the only
               * question is what to build. The agent MODE lives in the IDE.
               */}
            </section>

            <section className="vc-new-project-examples" aria-label="Example prompts">
              <header className="vc-new-project-examples-header">
                <span className="vc-new-project-meta-label">Try an example</span>
                <button
                  type="button"
                  onClick={() => setPromptSeed((value) => value + 1)}
                  className="vc-new-project-refresh"
                  aria-label="Refresh example prompts"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                </button>
              </header>
              <div className="vc-new-project-example-list">
                {examplePrompts.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setPrompt(example)}
                    className="vc-new-project-example"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </Form>
      </div>

      <section
        id="vc-new-project-templates"
        className="vc-new-project-templates"
        aria-label="Production templates"
        data-open={advancedOpen ? 'true' : 'false'}
      >
        <header className="vc-new-project-templates-header">
          <div>
            <p className="vc-new-project-meta-label">Templates</p>
            <h2 className="vc-new-project-templates-title">Start from the existing catalog</h2>
          </div>
          <p className="vc-new-project-templates-subtitle">Choose a curated starter and customize it with the agent.</p>
        </header>
        <TemplateGallery compact mode="authenticated" />
      </section>
    </AppShell>
  );
}

function ProjectsNewErrorActions({ descriptor }: { descriptor: ProjectsNewErrorDescriptor }) {
  switch (descriptor.kind) {
    case 'auth':
      return (
        <div className="vc-new-project-error-actions">
          <Link to="/login" className="vc-new-project-submit">
            <Sparkles className="h-4 w-4" aria-hidden />
            <span>Log in</span>
          </Link>
          <Link to="/" className="vc-new-project-example">
            Back to homepage
          </Link>
        </div>
      );

    case 'network':
      return (
        <div className="vc-new-project-error-actions">
          <button
            type="button"
            className="vc-new-project-submit"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.reload();
              }
            }}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            <span>Retry</span>
          </button>
          <Link to="/" className="vc-new-project-example">
            Back to homepage
          </Link>
        </div>
      );

    case 'quota':
      return (
        <div className="vc-new-project-error-actions">
          <Link to="/billing" className="vc-new-project-submit">
            <Rocket className="h-4 w-4" aria-hidden />
            <span>View billing</span>
          </Link>
          <Link to="/dashboard" className="vc-new-project-example">
            Back to dashboard
          </Link>
        </div>
      );

    case 'server':
      return (
        <div className="vc-new-project-error-actions">
          <button
            type="button"
            className="vc-new-project-submit"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.reload();
              }
            }}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            <span>Try again</span>
          </button>
          <Link to="/" className="vc-new-project-example">
            Back to homepage
          </Link>
        </div>
      );

    case 'unknown':
    default:
      return (
        <div className="vc-new-project-error-actions">
          <button
            type="button"
            className="vc-new-project-submit"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.reload();
              }
            }}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            <span>Retry</span>
          </button>
          <Link to="/" className="vc-new-project-example">
            Back to homepage
          </Link>
        </div>
      );
  }
}

export function ErrorBoundary() {
  const error = useRouteError();
  const descriptor = categorizeProjectsNewError(error);

  const shellDescription =
    descriptor.kind === 'auth'
      ? 'Sign in to create a project.'
      : descriptor.kind === 'quota'
        ? 'Project quota reached.'
        : 'Project creation is temporarily unavailable.';

  return (
    <AppShell
      title="Create project"
      description={shellDescription}
      hideHeader
      hideTopBar
      mainClassName="vc-new-project-page"
      contentClassName="vc-new-project-content"
    >
      <div className="vc-new-project-hero">
        <header className="vc-new-project-header">
          <h1 className="vc-new-project-title">{descriptor.title}</h1>
          <p className="vc-new-project-subtitle">{descriptor.subtitle}</p>
        </header>
        <ProjectsNewErrorActions descriptor={descriptor} />
      </div>
    </AppShell>
  );
}
