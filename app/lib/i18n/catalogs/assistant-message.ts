import { resolveMarketingLanguage } from './marketing';

export const assistantMessageEn = {
  'assistantMessage.agent': 'Agent',
  'assistantMessage.context.show': 'Show agent message context',
  'assistantMessage.context.label': 'Context',
  'assistantMessage.context.memoryTitle': 'Agent memory',
  'assistantMessage.context.memoriesUsed_one': '{{count}} persistent memory used for this response',
  'assistantMessage.context.memoriesUsed_other': '{{count}} persistent memories used for this response',
  'assistantMessage.context.match': '{{score}}% match',
  'assistantMessage.context.used': 'used {{count}}×',
  'assistantMessage.context.projectRules': 'Project rules',
  'assistantMessage.context.rulesApplied_one': 'Applied {{count}} project rules file to this response',
  'assistantMessage.context.rulesApplied_other': 'Applied {{count}} project rules files to this response',
  'assistantMessage.context.executionTitle': 'Sub-agent execution',
  'assistantMessage.context.executionFinished': 'Run {{runId}} finished with status {{status}}',
  'assistantMessage.context.consensus': 'Consensus · {{algorithm}}',
  'assistantMessage.context.agreementRounds_one': '{{score}}% agreement · {{count}} round',
  'assistantMessage.context.agreementRounds_other': '{{score}}% agreement · {{count}} rounds',
  'assistantMessage.context.claimsVoted_one': '{{count}} claim voted',
  'assistantMessage.context.claimsVoted_other': '{{count}} claims voted',
  'assistantMessage.context.conflictsDetected_one': '{{count}} conflict detected',
  'assistantMessage.context.conflictsDetected_other': '{{count}} conflicts detected',
  'assistantMessage.context.severity': '{{severity}} severity',
  'assistantMessage.context.orchestration': 'Agent orchestration',
  'assistantMessage.context.parallelPlanned': 'Parallel specialist agents planned',
  'assistantMessage.context.lanesPlanned': 'Specialist lanes planned inside the active model',
  'assistantMessage.context.summary': 'Summary',
  'assistantMessage.context.codeContext': 'Context',
  'assistantMessage.context.memoryUsed': 'Memory used: {{count}}',
  'assistantMessage.defaultLaneResponsibility': 'Specialist lane is streaming live.',
  'assistantMessage.mode.turbo': 'Turbo',
  'assistantMessage.mode.lite': 'Lite',
  'assistantMessage.mode.economy': 'Economy',
  'assistantMessage.mode.power': 'Power',
  'assistantMessage.mode.escalated': 'High effort: escalated',
  'assistantMessage.mode.noEscalation': 'High effort: +0 credit on this task (no escalation needed)',
  'assistantMessage.mode.tooltip': 'Agent mode used for this response',
  'assistantMessage.usage.tokens': '{{count}} tokens',
  'assistantMessage.usage.tooltip':
    'This run: {{prompt}} prompt / {{completion}} completion tokens — open the usage page',
  'assistantMessage.usage.aria': 'Run usage {{usage}} — open the usage page',
  'assistantMessage.plan.title': 'Plan',
  'assistantMessage.plan.done': '{{completed}}/{{total}} done',
  'assistantMessage.plan.tasksAgents_one_one': '{{tasks}} task · {{agents}} agent',
  'assistantMessage.plan.tasksAgents_one_other': '{{tasks}} task · {{agents}} agents',
  'assistantMessage.plan.tasksAgents_other_one': '{{tasks}} tasks · {{agents}} agent',
  'assistantMessage.plan.tasksAgents_other_other': '{{tasks}} tasks · {{agents}} agents',
  'assistantMessage.plan.review': 'Review the plan, then build — or refine it by sending another message.',
  'assistantMessage.plan.approve': 'Approve & build',
  'assistantMessage.lanes.title': 'Parallel agents',
  'assistantMessage.lanes.consensusStatus': 'consensus: {{status}}',
  'assistantMessage.lanes.running': 'running in parallel…',
  'assistantMessage.lanes.stopped': 'stopped',
  'assistantMessage.lanes.finalizing': 'finalizing consensus…',
  'assistantMessage.lanes.consensusSummary': 'Consensus · {{algorithm}} · {{outcome}} · {{score}}% agreement',
  'assistantMessage.reasoning': 'Reasoning',
  'assistantMessage.footer.group': 'Message actions',
  'assistantMessage.footer.copied': 'Copied',
  'assistantMessage.footer.copy': 'Copy message',
  'assistantMessage.footer.clipboardUnavailable': 'Clipboard API unavailable',
  'assistantMessage.footer.copyFailed': 'Copy failed: {{reason}}',
  'assistantMessage.footer.copyFailedSafe': 'Could not copy the message.',
  'assistantMessage.footer.regenerate': 'Regenerate from this prompt',
  'assistantMessage.footer.forkTooltip': 'Edit prompt and fork the conversation',
  'assistantMessage.footer.forkAria': 'Edit prompt and fork conversation',
  'assistantMessage.footer.helpful': 'Helpful',
  'assistantMessage.footer.helpfulAria': 'Mark response as helpful',
  'assistantMessage.footer.improve': 'Needs improvement',
  'assistantMessage.footer.improveAria': 'Mark response as needing improvement',
  'assistantMessage.status.running': 'running',
  'assistantMessage.status.complete': 'complete',
  'assistantMessage.status.partial': 'partial',
  'assistantMessage.status.failed': 'failed',
  'assistantMessage.status.proposed': 'proposed',
  'assistantMessage.outcome.ACCEPTED': 'Accepted',
  'assistantMessage.outcome.REJECTED': 'Rejected',
  'assistantMessage.outcome.PARTIAL': 'Partial',
  'assistantMessage.outcome.ABSTAINED': 'Abstained',
  'assistantMessage.decision.accepted': 'accepted',
  'assistantMessage.decision.rejected': 'rejected',
  'assistantMessage.decision.inconclusive': 'inconclusive',
  'assistantMessage.severity.low': 'low',
  'assistantMessage.severity.medium': 'medium',
  'assistantMessage.severity.high': 'high',
  'assistantMessage.role.architect': 'Architect',
  'assistantMessage.role.frontend': 'Frontend',
  'assistantMessage.role.backend': 'Backend',
  'assistantMessage.role.devops': 'DevOps',
  'assistantMessage.role.qa': 'QA',
  'assistantMessage.memoryScope.project': 'project',
  'assistantMessage.memoryScope.user': 'user',
  'assistantMessage.memoryScope.workspace': 'workspace',
  'assistantMessage.memoryScope.organization': 'organization',
  'assistantMessage.memoryScope.global': 'global',
  'assistantMessage.memoryType.semantic': 'semantic',
  'assistantMessage.memoryType.episodic': 'episodic',
  'assistantMessage.memoryType.procedural': 'procedural',
  'assistantMessage.memoryType.preference': 'preference',
  'assistantMessage.voteType.risk': 'risk',
  'assistantMessage.voteType.verification': 'verification',
  'assistantMessage.voteType.file': 'file',
  'assistantMessage.conflictType.file-overlap': 'file overlap',
  'assistantMessage.conflictType.risk-disagreement': 'risk disagreement',
  'assistantMessage.conflictType.verification-gap': 'verification gap',
  'assistantMessage.conflictType.role-failure': 'role failure',
} as const;

