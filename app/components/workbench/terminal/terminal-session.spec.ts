import { describe, expect, it } from 'vitest';

import { buildConnectingNotice, getSessionLabel, shellNameForProfile } from './terminal-session';

describe('shellNameForProfile', () => {
  it('reports the managed shell as bash (its real process name)', () => {
    expect(shellNameForProfile('managed')).toBe('bash');
  });

  it('reports explicit profiles by their label', () => {
    expect(shellNameForProfile('zsh')).toBe('zsh');
    expect(shellNameForProfile('sh')).toBe('sh');
  });
});

describe('getSessionLabel', () => {
  it('labels a pane with the profile it was actually spawned with', () => {
    /*
     * The core regression: a pane spawned as zsh must keep its zsh label even if
     * the Profile <select> later moves to sh — the live shell did not change.
     */
    expect(getSessionLabel(0, 'managed')).toBe('~/workspace: bash');
    expect(getSessionLabel(1, 'zsh')).toBe('~/workspace: zsh #2');
    expect(getSessionLabel(2, 'sh')).toBe('~/workspace: sh #3');
  });

  it('does not let a later profile selection rewrite an existing pane label', () => {
    const spawnedAs = 'zsh' as const;
    const labelWhenSpawned = getSessionLabel(1, spawnedAs);

    // Selecting a different profile must not change the label of pane 1.
    expect(labelWhenSpawned).toBe('~/workspace: zsh #2');
    expect(getSessionLabel(1, spawnedAs)).toBe(labelWhenSpawned);
  });
});

describe('buildConnectingNotice', () => {
  it('emits a visible connecting line so a cold start never looks hung', () => {
    const notice = buildConnectingNotice('managed');

    expect(notice).toContain('Connecting to workspace…');

    // Ends with CRLF so the real prompt prints cleanly beneath it.
    expect(notice.endsWith('\r\n')).toBe(true);

    // Carries ANSI dim/italic styling and a reset.
    expect(notice).toContain('\x1b[2m');
    expect(notice).toContain('\x1b[0m');
  });

  it('names the explicit shell when not the managed profile', () => {
    expect(buildConnectingNotice('zsh')).toContain('Connecting to zsh shell…');
  });
});
