import { useStore } from '@nanostores/react';
import {
  isDebugMode,
  isEventLogsEnabled,
  isLocalModelsEnabled,
  LOCAL_PROVIDERS,
  promptStore,
  providersStore,
  latestBranchStore,
  autoSelectStarterTemplate,
  enableContextOptimizationStore,
  tabConfigurationStore,
  updateTabConfiguration as updateTabConfig,
  resetTabConfiguration as resetTabConfig,
} from '~/lib/stores/settings';
import { useCallback, useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import type { IProviderSetting, ProviderInfo, IProviderConfig } from '~/types/model';
import type { TabWindowConfig, TabVisibilityConfig } from '~/components/settings/settings.types';
import { logStore } from '~/lib/stores/logs';
import { getLocalStorage, setLocalStorage } from '~/lib/persistence';

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: boolean;
  eventLogs: boolean;
  timezone: string;
  tabConfiguration: TabWindowConfig;
}

export interface UseSettingsReturn {
  // Theme and UI settings
  setTheme: (theme: Settings['theme']) => void;
  setLanguage: (language: string) => void;
  setNotifications: (enabled: boolean) => void;
  setEventLogs: (enabled: boolean) => void;
  setTimezone: (timezone: string) => void;
  settings: Settings;

  // Provider settings
  providers: Record<string, IProviderConfig>;
  activeProviders: ProviderInfo[];
  updateProviderSettings: (provider: string, config: IProviderSetting) => void;
  isLocalModel: boolean;
  enableLocalModels: (enabled: boolean) => void;

  // Debug and development settings
  debug: boolean;
  enableDebugMode: (enabled: boolean) => void;
  eventLogs: boolean;
  promptId: string;
  setPromptId: (promptId: string) => void;
  isLatestBranch: boolean;
  enableLatestBranch: (enabled: boolean) => void;
  autoSelectTemplate: boolean;
  setAutoSelectTemplate: (enabled: boolean) => void;
  contextOptimizationEnabled: boolean;
  enableContextOptimization: (enabled: boolean) => void;

  // Tab configuration
  tabConfiguration: TabWindowConfig;
  updateTabConfiguration: (config: TabVisibilityConfig) => void;
  resetTabConfiguration: () => void;
}

export function useSettings(): UseSettingsReturn {
  const providers = useStore(providersStore) as Record<string, IProviderConfig>;
  const debug = useStore(isDebugMode);
  const eventLogs = useStore(isEventLogsEnabled);
  const promptId = useStore(promptStore);
  const isLocalModel = useStore(isLocalModelsEnabled);
  const isLatestBranch = useStore(latestBranchStore);
  const autoSelectTemplate = useStore(autoSelectStarterTemplate);
  const [activeProviders, setActiveProviders] = useState<ProviderInfo[]>([]);
  const contextOptimizationEnabled = useStore(enableContextOptimizationStore);
  const tabConfiguration = useStore(tabConfigurationStore);
  const [settings, setSettings] = useState<Settings>(() => {
    const storedSettings = getLocalStorage('settings');
    return {
      theme: storedSettings?.theme || 'system',
      language: storedSettings?.language || 'en',
      notifications: storedSettings?.notifications ?? true,
      eventLogs: storedSettings?.eventLogs ?? true,
      timezone: storedSettings?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      tabConfiguration,
    };
  });

  // writing values to cookies on change
  useEffect(() => {
    const providers = providersStore.get();
    const providerSetting: Record<string, IProviderSetting> = {};
    Object.keys(providers).forEach((provider) => {
      providerSetting[provider] = providers[provider].settings;
    });
    Cookies.set('providers', JSON.stringify(providerSetting));
  }, [providers]);

  useEffect(() => {
    let active = Object.entries(providers)
      .filter(([_key, provider]) => provider.settings.enabled)
      .map(([_k, p]) => p);

    if (!isLocalModel) {
      active = active.filter((p) => !LOCAL_PROVIDERS.includes(p.name));
    }

    setActiveProviders(active);
  }, [providers, isLocalModel]);

  const saveSettings = useCallback((newSettings: Partial<Settings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      setLocalStorage('settings', updated);

      return updated;
    });
  }, []);

  const updateProviderSettings = useCallback((provider: string, config: IProviderSetting) => {
    providersStore.setKey(provider, { settings: config } as IProviderConfig);
  }, []);

  const enableDebugMode = useCallback((enabled: boolean) => {
    isDebugMode.set(enabled);
    logStore.logSystem(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    Cookies.set('isDebugEnabled', String(enabled));
  }, []);

  const setEventLogs = useCallback((enabled: boolean) => {
    isEventLogsEnabled.set(enabled);
    logStore.logSystem(`Event logs ${enabled ? 'enabled' : 'disabled'}`);
    Cookies.set('isEventLogsEnabled', String(enabled));
  }, []);

  const enableLocalModels = useCallback((enabled: boolean) => {
    isLocalModelsEnabled.set(enabled);
    logStore.logSystem(`Local models ${enabled ? 'enabled' : 'disabled'}`);
    Cookies.set('isLocalModelsEnabled', String(enabled));
  }, []);

  const setPromptId = useCallback((promptId: string) => {
    promptStore.set(promptId);
    Cookies.set('promptId', promptId);
  }, []);

  const enableLatestBranch = useCallback((enabled: boolean) => {
    latestBranchStore.set(enabled);
    logStore.logSystem(`Main branch updates ${enabled ? 'enabled' : 'disabled'}`);
    Cookies.set('isLatestBranch', String(enabled));
  }, []);

  const setAutoSelectTemplate = useCallback((enabled: boolean) => {
    autoSelectStarterTemplate.set(enabled);
    logStore.logSystem(`Auto select template ${enabled ? 'enabled' : 'disabled'}`);
    Cookies.set('autoSelectTemplate', String(enabled));
  }, []);

  const enableContextOptimization = useCallback((enabled: boolean) => {
    enableContextOptimizationStore.set(enabled);
    logStore.logSystem(`Context optimization ${enabled ? 'enabled' : 'disabled'}`);
    Cookies.set('contextOptimizationEnabled', String(enabled));
  }, []);

  const setTheme = useCallback(
    (theme: Settings['theme']) => {
      saveSettings({ theme });
    },
    [saveSettings],
  );

  const setLanguage = useCallback(
    (language: string) => {
      saveSettings({ language });
    },
    [saveSettings],
  );

  const setNotifications = useCallback(
    (enabled: boolean) => {
      saveSettings({ notifications: enabled });
    },
    [saveSettings],
  );

  const setTimezone = useCallback(
    (timezone: string) => {
      saveSettings({ timezone });
    },
    [saveSettings],
  );

  return {
    ...settings,
    providers,
    activeProviders,
    updateProviderSettings,
    isLocalModel,
    enableLocalModels,
    debug,
    enableDebugMode,
    eventLogs,
    setEventLogs,
    promptId,
    setPromptId,
    isLatestBranch,
    enableLatestBranch,
    autoSelectTemplate,
    setAutoSelectTemplate,
    contextOptimizationEnabled,
    enableContextOptimization,
    setTheme,
    setLanguage,
    setNotifications,
    setTimezone,
    settings,
    tabConfiguration,
    updateTabConfiguration: updateTabConfig,
    resetTabConfiguration: resetTabConfig,
  };
}
