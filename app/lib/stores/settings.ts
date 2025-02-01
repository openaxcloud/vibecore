import { atom, map } from 'nanostores';
import { workbenchStore } from './workbench';
import { PROVIDER_LIST } from '~/utils/constants';
import type { IProviderConfig } from '~/types/model';
import type { TabVisibilityConfig, TabWindowConfig } from '~/components/settings/settings.types';
import { DEFAULT_TAB_CONFIG } from '~/components/settings/settings.types';
import Cookies from 'js-cookie';
import { toggleTheme } from './theme';
import { chatStore } from './chat';

export interface Shortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  ctrlOrMetaKey?: boolean;
  action: () => void;
}

export interface Shortcuts {
  toggleTerminal: Shortcut;
  toggleTheme: Shortcut;
  toggleChat: Shortcut;
  toggleSettings: Shortcut;
}

export const URL_CONFIGURABLE_PROVIDERS = ['Ollama', 'LMStudio', 'OpenAILike'];
export const LOCAL_PROVIDERS = ['OpenAILike', 'LMStudio', 'Ollama'];

export type ProviderSetting = Record<string, IProviderConfig>;

export const shortcutsStore = map<Shortcuts>({
  toggleTerminal: {
    key: '`',
    ctrlOrMetaKey: true,
    action: () => workbenchStore.toggleTerminal(),
  },
  toggleTheme: {
    key: 'd',
    metaKey: true, // Command key on Mac, Windows key on Windows
    altKey: true, // Option key on Mac, Alt key on Windows
    shiftKey: true,
    action: () => toggleTheme(),
  },
  toggleChat: {
    key: 'k',
    ctrlOrMetaKey: true,
    action: () => chatStore.setKey('showChat', !chatStore.get().showChat),
  },
  toggleSettings: {
    key: 's',
    ctrlOrMetaKey: true,
    altKey: true,
    action: () => {
      // This will be connected to the settings panel toggle
      document.dispatchEvent(new CustomEvent('toggle-settings'));
    },
  },
});

// Create a single key for provider settings
const PROVIDER_SETTINGS_KEY = 'provider_settings';

// Add this helper function at the top of the file
const isBrowser = typeof window !== 'undefined';

// Initialize provider settings from both localStorage and defaults
const getInitialProviderSettings = (): ProviderSetting => {
  const initialSettings: ProviderSetting = {};

  // Start with default settings
  PROVIDER_LIST.forEach((provider) => {
    initialSettings[provider.name] = {
      ...provider,
      settings: {
        enabled: true,
      },
    };
  });

  // Only try to load from localStorage in the browser
  if (isBrowser) {
    const savedSettings = localStorage.getItem(PROVIDER_SETTINGS_KEY);

    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        Object.entries(parsed).forEach(([key, value]) => {
          if (initialSettings[key]) {
            initialSettings[key].settings = (value as IProviderConfig).settings;
          }
        });
      } catch (error) {
        console.error('Error parsing saved provider settings:', error);
      }
    }
  }

  return initialSettings;
};

export const providersStore = map<ProviderSetting>(getInitialProviderSettings());

// Create a function to update provider settings that handles both store and persistence
export const updateProviderSettings = (provider: string, settings: ProviderSetting) => {
  const currentSettings = providersStore.get();

  // Create new provider config with updated settings
  const updatedProvider = {
    ...currentSettings[provider],
    settings: {
      ...currentSettings[provider].settings,
      ...settings,
    },
  };

  // Update the store with new settings
  providersStore.setKey(provider, updatedProvider);

  // Save to localStorage
  const allSettings = providersStore.get();
  localStorage.setItem(PROVIDER_SETTINGS_KEY, JSON.stringify(allSettings));
};

export const isDebugMode = atom(false);

// Define keys for localStorage
const SETTINGS_KEYS = {
  LATEST_BRANCH: 'isLatestBranch',
  AUTO_SELECT_TEMPLATE: 'autoSelectTemplate',
  CONTEXT_OPTIMIZATION: 'contextOptimizationEnabled',
  EVENT_LOGS: 'isEventLogsEnabled',
  LOCAL_MODELS: 'isLocalModelsEnabled',
  PROMPT_ID: 'promptId',
  DEVELOPER_MODE: 'isDeveloperMode',
} as const;

// Initialize settings from localStorage or defaults
const getInitialSettings = () => {
  const getStoredBoolean = (key: string, defaultValue: boolean): boolean => {
    if (!isBrowser) {
      return defaultValue;
    }

    const stored = localStorage.getItem(key);

    if (stored === null) {
      return defaultValue;
    }

    try {
      return JSON.parse(stored);
    } catch {
      return defaultValue;
    }
  };

  return {
    latestBranch: getStoredBoolean(SETTINGS_KEYS.LATEST_BRANCH, false),
    autoSelectTemplate: getStoredBoolean(SETTINGS_KEYS.AUTO_SELECT_TEMPLATE, false),
    contextOptimization: getStoredBoolean(SETTINGS_KEYS.CONTEXT_OPTIMIZATION, false),
    eventLogs: getStoredBoolean(SETTINGS_KEYS.EVENT_LOGS, true),
    localModels: getStoredBoolean(SETTINGS_KEYS.LOCAL_MODELS, true),
    promptId: isBrowser ? localStorage.getItem(SETTINGS_KEYS.PROMPT_ID) || 'default' : 'default',
    developerMode: getStoredBoolean(SETTINGS_KEYS.DEVELOPER_MODE, false),
  };
};

