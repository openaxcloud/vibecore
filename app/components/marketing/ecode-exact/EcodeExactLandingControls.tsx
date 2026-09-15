import { CheckCircle2, ChevronRight, Clock, Cpu, Hammer, Layers, Paintbrush, Sparkles, X, Zap } from 'lucide-react';
import type { ElementType } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SiGoogle, SiOpenai } from 'react-icons/si';
import { toast as toastify } from 'react-toastify';
import { Badge, Button, Card, CardContent, cn, Skeleton } from '~/components/marketing/ecode-exact/EcodeExactUi';
import {
  persistPreferredModel,
  readPersistedModelId,
  resolvePreferredModelId,
} from '~/components/marketing/ecode-exact/resolve-preferred-model';
import { resolveMarketingLanguage } from '~/lib/i18n/catalogs/marketing';
import {
  formatExactBuildDuration,
  formatExactControlCount,
  formatExactRequestFailure,
  getMarketingExactProductControlsCopy,
  interpolateExactProductControlCopy,
  type ExactBuildOptionId,
  type ExactStaticModelId,
} from '~/lib/i18n/catalogs/marketing-exact-product-controls';

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
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingExactProductControlsCopy(language).exactLandingControls;
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
          throw new Error(
            formatExactRequestFailure(copy.errors.templateCatalogRequestFailed, response.status, language),
          );
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
  }, [copy.errors.templateCatalogRequestFailed, language]);

  return { data, isLoading };
}

export async function apiRequest<TResponse = unknown>(
  method: string,
  path: string,
  payload?: unknown,
  language?: string | null,
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
    const activeLanguage =
      language ?? (typeof document === 'undefined' ? undefined : document.documentElement.lang || undefined);

    const copy = getMarketingExactProductControlsCopy(activeLanguage).exactLandingControls;
    const english = resolveMarketingLanguage(activeLanguage) === 'en';
    const localizedFallback = formatExactRequestFailure(copy.errors.requestFailed, response.status, activeLanguage);
    const message = english ? data.error || response.statusText || localizedFallback : localizedFallback;
    const error = new Error(message) as Error & { status?: number };

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

type StaticModelOption = Omit<PublicModelOption, 'description'> & { id: ExactStaticModelId };

const modelOptions: StaticModelOption[] = [
  {
    id: 'gpt-5',
    name: 'GPT-5',
    provider: 'openai',
    supportsStreaming: true,
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'gemini',
    supportsStreaming: true,
  },
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    supportsStreaming: true,
  },
];

function createStaticModelOptions(language?: string | null): PublicModelOption[] {
  const descriptions = getMarketingExactProductControlsCopy(language).exactLandingControls.models.descriptions;

  return modelOptions.map((model) => ({ ...model, description: descriptions[model.id] }));
}

