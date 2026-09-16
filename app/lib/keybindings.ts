import {
  formatKeybindingsCopy,
  getKeybindingsCopy,
  type KeybindingsCopy,
  type KeybindingsKey,
} from '~/lib/i18n/catalogs/keybindings';

export type KeybindingContext = {
  activePanel?: string;
  commandPaletteOpen?: boolean;
  focusTarget?: 'editor' | 'terminal' | 'agent' | 'input' | 'none';
  isEditableTarget?: boolean;
  useMobileIde?: boolean;
};

export type KeybindingCategory = 'File' | 'Navigation' | 'Workbench' | 'Editor' | 'Agent' | 'Terminal' | 'Help';

export type Keybinding = {
  combo: string;
  action: string;
  label: string;
  description: string;
  category: KeybindingCategory;
  when?: (ctx: KeybindingContext) => boolean;
  preventDefault?: boolean;
};

export type KeybindingConflict = {
  combo: string;
  actions: string[];
};

export type KeybindingOverrideMap = Record<string, string>;

const CATEGORY = {
  file: 'File',
  navigation: 'Navigation',
  workbench: 'Workbench',
  editor: 'Editor',
  agent: 'Agent',
  terminal: 'Terminal',
  help: 'Help',
} as const satisfies Record<string, KeybindingCategory>;

export const PROJECT_KEYBINDING_CATEGORIES: readonly KeybindingCategory[] = [
  CATEGORY.file,
  CATEGORY.navigation,
  CATEGORY.workbench,
  CATEGORY.editor,
  CATEGORY.agent,
  CATEGORY.terminal,
  CATEGORY.help,
];

type BindingCopyId =
  | 'saveCurrent'
  | 'saveAll'
  | 'quickOpen'
  | 'commandPalette'
  | 'commandPaletteTerminalAware'
  | 'openTools'
  | 'closeTab'
  | 'reopenTab'
  | 'toggleSidebar'
  | 'toggleTerminal'
  | 'focusTerminal'
  | 'runWorkspace'
  | 'focusAgent'
  | 'openSettings'
  | 'toggleComment'
  | 'shortcutsOutsideEditor'
  | 'renameSymbol'
  | 'goToDefinition'
  | 'findReferences'
  | 'quickFix'
  | 'shortcuts'
  | 'closeOverlay';

const englishCopy = getKeybindingsCopy('en');

function bindingCopy(copy: KeybindingsCopy, id: BindingCopyId, field: 'label' | 'description'): string {
  return copy[`keybindings.binding.${id}.${field}` as KeybindingsKey];
}