export type AssistantMessageKey = keyof typeof assistantMessageEn;
export type AssistantMessageCopy = Readonly<Record<AssistantMessageKey, string>>;

export const assistantMessageFr: AssistantMessageCopy = {
  'assistantMessage.agent': 'Agent',
  'assistantMessage.context.show': 'Afficher le contexte du message de l’agent',
  'assistantMessage.context.label': 'Contexte',
  'assistantMessage.context.memoryTitle': 'Mémoire de l’agent',
  'assistantMessage.context.memoriesUsed_one': '{{count}} souvenir persistant utilisé pour cette réponse',
  'assistantMessage.context.memoriesUsed_other': '{{count}} souvenirs persistants utilisés pour cette réponse',
  'assistantMessage.context.match': 'correspondance à {{score}} %',
  'assistantMessage.context.used': 'utilisé {{count}} fois',
  'assistantMessage.context.projectRules': 'Règles du projet',
  'assistantMessage.context.rulesApplied_one': '{{count}} fichier de règles du projet appliqué à cette réponse',
  'assistantMessage.context.rulesApplied_other': '{{count}} fichiers de règles du projet appliqués à cette réponse',
  'assistantMessage.context.executionTitle': 'Exécution des sous-agents',
  'assistantMessage.context.executionFinished': 'Exécution {{runId}} terminée avec l’état {{status}}',
  'assistantMessage.context.consensus': 'Consensus · {{algorithm}}',
  'assistantMessage.context.agreementRounds_one': '{{score}} % d’accord · {{count}} tour',
  'assistantMessage.context.agreementRounds_other': '{{score}} % d’accord · {{count}} tours',
  'assistantMessage.context.claimsVoted_one': '{{count}} affirmation soumise au vote',
  'assistantMessage.context.claimsVoted_other': '{{count}} affirmations soumises au vote',
  'assistantMessage.context.conflictsDetected_one': '{{count}} conflit détecté',
  'assistantMessage.context.conflictsDetected_other': '{{count}} conflits détectés',
  'assistantMessage.context.severity': 'Sévérité : {{severity}}',
  'assistantMessage.context.orchestration': 'Orchestration des agents',
  'assistantMessage.context.parallelPlanned': 'Agents spécialistes parallèles planifiés',
  'assistantMessage.context.lanesPlanned': 'Rôles spécialistes planifiés dans le modèle actif',
  'assistantMessage.context.summary': 'Résumé',
  'assistantMessage.context.codeContext': 'Contexte',
  'assistantMessage.context.memoryUsed': 'Mémoire utilisée : {{count}}',
  'assistantMessage.defaultLaneResponsibility': 'Le rôle spécialiste transmet sa progression en direct.',
  'assistantMessage.mode.turbo': 'Turbo',
  'assistantMessage.mode.lite': 'Léger',
  'assistantMessage.mode.economy': 'Économique',
  'assistantMessage.mode.power': 'Puissance',
  'assistantMessage.mode.escalated': 'Effort élevé : escalade activée',
  'assistantMessage.mode.noEscalation': 'Effort élevé : +0 crédit pour cette tâche (aucune escalade nécessaire)',
  'assistantMessage.mode.tooltip': 'Mode Agent utilisé pour cette réponse',
  'assistantMessage.usage.tokens': '{{count}} jetons',
  'assistantMessage.usage.tooltip':
    'Cette exécution : {{prompt}} jetons de prompt / {{completion}} de complétion — ouvrir la page d’utilisation',
  'assistantMessage.usage.aria': 'Utilisation de l’exécution : {{usage}} — ouvrir la page d’utilisation',
  'assistantMessage.plan.title': 'Plan',
  'assistantMessage.plan.done': '{{completed}}/{{total}} terminées',
  'assistantMessage.plan.tasksAgents_one_one': '{{tasks}} tâche · {{agents}} agent',
  'assistantMessage.plan.tasksAgents_one_other': '{{tasks}} tâche · {{agents}} agents',
  'assistantMessage.plan.tasksAgents_other_one': '{{tasks}} tâches · {{agents}} agent',
  'assistantMessage.plan.tasksAgents_other_other': '{{tasks}} tâches · {{agents}} agents',
  'assistantMessage.plan.review':
    'Vérifiez le plan, puis lancez la création — ou affinez-le en envoyant un autre message.',
  'assistantMessage.plan.approve': 'Approuver et créer',
  'assistantMessage.lanes.title': 'Agents parallèles',
  'assistantMessage.lanes.consensusStatus': 'consensus : {{status}}',
  'assistantMessage.lanes.running': 'exécution parallèle…',
  'assistantMessage.lanes.stopped': 'arrêté',
  'assistantMessage.lanes.finalizing': 'finalisation du consensus…',
  'assistantMessage.lanes.consensusSummary': 'Consensus · {{algorithm}} · {{outcome}} · {{score}} % d’accord',
  'assistantMessage.reasoning': 'Raisonnement',
  'assistantMessage.footer.group': 'Actions du message',
  'assistantMessage.footer.copied': 'Copié',
  'assistantMessage.footer.copy': 'Copier le message',
  'assistantMessage.footer.clipboardUnavailable': 'Le presse-papiers est indisponible',
  'assistantMessage.footer.copyFailed': 'Échec de la copie : {{reason}}',
  'assistantMessage.footer.copyFailedSafe': 'Impossible de copier le message.',
  'assistantMessage.footer.regenerate': 'Régénérer à partir de ce prompt',
  'assistantMessage.footer.forkTooltip': 'Modifier le prompt et créer une branche de la conversation',
  'assistantMessage.footer.forkAria': 'Modifier le prompt et créer une branche de conversation',
  'assistantMessage.footer.helpful': 'Utile',
  'assistantMessage.footer.helpfulAria': 'Marquer la réponse comme utile',
  'assistantMessage.footer.improve': 'À améliorer',
  'assistantMessage.footer.improveAria': 'Marquer la réponse comme à améliorer',
  'assistantMessage.status.running': 'en cours',
  'assistantMessage.status.complete': 'terminé',
  'assistantMessage.status.partial': 'partiel',
  'assistantMessage.status.failed': 'échec',
  'assistantMessage.status.proposed': 'proposé',
  'assistantMessage.outcome.ACCEPTED': 'Accepté',
  'assistantMessage.outcome.REJECTED': 'Rejeté',
  'assistantMessage.outcome.PARTIAL': 'Partiel',
  'assistantMessage.outcome.ABSTAINED': 'Abstention',
  'assistantMessage.decision.accepted': 'acceptée',
  'assistantMessage.decision.rejected': 'rejetée',
  'assistantMessage.decision.inconclusive': 'sans conclusion',
  'assistantMessage.severity.low': 'faible',
  'assistantMessage.severity.medium': 'moyenne',
  'assistantMessage.severity.high': 'élevée',
  'assistantMessage.role.architect': 'Architecte',
  'assistantMessage.role.frontend': 'Interface utilisateur',
  'assistantMessage.role.backend': 'Service applicatif',
  'assistantMessage.role.devops': 'DevOps',
  'assistantMessage.role.qa': 'QA',
  'assistantMessage.memoryScope.project': 'projet',
  'assistantMessage.memoryScope.user': 'utilisateur',
  'assistantMessage.memoryScope.workspace': 'espace de travail',
  'assistantMessage.memoryScope.organization': 'organisation',
  'assistantMessage.memoryScope.global': 'global',
  'assistantMessage.memoryType.semantic': 'sémantique',
  'assistantMessage.memoryType.episodic': 'épisodique',
  'assistantMessage.memoryType.procedural': 'procédurale',
  'assistantMessage.memoryType.preference': 'préférence',
  'assistantMessage.voteType.risk': 'risque',
  'assistantMessage.voteType.verification': 'vérification',
  'assistantMessage.voteType.file': 'fichier',
  'assistantMessage.conflictType.file-overlap': 'chevauchement de fichiers',
  'assistantMessage.conflictType.risk-disagreement': 'désaccord sur un risque',
  'assistantMessage.conflictType.verification-gap': 'vérification insuffisante',
  'assistantMessage.conflictType.role-failure': 'échec d’un rôle',
};