function normalizePublicModelOption(model: PublicModelOption, language?: string | null): PublicModelOption | null {
  if (!model.id || !model.name) {
    return null;
  }

  const copy = getMarketingExactProductControlsCopy(language).exactLandingControls;
  const knownDescription = (copy.models.descriptions as Partial<Record<string, string>>)[model.id];

  const description =
    knownDescription ??
    (resolveMarketingLanguage(language) === 'en' && model.description
      ? model.description
      : interpolateExactProductControlCopy(copy.models.genericDescription, { name: model.name }));

  return {
    id: model.id,
    name: model.name,
    provider: model.provider || 'default',
    description,
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
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingExactProductControlsCopy(language).exactLandingControls;
  const fallbackModels = useMemo(() => createStaticModelOptions(language), [language]);
  const [models, setModels] = useState<PublicModelOption[]>(() => createStaticModelOptions(language));
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
            fallbackModels.map((model) => model.id),
          )
        : persisted || fallbackModels[0]?.id || '';

    if (resolved) {
      setSelectedModel(resolved);
    }
  }, [fallbackModels, variant]);

  useEffect(() => {
    if (variant !== 'card') {
      setModels(fallbackModels);
    }
  }, [fallbackModels, variant]);

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
          throw new Error(formatExactRequestFailure(copy.errors.modelCatalogRequestFailed, response.status, language));
        }

        const payload = (await response.json()) as PublicModelsResponse;

        const normalized = (payload.models ?? [])
          .map((model) => normalizePublicModelOption(model, language))
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
           * always reopened on its disabled localized placeholder and the saved
           * preference confirmation never showed. We only
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
          setModels(fallbackModels);
          setModelsError(error instanceof Error ? error.message : copy.errors.modelCatalogUnavailable);
        }
      } finally {
        if (!controller.signal.aborted) {
          setModelsLoading(false);
        }
      }
    }

    void loadModels();

    return () => controller.abort();
  }, [copy.errors.modelCatalogRequestFailed, copy.errors.modelCatalogUnavailable, fallbackModels, language, variant]);

  if (variant === 'compactLine') {
    /*
     * One-line "✦ Model: Auto ▾" for the mobile prompt card. Same state and
     * persistence handlers as the other variants — an empty selection reads as
     * "Auto" instead of a skeleton so the line never jumps.
     */
    return (
      <label className={cn('flex items-center gap-1.5 text-[13px] text-[var(--ecode-text-secondary)]', className)}>
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-ecode-accent" aria-hidden />
        <span className="shrink-0 font-medium">{copy.modelSelector.compactLabel}</span>
        <select
          value={selectedModel}
          onChange={(event) => handleModelChange(event.target.value)}
          aria-label={copy.modelSelector.ariaLabel}
          className="min-w-0 flex-1 bg-transparent text-[16px] text-[var(--ecode-text)] outline-none"
          data-testid="select-ai-model-compact"
        >
          <option value="">{copy.modelSelector.automatic}</option>
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
              <Sparkles className="h-4 w-4 shrink-0 text-ecode-accent sm:h-5 sm:w-5" aria-hidden="true" />
              <h3 className="min-w-0 break-words text-[13px] font-semibold sm:text-base">
                {copy.modelSelector.cardTitle}
              </h3>
            </div>
            <p className="break-words text-[11px] leading-relaxed text-muted-foreground">
              {modelsLoading
                ? copy.modelSelector.loadingDescription
                : formatExactControlCount(models.length, copy.modelSelector.availableDescription, language)}
            </p>
            <select
              value={selectedModel}
              onChange={(event) => handleModelChange(event.target.value)}
              disabled={modelsLoading}
              aria-label={copy.modelSelector.ariaLabel}
              className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-base sm:text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] disabled:cursor-wait disabled:opacity-70"
              data-testid="select-ai-model"
            >
              <option value="" disabled>
                {modelsLoading ? copy.modelSelector.loadingOption : copy.modelSelector.selectOption}
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
                    <CurrentProviderIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {currentModel.name}
                    {currentModel.supportsStreaming ? (
                      <Badge variant="secondary" className="text-[11px] px-1.5 py-0">
                        {copy.modelSelector.streaming}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 break-words text-[11px] leading-relaxed text-muted-foreground">
                    {currentModel.description}
                  </p>
                </div>
              </div>
            ) : null}
            {modelsError ? (
              <div className="flex items-center gap-2 text-[11px] sm:text-[13px] text-[var(--status-warning-text)]">
                <Clock className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
                <span className="min-w-0 break-words">{copy.modelSelector.fallbackWarning}</span>
              </div>
            ) : null}
            {currentModel ? (
              <div className="flex items-center gap-2 text-[11px] sm:text-[13px] text-[var(--status-success-text)]">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
                <span className="min-w-0 break-words">{copy.modelSelector.preferenceSaved}</span>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2', className)}>
      <Zap className="h-4 w-4 shrink-0 text-ecode-accent" aria-hidden="true" />
      <select
        value={selectedModel || fallbackModels[0]?.id || ''}
        onChange={(event) => handleModelChange(event.target.value)}
        aria-label={copy.modelSelector.ariaLabel}
        className="min-h-[36px] min-w-0 flex-1 bg-transparent text-[13px] outline-none"
      >
        {fallbackModels.map((model) => (
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

/*
 * COULEUR-001 — chaque option portait sa propre couleur décorative (orange pour
 * « commencer par le design », emeraude pour « créer l'application complète »).
 * Ces teintes n'encodaient RIEN : ni un état, ni une gravité, ni une catégorie.
 * Résultat mesuré sur la modale en 390 sombre : cinq couleurs saturées
 * distinctes (#f26207, #fdb022, #34d399, #dc6803, #065f46) pour deux choix.
 *
 * La seule chose qui différencie réellement les deux options est que l'une est
 * RECOMMANDÉE. C'est donc elle, et elle seule, qui porte l'accent de marque ;
 * l'autre prend le neutre. La modale se lit alors d'un coup d'œil : une
 * recommandation mise en avant, une alternative.
 */
const BUILD_OPTION_VISUALS: Record<
  ExactBuildOptionId,
  { icon: typeof Paintbrush; emphasis: 'recommended' | 'alternative'; durationMinutes: number }
> = {
  'design-first': { icon: Paintbrush, emphasis: 'alternative', durationMinutes: 3 },
  'full-app': { icon: Hammer, emphasis: 'recommended', durationMinutes: 10 },
};

function AnimatedDot({
  emphasis,
  delay,
  isActive,
}: {
  emphasis: BuildOptionEmphasis;
  delay: number;
  isActive: boolean;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isActive) {
      const timer = setTimeout(() => setVisible(true), delay);
      return () => clearTimeout(timer);
    }

    setVisible(false);

    return undefined;
  }, [isActive, delay]);

  // COULEUR-001 — la puce suit la hiérarchie de la carte, pas une teinte propre.
  const dotColors: Record<BuildOptionEmphasis, string> = {
    recommended: 'bg-[var(--ecode-accent)]',
    alternative: 'bg-muted-foreground',
  };

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block w-1.5 h-1.5 rounded-full transition-all duration-300',
        visible ? dotColors[emphasis] : 'bg-muted-foreground/30',
        visible && 'animate-pulse',
      )}
    />
  );
}

type BuildOptionEmphasis = 'recommended' | 'alternative';

/*
 * COULEUR-001 — deux traitements, pas deux teintes arbitraires. L'option
 * recommandée porte l'accent de marque (bordure, pastille, icône) ; l'autre
 * reste neutre et ne se distingue que par l'interaction (survol, focus).
 */
function getEmphasisClasses(emphasis: BuildOptionEmphasis, type: 'bg' | 'border' | 'fg' | 'icon') {
  const styles: Record<BuildOptionEmphasis, Record<string, string>> = {
    recommended: {
      bg: 'bg-[color-mix(in_srgb,var(--ecode-accent)_8%,transparent)]',
      border: 'border-[var(--ecode-accent)] hover:border-[var(--ecode-accent)]',
      fg: 'text-[var(--vc-action-primary)]',
      icon: 'bg-[color-mix(in_srgb,var(--ecode-accent)_14%,transparent)]',
    },
    alternative: {
      bg: 'bg-muted/60',
      border: 'border-border hover:border-[var(--vc-action-primary)]',
      fg: 'text-muted-foreground',
      icon: 'bg-muted',
    },
  };

  return styles[emphasis]?.[type] ?? '';
}

export function BuildModeSelector({
  open,
  onOpenChange,
  onSelectMode,
  featureList = [],
  projectName,
}: BuildModeSelectorProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingExactProductControlsCopy(language).exactLandingControls;

  const buildOptions = copy.buildMode.options.map((option) => ({
    ...option,
    ...BUILD_OPTION_VISUALS[option.id],
    timeEstimate: formatExactBuildDuration(
      BUILD_OPTION_VISUALS[option.id].durationMinutes,
      copy.buildMode.duration,
      language,
    ),
  }));

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

  /*
   * TACTILE-002 — `w-full sm:w-auto` sous un parent `flex-col sm:flex-row`
   * donnait, en 390, un bouton « Fermer » de 309x44 occupant une LIGNE ENTIÈRE
   * sous le titre. Mesuré : 87 % de la largeur de la modale dépensée pour la
   * sortie, au moment le plus décisif du parcours, et les deux choix repoussés
   * d'autant vers le bas.
   *
   * Il redevient ce qu'un bouton de fermeture doit être : une croix ancrée en
   * haut à droite, à toutes les largeurs. Le libellé reste porté par
   * `aria-label`, donc rien n'est perdu au lecteur d'écran ni aux tests qui
   * cherchent par nom accessible. 44px de côté : la cible tactile est conservée.
   */

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="build-mode-selector-title"
      data-testid="build-mode-selector-dialog"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-background shadow-2xl">
        <div className="border-b border-border bg-muted/60 px-4 pb-4 pt-5 sm:px-6 sm:pt-6">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex min-w-0 items-center gap-2">
                <Sparkles className="h-5 w-5 shrink-0 text-ecode-accent" aria-hidden="true" />
                <h2 id="build-mode-selector-title" className="min-w-0 break-words text-[15px] font-semibold">
                  {copy.buildMode.title}
                </h2>
              </div>
              <p className="break-words text-[13px] leading-relaxed text-muted-foreground">
                {projectName ? <span className="font-medium">{projectName}: </span> : null}
                {copy.buildMode.approach}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0 self-end sm:self-start"
              onClick={() => onOpenChange(false)}
              aria-label={copy.buildMode.close}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {featureList.length > 0 ? (
            <div className="mt-4 rounded-lg border border-border bg-background p-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Layers className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 break-words text-[11px] font-medium text-muted-foreground">
                  {copy.buildMode.featureListCreated}
                </span>
                <Badge variant="secondary" className="max-w-full whitespace-normal text-[11px] leading-snug">
                  {formatExactControlCount(featureList.length, copy.buildMode.featureCount, language)}
                </Badge>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-4 p-4 sm:p-6">
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
                    'relative min-w-0 rounded-xl border-2 p-4 text-left transition-all duration-200',
                    'hover:shadow-lg md:hover:scale-[1.02]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] focus-visible:ring-offset-2',
                    getEmphasisClasses(option.emphasis, 'border'),
                    isHovered && getEmphasisClasses(option.emphasis, 'bg'),
                  )}
                  data-testid={`build-option-${option.id}`}
                >
                  <div className="mb-3 flex justify-end">
                    <Badge
                      className={cn(
                        'max-w-full whitespace-normal border-0 px-2 text-right text-[11px] leading-snug',
                        getEmphasisClasses(option.emphasis, 'fg'),
                        getEmphasisClasses(option.emphasis, 'icon'),
                      )}
                    >
                      {option.badge}
                    </Badge>
                  </div>

                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                        getEmphasisClasses(option.emphasis, 'icon'),
                      )}
                    >
                      <Icon className={cn('h-5 w-5', getEmphasisClasses(option.emphasis, 'fg'))} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-[13px] font-semibold leading-snug">{option.title}</h3>
                      <p className="mb-3 break-words text-[11px] leading-relaxed text-muted-foreground">
                        {option.description}
                      </p>
                      <div className="mb-3 flex min-w-0 items-center gap-1">
                        <Clock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 break-words text-[11px] text-muted-foreground">
                          {option.timeEstimate}
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {option.features.map((feature, index) => (
                          <li
                            key={`${option.id}-${index}`}
                            className="flex min-w-0 items-start gap-2 text-[11px] leading-relaxed text-muted-foreground"
                          >
                            <AnimatedDot
                              emphasis={option.emphasis}
                              delay={index * 150}
                              isActive={activeAnimations[option.id] || isHovered}
                            />
                            <span className="min-w-0 break-words">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <ChevronRight
                      className={cn('mt-1 h-4 w-4 shrink-0 transition-transform', isHovered && 'translate-x-1')}
                      aria-hidden="true"
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => onSelectMode('continue-planning')}
            className="min-h-[44px] w-full whitespace-normal rounded-md py-2 text-center text-[13px] leading-snug text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)]"
            data-testid="build-option-continue-planning"
          >
            {copy.buildMode.continuePlanning}
          </button>
        </div>
      </div>
    </div>
  );
}