export const defaultProjectKeybindings: Keybinding[] = [
  {
    combo: 'cmd+s',
    action: 'file.save',
    label: bindingCopy(englishCopy, 'saveCurrent', 'label'),
    description: bindingCopy(englishCopy, 'saveCurrent', 'description'),
    category: CATEGORY.file,
    when: (ctx) => ctx.activePanel === 'editor',
    preventDefault: true,
  },
  {
    combo: 'cmd+shift+s',
    action: 'file.saveAll',
    label: bindingCopy(englishCopy, 'saveAll', 'label'),
    description: bindingCopy(englishCopy, 'saveAll', 'description'),
    category: CATEGORY.file,
    preventDefault: true,
  },
  {
    combo: 'cmd+p',
    action: 'file.quickOpen',
    label: bindingCopy(englishCopy, 'quickOpen', 'label'),
    description: bindingCopy(englishCopy, 'quickOpen', 'description'),
    category: CATEGORY.navigation,
    preventDefault: true,
  },
  {
    combo: 'cmd+shift+p',
    action: 'command.palette',
    label: bindingCopy(englishCopy, 'commandPalette', 'label'),
    description: bindingCopy(englishCopy, 'commandPalette', 'description'),
    category: CATEGORY.navigation,
    preventDefault: true,
  },
  {
    combo: 'cmd+k',
    action: 'command.palette',
    label: bindingCopy(englishCopy, 'commandPaletteTerminalAware', 'label'),
    description: bindingCopy(englishCopy, 'commandPaletteTerminalAware', 'description'),
    category: CATEGORY.navigation,

    /*
     * VS Code semantics: while the terminal owns focus, ⌘K belongs to the shell
     * (clear, handled by the terminal's own key handler) — the palette stays
     * reachable via ⌘⇧P. Without this guard the window-level capture listener
     * would swallow the event before xterm ever sees it.
     *
     * SCR-006 — cette sémantique ne tient PAS sur les coques mobile et tablette,
     * et la garde y rendait ⌘K purement décoratif. Mesuré live le 20/08 sur prod
     * `web:73c4edc166`, projet réel : au CHARGEMENT, sans que l'utilisateur ait
     * touché à quoi que ce soit, `document.activeElement` est déjà le
     * `textarea.xterm-helper-textarea` caché de xterm — à 390 le `.xterm` est la
     * surface d'accueil (`390×631` à `y=141`, `display:block`, `visibility:visible`)
     * et à 768 il est monté hors écran (`x=-768`) tout en gardant le focus.
     * `focusTarget` valait donc 'terminal' AVANT toute intention de l'utilisateur,
     * et ⌘K n'ouvrait jamais la palette. Preuve du diagnostic : ⌘⇧P, qui vise la
     * même action SANS garde, l'ouvrait bien dans la même page.
     *
     * Une garde sur la VISIBILITÉ du terminal ne suffirait pas : elle corrigerait
     * 768 (hors écran) mais pas 390, où le terminal est réellement à l'écran.
     * On lève donc la garde sur les coques mobile/tablette — où ⌘⇧P n'est de
     * toute façon pas une porte de sortie praticable — et on la garde au bureau,
     * où elle a du sens et où ⌘⇧P reste disponible.
     */
    when: (ctx) => ctx.useMobileIde === true || ctx.focusTarget !== 'terminal',
    preventDefault: true,
  },
  {
    combo: 'cmd+t',
    action: 'workbench.tools',
    label: bindingCopy(englishCopy, 'openTools', 'label'),
    description: bindingCopy(englishCopy, 'openTools', 'description'),
    category: CATEGORY.navigation,
    preventDefault: true,
  },
  {
    combo: 'cmd+w',
    action: 'tab.close',
    label: bindingCopy(englishCopy, 'closeTab', 'label'),
    description: bindingCopy(englishCopy, 'closeTab', 'description'),
    category: CATEGORY.workbench,
    preventDefault: true,
  },
  {
    combo: 'cmd+shift+t',
    action: 'tab.reopenClosed',
    label: bindingCopy(englishCopy, 'reopenTab', 'label'),
    description: bindingCopy(englishCopy, 'reopenTab', 'description'),
    category: CATEGORY.workbench,
    preventDefault: true,
  },
  {
    combo: 'cmd+b',
    action: 'sidebar.toggle',
    label: bindingCopy(englishCopy, 'toggleSidebar', 'label'),
    description: bindingCopy(englishCopy, 'toggleSidebar', 'description'),
    category: CATEGORY.workbench,
    preventDefault: true,
  },
  {
    combo: 'cmd+j',
    action: 'terminal.toggle',
    label: bindingCopy(englishCopy, 'toggleTerminal', 'label'),
    description: bindingCopy(englishCopy, 'toggleTerminal', 'description'),
    category: CATEGORY.terminal,
    preventDefault: true,
  },
  {
    combo: 'cmd+`',
    action: 'terminal.focus',
    label: bindingCopy(englishCopy, 'focusTerminal', 'label'),
    description: bindingCopy(englishCopy, 'focusTerminal', 'description'),
    category: CATEGORY.terminal,
    preventDefault: true,
  },
  {
    combo: 'cmd+enter',
    action: 'workspace.run',
    label: bindingCopy(englishCopy, 'runWorkspace', 'label'),
    description: bindingCopy(englishCopy, 'runWorkspace', 'description'),
    category: CATEGORY.workbench,
    preventDefault: true,
  },
  {
    combo: 'cmd+l',
    action: 'agent.focus',
    label: bindingCopy(englishCopy, 'focusAgent', 'label'),
    description: bindingCopy(englishCopy, 'focusAgent', 'description'),
    category: CATEGORY.agent,
    preventDefault: true,
  },
  {
    combo: 'cmd+,',
    action: 'settings.open',
    label: bindingCopy(englishCopy, 'openSettings', 'label'),
    description: bindingCopy(englishCopy, 'openSettings', 'description'),
    category: CATEGORY.workbench,
    preventDefault: true,
  },
  {
    combo: 'cmd+/',
    action: 'editor.toggleComment',
    label: bindingCopy(englishCopy, 'toggleComment', 'label'),
    description: bindingCopy(englishCopy, 'toggleComment', 'description'),
    category: CATEGORY.editor,
    when: (ctx) => ctx.activePanel === 'editor',
    preventDefault: true,
  },
  {
    combo: 'cmd+/',
    action: 'help.keyboard',
    label: bindingCopy(englishCopy, 'shortcutsOutsideEditor', 'label'),
    description: bindingCopy(englishCopy, 'shortcutsOutsideEditor', 'description'),
    category: CATEGORY.help,
    when: (ctx) => ctx.activePanel !== 'editor',
    preventDefault: true,
  },
  {
    combo: 'f2',
    action: 'editor.rename',
    label: bindingCopy(englishCopy, 'renameSymbol', 'label'),
    description: bindingCopy(englishCopy, 'renameSymbol', 'description'),
    category: CATEGORY.editor,
    when: (ctx) => ctx.activePanel === 'editor',
    preventDefault: true,
  },
  {
    combo: 'f12',
    action: 'editor.goToDefinition',
    label: bindingCopy(englishCopy, 'goToDefinition', 'label'),
    description: bindingCopy(englishCopy, 'goToDefinition', 'description'),
    category: CATEGORY.editor,
    when: (ctx) => ctx.activePanel === 'editor',
    preventDefault: true,
  },
  {
    combo: 'shift+f12',
    action: 'editor.findReferences',
    label: bindingCopy(englishCopy, 'findReferences', 'label'),
    description: bindingCopy(englishCopy, 'findReferences', 'description'),
    category: CATEGORY.editor,
    when: (ctx) => ctx.activePanel === 'editor',
    preventDefault: true,
  },
  {
    combo: 'cmd+.',
    action: 'editor.quickFix',
    label: bindingCopy(englishCopy, 'quickFix', 'label'),
    description: bindingCopy(englishCopy, 'quickFix', 'description'),
    category: CATEGORY.editor,
    when: (ctx) => ctx.activePanel === 'editor',
    preventDefault: true,
  },
  {
    combo: 'shift+/',
    action: 'help.keyboard',
    label: bindingCopy(englishCopy, 'shortcuts', 'label'),
    description: bindingCopy(englishCopy, 'shortcuts', 'description'),
    category: CATEGORY.help,
    when: (ctx) => !ctx.isEditableTarget,
    preventDefault: true,
  },
  {
    combo: 'escape',
    action: 'overlay.close',
    label: bindingCopy(englishCopy, 'closeOverlay', 'label'),
    description: bindingCopy(englishCopy, 'closeOverlay', 'description'),
    category: CATEGORY.help,
    preventDefault: true,
  },
];

