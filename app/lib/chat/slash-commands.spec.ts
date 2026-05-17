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
    expect(ids).toEqual([
      'build',
      'clear',
      'diff',
      'discuss',
      'file',
      'help',
      'open',
      'plan',
      'preview-error',
      'run',
      'snapshot',
    ]);
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

describe('/file command', () => {
  it('inserts @<path> at the cursor when an argument is supplied', () => {
    const insertIntoComposer = vi.fn();
    getSlashCommand('file')?.execute(emptyContext({ argument: 'src/App.tsx', insertIntoComposer }));
    expect(insertIntoComposer).toHaveBeenCalledWith('@src/App.tsx ');
  });

  it('strips a leading @ the user may have typed', () => {
    const insertIntoComposer = vi.fn();
    getSlashCommand('file')?.execute(emptyContext({ argument: '@src/App.tsx', insertIntoComposer }));
    expect(insertIntoComposer).toHaveBeenCalledWith('@src/App.tsx ');
  });

  it('no-ops when the argument is empty', () => {
    const insertIntoComposer = vi.fn();
    getSlashCommand('file')?.execute(emptyContext({ argument: '   ', insertIntoComposer }));
    expect(insertIntoComposer).not.toHaveBeenCalled();
  });

  it('no-ops when the composer hook is missing (e.g. Bolt standalone)', () => {
    // No throw, no setter — graceful no-op
    expect(() => getSlashCommand('file')?.execute(emptyContext({ argument: 'src/App.tsx' }))).not.toThrow();
  });
});

describe('/snapshot command', () => {
  it('calls createSnapshot when wired', async () => {
    const createSnapshot = vi.fn().mockResolvedValue(undefined);
    await getSlashCommand('snapshot')?.execute(emptyContext({ createSnapshot }));
    expect(createSnapshot).toHaveBeenCalledTimes(1);
  });

  it('no-ops gracefully when createSnapshot is absent (Bolt standalone)', async () => {
    await expect(getSlashCommand('snapshot')?.execute(emptyContext())).resolves.not.toThrow();
  });
});

describe('/preview-error command', () => {
  it('pre-fills the composer with the latest preview error when present', () => {
    const insertIntoComposer = vi.fn();
    getSlashCommand('preview-error')?.execute(
      emptyContext({
        insertIntoComposer,
        getLastPreviewError: () => 'TypeError: undefined is not a function at App.tsx:42',
      }),
    );

    expect(insertIntoComposer).toHaveBeenCalledTimes(1);

    const [text, options] = insertIntoComposer.mock.calls[0];
    expect(text).toContain('TypeError');
    expect(text).toContain('Fix this preview error');
    expect(options).toEqual({ replace: true });
  });

  it('no-ops when there is no preview error to fix', () => {
    const insertIntoComposer = vi.fn();
    getSlashCommand('preview-error')?.execute(
      emptyContext({ insertIntoComposer, getLastPreviewError: () => undefined }),
    );
    expect(insertIntoComposer).not.toHaveBeenCalled();
  });

  it('no-ops when getLastPreviewError is absent (Bolt standalone)', () => {
    const insertIntoComposer = vi.fn();
    getSlashCommand('preview-error')?.execute(emptyContext({ insertIntoComposer }));
    expect(insertIntoComposer).not.toHaveBeenCalled();
  });
});

describe('/open command', () => {
  it('opens the requested file via openFile', () => {
    const openFile = vi.fn();
    getSlashCommand('open')?.execute(emptyContext({ argument: 'src/App.tsx', openFile }));
    expect(openFile).toHaveBeenCalledWith('src/App.tsx');
  });

  it('no-ops when argument is empty', () => {
    const openFile = vi.fn();
    getSlashCommand('open')?.execute(emptyContext({ argument: '  ', openFile }));
    expect(openFile).not.toHaveBeenCalled();
  });

  it('no-ops when openFile callback is missing (Bolt standalone)', () => {
    expect(() => getSlashCommand('open')?.execute(emptyContext({ argument: 'src/App.tsx' }))).not.toThrow();
  });
});

describe('/diff command', () => {
  it('calls openDiff with the supplied path', () => {
    const openDiff = vi.fn();
    getSlashCommand('diff')?.execute(emptyContext({ argument: 'src/App.tsx', openDiff }));
    expect(openDiff).toHaveBeenCalledWith('src/App.tsx');
  });

  it('calls openDiff with undefined when no argument is provided (active file)', () => {
    const openDiff = vi.fn();
    getSlashCommand('diff')?.execute(emptyContext({ openDiff }));
    expect(openDiff).toHaveBeenCalledWith(undefined);
  });

  it('no-ops when openDiff callback is missing', () => {
    expect(() => getSlashCommand('diff')?.execute(emptyContext({ argument: 'src/App.tsx' }))).not.toThrow();
  });
});

describe('/run command', () => {
  it('executes the supplied command via runShellCommand', async () => {
    const runShellCommand = vi.fn().mockResolvedValue(undefined);
    await getSlashCommand('run')?.execute(emptyContext({ argument: 'pnpm test', runShellCommand }));
    expect(runShellCommand).toHaveBeenCalledWith('pnpm test');
  });

  it('no-ops on empty argument', async () => {
    const runShellCommand = vi.fn();
    await getSlashCommand('run')?.execute(emptyContext({ argument: '   ', runShellCommand }));
    expect(runShellCommand).not.toHaveBeenCalled();
  });

  it('no-ops when runShellCommand is missing (Bolt standalone)', async () => {
    await expect(getSlashCommand('run')?.execute(emptyContext({ argument: 'ls' }))).resolves.not.toThrow();
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
