import { formatTerminalSessionCopy, getTerminalSessionCopy } from '~/lib/i18n/catalogs/terminal-session';

export type TerminalProfileId = 'managed' | 'bash' | 'zsh' | 'sh';

export interface TerminalProfileSpec {
  id: TerminalProfileId;
  label: string;
  command?: string;
}

export const TERMINAL_PROFILES: TerminalProfileSpec[] = [
  {
    id: 'managed',
    get label() {
      return getTerminalProfileLabel('managed');
    },
  },
  { id: 'bash', label: 'bash', command: '/bin/bash' },
  { id: 'zsh', label: 'zsh', command: '/bin/zsh' },
  { id: 'sh', label: 'sh', command: '/bin/sh' },
];

export function getTerminalProfileLabel(profileId: TerminalProfileId, language?: string | null): string {
  if (profileId === 'managed') {
    return getTerminalSessionCopy(language)['terminalSession.profile.managed'];
  }

  return profileId;
}

const TERMINAL_WORKSPACE_LABEL = '~/workspace';

/**
 * The xterm color used in a managed-shell session is the user-facing process
 * name, not the literal profile id.
 */
export function shellNameForProfile(profileId: TerminalProfileId): string {
  const profile = TERMINAL_PROFILES.find((item) => item.id === profileId) ?? TERMINAL_PROFILES[0];

  return profile.id === 'managed' ? 'bash' : profile.label;
}

/**
 * Build the session label shown in the switcher for a given pane.
 *
 * The label MUST reflect the profile the pane was actually spawned with, never
 * the currently-selected profile. Changing the Profile <select> only affects
 * shells spawned afterward; already-running shells keep typing into the command
 * they were launched with, so labelling them with the freshly-picked profile is
 * a reality/label mismatch (label says 'zsh', the live shell is still jsh).
 */
export function getSessionLabel(index: number, profileId: TerminalProfileId): string {
  const baseLabel = `${TERMINAL_WORKSPACE_LABEL}: ${shellNameForProfile(profileId)}`;

  return index === 0 ? baseLabel : `${baseLabel} #${index + 1}`;
}

/**
 * A styled ANSI line written into a freshly-opened xterm before the shell turns
 * interactive.
 *
 * Managed/remote shells can take 30–60s to cold-start a workspace pod; without
 * this the user stares at an empty black panel with no spinner and no cursor
 * activity, which looks broken even when provisioning is healthy. The notice is
 * dim/italic so it reads as transient status, and ends with CRLF so the real
 * shell prompt prints cleanly underneath it once the OSC 'interactive' arrives.
 */
export function buildConnectingNotice(profileId: TerminalProfileId, language?: string | null): string {
  const copy = getTerminalSessionCopy(language);

  const target =
    profileId === 'managed'
      ? copy['terminalSession.target.workspace']
      : formatTerminalSessionCopy(copy['terminalSession.target.shell'], {
          shell: shellNameForProfile(profileId),
        });

  const message = formatTerminalSessionCopy(copy['terminalSession.status.connecting'], { target });

  /* \x1b[2m = dim, \x1b[3m = italic, \x1b[0m = reset. */
  return `\x1b[2m\x1b[3m${message}\x1b[0m\r\n`;
}
