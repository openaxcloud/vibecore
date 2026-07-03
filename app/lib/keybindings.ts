export type KeybindingContext = {
  activePanel?: string;
  commandPaletteOpen?: boolean;
  focusTarget?: 'editor' | 'terminal' | 'agent' | 'input' | 'none';
  isEditableTarget?: boolean;
  useMobileIde?: boolean;
};

export type Keybinding = {
  combo: string;
  action: string;
  label: string;
  description: string;
  category: 'File' | 'Navigation' | 'Workbench' | 'Editor' | 'Agent' | 'Terminal' | 'Help';
  when?: (ctx: KeybindingContext) => boolean;
  preventDefault?: boolean;
};

export type KeybindingConflict = {
  combo: string;
  actions: string[];
};

export type KeybindingOverrideMap = Record<string, string>;

export const defaultProjectKeybindings: Keybinding[] = [
  {
    combo: 'cmd+s',
    action: 'file.save',
    label: 'Save current file',
    description: 'Save the active editor file.',
    category: 'File',
    when: (ctx) => ctx.activePanel === 'editor',
    preventDefault: true,
  },
  {
    combo: 'cmd+shift+s',
    action: 'file.saveAll',
    label: 'Save all files',
    description: 'Save every file with unsaved changes.',
    category: 'File',
    preventDefault: true,
  },
  {
    combo: 'cmd+p',
    action: 'file.quickOpen',
    label: 'Quick open file',
    description: 'Search indexed project files.',
    category: 'Navigation',
    preventDefault: true,
  },
  {
    combo: 'cmd+shift+p',
    action: 'command.palette',
    label: 'Command palette',
    description: 'Search every project command.',
    category: 'Navigation',
    preventDefault: true,
  },
  {
    combo: 'cmd+k',
    action: 'command.palette',
    label: 'Command palette',
    description: 'Search every project command. Inside the terminal, ⌘K clears the shell instead.',
    category: 'Navigation',

    /*
     * VS Code semantics: while the terminal owns focus, ⌘K belongs to the shell
     * (clear, handled by the terminal's own key handler) — the palette stays
     * reachable via ⌘⇧P. Without this guard the window-level capture listener
     * would swallow the event before xterm ever sees it.
     */
    when: (ctx) => ctx.focusTarget !== 'terminal',
    preventDefault: true,
  },
  {
    combo: 'cmd+t',
    action: 'workbench.tools',
    label: 'Open tools',
    description: 'Search project tools and service panels.',
    category: 'Navigation',
    preventDefault: true,
  },
  {
    combo: 'cmd+w',
    action: 'tab.close',
    label: 'Close tab',
    description: 'Close the active workspace tab.',
    category: 'Workbench',
    preventDefault: true,
  },
  {
    combo: 'cmd+shift+t',
    action: 'tab.reopenClosed',
    label: 'Reopen closed tab',
    description: 'Restore the last closed workspace tab.',
    category: 'Workbench',
    preventDefault: true,
  },
  {
    combo: 'cmd+b',
    action: 'sidebar.toggle',
    label: 'Toggle sidebar',
    description: 'Show or hide the files and service sidebar.',
    category: 'Workbench',
    preventDefault: true,
  },
  {
    combo: 'cmd+j',
    action: 'terminal.toggle',
    label: 'Toggle terminal',
    description: 'Show or hide the bottom terminal.',
    category: 'Terminal',
    preventDefault: true,
  },
  {
    combo: 'cmd+`',
    action: 'terminal.focus',
    label: 'Focus terminal',
    description: 'Open and focus the workspace terminal.',
    category: 'Terminal',
    preventDefault: true,
  },
  {
    combo: 'cmd+enter',
    action: 'workspace.run',
    label: 'Run workspace',
    description: 'Open the preview and start the runtime.',
    category: 'Workbench',
    preventDefault: true,
  },
  {
    combo: 'cmd+l',
    action: 'agent.focus',
    label: 'Focus agent',
    description: 'Open the agent panel and focus the composer.',
    category: 'Agent',
    preventDefault: true,
  },
  {
    combo: 'cmd+,',
    action: 'settings.open',
    label: 'Open settings',
    description: 'Open project settings.',
    category: 'Workbench',
    preventDefault: true,
  },
  {
    combo: 'cmd+/',
    action: 'editor.toggleComment',
    label: 'Toggle line comment',
    description: 'Toggle comments in the active editor.',
    category: 'Editor',
    when: (ctx) => ctx.activePanel === 'editor',
    preventDefault: true,
  },
  {
    combo: 'cmd+/',
    action: 'help.keyboard',
    label: 'Keyboard shortcuts',
    description: 'Open the keyboard shortcuts reference outside the editor.',
    category: 'Help',
    when: (ctx) => ctx.activePanel !== 'editor',
    preventDefault: true,
  },
  {
    combo: 'f2',
    action: 'editor.rename',
    label: 'Rename symbol',
    description: 'Rename the symbol at the cursor.',
    category: 'Editor',
    when: (ctx) => ctx.activePanel === 'editor',
    preventDefault: true,
  },
  {
    combo: 'f12',
    action: 'editor.goToDefinition',
    label: 'Go to definition',
    description: 'Jump to the definition under the cursor.',
    category: 'Editor',
    when: (ctx) => ctx.activePanel === 'editor',
    preventDefault: true,
  },
  {
    combo: 'shift+f12',
    action: 'editor.findReferences',
    label: 'Find references',
    description: 'Show references for the symbol under the cursor.',
    category: 'Editor',
    when: (ctx) => ctx.activePanel === 'editor',
    preventDefault: true,
  },
  {
    combo: 'cmd+.',
    action: 'editor.quickFix',
    label: 'Quick fix',
    description: 'Open code actions for the current editor position.',
    category: 'Editor',
    when: (ctx) => ctx.activePanel === 'editor',
    preventDefault: true,
  },
  {
    combo: 'shift+/',
    action: 'help.keyboard',
    label: 'Keyboard shortcuts',
    description: 'Open the keyboard shortcuts reference.',
    category: 'Help',
    when: (ctx) => !ctx.isEditableTarget,
    preventDefault: true,
  },
  {
    combo: 'escape',
    action: 'overlay.close',
    label: 'Close overlay',
    description: 'Close command palette or keyboard shortcuts.',
    category: 'Help',
    preventDefault: true,
  },
];

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