const BINDING_COPY_IDS: Readonly<Record<string, BindingCopyId>> = {
  'cmd+s:file.save': 'saveCurrent',
  'cmd+shift+s:file.saveAll': 'saveAll',
  'cmd+p:file.quickOpen': 'quickOpen',
  'cmd+shift+p:command.palette': 'commandPalette',
  'cmd+k:command.palette': 'commandPaletteTerminalAware',
  'cmd+t:workbench.tools': 'openTools',
  'cmd+w:tab.close': 'closeTab',
  'cmd+shift+t:tab.reopenClosed': 'reopenTab',
  'cmd+b:sidebar.toggle': 'toggleSidebar',
  'cmd+j:terminal.toggle': 'toggleTerminal',
  'cmd+`:terminal.focus': 'focusTerminal',
  'cmd+enter:workspace.run': 'runWorkspace',
  'cmd+l:agent.focus': 'focusAgent',
  'cmd+,:settings.open': 'openSettings',
  'cmd+/:editor.toggleComment': 'toggleComment',
  'cmd+/:help.keyboard': 'shortcutsOutsideEditor',
  'f2:editor.rename': 'renameSymbol',
  'f12:editor.goToDefinition': 'goToDefinition',
  'shift+f12:editor.findReferences': 'findReferences',
  'cmd+.:editor.quickFix': 'quickFix',
  'shift+/:help.keyboard': 'shortcuts',
  'escape:overlay.close': 'closeOverlay',
};

