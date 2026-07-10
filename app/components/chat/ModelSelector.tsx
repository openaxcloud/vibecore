import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { AUTO_MODEL_OPTION, isAutoModel } from './modelList';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { LOCAL_PROVIDERS } from '~/lib/stores/settings';
import type { ProviderInfo } from '~/types/model';
import { classNames } from '~/utils/classNames';
import { DEFAULT_PROVIDER } from '~/utils/constants';

// Fuzzy search utilities
const levenshteinDistance = (str1: string, str2: string): number => {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }

  return matrix[str2.length][str1.length];
};

const fuzzyMatch = (query: string, text: string): { score: number; matches: boolean } => {
  if (!query) {
    return { score: 0, matches: true };
  }

  if (!text) {
    return { score: 0, matches: false };
  }

  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  // Exact substring match gets highest score
  if (textLower.includes(queryLower)) {
    return { score: 100 - (textLower.indexOf(queryLower) / textLower.length) * 20, matches: true };
  }

  // Fuzzy match with reasonable threshold
  const distance = levenshteinDistance(queryLower, textLower);
  const maxLen = Math.max(queryLower.length, textLower.length);
  const similarity = 1 - distance / maxLen;

  return {
    score: similarity > 0.6 ? similarity * 80 : 0,
    matches: similarity > 0.6,
  };
};

const highlightText = (text: string, query: string): string => {
  /*
   * The result is rendered via dangerouslySetInnerHTML, so EVERY path must escape
   * HTML — including the no-query path, which previously returned the raw model/
   * provider name (stored XSS if a name contains markup).
   */
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  if (!query) {
    return escapeHtml(text);
  }

  const safeQuery = escapeHtml(query);
  const regex = new RegExp(`(${safeQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');

  return escapeHtml(text).replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800 text-current">$1</mark>');
};

const formatContextSize = (tokens: number): string => {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }

  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}K`;
  }

  return tokens.toString();
};

interface ModelSelectorProps {
  model?: string;
  setModel?: (model: string) => void;
  provider?: ProviderInfo;
  setProvider?: (provider: ProviderInfo) => void;
  modelList: ModelInfo[];
  providerList: ProviderInfo[];
  apiKeys: Record<string, string>;
  modelLoading?: string;
  modelError?: string | null;
}

// Helper function to determine if a model is likely free
const isModelLikelyFree = (model: ModelInfo, providerName?: string): boolean => {
  // OpenRouter models with zero pricing in the label
  if (providerName === 'OpenRouter' && model.label.includes('in:$0.00') && model.label.includes('out:$0.00')) {
    return true;
  }

  // Models with "free" in the name or label
  if (model.name.toLowerCase().includes('free') || model.label.toLowerCase().includes('free')) {
    return true;
  }

  return false;
};

