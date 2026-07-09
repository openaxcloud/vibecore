import { CheckCircle2, ChevronRight, Clock, Cpu, Hammer, Layers, Paintbrush, Sparkles, Zap } from 'lucide-react';
import type { ElementType } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { SiGoogle, SiOpenai } from 'react-icons/si';
import { toast as toastify } from 'react-toastify';
import { Badge, Button, Card, CardContent, cn, Skeleton } from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  persistPreferredModel,
  readPersistedModelId,
  resolvePreferredModelId,
} from '~/components/marketing/ecode-exact/resolve-preferred-model';

export type BuildMode = 'design-first' | 'full-app' | 'continue-planning';

interface ToastInput {
  title: string;
  description?: string;
  variant?: 'destructive';
}

export function useEcodeToast() {
  return {
    toast({ title, description, variant }: ToastInput) {
      const message = description ? `${title}: ${description}` : title;

      if (variant === 'destructive') {
        toastify.error(message);
      } else {
        toastify.info(message);
      }
    },
  };
}

export function useStaticTemplatesQuery<TData>() {
  const [data, setData] = useState<TData>(() => [] as unknown as TData);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsLoading(false);
      return undefined;
    }

    const controller = new AbortController();

    async function loadTemplates() {
      setIsLoading(true);

      try {
        const response = await fetch('/api/marketplace/templates', {
          credentials: 'include',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Template catalog request failed with ${response.status}`);
        }

        const payload = (await response.json()) as TData;

        if (!controller.signal.aborted) {
          setData(payload);
        }
      } catch {
        if (!controller.signal.aborted) {
          /* Keep the empty list so the consumer falls back to its default templates. */
          setData([] as unknown as TData);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadTemplates();

    return () => controller.abort();
  }, []);

  return { data, isLoading };
}

export async function apiRequest<TResponse = unknown>(
  method: string,
  path: string,
  payload?: unknown,
): Promise<TResponse> {
  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: payload == null ? undefined : JSON.stringify(payload),
    credentials: 'include',
  });

  const data = (await response.json().catch(() => ({}))) as TResponse & { error?: string };

  if (!response.ok) {
    const error = new Error(data.error || response.statusText || 'Request failed') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return data;
}

interface PublicModelOption {
  id: string;
  name: string;
  provider: string;
  description: string;
  supportsStreaming: boolean;
}

interface PublicModelsResponse {
  models?: PublicModelOption[];
}

const modelOptions: PublicModelOption[] = [
  {
    id: 'gpt-5',
    name: 'GPT-5',
    provider: 'openai',
    description: 'Advanced reasoning model for full-stack app generation.',
    supportsStreaming: true,
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'gemini',
    description: 'Large-context model for planning, code, and multimodal app work.',
    supportsStreaming: true,
  },
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    description: 'Balanced coding model for long-running implementation tasks.',
    supportsStreaming: true,
  },
];

function normalizePublicModelOption(model: PublicModelOption): PublicModelOption | null {
  if (!model.id || !model.name) {
    return null;
  }

  return {
    id: model.id,
    name: model.name,
    provider: model.provider || 'default',
    description: model.description || model.name,
    supportsStreaming: Boolean(model.supportsStreaming),
  };
}

const AnthropicIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
    <path d="M17.304 3.541h-3.672l6.696 16.918h3.672zm-10.608 0L0 20.459h3.744l1.368-3.541h6.912l1.368 3.541h3.744L10.44 3.541zm-.456 10.295l2.304-5.975 2.304 5.975z" />
  </svg>
);

function getProviderIcon(provider: string) {
  const icons: Record<string, ElementType> = {
    openai: SiOpenai,
    anthropic: AnthropicIcon,
    gemini: SiGoogle,
    default: Cpu,
  };

  return icons[provider] || icons.default;
}

function getProviderColor(provider: string) {
  const colors: Record<string, string> = {
    openai: 'bg-green-500',
    anthropic: 'bg-orange-500',
    gemini: 'bg-blue-500',
    default: 'bg-gray-500',
  };

  return colors[provider] || colors.default;
}

interface AiModelSelectorProps {
  /** 'compactLine' is the one-line "✦ Model: Auto ▾" control inside the mobile prompt card. */
  variant?: 'inline' | 'card' | 'hero' | 'compactLine';
  className?: string;
  onModelChange?: (modelId: string) => void;
}

function AiModelSelector({ variant = 'inline', className = '', onModelChange }: AiModelSelectorProps) {
  const [models, setModels] = useState<PublicModelOption[]>(modelOptions);
  const [modelsLoading, setModelsLoading] = useState(variant === 'card');
  const [modelsError, setModelsError] = useState<string | null>(null);

  /*
   * SSR-safe initial selection: the server has no window/localStorage, so the
   * first render MUST be deterministic and identical on server and client (an
   * empty selection). Reading the persisted preference in the initializer made
   * the client's first render diverge from the server HTML, throwing a React
   * hydration mismatch (#418/#423) on every public page load. The persisted /
   * default preference is applied right after mount (client-only) in the effect
   * below; for the card variant the live catalog effect refines it further.
   */
  const [selectedModel, setSelectedModel] = useState<string>('');

  useEffect(() => {
    const persisted = readPersistedModelId();

    const resolved =
      variant === 'card'
        ? resolvePreferredModelId(
            persisted,
            modelOptions.map((model) => model.id),
          )
        : persisted || modelOptions[0]?.id || '';

    if (resolved) {
      setSelectedModel(resolved);
    }
  }, [variant, modelOptions]);

  const currentModel = useMemo(
    () => models.find((model) => model.id === selectedModel) ?? null,
    [models, selectedModel],
  );

  const handleModelChange = (modelId: string) => {
    if (!modelId) {
      return;
    }

    setSelectedModel(modelId);
    onModelChange?.(modelId);

    /*
     * Persist the model id AND its provider together so the landing "Build Now"
     * hand-off can forward the provider to /projects/new without re-deriving it.
     * The provider comes straight from the chosen model option's `provider`
     * field; if the option isn't in the current list (shouldn't happen) we still
     * persist the id and let the consumer resolve the provider from its catalog.
     */
    const chosen = models.find((model) => model.id === modelId);
    persistPreferredModel(modelId, chosen?.provider);
  };

  useEffect(() => {
    if (variant !== 'card' || typeof window === 'undefined') {
      return undefined;
    }

    const controller = new AbortController();

    async function loadModels() {
      setModelsLoading(true);
      setModelsError(null);

      try {
        const response = await fetch('/api/models', {
          credentials: 'include',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Model catalog request failed with ${response.status}`);
        }

        const payload = (await response.json()) as PublicModelsResponse;

        const normalized = (payload.models ?? [])
          .map((model) => normalizePublicModelOption(model))
          .filter((model): model is PublicModelOption => Boolean(model));

        /*
         * De-duplicate by id: the catalog can return the same model id from
         * multiple providers, which produced duplicate React keys on the <option>
         * list (console errors). Keep the first occurrence.
         */
        const seen = new Set<string>();

        const loadedModels = normalized.filter((model) => {
          if (seen.has(model.id)) {
            return false;
          }

          seen.add(model.id);

          return true;
        });

        if (loadedModels.length > 0) {
          setModels(loadedModels);

          /*
           * Restore the returning visitor's saved preference now that we know
           * which models the live catalog actually offers. Without this the card
           * always reopened on the disabled 'Select AI model...' placeholder and
           * the 'Model preference saved' confirmation never showed. We only
           * overwrite the current selection when nothing has been chosen yet, so
           * an in-session change made before the fetch resolved is preserved.
           */
          setSelectedModel((current) => {
            if (current) {
              return current;
            }

            return resolvePreferredModelId(
              readPersistedModelId(),
              loadedModels.map((model) => model.id),
            );
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setModels(modelOptions);
          setModelsError(error instanceof Error ? error.message : 'Model catalog unavailable');
        }
      } finally {
        if (!controller.signal.aborted) {
          setModelsLoading(false);
        }
      }
    }

    void loadModels();

    return () => controller.abort();
  }, [variant]);

  if (variant === 'compactLine') {
    /*
     * One-line "✦ Model: Auto ▾" for the mobile prompt card. Same state and
     * persistence handlers as the other variants — an empty selection reads as
     * "Auto" instead of a skeleton so the line never jumps.
     */
    return (
      <label className={cn('flex items-center gap-1.5 text-[13px] text-[var(--ecode-text-secondary)]', className)}>
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-ecode-accent" aria-hidden />
        <span className="shrink-0 font-medium">Model:</span>
        <select
          value={selectedModel}
          onChange={(event) => handleModelChange(event.target.value)}
          aria-label="AI model"
          className="min-w-0 flex-1 bg-transparent text-[16px] text-[var(--ecode-text)] outline-none"
          data-testid="select-ai-model-compact"
        >
          <option value="">Auto</option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (variant !== 'card' && !currentModel) {
    return <Skeleton className="h-10 sm:h-12 w-full" />;
  }

  const CurrentProviderIcon = currentModel ? getProviderIcon(currentModel.provider) : null;

  if (variant === 'card') {
    return (
      <Card className={className}>
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500 shrink-0" />
              <h3 className="font-semibold text-[13px] sm:text-base">AI Model Selection</h3>
            </div>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground">
              {modelsLoading
                ? 'Loading available AI models for code generation...'
                : `Choose your preferred AI model for code generation (${models.length} available)`}
            </p>
            <select
              value={selectedModel}
              onChange={(event) => handleModelChange(event.target.value)}
              disabled={modelsLoading}
              className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-base sm:text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] disabled:cursor-wait disabled:opacity-70"
              data-testid="select-ai-model"
            >
              <option value="" disabled>
                {modelsLoading ? 'Loading AI models...' : 'Select AI model...'}
              </option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
            {currentModel && CurrentProviderIcon ? (
              <div className="flex items-start gap-3 rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface-tertiary)] p-3">
                <div
                  className={cn('mt-1 h-2.5 w-2.5 rounded-full shrink-0', getProviderColor(currentModel.provider))}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                    <CurrentProviderIcon className="h-4 w-4" />
                    {currentModel.name}
                    {currentModel.supportsStreaming ? (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        Stream
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[10px] leading-tight text-muted-foreground">{currentModel.description}</p>
                </div>
              </div>
            ) : null}
            {modelsError ? (
              <div className="flex items-center gap-2 text-[11px] sm:text-[13px] text-[var(--status-warning-text)]">
                <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                <span>Using the static model fallback while the catalog reconnects.</span>
              </div>
            ) : null}
            {currentModel ? (
              <div className="flex items-center gap-2 text-[11px] sm:text-[13px] text-[var(--status-success-text)]">
                <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                <span>Model preference saved</span>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2', className)}>
      <Zap className="h-4 w-4 text-orange-500" />
      <select
        value={selectedModel || modelOptions[0]?.id || ''}
        onChange={(event) => handleModelChange(event.target.value)}
        className="min-h-[36px] flex-1 bg-transparent text-[13px] outline-none"
      >
        {modelOptions.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export { AiModelSelector as AIModelSelector };

interface BuildModeSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectMode: (mode: BuildMode) => void;
  featureList?: string[];
  projectName?: string;
}

const buildOptions = [
  {
    id: 'design-first' as const,
    title: 'Start with a design',
    description: 'See your app design first, then add functionality',
    icon: Paintbrush,
    badge: 'Visual First',
    timeEstimate: '~3 minutes',
    features: ['Quick clickable prototype', 'See UI before building', 'Iterate on design', 'Build functionality later'],
    color: 'orange',
  },
  {
    id: 'full-app' as const,
    title: 'Build the full app',
    description: 'Complete working application from the start',
    icon: Hammer,
    badge: 'Recommended',
    timeEstimate: '~10 minutes',
    features: ['Full-stack development', 'Working MVP immediately', 'Backend + Frontend', 'Database integration'],
    color: 'emerald',
    recommended: true,
  },
];

function AnimatedDot({ color, delay, isActive }: { color: string; delay: number; isActive: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isActive) {
      const timer = setTimeout(() => setVisible(true), delay);
      return () => clearTimeout(timer);
    }

    setVisible(false);

    return undefined;
  }, [isActive, delay]);

  const dotColors: Record<string, string> = {
    orange: 'bg-orange-500',
    emerald: 'bg-emerald-500',
  };

  return (
    <span
      className={cn(
        'inline-block w-1.5 h-1.5 rounded-full transition-all duration-300',
        visible ? dotColors[color] || 'bg-primary' : 'bg-muted-foreground/30',
        visible && 'animate-pulse',
      )}
    />
  );
}

function getColorClasses(color: string, type: 'bg' | 'border' | 'text' | 'icon') {
  const colors: Record<string, Record<string, string>> = {
    orange: {
      bg: 'bg-orange-50 dark:bg-muted',
      border: 'border-orange-200 dark:border-orange-800 hover:border-orange-400 dark:hover:border-orange-600',
      text: 'text-orange-600 dark:text-orange-400',
      icon: 'bg-orange-100 dark:bg-muted/70',
    },
    emerald: {
      bg: 'bg-emerald-50 dark:bg-muted',
      border: 'border-emerald-200 dark:border-emerald-800 hover:border-emerald-400 dark:hover:border-emerald-600',
      text: 'text-emerald-600 dark:text-emerald-400',
      icon: 'bg-emerald-100 dark:bg-muted/70',
    },
  };

  return colors[color]?.[type] || '';
}

export function BuildModeSelector({
  open,
  onOpenChange,
  onSelectMode,
  featureList = [],
  projectName,
}: BuildModeSelectorProps) {
  const [hoveredOption, setHoveredOption] = useState<BuildMode | null>(null);
  const [activeAnimations, setActiveAnimations] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) {
      setActiveAnimations({});
      return undefined;
    }

    const timer = setTimeout(() => setActiveAnimations({ 'design-first': true, 'full-app': true }), 200);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onOpenChange]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      data-testid="build-mode-selector-dialog"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="px-6 pt-6 pb-4 bg-gradient-to-r from-blue-50 to-orange-50 dark:from-muted dark:to-muted/70 border-b">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h2 className="text-[15px] font-semibold">How do you want to continue?</h2>
              </div>
              <p className="text-[13px] text-muted-foreground">
                {projectName ? <span className="font-medium">{projectName}: </span> : null}
                Choose your preferred build approach
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>

          {featureList.length > 0 ? (
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground">Feature list created</span>
                <Badge variant="secondary" className="text-[10px]">
                  {featureList.length} features
                </Badge>
              </div>
            </div>
          ) : null}
        </div>

        <div className="p-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {buildOptions.map((option) => {
              const Icon = option.icon;
              const isHovered = hoveredOption === option.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelectMode(option.id)}
                  onMouseEnter={() => setHoveredOption(option.id)}
                  onMouseLeave={() => setHoveredOption(null)}
                  className={cn(
                    'relative text-left p-4 rounded-xl border-2 transition-all duration-200',
                    'hover:shadow-lg hover:scale-[1.02]',
                    getColorClasses(option.color, 'border'),
                    isHovered && getColorClasses(option.color, 'bg'),
                  )}
                  data-testid={`build-option-${option.id}`}
                >
                  {option.recommended ? (
                    <div className="absolute -top-2.5 right-4">
                      <Badge
                        className={cn(
                          'text-[10px] px-2',
                          getColorClasses(option.color, 'text'),
                          'bg-emerald-100 dark:bg-emerald-900/50 border-0',
                        )}
                      >
                        {option.badge}
                      </Badge>
                    </div>
                  ) : null}

                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                        getColorClasses(option.color, 'icon'),
                      )}
                    >
                      <Icon className={cn('h-5 w-5', getColorClasses(option.color, 'text'))} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-[13px]">{option.title}</h3>
                      <p className="text-[11px] text-muted-foreground mb-3">{option.description}</p>
                      <div className="flex items-center gap-1 mb-3">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground">{option.timeEstimate}</span>
                      </div>
                      <ul className="space-y-1.5">
                        {option.features.map((feature, index) => (
                          <li key={feature} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <AnimatedDot
                              color={option.color}
                              delay={index * 150}
                              isActive={activeAnimations[option.id] || isHovered}
                            />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <ChevronRight className={cn('h-4 w-4 transition-transform mt-1', isHovered && 'translate-x-1')} />
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => onSelectMode('continue-planning')}
            className="w-full text-center text-[13px] text-muted-foreground hover:text-foreground transition-colors py-2"
            data-testid="build-option-continue-planning"
          >
            Continue refining the prompt
          </button>
        </div>
      </div>
    </div>
  );
}
