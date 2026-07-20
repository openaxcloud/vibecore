/**
 * Agent mode settings — a persisted USER setting (never per-project).
 *
 * The composer's mode (Lite / Economy / Power) and Advanced switches (High
 * effort, Turbo) follow the user, not the project: same two-tier persistence
 * as useAutoApplyEnabled —
 *  - localStorage: fast per-browser cache, seeds first paint, broadcast via a
 *    custom DOM event so every composer in the tab reacts immediately;
 *  - the server `preferences` blob (`/api/user/preferences`, key `agentMode`):
 *    the cross-device source of truth, reconciled once per page load and
 *    pushed back on every change (best-effort — an unauthenticated session
 *    stays localStorage-only).
 *
 * NO model name ever lives here: the setting is the MODE; the server routing
 * card decides what the mode means.
 */
import { useEffect, useState } from 'react';

export type AgentMode = 'lite' | 'economy' | 'power';

export interface AgentModeSettings {
  mode: AgentMode;
  highEffort: boolean;
  turbo: boolean;
}

/** Economy is the product default. */
export const DEFAULT_AGENT_MODE_SETTINGS: AgentModeSettings = {
  mode: 'economy',
  highEffort: false,
  turbo: false,
};

export const AGENT_MODE_STORAGE_KEY = 'vibecore:agent-mode';
export const AGENT_MODE_CHANGED_EVENT = 'vibecore:agent-mode-changed';

/** The key this setting occupies inside the server `preferences` blob. */
export const AGENT_MODE_PREFERENCE_KEY = 'agentMode';

const USER_PREFERENCES_ENDPOINT = '/api/user/preferences';

function hasLocalStorage(): boolean {
  return typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined';
}

function canReachServer(): boolean {
  return typeof globalThis.window !== 'undefined' && typeof globalThis.fetch === 'function';
}

/** Coerce any stored/received value into a safe settings object. */
export function coerceAgentModeSettings(raw: unknown): AgentModeSettings {
  const candidate = (raw ?? {}) as Partial<AgentModeSettings> & { mode?: string };
  const mode: AgentMode = candidate.mode === 'lite' || candidate.mode === 'power' ? candidate.mode : 'economy';

  return {
    mode,

    // High effort never applies in Lite; Turbo only exists in Power.
    highEffort: mode !== 'lite' && candidate.highEffort === true,
    turbo: mode === 'power' && candidate.turbo === true,
  };
}

export function readAgentModeSettingsFromStorage(): AgentModeSettings {
  if (!hasLocalStorage()) {
    return DEFAULT_AGENT_MODE_SETTINGS;
  }

  try {
    const raw = globalThis.localStorage.getItem(AGENT_MODE_STORAGE_KEY);

    if (!raw) {
      return DEFAULT_AGENT_MODE_SETTINGS;
    }

    return coerceAgentModeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_AGENT_MODE_SETTINGS;
  }
}

function writeAgentModeSettingsLocally(next: AgentModeSettings): void {
  if (hasLocalStorage()) {
    try {
      globalThis.localStorage.setItem(AGENT_MODE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable (private mode / quota) — still broadcast below.
    }
  }

  if (typeof globalThis.window !== 'undefined' && typeof CustomEvent === 'function') {
    globalThis.window.dispatchEvent(new CustomEvent<AgentModeSettings>(AGENT_MODE_CHANGED_EVENT, { detail: next }));
  }
}

async function pushAgentModeSettingsToServer(next: AgentModeSettings): Promise<void> {
  if (!canReachServer()) {
    return;
  }

  try {
    await globalThis.fetch(USER_PREFERENCES_ENDPOINT, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ preferences: { [AGENT_MODE_PREFERENCE_KEY]: next } }),
    });
  } catch {
    // Offline / no backend account — keep the localStorage value.
  }
}

let serverValuePromise: Promise<AgentModeSettings | undefined> | undefined;

function fetchAgentModeSettingsFromServer(): Promise<AgentModeSettings | undefined> {
  if (serverValuePromise) {
    return serverValuePromise;
  }

  if (!canReachServer()) {
    serverValuePromise = Promise.resolve(undefined);
    return serverValuePromise;
  }

  serverValuePromise = globalThis
    .fetch(USER_PREFERENCES_ENDPOINT, { headers: { accept: 'application/json' } })
    .then((response) => (response.ok ? response.json() : undefined))
    .then((payload) => {
      const value = (payload as { preferences?: Record<string, unknown> } | undefined)?.preferences?.[
        AGENT_MODE_PREFERENCE_KEY
      ];

      return value && typeof value === 'object' ? coerceAgentModeSettings(value) : undefined;
    })
    .catch(() => undefined);

  return serverValuePromise;
}

/** Test-only: drop the memoized server fetch so each case starts clean. */
export function __resetAgentModeSettingsServerCache(): void {
  serverValuePromise = undefined;
}

/**
 * Imperative write: local cache + broadcast + best-effort server PATCH so the
 * setting survives reload and follows the user to another device.
 */
export function setAgentModeSettings(next: AgentModeSettings): void {
  const coerced = coerceAgentModeSettings(next);
  writeAgentModeSettingsLocally(coerced);
  void pushAgentModeSettingsToServer(coerced);
}

/**
 * Reactive read of the user's agent mode settings: localStorage-seeded, then
 * reconciled once from the server blob, then live via the same-tab custom
 * event + cross-tab `storage` event.
 */
export function useAgentModeSettings(): AgentModeSettings {
  const [settings, setSettings] = useState<AgentModeSettings>(() => readAgentModeSettingsFromStorage());

  useEffect(() => {
    let cancelled = false;

    void fetchAgentModeSettingsFromServer().then((serverValue) => {
      if (!cancelled && serverValue) {
        setSettings(serverValue);
        writeAgentModeSettingsLocally(serverValue);
      }
    });

    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<AgentModeSettings>).detail;

      if (detail) {
        setSettings(coerceAgentModeSettings(detail));
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === AGENT_MODE_STORAGE_KEY) {
        setSettings(readAgentModeSettingsFromStorage());
      }
    };

    globalThis.window.addEventListener(AGENT_MODE_CHANGED_EVENT, onCustom);
    globalThis.window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      globalThis.window.removeEventListener(AGENT_MODE_CHANGED_EVENT, onCustom);
      globalThis.window.removeEventListener('storage', onStorage);
    };
  }, []);

  return settings;
}