// Initialize stores with persisted values
const initialSettings = getInitialSettings();

export const latestBranchStore = atom<boolean>(initialSettings.latestBranch);
export const autoSelectStarterTemplate = atom<boolean>(initialSettings.autoSelectTemplate);
export const enableContextOptimizationStore = atom<boolean>(initialSettings.contextOptimization);
export const isEventLogsEnabled = atom<boolean>(initialSettings.eventLogs);
export const isLocalModelsEnabled = atom<boolean>(initialSettings.localModels);
export const promptStore = atom<string>(initialSettings.promptId);

// Helper functions to update settings with persistence
export const updateLatestBranch = (enabled: boolean) => {
  latestBranchStore.set(enabled);
  localStorage.setItem(SETTINGS_KEYS.LATEST_BRANCH, JSON.stringify(enabled));
};

export const updateAutoSelectTemplate = (enabled: boolean) => {
  autoSelectStarterTemplate.set(enabled);
  localStorage.setItem(SETTINGS_KEYS.AUTO_SELECT_TEMPLATE, JSON.stringify(enabled));
};

export const updateContextOptimization = (enabled: boolean) => {
  enableContextOptimizationStore.set(enabled);
  localStorage.setItem(SETTINGS_KEYS.CONTEXT_OPTIMIZATION, JSON.stringify(enabled));
};

export const updateEventLogs = (enabled: boolean) => {
  isEventLogsEnabled.set(enabled);
  localStorage.setItem(SETTINGS_KEYS.EVENT_LOGS, JSON.stringify(enabled));
};

export const updateLocalModels = (enabled: boolean) => {
  isLocalModelsEnabled.set(enabled);
  localStorage.setItem(SETTINGS_KEYS.LOCAL_MODELS, JSON.stringify(enabled));
};

export const updatePromptId = (id: string) => {
  promptStore.set(id);
  localStorage.setItem(SETTINGS_KEYS.PROMPT_ID, id);
};

// Initialize tab configuration from localStorage or defaults
const getInitialTabConfiguration = (): TabWindowConfig => {
  const defaultConfig: TabWindowConfig = {
    userTabs: DEFAULT_TAB_CONFIG.filter((tab) => tab.window === 'user'),
    developerTabs: DEFAULT_TAB_CONFIG.filter((tab) => tab.window === 'developer'),
  };

  if (!isBrowser) {
    return defaultConfig;
  }

  try {
    const saved = localStorage.getItem('bolt_tab_configuration');

    if (!saved) {
      return defaultConfig;
    }

    const parsed = JSON.parse(saved);

    if (!parsed?.userTabs || !parsed?.developerTabs) {
      return defaultConfig;
    }

    return parsed;
  } catch (error) {
    console.warn('Failed to parse tab configuration:', error);
    return defaultConfig;
  }
};

console.log('Initial tab configuration:', getInitialTabConfiguration());

export const tabConfigurationStore = map<TabWindowConfig>(getInitialTabConfiguration());

// Helper function to update tab configuration
export const updateTabConfiguration = (config: TabVisibilityConfig) => {
  const currentConfig = tabConfigurationStore.get();
  console.log('Current tab configuration before update:', currentConfig);

  const isUserTab = config.window === 'user';
  const targetArray = isUserTab ? 'userTabs' : 'developerTabs';

  // Only update the tab in its respective window
  const updatedTabs = currentConfig[targetArray].map((tab) => (tab.id === config.id ? { ...config } : tab));

  // If tab doesn't exist in this window yet, add it
  if (!updatedTabs.find((tab) => tab.id === config.id)) {
    updatedTabs.push(config);
  }

  // Create new config, only updating the target window's tabs
  const newConfig: TabWindowConfig = {
    ...currentConfig,
    [targetArray]: updatedTabs,
  };

  console.log('New tab configuration after update:', newConfig);

  tabConfigurationStore.set(newConfig);
  Cookies.set('tabConfiguration', JSON.stringify(newConfig), {
    expires: 365, // Set cookie to expire in 1 year
    path: '/',
    sameSite: 'strict',
  });
};

// Helper function to reset tab configuration
export const resetTabConfiguration = () => {
  console.log('Resetting tab configuration to defaults');

  const defaultConfig: TabWindowConfig = {
    userTabs: DEFAULT_TAB_CONFIG.filter((tab) => tab.window === 'user'),
    developerTabs: DEFAULT_TAB_CONFIG.filter((tab) => tab.window === 'developer'),
  };

  console.log('Default tab configuration:', defaultConfig);

  tabConfigurationStore.set(defaultConfig);
  Cookies.set('tabConfiguration', JSON.stringify(defaultConfig), {
    expires: 365, // Set cookie to expire in 1 year
    path: '/',
    sameSite: 'strict',
  });
};

// Developer mode store with persistence
export const developerModeStore = atom<boolean>(initialSettings.developerMode);

export const setDeveloperMode = (value: boolean) => {
  developerModeStore.set(value);

  if (isBrowser) {
    localStorage.setItem(SETTINGS_KEYS.DEVELOPER_MODE, JSON.stringify(value));
  }
};
