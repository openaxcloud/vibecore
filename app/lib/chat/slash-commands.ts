/**
 * Slash-command registry surfaced by the chat composer palette (Sprint 4).
 *
 * Commands are pure value objects + an optional `execute(context)` hook —
 * the composer is what calls `execute`, so this module stays free of any
 * DOM or React dependency and is unit-testable in isolation.
 *
 * Built-in commands cover the standard chat affordances (mode switches,
 * clear, plan-first toggle); future sprints can register additional ones
 * via `registerSlashCommand` without touching this file directly.
 */

export type ChatMode = 'discuss' | 'build';

export interface SlashCommandContext {
  /**
   * Currently selected chat mode. Mode-switch commands read this so they
   * can no-op on a redundant click.
   */
  chatMode?: ChatMode;

  /** Switch the chat mode (BaseChat wires this to `setChatMode`). */
  setChatMode?: (mode: ChatMode) => void;

  /**
   * Plan-first toggle state. Toggling commands surface a confirmation
   * toast via the composer when this flips.
   */
  planFirst?: boolean;

  /** Setter mirror of `planFirst`. */
  setPlanFirst?: (next: boolean) => void;

  /** Auto-apply policy state. It is currently always true. */
  autoApplyEnabled?: boolean;

  /** Imperative composer hooks. */
  clearConversation?: () => void;
  openHelp?: () => void;
  focusComposer?: () => void;

  /**
   * Splice text into the composer. When `replace` is true the entire
   * input is overwritten (used by `/preview-error` to pre-fill an
   * actionable prompt); otherwise the text is appended at the caret.
   * Wired by BaseChat through the same handleInputChange machinery
   * the overlays use, so the production path stays shared.
   */
  insertIntoComposer?: (text: string, options?: { replace?: boolean }) => void;

  /**
   * Create a manual snapshot of the current workspace. Returns a promise
   * so the command can await it before clearing the input.
   */
  createSnapshot?: () => void | Promise<void>;

  /**
   * Return the most recent preview error message (e.g. dev server crash,
   * runtime exception). When the preview is healthy returns undefined.
   */
  getLastPreviewError?: () => string | undefined;

  /**
   * Open the given path in the workbench editor. Used by `/open`.
   * Path can be absolute (`/home/project/...`) or relative — the
   * implementation normalises against WORK_DIR.
   */
  openFile?: (filePath: string) => void;

  /**
   * Switch the workbench view to the inline diff for the given path
   * (or the currently selected file when no path is provided). Used
   * by `/diff`.
   */
  openDiff?: (filePath?: string) => void;

  /**
   * Execute a shell command in the project workspace. Used by `/run`.
   * Should surface stdout/stderr in the IDE terminal panel rather than
   * returning the output to the slash command runner.
   */
  runShellCommand?: (command: string) => void | Promise<void>;

  /**
   * Free-form arguments parsed from after the command keyword, e.g. for
   * `/explain reactivity` the argument is `'reactivity'`.
   */
  argument?: string;
}

export interface SlashCommand {
  /** Stable id, matches the keyword without the leading slash. */
  id: string;

  /** Display label in the palette. */
  label: string;

  /** One-line description shown next to the label. */
  description: string;

  /**
   * Aliases used for fuzzy matching (e.g. `/c` → `/clear`). The id is
   * always considered a match prefix; aliases extend the keyword set.
   */
  aliases?: readonly string[];

  /**
   * Whether the command takes a free-form argument after the keyword.
   * When `true` the palette stays open and surfaces an arg input.
   */
  takesArgument?: boolean;

  /** Optional keyboard shortcut for documentation only. */
  shortcut?: string;

  /**
   * Imperative side effect run when the user picks the command. The
   * registry passes the live composer context so commands can flip
   * preferences without owning their own state.
   */
  execute(context: SlashCommandContext): void | Promise<void>;
}

