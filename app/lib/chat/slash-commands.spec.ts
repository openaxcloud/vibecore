import { describe, expect, it, vi } from 'vitest';

import {
  BUILT_IN_SLASH_COMMANDS,
  getSlashCommand,
  listSlashCommands,
  parseSlashInput,
  registerSlashCommand,
  searchSlashCommands,
  type SlashCommandContext,
} from './slash-commands';

function emptyContext(overrides: Partial<SlashCommandContext> = {}): SlashCommandContext {
  return { ...overrides };
}

describe('built-in slash commands', () => {
  it('lists every built-in by id', () => {
    const ids = BUILT_IN_SLASH_COMMANDS.map((command) => command.id).sort();
    expect(ids).toEqual(['build', 'clear', 'discuss', 'help', 'plan']);
  });

  it('resolves an alias to its canonical command', () => {
    const reset = getSlashCommand('reset');
    const clear = getSlashCommand('clear');
    expect(reset).toBeTruthy();
    expect(reset).toBe(clear);
  });

  it('accepts the keyword with or without the leading slash', () => {
    expect(getSlashCommand('/clear')).toBe(getSlashCommand('clear'));
  });
});

describe('parseSlashInput', () => {
  it('returns undefined when the input does not start with a slash', () => {
    expect(parseSlashInput('hello world')).toBeUndefined();
  });

  it('returns undefined when only `/` is typed', () => {
    expect(parseSlashInput('/')).toBeUndefined();
    expect(parseSlashInput('/ ')).toBeUndefined();
  });

  it('splits keyword and argument on the first space', () => {
    expect(parseSlashInput('/explain reactivity model')).toEqual({
      keyword: 'explain',
      argument: 'reactivity model',
    });
  });

  it('returns an empty argument when none is typed', () => {
    expect(parseSlashInput('/clear')).toEqual({ keyword: 'clear', argument: '' });
  });
});

describe('searchSlashCommands', () => {
  it('returns every command for an empty query', () => {
    expect(searchSlashCommands('').length).toBe(listSlashCommands().length);
  });

  it('matches by id prefix', () => {
    const results = searchSlashCommands('cl');
    expect(results.map((command) => command.id)).toContain('clear');
  });

  it('matches by label substring', () => {
    const results = searchSlashCommands('checklist');
    expect(results.map((command) => command.id)).toContain('plan');
  });

  it('drops commands with no match', () => {
    expect(searchSlashCommands('zzzunknown')).toEqual([]);
  });
});

describe('command execution', () => {
  it('runs the mode-switch executor only when the mode is changing', () => {
    const setChatMode = vi.fn();
    getSlashCommand('build')?.execute(emptyContext({ chatMode: 'build', setChatMode }));
    expect(setChatMode).not.toHaveBeenCalled();

    getSlashCommand('build')?.execute(emptyContext({ chatMode: 'discuss', setChatMode }));
    expect(setChatMode).toHaveBeenCalledWith('build');
  });

  it('toggles plan-first via the context setter', () => {
    const setPlanFirst = vi.fn();
    getSlashCommand('plan')?.execute(emptyContext({ planFirst: false, setPlanFirst }));
    expect(setPlanFirst).toHaveBeenCalledWith(true);

    setPlanFirst.mockClear();
    getSlashCommand('plan')?.execute(emptyContext({ planFirst: true, setPlanFirst }));
    expect(setPlanFirst).toHaveBeenCalledWith(false);
  });
});

describe('searchSlashCommands with recent MRU', () => {
  it('orders by MRU on an empty query', () => {
    const results = searchSlashCommands('', { recentSlashCommandIds: ['plan', 'clear'] });
    expect(results[0].id).toBe('plan');
    expect(results[1].id).toBe('clear');
  });

  it('boosts MRU entries above ties on an empty query', () => {
    const both = searchSlashCommands('', { recentSlashCommandIds: ['build', 'clear'] });
    expect(both[0].id).toBe('build');
    expect(both[1].id).toBe('clear');
  });

  it('MRU bonus lifts a matching command above its peers on a partial query', () => {
    /*
     * "c" fuzzy-matches both /clear (id 10) and /build (via alias 'code',
     * id 7). With /build in MRU, the bonus pushes /build ahead — that's
     * the desired behaviour: recently-used commands surface first
     * whenever they fuzzy-match the query at all.
     */
    const noMru = searchSlashCommands('c');
    expect(noMru[0].id).toBe('clear');

    const withMru = searchSlashCommands('c', { recentSlashCommandIds: ['build'] });
    expect(withMru[0].id).toBe('build');
  });
});

describe('registerSlashCommand', () => {
  it('exposes the registered command via getSlashCommand and lists it', () => {
    const execute = vi.fn();

    const unregister = registerSlashCommand({
      id: 'spec-only',
      label: 'Spec only',
      description: 'Test command',
      aliases: ['spec'],
      execute,
    });

    try {
      expect(getSlashCommand('spec-only')?.execute).toBe(execute);
      expect(getSlashCommand('spec')).toBe(getSlashCommand('spec-only'));
      expect(listSlashCommands().some((command) => command.id === 'spec-only')).toBe(true);
    } finally {
      unregister();
    }

    expect(getSlashCommand('spec-only')).toBeUndefined();
    expect(getSlashCommand('spec')).toBeUndefined();
  });
});
