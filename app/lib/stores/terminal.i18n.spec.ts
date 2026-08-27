// @vitest-environment jsdom

import type { RuntimeAdapter } from '@vibecore/runtime-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalStore } from './terminal';

import { setUserLanguagePreference } from '~/lib/i18n/language';
import type { ITerminal } from '~/types/terminal';

const shellMocks = vi.hoisted(() => ({
  boltInit: vi.fn(),
  newShellProcess: vi.fn(),
}));

vi.mock('~/utils/shell', () => ({
  newBoltShellProcess: () => ({
    init: shellMocks.boltInit,
    process: undefined,
    terminal: undefined,
  }),
  newShellProcess: shellMocks.newShellProcess,
}));

function createTerminal(): ITerminal {
  return {
    cols: 80,
    rows: 24,
    write: vi.fn(),
  } as unknown as ITerminal;
}

describe('TerminalStore localized spawn failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUserLanguagePreference('en');
  });

  it('writes a reviewed French managed-shell error without leaking the raw diagnostic', async () => {
    setUserLanguagePreference('fr');
    shellMocks.boltInit.mockRejectedValueOnce(new Error('upstream spawn failed secret=raw'));

    const terminal = createTerminal();
    const store = new TerminalStore({} as RuntimeAdapter);

    await store.attachBoltTerminal(terminal);

    const output = vi.mocked(terminal.write).mock.calls[0]?.[0] as string;
    expect(output).toContain('Impossible de démarrer le shell géré.');
    expect(output).not.toContain('upstream spawn failed');
    expect(output).not.toContain('secret=raw');
  });

  it('resolves the active language for every newly written shell failure', async () => {
    shellMocks.newShellProcess.mockRejectedValue(new Error('runtime refused connection'));

    const terminal = createTerminal();
    const store = new TerminalStore({} as RuntimeAdapter);

    await store.attachTerminal(terminal);
    setUserLanguagePreference('fr');
    await store.attachTerminal(terminal);

    const outputs = vi.mocked(terminal.write).mock.calls.map(([value]) => String(value));
    expect(outputs[0]).toContain('Could not start the shell.');
    expect(outputs[1]).toContain('Impossible de démarrer le shell.');
    expect(outputs.join('\n')).not.toContain('runtime refused connection');
  });
});
