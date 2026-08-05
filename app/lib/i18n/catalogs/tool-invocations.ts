import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const toolInvocationsEn = {
  'toolInvocations.summary.label': 'Tool calls',
  'toolInvocations.summary.expand': 'Show tool call details',
  'toolInvocations.summary.collapse': 'Hide tool call details',
  'toolInvocations.summary.progress': 'Progress: {resolved}/{total} · {percent}',
  'toolInvocations.summary.running': 'Tool execution in progress',
  'toolInvocations.summary.complete': 'Tool execution completed',
  'toolInvocations.section.pending': 'Tool calls awaiting approval',
  'toolInvocations.section.results': 'Tool call results',
  'toolInvocations.status.pending': 'Approval required',
  'toolInvocations.status.approved': 'Tool execution approved',
  'toolInvocations.status.success': 'Tool completed successfully',
  'toolInvocations.status.error': 'Tool execution failed',
  'toolInvocations.field.server': 'Server',
  'toolInvocations.field.tool': 'Tool',
  'toolInvocations.field.description': 'Description',
  'toolInvocations.field.parameters': 'Parameters',
  'toolInvocations.field.result': 'Result',
  'toolInvocations.code.parametersAria': 'Parameters for {toolName}',
  'toolInvocations.code.resultAria': 'Result from {toolName}',
  'toolInvocations.action.cancel': 'Cancel',
  'toolInvocations.action.cancelAria': 'Cancel the execution of {toolName}',
  'toolInvocations.action.run': 'Run tool',
  'toolInvocations.action.runAria': 'Run {toolName}',
  'toolInvocations.shortcut.cancel': 'Keyboard shortcut to cancel: {shortcut}',
  'toolInvocations.shortcut.run': 'Keyboard shortcut to run the tool: {shortcut}',
  'toolInvocations.notice.approved.title': 'Execution approved',
  'toolInvocations.notice.approved.body': 'The tool was authorized to run.',
  'toolInvocations.error.denied.title': 'Execution cancelled',
  'toolInvocations.error.denied.body': 'The tool was not run because its execution was declined.',
  'toolInvocations.error.failed.title': 'Execution failed',
  'toolInvocations.error.failed.body': 'The tool could not be executed. Check its parameters, then try again.',
  'toolInvocations.error.unavailable.title': 'Tool unavailable',
  'toolInvocations.error.unavailable.body':
    'This tool cannot be executed because its server did not provide an execution handler.',
} as const;

export type ToolInvocationsKey = keyof typeof toolInvocationsEn;
export type ToolInvocationsCopy = Readonly<Record<ToolInvocationsKey, string>>;
export type ToolInvocationSafeResultKind = 'approved' | 'denied' | 'failed' | 'unavailable';

export const toolInvocationsFr: ToolInvocationsCopy = {
  'toolInvocations.summary.label': 'Appels d’outils',
  'toolInvocations.summary.expand': 'Afficher le détail des appels d’outils',
  'toolInvocations.summary.collapse': 'Masquer le détail des appels d’outils',
  'toolInvocations.summary.progress': 'Progression : {resolved}/{total} · {percent}',
  'toolInvocations.summary.running': 'Exécution des outils en cours',
  'toolInvocations.summary.complete': 'Exécution des outils terminée',
  'toolInvocations.section.pending': 'Appels d’outils en attente d’autorisation',
  'toolInvocations.section.results': 'Résultats des appels d’outils',
  'toolInvocations.status.pending': 'Autorisation requise',
  'toolInvocations.status.approved': 'Exécution de l’outil autorisée',
  'toolInvocations.status.success': 'Outil exécuté avec succès',
  'toolInvocations.status.error': 'Échec de l’exécution de l’outil',
  'toolInvocations.field.server': 'Serveur',
  'toolInvocations.field.tool': 'Outil',
  'toolInvocations.field.description': 'Description',
  'toolInvocations.field.parameters': 'Paramètres',
  'toolInvocations.field.result': 'Résultat',
  'toolInvocations.code.parametersAria': 'Paramètres de {toolName}',
  'toolInvocations.code.resultAria': 'Résultat de {toolName}',
  'toolInvocations.action.cancel': 'Annuler',
  'toolInvocations.action.cancelAria': 'Annuler l’exécution de {toolName}',
  'toolInvocations.action.run': 'Exécuter l’outil',
  'toolInvocations.action.runAria': 'Exécuter {toolName}',
  'toolInvocations.shortcut.cancel': 'Raccourci clavier pour annuler : {shortcut}',
  'toolInvocations.shortcut.run': 'Raccourci clavier pour exécuter l’outil : {shortcut}',
  'toolInvocations.notice.approved.title': 'Exécution autorisée',
  'toolInvocations.notice.approved.body': 'L’outil a été autorisé à s’exécuter.',
  'toolInvocations.error.denied.title': 'Exécution annulée',
  'toolInvocations.error.denied.body': 'L’outil n’a pas été exécuté, car son exécution a été refusée.',
  'toolInvocations.error.failed.title': 'Échec de l’exécution',
  'toolInvocations.error.failed.body': 'Impossible d’exécuter l’outil. Vérifiez ses paramètres, puis réessayez.',
  'toolInvocations.error.unavailable.title': 'Outil indisponible',
  'toolInvocations.error.unavailable.body':
    'Impossible d’exécuter cet outil, car son serveur n’a fourni aucun gestionnaire d’exécution.',
};

export function resolveToolInvocationsLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function getToolInvocationsCopy(language?: string | null): ToolInvocationsCopy {
  return resolveToolInvocationsLanguage(language) === 'fr' ? toolInvocationsFr : toolInvocationsEn;
}

export function formatToolInvocationsCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatToolInvocationsNumber(value: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveToolInvocationsLanguage(language) === 'fr' ? 'fr-FR' : 'en-US').format(value);
}

export function formatToolInvocationsPercent(value: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveToolInvocationsLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatToolInvocationsProgress(resolved: number, total: number, language?: string | null): string {
  const resolvedLanguage = resolveToolInvocationsLanguage(language);
  const copy = getToolInvocationsCopy(resolvedLanguage);
  const ratio = total > 0 ? resolved / total : 0;

  return formatToolInvocationsCopy(copy['toolInvocations.summary.progress'], {
    resolved: formatToolInvocationsNumber(resolved, resolvedLanguage),
    total: formatToolInvocationsNumber(total, resolvedLanguage),
    percent: formatToolInvocationsPercent(ratio, resolvedLanguage),
  });
}

export function getToolInvocationSafeResultCopy(
  kind: ToolInvocationSafeResultKind,
  language?: string | null,
): Readonly<{ title: string; body: string }> {
  const copy = getToolInvocationsCopy(language);

  if (kind === 'approved') {
    return {
      title: copy['toolInvocations.notice.approved.title'],
      body: copy['toolInvocations.notice.approved.body'],
    };
  }

  return {
    title: copy[`toolInvocations.error.${kind}.title`],
    body: copy[`toolInvocations.error.${kind}.body`],
  };
}