function asMatchKey(keyword: string): string {
  return keyword.replace(/^\//, '').toLowerCase();
}

/**
 * Built-in commands — the registry seed. Keep this list short and
 * obvious; specialised commands belong to feature modules.
 */
export const BUILT_IN_SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    id: 'clear',
    label: 'Clear conversation',
    description: 'Archive the current chat and start a fresh thread.',
    aliases: ['reset'],
    execute(context) {
      context.clearConversation?.();
    },
  },
  {
    id: 'discuss',
    label: 'Discuss mode',
    description: 'Talk through the problem before writing any code.',
    aliases: ['chat'],
    execute(context) {
      if (context.chatMode !== 'discuss') {
        context.setChatMode?.('discuss');
      }
    },
  },
  {
    id: 'build',
    label: 'Build mode',
    description: 'Generate code and file actions directly.',
    aliases: ['code'],
    execute(context) {
      if (context.chatMode !== 'build') {
        context.setChatMode?.('build');
      }
    },
  },
  {
    id: 'plan',
    label: 'Toggle plan-first',
    description: 'Make the agent produce a checklist before applying changes.',
    aliases: ['planfirst', 'checklist'],
    execute(context) {
      context.setPlanFirst?.(!context.planFirst);
    },
  },
  {
    id: 'help',
    label: 'Help',
    description: 'Open the keyboard shortcuts and command reference.',
    aliases: ['?'],
    execute(context) {
      context.openHelp?.();
    },
  },
  {
    id: 'file',
    label: 'Insert file mention',
    description: 'Insert @<path> at the cursor without opening the @ autocomplete.',
    takesArgument: true,
    execute(context) {
      const trimmed = context.argument?.trim();

      if (!trimmed || !context.insertIntoComposer) {
        return;
      }

      // Strip leading @ if the user already typed it, then re-add a single one.
      const cleaned = trimmed.replace(/^@+/, '');
      context.insertIntoComposer(`@${cleaned} `);
    },
  },
  {
    id: 'snapshot',
    label: 'Create project snapshot',
    description: 'Take a manual git-style snapshot of the workspace so you can roll back later.',
    aliases: ['save'],
    async execute(context) {
      await context.createSnapshot?.();
    },
  },
  {
    id: 'preview-error',
    label: 'Fix last preview error',
    description: 'Pre-fill the composer with the most recent preview error so you only press Enter.',
    aliases: ['fix-preview', 'fixerror'],
    execute(context) {
      const error = context.getLastPreviewError?.();

      if (!error || !context.insertIntoComposer) {
        return;
      }

      context.insertIntoComposer(`Fix this preview error:\n\n\`\`\`\n${error}\n\`\`\`\n`, { replace: true });
    },
  },
  {
    id: 'open',
    label: 'Open file in editor',
    description: 'Switch the workbench to code view and select the given file.',
    aliases: ['edit'],
    takesArgument: true,
    execute(context) {
      const path = context.argument?.trim();

      if (!path || !context.openFile) {
        return;
      }

      context.openFile(path);
    },
  },
  {
    id: 'diff',
    label: 'Show diff for file',
    description: 'Switch the workbench to inline diff view for the given path (or the active file).',
    takesArgument: true,
    execute(context) {
      const trimmed = context.argument?.trim();
      context.openDiff?.(trimmed || undefined);
    },
  },
  {
    id: 'run',
    label: 'Run shell command',
    description: 'Execute a shell command in the project workspace (output appears in the terminal).',
    aliases: ['sh', 'shell'],
    takesArgument: true,
    async execute(context) {
      const command = context.argument?.trim();

      if (!command || !context.runShellCommand) {
        return;
      }

      await context.runShellCommand(command);
    },
  },
];

const registry = new Map<string, SlashCommand>();

function indexCommand(command: SlashCommand) {
  registry.set(asMatchKey(command.id), command);

  for (const alias of command.aliases ?? []) {
    registry.set(asMatchKey(alias), command);
  }
}

for (const command of BUILT_IN_SLASH_COMMANDS) {
  indexCommand(command);
}

/**
 * Register an additional command at runtime. Returns an unregister
 * function so callers can clean up (e.g. plugins / feature flags).
 */
