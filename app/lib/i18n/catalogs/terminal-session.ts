import { detectUserLanguage, normalizeSupportedLanguage } from '~/lib/i18n/language';

export const terminalSessionEn = {
  'terminalSession.profile.managed': 'Managed shell',
  'terminalSession.target.workspace': 'to workspace',
  'terminalSession.target.shell': 'to {shell} shell',
  'terminalSession.status.connecting': 'Connecting {target}…',
} as const;

export type TerminalSessionKey = keyof typeof terminalSessionEn;
export type TerminalSessionCopy = Readonly<Record<TerminalSessionKey, string>>;

export const terminalSessionFr: TerminalSessionCopy = {
  'terminalSession.profile.managed': 'Shell géré',
  'terminalSession.target.workspace': 'à l’espace de travail',
  'terminalSession.target.shell': 'au shell {shell}',
  'terminalSession.status.connecting': 'Connexion {target}…',
};

export function getTerminalSessionCopy(language?: string | null): TerminalSessionCopy {
  const resolved = normalizeSupportedLanguage(language ?? detectUserLanguage());

  return resolved === 'fr' ? terminalSessionFr : terminalSessionEn;
}

export function formatTerminalSessionCopy(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => values[key] ?? token);
}