export function localizeProjectKeybindings(bindings: Keybinding[], language?: string | null): Keybinding[] {
  const copy = getKeybindingsCopy(language);

  return bindings.map((binding) => {
    const id = BINDING_COPY_IDS[`${normalizeCombo(binding.combo)}:${binding.action}`];

    return id
      ? {
          ...binding,
          label: bindingCopy(copy, id, 'label'),
          description: bindingCopy(copy, id, 'description'),
        }
      : binding;
  });
}

export function getKeybindingCategoryLabel(language: string | null | undefined, category: KeybindingCategory): string {
  const copy = getKeybindingsCopy(language);

  return copy[`keybindings.category.${category}` as KeybindingsKey];
}

export function createProjectFocusTabKeybinding(index: number, language?: string | null): Keybinding {
  const copy = getKeybindingsCopy(language);

  return {
    combo: `cmd+${index}`,
    action: `tab.focus.${index}`,
    label: formatKeybindingsCopy(copy['keybindings.binding.focusTab.label'], { index }),
    description: formatKeybindingsCopy(copy['keybindings.binding.focusTab.description'], { index }),
    category: CATEGORY.workbench,
    preventDefault: true,
  };
}

export function normalizeCombo(combo: string): string {
  return combo
    .toLowerCase()
    .replace(/\s+/g, '')
    .split('+')
    .map((part) => {
      if (part === 'mod' || part === 'meta' || part === 'ctrl') {
        return part === 'ctrl' ? 'ctrl' : 'cmd';
      }

      if (part === 'esc') {
        return 'escape';
      }

      if (part === 'return') {
        return 'enter';
      }

      return part;
    })
    .sort((a, b) => modifierRank(a) - modifierRank(b))
    .join('+');
}

export function serializeKeyEvent(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
) {
  const parts: string[] = [];

  if (event.metaKey || event.ctrlKey) {
    parts.push('cmd');
  }

  if (event.altKey) {
    parts.push('alt');
  }

  if (event.shiftKey && !isShiftEncodedKey(event.key)) {
    parts.push('shift');
  }

  parts.push(normalizeEventKey(event));

  return normalizeCombo(parts.join('+'));
}

export function formatKeybindingCombo(combo: string, isAppleHost = isApplePlatform()) {
  const labels: Record<string, string> = {
    cmd: isAppleHost ? '⌘' : 'Ctrl',
    ctrl: 'Ctrl',
    alt: isAppleHost ? '⌥' : 'Alt',
    shift: '⇧',
    enter: '↵',
    escape: 'Esc',
    tab: 'Tab',
    ' ': 'Space',
  };

  return normalizeCombo(combo)
    .split('+')
    .map((part) => labels[part] ?? (part.length === 1 ? part.toUpperCase() : part.toUpperCase()))
    .join(isAppleHost ? '' : '+');
}

