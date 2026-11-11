/** Package-local copy: callers choose the locale; transport/status codes stay unchanged. */
export type WorkspaceAgentLocale = 'en' | 'fr';

const requestFailureCopy: Readonly<Record<WorkspaceAgentLocale, string>> = {
  en: 'Workspace agent request failed: {status}',
  fr: 'La requête à l’agent de l’espace de travail a échoué : {status}',
};

export function workspaceAgentRequestFailure(status: number, locale: WorkspaceAgentLocale = 'en'): string {
  return (requestFailureCopy[locale] ?? requestFailureCopy.en).replace('{status}', String(status));
}