export function getAssistantMessageCopy(language?: string | null): AssistantMessageCopy {
  return resolveMarketingLanguage(language) === 'fr' ? assistantMessageFr : assistantMessageEn;
}

export function formatAssistantMessageCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function selectAssistantMessagePlural(
  copy: AssistantMessageCopy,
  baseKey:
    | 'assistantMessage.context.memoriesUsed'
    | 'assistantMessage.context.rulesApplied'
    | 'assistantMessage.context.agreementRounds'
    | 'assistantMessage.context.claimsVoted'
    | 'assistantMessage.context.conflictsDetected',
  count: number,
): string {
  const suffix = count === 1 ? '_one' : '_other';

  return copy[`${baseKey}${suffix}` as AssistantMessageKey];
}

export function formatAssistantUsageNumber(value: number | undefined, language?: string | null): string | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }

  return new Intl.NumberFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 10000 ? 0 : 1,
  }).format(value);
}

export function formatAssistantDuration(value: number | undefined, language?: string | null): string | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }

  const locale = resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';

  return value >= 1000
    ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(value / 1000)} s`
    : `${new Intl.NumberFormat(locale).format(Math.round(value))} ms`;
}

export function formatAssistantCost(value: number, language?: string | null): string {
  return new Intl.NumberFormat(resolveMarketingLanguage(language) === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

export function formatAssistantTasksAgents(
  copy: AssistantMessageCopy,
  tasks: number,
  agents: number,
  language?: string | null,
): string {
  const taskSuffix = tasks === 1 ? 'one' : 'other';
  const agentSuffix = agents === 1 ? 'one' : 'other';
  const key = `assistantMessage.plan.tasksAgents_${taskSuffix}_${agentSuffix}` as AssistantMessageKey;

  return formatAssistantMessageCopy(copy[key], {
    tasks: formatAssistantUsageNumber(tasks, language) ?? tasks,
    agents: formatAssistantUsageNumber(agents, language) ?? agents,
  });
}

export function localizeAssistantEnum(
  copy: AssistantMessageCopy,
  family:
    | 'status'
    | 'outcome'
    | 'decision'
    | 'severity'
    | 'role'
    | 'memoryScope'
    | 'memoryType'
    | 'voteType'
    | 'conflictType',
  value: string,
): string {
  const key = `assistantMessage.${family}.${value}` as AssistantMessageKey;

  return key in copy ? copy[key] : value;
}
