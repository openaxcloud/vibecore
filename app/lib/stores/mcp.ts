import { create } from 'zustand';
import {
  getClientRuntimeResidualCopy,
  type ClientRuntimeResidualKey,
} from '~/lib/i18n/catalogs/client-runtime-residual';
import { getI18nInstance } from '~/lib/i18n/runtime';
import type { MCPConfig, MCPServerTools } from '~/lib/services/mcpService';

const MCP_SETTINGS_KEY = 'mcp_settings';
const isBrowser = typeof window !== 'undefined';

type MCPSettings = {
  mcpConfig: MCPConfig;
  maxLLMSteps: number;
};

const defaultSettings = {
  maxLLMSteps: 5,
  mcpConfig: {
    mcpServers: {},
  },
} satisfies MCPSettings;

type Store = {
  isInitialized: boolean;
  settings: MCPSettings;
  serverTools: MCPServerTools;
  error: string | null;
  isUpdatingConfig: boolean;
};

type Actions = {
  initialize: () => Promise<void>;
  updateSettings: (settings: MCPSettings) => Promise<void>;
  checkServersAvailabilities: () => Promise<void>;
};

let initializePromise: Promise<void> | null = null;

const mcpI18n = getI18nInstance();

let currentMcpErrorKey: ClientRuntimeResidualKey | null = null;

function getMcpCopy() {
  return getClientRuntimeResidualCopy(mcpI18n.resolvedLanguage ?? mcpI18n.language);
}

export const useMCPStore = create<Store & Actions>((set, get) => ({
  isInitialized: false,
  settings: defaultSettings,
  serverTools: {},
  error: null,
  isUpdatingConfig: false,
  initialize: async () => {
    if (get().isInitialized) {
      return;
    }

    /*
     * `initialize` is fired from several components (McpTab, McpTools) that can
     * mount concurrently. Since `isInitialized` only flips to true at the very
     * end, the simple guard above lets concurrent callers slip through and run
     * the expensive `updateServerConfig` (which closes + recreates every MCP
     * client) more than once. De-dupe on a shared in-flight promise instead.
     */
    if (initializePromise) {
      await initializePromise;
      return;
    }

    initializePromise = (async () => {
      if (isBrowser) {
        /*
         * Audit H5: the "Configuration" tab now persists server-side. Prefer the
         * DB-backed config so it follows the user across devices; fall back to
         * the localStorage cache when the API is unreachable or the user is not
         * signed in (e.g. local dev without a session).
         */
        const settings = (await loadSettingsFromDb()) ?? loadSettingsFromLocalStorage();

        try {
          const serverTools = await updateServerConfig(settings.mcpConfig);
          currentMcpErrorKey = null;
          set(() => ({ settings, serverTools, error: null }));
        } catch (error) {
          console.error('Error applying saved mcp config:', error);

          const errorKey = 'clientRuntime.mcp.applySavedFailed';
          currentMcpErrorKey = errorKey;
          set(() => ({
            settings,
            error: getMcpCopy()[errorKey],
          }));
        }

        localStorage.setItem(MCP_SETTINGS_KEY, JSON.stringify(settings));
      }

      set(() => ({ isInitialized: true }));
    })();

    try {
      await initializePromise;
    } finally {
      initializePromise = null;
    }
  },
  updateSettings: async (newSettings: MCPSettings) => {
    if (get().isUpdatingConfig) {
      throw new Error(getMcpCopy()['clientRuntime.mcp.updateInProgress']);
    }

    try {
      currentMcpErrorKey = null;
      set(() => ({ isUpdatingConfig: true, error: null }));

      const serverTools = await updateServerConfig(newSettings.mcpConfig);

      if (isBrowser) {
        localStorage.setItem(MCP_SETTINGS_KEY, JSON.stringify(newSettings));
      }

      /*
       * Persist server-side (audit H5) so the chat/agent runtime can read these
       * manually-configured servers. A failure here (offline / unauthenticated)
       * must not lose the in-session change, so we only warn.
       */
      await persistSettingsToDb(newSettings).catch((error) => {
        console.warn('Failed to persist MCP configuration to server:', error);
      });

      set(() => ({ settings: newSettings, serverTools, error: null }));
    } catch (error) {
      console.error('Failed to update MCP configuration:', error);
      currentMcpErrorKey = 'clientRuntime.mcp.updateFailed';

      const message = getMcpCopy()[currentMcpErrorKey];
      set(() => ({ error: message }));
      throw new Error(message);
    } finally {
      set(() => ({ isUpdatingConfig: false }));
    }
  },
  checkServersAvailabilities: async () => {
    try {
      const response = await fetch('/api/mcp-check', {
        method: 'GET',
      });

      if (!response.ok) {
        throw Object.assign(new Error(), { code: 'MCP_AVAILABILITY_HTTP_ERROR', status: response.status });
      }

      const serverTools = (await response.json()) as MCPServerTools;

      currentMcpErrorKey = null;
      set(() => ({ serverTools, error: null }));
    } catch (error) {
      console.error('Failed to check MCP server availability:', error);
      currentMcpErrorKey = 'clientRuntime.mcp.availabilityFailed';

      const message = getMcpCopy()[currentMcpErrorKey];
      set(() => ({ error: message }));
      throw new Error(message);
    }
  },
}));

mcpI18n.on('languageChanged', () => {
  if (!currentMcpErrorKey) {
    return;
  }

  useMCPStore.setState({ error: getMcpCopy()[currentMcpErrorKey] });
});

function loadSettingsFromLocalStorage(): MCPSettings {
  const savedConfig = localStorage.getItem(MCP_SETTINGS_KEY);

  if (!savedConfig) {
    return defaultSettings;
  }

  try {
    return JSON.parse(savedConfig) as MCPSettings;
  } catch (error) {
    console.error('Error parsing saved mcp config:', error);
    return defaultSettings;
  }
}

async function loadSettingsFromDb(): Promise<MCPSettings | null> {
  try {
    const response = await fetch('/api/mcp/config', { headers: { accept: 'application/json' } });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { config?: MCPConfig; maxLLMSteps?: number };

    return {
      mcpConfig: data.config?.mcpServers ? data.config : defaultSettings.mcpConfig,
      maxLLMSteps: data.maxLLMSteps ?? defaultSettings.maxLLMSteps,
    };
  } catch {
    return null;
  }
}

async function persistSettingsToDb(settings: MCPSettings): Promise<void> {
  const response = await fetch('/api/mcp/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: settings.mcpConfig, maxLLMSteps: settings.maxLLMSteps }),
  });

  if (!response.ok) {
    throw Object.assign(new Error(), { code: 'MCP_PERSIST_HTTP_ERROR', status: response.status });
  }
}

async function updateServerConfig(config: MCPConfig) {
  const response = await fetch('/api/mcp-update-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    throw Object.assign(new Error(), { code: 'MCP_UPDATE_HTTP_ERROR', status: response.status });
  }

  const data = (await response.json()) as MCPServerTools;

  return data;
}
