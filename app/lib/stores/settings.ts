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

const initialProviderSettings: ProviderSetting = {};
PROVIDER_LIST.forEach((provider) => {
  initialProviderSettings[provider.name] = {
    ...provider,
    settings: {
      enabled: true,
    },
  };
});

//TODO: need to create one single map for all these flags

export const providersStore = map<ProviderSetting>(initialProviderSettings);

export const isDebugMode = atom(false);

// Initialize event logs from cookie or default to false
const savedEventLogs = Cookies.get('isEventLogsEnabled');
export const isEventLogsEnabled = atom(savedEventLogs === 'true');

// Local models settings
export const isLocalModelsEnabled = atom(true);

// Prompt settings
export const promptStore = atom<string>('default');

// Branch settings
export const latestBranchStore = atom(false);

// Template settings
export const autoSelectStarterTemplate = atom(false);

// Context optimization settings
export const enableContextOptimizationStore = atom(false);

// Initialize tab configuration from cookie or default
const savedTabConfig = Cookies.get('tabConfiguration');
console.log('Saved tab configuration:', savedTabConfig);

let initialTabConfig: TabWindowConfig;

try {
  if (savedTabConfig) {
    const parsedConfig = JSON.parse(savedTabConfig);

    // Validate the parsed configuration
    if (
      parsedConfig &&
      Array.isArray(parsedConfig.userTabs) &&
      Array.isArray(parsedConfig.developerTabs) &&
      parsedConfig.userTabs.every(
        (tab: any) =>
          tab &&
          typeof tab.id === 'string' &&
          typeof tab.visible === 'boolean' &&
          typeof tab.window === 'string' &&
          typeof tab.order === 'number',
      ) &&
      parsedConfig.developerTabs.every(
        (tab: any) =>
          tab &&
          typeof tab.id === 'string' &&
          typeof tab.visible === 'boolean' &&
          typeof tab.window === 'string' &&
          typeof tab.order === 'number',
      )
    ) {
      initialTabConfig = parsedConfig;
      console.log('Using saved tab configuration');
    } else {
      console.warn('Invalid saved tab configuration, using defaults');
      initialTabConfig = {
        userTabs: DEFAULT_TAB_CONFIG.filter((tab) => tab.window === 'user'),
        developerTabs: DEFAULT_TAB_CONFIG.filter((tab) => tab.window === 'developer'),
      };
    }
  } else {
    console.log('No saved tab configuration found, using defaults');
    initialTabConfig = {
      userTabs: DEFAULT_TAB_CONFIG.filter((tab) => tab.window === 'user'),
      developerTabs: DEFAULT_TAB_CONFIG.filter((tab) => tab.window === 'developer'),
    };
  }
} catch (error) {
  console.error('Error loading tab configuration:', error);
  initialTabConfig = {
    userTabs: DEFAULT_TAB_CONFIG.filter((tab) => tab.window === 'user'),
    developerTabs: DEFAULT_TAB_CONFIG.filter((tab) => tab.window === 'developer'),
  };
}

console.log('Initial tab configuration:', initialTabConfig);

export const tabConfigurationStore = map<TabWindowConfig>(initialTabConfig);

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

// Developer mode store
export const developerModeStore = atom<boolean>(false);

export const setDeveloperMode = (value: boolean) => {
  developerModeStore.set(value);
};