export function detectKeybindingConflicts(bindings: Keybinding[]): KeybindingConflict[] {
  const globalBindings = bindings.filter((binding) => !binding.when);
  const byCombo = new Map<string, string[]>();

  for (const binding of globalBindings) {
    const combo = normalizeCombo(binding.combo);
    byCombo.set(combo, [...(byCombo.get(combo) ?? []), binding.action]);
  }

  return Array.from(byCombo.entries())
    .filter(([, actions]) => new Set(actions).size > 1)
    .map(([combo, actions]) => ({ combo, actions }));
}

export function applyKeybindingOverrides(
  bindings: Keybinding[],
  overrides: KeybindingOverrideMap | undefined,
): Keybinding[] {
  if (!overrides || typeof overrides !== 'object') {
    return bindings;
  }

  return bindings.map((binding) => {
    const override = overrides[binding.action];

    if (typeof override !== 'string' || !override.trim()) {
      return binding;
    }

    return { ...binding, combo: normalizeCombo(override) };
  });
}

export function serializeKeybindingOverrides(
  bindings: Keybinding[],
  values: Record<string, FormDataEntryValue | string | undefined>,
): KeybindingOverrideMap {
  const defaultsByAction = new Map(bindings.map((binding) => [binding.action, normalizeCombo(binding.combo)]));
  const overrides: KeybindingOverrideMap = {};

  for (const [action, defaultCombo] of defaultsByAction) {
    const value = values[action];

    if (typeof value !== 'string') {
      continue;
    }

    const normalized = normalizeCombo(value);

    if (normalized && normalized !== defaultCombo) {
      overrides[action] = normalized;
    }
  }

  return overrides;
}

export function findKeybinding(bindings: Keybinding[], combo: string, ctx: KeybindingContext): Keybinding | undefined {
  const normalized = normalizeCombo(combo);

  return [...bindings]
    .sort((a, b) => Number(Boolean(b.when)) - Number(Boolean(a.when)))
    .find((binding) => normalizeCombo(binding.combo) === normalized && (!binding.when || binding.when(ctx)));
}

/**
 * True when a keyboard event originated inside an xterm.js terminal (xterm
 * focuses a hidden helper textarea inside its `.xterm` root). Used to make
 * `KeybindingContext.focusTarget === 'terminal'` truthful for real DOM focus,
 * not just for "the terminal panel is the active workspace panel".
 */
export function isTerminalKeyEventTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('.xterm'));
}

export function isEditableKeybindingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return tagName === 'input' || tagName === 'textarea' || target.isContentEditable;
}

function normalizeEventKey(event: Pick<KeyboardEvent, 'key' | 'code'>) {
  const key = event.key === ' ' ? 'space' : event.key.toLowerCase();

  if (key === '?') {
    return '/';
  }

  if (key === 'esc') {
    return 'escape';
  }

  if (key === 'return') {
    return 'enter';
  }

  if (/^f\d{1,2}$/.test(key)) {
    return key;
  }

  if (key.length === 1) {
    return key;
  }

  if (/^Key[A-Z]$/.test(event.code)) {
    return event.code.slice(3).toLowerCase();
  }

  if (/^Digit\d$/.test(event.code)) {
    return event.code.slice(5);
  }

  return key;
}

function isShiftEncodedKey(key: string) {
  return key === '~';
}

function modifierRank(part: string) {
  const rank: Record<string, number> = {
    cmd: 0,
    ctrl: 1,
    alt: 2,
    shift: 3,
  };

  return rank[part] ?? 10;
}

function isApplePlatform() {
  if (typeof navigator === 'undefined') {
    return true;
  }

  return /mac|iphone|ipad|ipod/i.test(navigator.platform);
}
