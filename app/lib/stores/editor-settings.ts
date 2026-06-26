import { atom } from 'nanostores';

/*
 * Editor preferences store — the single source of truth for Workspace Settings →
 * Editor (font size, indentation, word-wrap, vim mode, format-on-save). The
 * CodeMirror editor reads these via `useStore(editorSettingsStore)` so a change
 * in the settings page applies live. Persisted to localStorage so the choice
 * survives reloads; SSR-safe (defaults until hydration reads storage).
 */

export interface EditorSettings {
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  vimMode: boolean;
  formatOnSave: boolean;
}

export const EDITOR_SETTINGS_DEFAULTS: EditorSettings = {
  fontSize: 14,
  tabSize: 2,
  wordWrap: false,
  vimMode: false,
  formatOnSave: false,
};

export const EDITOR_SETTINGS_STORAGE_KEY = 'vibecore:editor-settings';

const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 28;
const TAB_SIZES = [2, 4, 8] as const;

/** Clamp/validate a partial settings object into a complete, safe EditorSettings. */
export function normalizeEditorSettings(input: Partial<EditorSettings> | null | undefined): EditorSettings {
  const merged = { ...EDITOR_SETTINGS_DEFAULTS, ...(input ?? {}) };

  const fontSize = Number(merged.fontSize);
  const tabSize = Number(merged.tabSize);

  return {
    fontSize: Number.isFinite(fontSize)
      ? Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(fontSize)))
      : EDITOR_SETTINGS_DEFAULTS.fontSize,
    tabSize: (TAB_SIZES as readonly number[]).includes(tabSize) ? tabSize : EDITOR_SETTINGS_DEFAULTS.tabSize,
    wordWrap: Boolean(merged.wordWrap),
    vimMode: Boolean(merged.vimMode),
    formatOnSave: Boolean(merged.formatOnSave),
  };
}

function readStored(): EditorSettings {
  if (typeof globalThis === 'undefined' || typeof globalThis.localStorage === 'undefined') {
    return EDITOR_SETTINGS_DEFAULTS;
  }

  try {
    const raw = globalThis.localStorage.getItem(EDITOR_SETTINGS_STORAGE_KEY);

    if (!raw) {
      return EDITOR_SETTINGS_DEFAULTS;
    }

    return normalizeEditorSettings(JSON.parse(raw) as Partial<EditorSettings>);
  } catch {
    return EDITOR_SETTINGS_DEFAULTS;
  }
}

export const editorSettingsStore = atom<EditorSettings>(readStored());

/** Patch one or more editor settings, persist, and notify subscribers. */
export function setEditorSettings(patch: Partial<EditorSettings>): EditorSettings {
  const next = normalizeEditorSettings({ ...editorSettingsStore.get(), ...patch });

  editorSettingsStore.set(next);

  if (typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined') {
    try {
      globalThis.localStorage.setItem(EDITOR_SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Non-fatal: persistence is best-effort, the in-memory store still updates.
    }
  }

  return next;
}

/** Reset every editor setting to its default. */
export function resetEditorSettings(): EditorSettings {
  return setEditorSettings(EDITOR_SETTINGS_DEFAULTS);
}