export const ModelSelector = ({
  model,
  setModel,
  provider,
  setProvider,
  modelList,
  providerList,
  modelLoading,
  modelError,
}: ModelSelectorProps) => {
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [debouncedModelSearchQuery, setDebouncedModelSearchQuery] = useState('');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [focusedModelIndex, setFocusedModelIndex] = useState(-1);
  const modelSearchInputRef = useRef<HTMLInputElement>(null);
  const modelOptionsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const [providerSearchQuery, setProviderSearchQuery] = useState('');
  const [debouncedProviderSearchQuery, setDebouncedProviderSearchQuery] = useState('');
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
  const [focusedProviderIndex, setFocusedProviderIndex] = useState(-1);
  const providerSearchInputRef = useRef<HTMLInputElement>(null);
  const providerOptionsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const providerDropdownRef = useRef<HTMLDivElement>(null);
  const [showFreeModelsOnly, setShowFreeModelsOnly] = useState(false);

  type ConnectionStatus = 'unknown' | 'connected' | 'disconnected';

  const [localProviderStatus, setLocalProviderStatus] = useState<Record<string, ConnectionStatus>>({});

  // Check connectivity of local providers when provider list changes
  useEffect(() => {
    const checkLocalProviders = async () => {
      const statuses: Record<string, 'connected' | 'disconnected'> = {};

      for (const p of providerList) {
        if (!LOCAL_PROVIDERS.includes(p.name)) {
          continue;
        }

        // If the provider has models loaded, it's connected
        const hasModels = modelList.some((m) => m.provider === p.name);

        statuses[p.name] = hasModels ? 'connected' : 'disconnected';
      }

      setLocalProviderStatus(statuses);
    };

    checkLocalProviders();
  }, [providerList, modelList]);

  // Debounce search queries
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedModelSearchQuery(modelSearchQuery);
    }, 150);

    return () => clearTimeout(timer);
  }, [modelSearchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedProviderSearchQuery(providerSearchQuery);
    }, 150);

    return () => clearTimeout(timer);
  }, [providerSearchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setIsModelDropdownOpen(false);
        setModelSearchQuery('');
      }

      if (providerDropdownRef.current && !providerDropdownRef.current.contains(event.target as Node)) {
        setIsProviderDropdownOpen(false);
        setProviderSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredModels = useMemo(() => {
    const baseModels = [...modelList].filter((e) => e.provider === provider?.name && e.name);

    const realModels = baseModels
      .filter((model) => {
        // Apply free models filter
        if (showFreeModelsOnly && !isModelLikelyFree(model, provider?.name)) {
          return false;
        }

        return true;
      })
      .map((model) => {
        // Calculate search scores for fuzzy matching
        const labelMatch = fuzzyMatch(debouncedModelSearchQuery, model.label);
        const nameMatch = fuzzyMatch(debouncedModelSearchQuery, model.name);
        const contextMatch = fuzzyMatch(debouncedModelSearchQuery, formatContextSize(model.maxTokenAllowed));

        const bestScore = Math.max(labelMatch.score, nameMatch.score, contextMatch.score);
        const matches = labelMatch.matches || nameMatch.matches || contextMatch.matches || !debouncedModelSearchQuery; // Show all if no query

        return {
          ...model,
          searchScore: bestScore,
          searchMatches: matches,
          highlightedLabel: highlightText(model.label, debouncedModelSearchQuery),
          highlightedName: highlightText(model.name, debouncedModelSearchQuery),
        };
      })
      .filter((model) => model.searchMatches)
      .sort((a, b) => {
        // Sort by search score (highest first), then by label
        if (debouncedModelSearchQuery) {
          return b.searchScore - a.searchScore;
        }

        return a.label.localeCompare(b.label);
      });

    /*
     * The provider-agnostic "Auto" (opt-in complexity routing) entry is always
     * pinned to the very top of the list, independent of the selected provider.
     * It participates in the search (matches on its label/name) but never gets
     * sorted below the real models.
     */
    const autoLabelMatch = fuzzyMatch(debouncedModelSearchQuery, AUTO_MODEL_OPTION.label);
    const autoNameMatch = fuzzyMatch(debouncedModelSearchQuery, AUTO_MODEL_OPTION.name);
    const autoMatches = autoLabelMatch.matches || autoNameMatch.matches || !debouncedModelSearchQuery;

    const autoEntry = autoMatches
      ? [
          {
            ...AUTO_MODEL_OPTION,
            searchScore: 1000,
            searchMatches: true,
            highlightedLabel: highlightText(AUTO_MODEL_OPTION.label, debouncedModelSearchQuery),
            highlightedName: highlightText(AUTO_MODEL_OPTION.name, debouncedModelSearchQuery),
          },
        ]
      : [];

    return [...autoEntry, ...realModels];
  }, [modelList, provider?.name, showFreeModelsOnly, debouncedModelSearchQuery]);

  const filteredProviders = useMemo(() => {
    if (!debouncedProviderSearchQuery) {
      return providerList;
    }

    return providerList
      .map((provider) => {
        const match = fuzzyMatch(debouncedProviderSearchQuery, provider.name);
        return {
          ...provider,
          searchScore: match.score,
          searchMatches: match.matches,
          highlightedName: highlightText(provider.name, debouncedProviderSearchQuery),
        };
      })
      .filter((provider) => provider.searchMatches)
      .sort((a, b) => b.searchScore - a.searchScore);
  }, [providerList, debouncedProviderSearchQuery]);

  // Reset free models filter when provider changes
  useEffect(() => {
    setShowFreeModelsOnly(false);
  }, [provider?.name]);

  useEffect(() => {
    setFocusedModelIndex(-1);
  }, [debouncedModelSearchQuery, isModelDropdownOpen, showFreeModelsOnly]);

  useEffect(() => {
    setFocusedProviderIndex(-1);
  }, [debouncedProviderSearchQuery, isProviderDropdownOpen]);

  // Clear search functions
  const clearModelSearch = useCallback(() => {
    setModelSearchQuery('');
    setDebouncedModelSearchQuery('');

    if (modelSearchInputRef.current) {
      modelSearchInputRef.current.focus();
    }
  }, []);

  const clearProviderSearch = useCallback(() => {
    setProviderSearchQuery('');
    setDebouncedProviderSearchQuery('');

    if (providerSearchInputRef.current) {
      providerSearchInputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (isModelDropdownOpen && modelSearchInputRef.current) {
      modelSearchInputRef.current.focus();
    }
  }, [isModelDropdownOpen]);

  useEffect(() => {
    if (isProviderDropdownOpen && providerSearchInputRef.current) {
      providerSearchInputRef.current.focus();
    }
  }, [isProviderDropdownOpen]);

  /*
   * Select a model option. The provider-agnostic "Auto" entry additionally pins
   * the provider to the DEFAULT_PROVIDER (Auto always routes against the default
   * provider's frontier/small pair); every other model keeps the current provider.
   */
  const handleSelectModel = useCallback(
    (modelName: string) => {
      if (isAutoModel(modelName) && setProvider) {
        const defaultProviderOption = providerList.find((p) => p.name === DEFAULT_PROVIDER.name);

        if (defaultProviderOption) {
          setProvider(defaultProviderOption);
        }
      }

      setModel?.(modelName);
    },
    [providerList, setModel, setProvider],
  );

  const handleModelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isModelDropdownOpen) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedModelIndex((prev) => (prev + 1 >= filteredModels.length ? 0 : prev + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedModelIndex((prev) => (prev - 1 < 0 ? filteredModels.length - 1 : prev - 1));
        break;
      case 'Enter':
        e.preventDefault();

        if (focusedModelIndex >= 0 && focusedModelIndex < filteredModels.length) {
          const selectedModel = filteredModels[focusedModelIndex];
          handleSelectModel(selectedModel.name);
          setIsModelDropdownOpen(false);
          setModelSearchQuery('');
          setDebouncedModelSearchQuery('');
        }

        break;
      case 'Escape':
        e.preventDefault();
        setIsModelDropdownOpen(false);
        setModelSearchQuery('');
        setDebouncedModelSearchQuery('');
        break;
      case 'Tab':
        /*
         * Guard length > 0: on an empty list `length - 1 === -1` matched the
         * initial focusedModelIndex of -1 and closed the dropdown on Tab.
         */
        if (!e.shiftKey && filteredModels.length > 0 && focusedModelIndex === filteredModels.length - 1) {
          setIsModelDropdownOpen(false);
        }

        break;
      case 'k':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          clearModelSearch();
        }

        break;
    }
  };

  const handleProviderKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isProviderDropdownOpen) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedProviderIndex((prev) => (prev + 1 >= filteredProviders.length ? 0 : prev + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedProviderIndex((prev) => (prev - 1 < 0 ? filteredProviders.length - 1 : prev - 1));
        break;
      case 'Enter':
        e.preventDefault();

        if (focusedProviderIndex >= 0 && focusedProviderIndex < filteredProviders.length) {
          const selectedProvider = filteredProviders[focusedProviderIndex];

          if (setProvider) {
            setProvider(selectedProvider);

            const firstModel = modelList.find((m) => m.provider === selectedProvider.name);

            if (firstModel && setModel) {
              setModel(firstModel.name);
            }
          }

          setIsProviderDropdownOpen(false);
          setProviderSearchQuery('');
          setDebouncedProviderSearchQuery('');
        }

        break;
      case 'Escape':
        e.preventDefault();
        setIsProviderDropdownOpen(false);
        setProviderSearchQuery('');
        setDebouncedProviderSearchQuery('');
        break;
      case 'Tab':
        if (!e.shiftKey && filteredProviders.length > 0 && focusedProviderIndex === filteredProviders.length - 1) {
          setIsProviderDropdownOpen(false);
        }

        break;
      case 'k':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          clearProviderSearch();
        }

        break;
    }
  };

  useEffect(() => {
    if (focusedModelIndex >= 0 && modelOptionsRef.current[focusedModelIndex]) {
      modelOptionsRef.current[focusedModelIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedModelIndex]);

  useEffect(() => {
    if (focusedProviderIndex >= 0 && providerOptionsRef.current[focusedProviderIndex]) {
      providerOptionsRef.current[focusedProviderIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedProviderIndex]);

  useEffect(() => {
    if (providerList.length === 0) {
      return;
    }

    if (provider && !providerList.some((p) => p.name === provider.name)) {
      const firstEnabledProvider = providerList[0];
      setProvider?.(firstEnabledProvider);

      const firstModel = modelList.find((m) => m.provider === firstEnabledProvider.name);

      if (firstModel) {
        setModel?.(firstModel.name);
      }
    }
  }, [providerList, provider, setProvider, modelList, setModel]);

  if (providerList.length === 0) {
    return (
      <div
        className="bolt-model-selector-empty mb-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-prompt-background p-4 text-bolt-elements-textPrimary"
        data-testid="agent-model-selector-empty"
      >
        <p className="text-center">
          No providers are currently enabled. Please enable at least one provider in the settings to start using the
          chat.
        </p>
      </div>
    );
  }

  return (
    <div className="bolt-model-selector" data-testid="agent-model-selector">
      {/* Provider Combobox */}
      <div
        className="bolt-model-selector-field"
        data-testid="agent-provider-dropdown"
        onKeyDown={handleProviderKeyDown}
        ref={providerDropdownRef}
      >
        <button
          type="button"
          className={classNames(
            'bolt-model-selector-trigger w-full rounded-lg border border-bolt-elements-borderColor p-2',
            'bg-bolt-elements-prompt-background text-bolt-elements-textPrimary',
            'focus-within:outline-none focus-within:ring-2 focus-within:ring-bolt-elements-focus',
            'transition-all cursor-pointer',
            isProviderDropdownOpen ? 'ring-2 ring-bolt-elements-focus' : undefined,
          )}
          onClick={() => setIsProviderDropdownOpen(!isProviderDropdownOpen)}
          role="combobox"
          aria-expanded={isProviderDropdownOpen}
          aria-controls="provider-listbox"
          aria-haspopup="listbox"
          data-testid="agent-provider-combobox"
        >
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="bolt-model-selector-trigger-label flex min-w-0 items-center gap-2">
              {provider?.name && LOCAL_PROVIDERS.includes(provider.name) && (
                <span
                  className={classNames(
                    'inline-block w-2 h-2 rounded-full flex-shrink-0',
                    localProviderStatus[provider.name] === 'connected'
                      ? 'bg-green-500'
                      : localProviderStatus[provider.name] === 'disconnected'
                        ? 'bg-red-400'
                        : 'bg-bolt-elements-textTertiary',
                  )}
                  title={
                    localProviderStatus[provider.name] === 'connected'
                      ? `${provider.name} is running`
                      : localProviderStatus[provider.name] === 'disconnected'
                        ? `${provider.name} is not reachable`
                        : 'Checking...'
                  }
                />
              )}
              {provider?.name || 'Select provider'}
            </div>
            <div
              className={classNames(
                'i-ph:caret-down h-4 w-4 flex-shrink-0 text-bolt-elements-textSecondary opacity-75',
                isProviderDropdownOpen ? 'rotate-180' : undefined,
              )}
            />
          </div>
        </button>

        {isProviderDropdownOpen && (
          <div
            className="bolt-model-selector-popover absolute z-20 mt-1 w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 py-1 shadow-lg"
            role="listbox"
            id="provider-listbox"
            data-testid="agent-provider-listbox"
            data-selector="provider"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="bolt-model-selector-popover-head px-2 pb-2">
              <div className="bolt-model-selector-search relative">
                <input
                  ref={providerSearchInputRef}
                  type="text"
                  value={providerSearchQuery}
                  onChange={(e) => setProviderSearchQuery(e.target.value)}
                  placeholder="Search providers..."
                  className={classNames(
                    'w-full rounded-md py-1.5 pl-8 pr-8 text-sm',
                    'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
                    'text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary',
                    'focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus',
                    'transition-all',
                  )}
                  onClick={(e) => e.stopPropagation()}
                  role="searchbox"
                  aria-label="Search providers"
                  data-testid="agent-provider-search"
                />
                <div className="absolute left-2.5 top-1/2 -translate-y-1/2">
                  <span className="i-ph:magnifying-glass text-bolt-elements-textTertiary" />
                </div>
                {providerSearchQuery && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearProviderSearch();
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-bolt-elements-background-depth-3 transition-colors"
                    aria-label="Clear search"
                  >
                    <span className="i-ph:x text-bolt-elements-textTertiary text-xs" />
                  </button>
                )}
              </div>
            </div>

            <div
              className={classNames(
                'bolt-model-selector-list max-h-60 overflow-y-auto',
                'sm:scrollbar-none',
                '[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2',
                '[&::-webkit-scrollbar-thumb]:bg-bolt-elements-borderColor',
                '[&::-webkit-scrollbar-thumb]:hover:bg-bolt-elements-borderColorHover',
                '[&::-webkit-scrollbar-thumb]:rounded-full',
                '[&::-webkit-scrollbar-track]:bg-bolt-elements-background-depth-2',
                '[&::-webkit-scrollbar-track]:rounded-full',
                'sm:[&::-webkit-scrollbar]:w-1.5 sm:[&::-webkit-scrollbar]:h-1.5',
                'sm:hover:[&::-webkit-scrollbar-thumb]:bg-bolt-elements-borderColor/50',
                'sm:hover:[&::-webkit-scrollbar-thumb:hover]:bg-bolt-elements-borderColor',
                'sm:[&::-webkit-scrollbar-track]:bg-transparent',
              )}
            >
              {filteredProviders.length === 0 ? (
                <div className="px-3 py-3 text-sm">
                  <div className="text-bolt-elements-textTertiary mb-1">
                    {debouncedProviderSearchQuery
                      ? `No providers match "${debouncedProviderSearchQuery}"`
                      : 'No providers found'}
                  </div>
                  {debouncedProviderSearchQuery && (
                    <div className="text-xs text-bolt-elements-textTertiary">
                      Try searching for provider names like "OpenAI", "Anthropic", or "Google"
                    </div>
                  )}
                </div>
              ) : (
                filteredProviders.map((providerOption, index) => (
                  <button
                    type="button"
                    ref={(el) => {
                      providerOptionsRef.current[index] = el;
                    }}
                    key={providerOption.name}
                    role="option"
                    aria-selected={provider?.name === providerOption.name}
                    aria-label={`Select ${providerOption.name} provider`}
                    data-testid="agent-provider-option"
                    className={classNames(
                      'bolt-model-selector-option cursor-pointer px-3 py-2 text-sm',
                      'hover:bg-bolt-elements-background-depth-3',
                      'text-bolt-elements-textPrimary',
                      'outline-none',
                      provider?.name === providerOption.name || focusedProviderIndex === index
                        ? 'bg-bolt-elements-background-depth-2'
                        : undefined,
                      focusedProviderIndex === index ? 'ring-1 ring-inset ring-bolt-elements-focus' : undefined,
                    )}
                    onClick={(e) => {
                      e.stopPropagation();

                      if (setProvider) {
                        setProvider(providerOption);

                        const firstModel = modelList.find((m) => m.provider === providerOption.name);

                        if (firstModel && setModel) {
                          setModel(firstModel.name);
                        }
                      }

                      setIsProviderDropdownOpen(false);
                      setProviderSearchQuery('');
                      setDebouncedProviderSearchQuery('');
                    }}
                    tabIndex={focusedProviderIndex === index ? 0 : -1}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {LOCAL_PROVIDERS.includes(providerOption.name) && (
                        <span
                          className={classNames(
                            'inline-block w-2 h-2 rounded-full flex-shrink-0',
                            localProviderStatus[providerOption.name] === 'connected'
                              ? 'bg-green-500'
                              : localProviderStatus[providerOption.name] === 'disconnected'
                                ? 'bg-red-400'
                                : 'bg-bolt-elements-textTertiary',
                          )}
                        />
                      )}
                      <span
                        className="bolt-model-selector-option-title"
                        dangerouslySetInnerHTML={{
                          __html: (providerOption as any).highlightedName || providerOption.name,
                        }}
                      />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Model Combobox */}
      <div
        className="bolt-model-selector-field"
        data-testid="agent-model-dropdown"
        onKeyDown={handleModelKeyDown}
        ref={modelDropdownRef}
      >
        <button
          type="button"
          className={classNames(
            'bolt-model-selector-trigger w-full rounded-lg border border-bolt-elements-borderColor p-2',
            'bg-bolt-elements-prompt-background text-bolt-elements-textPrimary',
            'focus-within:outline-none focus-within:ring-2 focus-within:ring-bolt-elements-focus',
            'transition-all cursor-pointer',
            isModelDropdownOpen ? 'ring-2 ring-bolt-elements-focus' : undefined,
          )}
          onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
          role="combobox"
          aria-expanded={isModelDropdownOpen}
          aria-controls="model-listbox"
          aria-haspopup="listbox"
          data-testid="agent-model-combobox"
        >
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="bolt-model-selector-trigger-label">
              {isAutoModel(model)
                ? AUTO_MODEL_OPTION.label
                : modelList.find((m) => m.name === model)?.label || 'Select model'}
            </div>
            <div
              className={classNames(
                'i-ph:caret-down h-4 w-4 flex-shrink-0 text-bolt-elements-textSecondary opacity-75',
                isModelDropdownOpen ? 'rotate-180' : undefined,
              )}
            />
          </div>
        </button>

        {isModelDropdownOpen && (
          <div
            className="bolt-model-selector-popover absolute z-20 mt-1 w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 py-1 shadow-lg"
            role="listbox"
            id="model-listbox"
            data-testid="agent-model-listbox"
            data-selector="model"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="bolt-model-selector-popover-head space-y-2 px-2 pb-2">
              {/* Free Models Filter Toggle - Only show for OpenRouter */}
              {provider?.name === 'OpenRouter' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowFreeModelsOnly(!showFreeModelsOnly);
                    }}
                    className={classNames(
                      'bolt-model-selector-filter-toggle flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-all',
                      'hover:bg-bolt-elements-background-depth-3',
                      showFreeModelsOnly
                        ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent border border-bolt-elements-borderColorActive'
                        : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary border border-bolt-elements-borderColor',
                    )}
                  >
                    <span className="i-ph:gift text-xs" />
                    Free models only
                  </button>
                  {showFreeModelsOnly && (
                    <span className="text-xs text-bolt-elements-textTertiary">
                      {filteredModels.length} free model{filteredModels.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}

              {/* Search Result Count */}
              {debouncedModelSearchQuery && filteredModels.length > 0 && (
                <div className="text-xs text-bolt-elements-textTertiary px-1">
                  {filteredModels.length} model{filteredModels.length !== 1 ? 's' : ''} found
                  {filteredModels.length > 5 && ' (showing best matches)'}
                </div>
              )}

              {/* Search Input */}
              <div className="bolt-model-selector-search relative">
                <input
                  ref={modelSearchInputRef}
                  type="text"
                  value={modelSearchQuery}
                  onChange={(e) => setModelSearchQuery(e.target.value)}
                  placeholder="Search models..."
                  className={classNames(
                    'w-full rounded-md py-1.5 pl-8 pr-8 text-sm',
                    'bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
                    'text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary',
                    'focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus',
                    'transition-all',
                  )}
                  onClick={(e) => e.stopPropagation()}
                  role="searchbox"
                  aria-label="Search models"
                  data-testid="agent-model-search"
                />
                <div className="absolute left-2.5 top-1/2 -translate-y-1/2">
                  <span className="i-ph:magnifying-glass text-bolt-elements-textTertiary" />
                </div>
                {modelSearchQuery && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearModelSearch();
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-bolt-elements-background-depth-3 transition-colors"
                    aria-label="Clear search"
                  >
                    <span className="i-ph:x text-bolt-elements-textTertiary text-xs" />
                  </button>
                )}
              </div>
            </div>

            <div
              className={classNames(
                'bolt-model-selector-list max-h-60 overflow-y-auto',
                'sm:scrollbar-none',
                '[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2',
                '[&::-webkit-scrollbar-thumb]:bg-bolt-elements-borderColor',
                '[&::-webkit-scrollbar-thumb]:hover:bg-bolt-elements-borderColorHover',
                '[&::-webkit-scrollbar-thumb]:rounded-full',
                '[&::-webkit-scrollbar-track]:bg-bolt-elements-background-depth-2',
                '[&::-webkit-scrollbar-track]:rounded-full',
                'sm:[&::-webkit-scrollbar]:w-1.5 sm:[&::-webkit-scrollbar]:h-1.5',
                'sm:hover:[&::-webkit-scrollbar-thumb]:bg-bolt-elements-borderColor/50',
                'sm:hover:[&::-webkit-scrollbar-thumb:hover]:bg-bolt-elements-borderColor',
                'sm:[&::-webkit-scrollbar-track]:bg-transparent',
              )}
            >
              {modelLoading === 'all' || modelLoading === provider?.name ? (
                <div className="px-3 py-3 text-sm">
                  <div className="flex items-center gap-2 text-bolt-elements-textTertiary">
                    <span className="i-ph:spinner animate-spin" />
                    Loading models...
                  </div>
                </div>
              ) : modelError && filteredModels.length === 0 ? (
                <div className="px-3 py-3 text-sm" role="alert">
                  <div className="flex items-center gap-2 text-bolt-elements-icon-error">
                    <span className="i-ph:warning-circle" />
                    {modelError}
                  </div>
                </div>
              ) : filteredModels.length === 0 ? (
                <div className="px-3 py-3 text-sm">
                  <div className="text-bolt-elements-textTertiary mb-1">
                    {debouncedModelSearchQuery
                      ? `No models match "${debouncedModelSearchQuery}"${showFreeModelsOnly ? ' (free only)' : ''}`
                      : showFreeModelsOnly
                        ? 'No free models available'
                        : provider?.name && LOCAL_PROVIDERS.includes(provider.name)
                          ? `No models found — is ${provider.name} running?`
                          : 'No models available'}
                  </div>
                  {!debouncedModelSearchQuery && provider?.name && LOCAL_PROVIDERS.includes(provider.name) && (
                    <div className="text-xs text-bolt-elements-textTertiary mt-1">
                      Make sure {provider.name} is running and has at least one model loaded.
                      {provider.name === 'Ollama' && ' Try: ollama pull llama3.2'}
                      {provider.name === 'LMStudio' && ' Load a model in LM Studio first.'}
                    </div>
                  )}
                  {debouncedModelSearchQuery && (
                    <div className="text-xs text-bolt-elements-textTertiary">
                      Try searching for model names, context sizes (e.g., "128k", "1M"), or capabilities
                    </div>
                  )}
                  {showFreeModelsOnly && !debouncedModelSearchQuery && (
                    <div className="text-xs text-bolt-elements-textTertiary">
                      Try disabling the "Free models only" filter to see all available models
                    </div>
                  )}
                </div>
              ) : (
                filteredModels.map((modelOption, index) => (
                  <button
                    type="button"
                    ref={(el) => {
                      modelOptionsRef.current[index] = el;
                    }}
                    key={modelOption.name}
                    role="option"
                    aria-selected={model === modelOption.name}
                    aria-label={`Select ${modelOption.label} model`}
                    data-testid="agent-model-option"
                    className={classNames(
                      'bolt-model-selector-option cursor-pointer px-3 py-2 text-sm',
                      'hover:bg-bolt-elements-background-depth-3',
                      'text-bolt-elements-textPrimary',
                      'outline-none',
                      model === modelOption.name || focusedModelIndex === index
                        ? 'bg-bolt-elements-background-depth-2'
                        : undefined,
                      focusedModelIndex === index ? 'ring-1 ring-inset ring-bolt-elements-focus' : undefined,
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectModel(modelOption.name);
                      setIsModelDropdownOpen(false);
                      setModelSearchQuery('');
                      setDebouncedModelSearchQuery('');
                    }}
                    tabIndex={focusedModelIndex === index ? 0 : -1}
                  >
                    <div className="flex min-w-0 items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="bolt-model-selector-option-title">
                          <span
                            dangerouslySetInnerHTML={{
                              __html: (modelOption as any).highlightedLabel || modelOption.label,
                            }}
                          />
                        </div>
                        <div className="bolt-model-selector-option-meta mt-0.5 flex items-center gap-2">
                          <span className="text-xs text-bolt-elements-textTertiary">
                            {isAutoModel(modelOption.name)
                              ? 'Fast model for simple turns, frontier for builds'
                              : `${formatContextSize(modelOption.maxTokenAllowed)} tokens`}
                          </span>
                          {debouncedModelSearchQuery && (modelOption as any).searchScore > 70 && (
                            <span className="text-xs text-[var(--status-success-text)] font-medium">
                              {(modelOption as any).searchScore.toFixed(0)}% match
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        {isModelLikelyFree(modelOption, provider?.name) && (
                          <span
                            className="i-ph:gift text-xs text-bolt-elements-item-contentAccent"
                            title="Free model"
                          />
                        )}
                        {model === modelOption.name && (
                          <span className="i-ph:check text-xs text-green-500" title="Selected" />
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