export function registerSlashCommand(command: SlashCommand): () => void {
  indexCommand(command);

  return () => {
    registry.delete(asMatchKey(command.id));

    for (const alias of command.aliases ?? []) {
      const key = asMatchKey(alias);
      const current = registry.get(key);

      if (current === command) {
        registry.delete(key);
      }
    }
  };
}

/**
 * Lookup a command by its keyword (with or without leading slash).
 * Returns undefined when no command or alias matches.
 */
export function getSlashCommand(keyword: string): SlashCommand | undefined {
  return registry.get(asMatchKey(keyword));
}

export function listSlashCommands(): SlashCommand[] {
  /*
   * Deduplicate (aliases share the same command reference) and sort by
   * id so the palette renders a stable list.
   */
  const seen = new Set<SlashCommand>();
  const commands: SlashCommand[] = [];

  for (const command of registry.values()) {
    if (seen.has(command)) {
      continue;
    }

    seen.add(command);
    commands.push(command);
  }

  commands.sort((a, b) => a.id.localeCompare(b.id));

  return commands;
}

export interface ParsedSlashCommand {
  keyword: string;
  argument: string;
}

/**
 * Parse the composer input into `/keyword arg…`. Returns undefined when
 * the input doesn't start with a slash or the slash isn't followed by a
 * keyword character (so users can still write `/` literally).
 */
export function parseSlashInput(input: string): ParsedSlashCommand | undefined {
  if (!input.startsWith('/')) {
    return undefined;
  }

  const body = input.slice(1);

  if (body.length === 0 || /^\s/.test(body)) {
    return undefined;
  }

  const spaceIdx = body.indexOf(' ');
  const keyword = spaceIdx === -1 ? body : body.slice(0, spaceIdx);
  const argument = spaceIdx === -1 ? '' : body.slice(spaceIdx + 1).trim();

  return { keyword, argument };
}

/**
 * Filter the registered commands by a fuzzy match on the query. Empty
 * query returns every command (sorted as `listSlashCommands` does).
 */
export interface SearchSlashCommandsOptions {
  /**
   * MRU command-id list to boost in the ranking. First entry gets the
   * biggest bonus, decaying linearly so the most-used commands surface
   * at the top of the empty-query default list.
   */
  recentSlashCommandIds?: readonly string[];
}

const SLASH_MRU_BONUS_MAX = 30;
const SLASH_MRU_BONUS_DECAY = 2;

function slashMruBonus(recent: readonly string[] | undefined, commandId: string): number {
  if (!recent || recent.length === 0) {
    return 0;
  }

  const idx = recent.indexOf(commandId);

  if (idx < 0) {
    return 0;
  }

  return Math.max(0, SLASH_MRU_BONUS_MAX - idx * SLASH_MRU_BONUS_DECAY);
}

export function searchSlashCommands(query: string, options: SearchSlashCommandsOptions = {}): SlashCommand[] {
  const trimmed = query.trim().toLowerCase();
  const haystack = listSlashCommands();
  const recent = options.recentSlashCommandIds;

  if (trimmed.length === 0) {
    if (!recent || recent.length === 0) {
      return haystack;
    }

    // Empty query: rank purely by MRU + fall back to alphabetical.
    return [...haystack].sort((a, b) => {
      const bonusDiff = slashMruBonus(recent, b.id) - slashMruBonus(recent, a.id);

      if (bonusDiff !== 0) {
        return bonusDiff;
      }

      return a.id.localeCompare(b.id);
    });
  }

  const results: { command: SlashCommand; score: number }[] = [];

  for (const command of haystack) {
    const idScore = command.id.toLowerCase().includes(trimmed) ? 10 : -1;
    const labelScore = command.label.toLowerCase().includes(trimmed) ? 5 : -1;
    const aliasScore = command.aliases?.some((alias) => alias.toLowerCase().includes(trimmed)) ? 7 : -1;

    const score = Math.max(idScore, labelScore, aliasScore);

    if (score < 0) {
      continue;
    }

    results.push({ command, score: score + slashMruBonus(recent, command.id) });
  }

  results.sort((a, b) => b.score - a.score || a.command.id.localeCompare(b.command.id));

  return results.map((entry) => entry.command);
}
