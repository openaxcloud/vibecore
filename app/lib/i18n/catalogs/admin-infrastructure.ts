import { resolveMarketingLanguage, type MarketingLanguage } from './marketing';

export const adminInfrastructureEn = {
  'adminInfrastructure.unavailable.title': 'Infrastructure',
  'adminInfrastructure.unavailable.description':
    'Live capacity metrics are temporarily unavailable because a cluster service did not respond. This read-only view refreshes when you reload the page.',
  'adminInfrastructure.alert.critical': 'Critical',
  'adminInfrastructure.alert.warning': 'Warning',
  'adminInfrastructure.alert.nodeCritical':
    'Node pool “{pool}” is at {current}/{max} nodes ({percent}% of the autoscaling maximum). The pool cannot scale further; raise the maximum node count.',
  'adminInfrastructure.alert.nodeWarning':
    'Node pool “{pool}” is at {current}/{max} nodes ({percent}% of the autoscaling maximum). It is approaching the ceiling; consider raising the maximum node count.',
  'adminInfrastructure.alert.cpu':
    'Reserved CPU on “{pool}” is {percent}% of allocatable capacity. New workspaces may fail to schedule; free idle workspaces or raise the autoscaling maximum.',
  'adminInfrastructure.alert.fallback':
    'The cluster reported a capacity warning. Review the live metrics below before changing capacity.',
  'adminInfrastructure.page.title': 'Infrastructure & capacity',
  'adminInfrastructure.page.description':
    'Live cluster state for the “{pool}” workspace pool. Autoscaling operates automatically between its minimum and maximum; raise the maximum only when the pool remains near its ceiling.',
  'adminInfrastructure.stat.runningWorkspaces': 'Running workspaces',
  'adminInfrastructure.stat.pods_one': '{count} pod total',
  'adminInfrastructure.stat.pods_other': '{count} pods total',
  'adminInfrastructure.stat.idleStopped': 'Idle-stopped',
  'adminInfrastructure.stat.reclaimed': 'reclaimed by garbage collection',
  'adminInfrastructure.stat.nodes': 'Nodes',
  'adminInfrastructure.stat.minMax': 'min {min} · max {max}',
  'adminInfrastructure.stat.autoscalingUnavailable': 'autoscaling unavailable',
  'adminInfrastructure.stat.autoscaling': 'Autoscaling',
  'adminInfrastructure.stat.healthy': 'Healthy',
  'adminInfrastructure.stat.degraded': 'Degraded',
  'adminInfrastructure.stat.automaticScaling': 'automatic scale up and down',
  'adminInfrastructure.meter.cpuReserved': 'CPU reserved (requests)',
  'adminInfrastructure.meter.cpuUsed': 'CPU used (live)',
  'adminInfrastructure.meter.memoryReserved': 'Memory reserved',
  'adminInfrastructure.meter.nodesMaximum': 'Nodes vs maximum',
  'adminInfrastructure.meter.cores': '{used} / {total} cores',
  'adminInfrastructure.meter.memory': '{used} / {total} GiB',
  'adminInfrastructure.meter.nodes': '{current} of {max} nodes',
  'adminInfrastructure.meter.unavailable': 'unavailable',
  'adminInfrastructure.meter.progress': '{label}: {percent}%',
  'adminInfrastructure.organizations.title': 'Running workspaces by organization',
  'adminInfrastructure.snapshot': 'Snapshot at {date}',
  'adminInfrastructure.dateUnavailable': 'date unavailable',
} as const;

export type AdminInfrastructureKey = keyof typeof adminInfrastructureEn;
export type AdminInfrastructureCopy = Readonly<Record<AdminInfrastructureKey, string>>;

export const adminInfrastructureFr: AdminInfrastructureCopy = {
  'adminInfrastructure.unavailable.title': 'Infrastructure',
  'adminInfrastructure.unavailable.description':
    'Les métriques de capacité en direct sont temporairement indisponibles, car un service du cluster n’a pas répondu. Cette vue en lecture seule s’actualise lorsque vous rechargez la page.',
  'adminInfrastructure.alert.critical': 'Critique',
  'adminInfrastructure.alert.warning': 'Avertissement',
  'adminInfrastructure.alert.nodeCritical':
    'Le pool de nœuds « {pool} » utilise {current}/{max} nœuds ({percent} % du maximum d’autoscaling). Le pool ne peut plus évoluer ; augmentez le nombre maximal de nœuds.',
  'adminInfrastructure.alert.nodeWarning':
    'Le pool de nœuds « {pool} » utilise {current}/{max} nœuds ({percent} % du maximum d’autoscaling). Il approche de sa limite ; envisagez d’augmenter le nombre maximal de nœuds.',
  'adminInfrastructure.alert.cpu':
    'Le CPU réservé sur « {pool} » représente {percent} % de la capacité allouable. La planification de nouveaux espaces de travail peut échouer ; libérez les espaces inactifs ou augmentez le maximum d’autoscaling.',
  'adminInfrastructure.alert.fallback':
    'Le cluster a signalé une alerte de capacité. Consultez les métriques en direct ci-dessous avant de modifier la capacité.',
  'adminInfrastructure.page.title': 'Infrastructure et capacité',
  'adminInfrastructure.page.description':
    'État en direct du cluster pour le pool d’espaces de travail « {pool} ». L’autoscaling fonctionne automatiquement entre son minimum et son maximum ; augmentez le maximum uniquement lorsque le pool reste proche de sa limite.',
  'adminInfrastructure.stat.runningWorkspaces': 'Espaces de travail actifs',
  'adminInfrastructure.stat.pods_one': '{count} pod au total',
  'adminInfrastructure.stat.pods_other': '{count} pods au total',
  'adminInfrastructure.stat.idleStopped': 'Arrêtés pour inactivité',
  'adminInfrastructure.stat.reclaimed': 'récupérés par le nettoyage automatique',
  'adminInfrastructure.stat.nodes': 'Nœuds',
  'adminInfrastructure.stat.minMax': 'min. {min} · max. {max}',
  'adminInfrastructure.stat.autoscalingUnavailable': 'autoscaling indisponible',
  'adminInfrastructure.stat.autoscaling': 'Autoscaling',
  'adminInfrastructure.stat.healthy': 'Opérationnel',
  'adminInfrastructure.stat.degraded': 'Dégradé',
  'adminInfrastructure.stat.automaticScaling': 'augmentation et réduction automatiques',
  'adminInfrastructure.meter.cpuReserved': 'CPU réservé (requêtes)',
  'adminInfrastructure.meter.cpuUsed': 'CPU utilisé (en direct)',
  'adminInfrastructure.meter.memoryReserved': 'Mémoire réservée',
  'adminInfrastructure.meter.nodesMaximum': 'Nœuds par rapport au maximum',
  'adminInfrastructure.meter.cores': '{used} / {total} cœurs',
  'adminInfrastructure.meter.memory': '{used} / {total} Gio',
  'adminInfrastructure.meter.nodes': '{current} nœuds sur {max}',
  'adminInfrastructure.meter.unavailable': 'indisponible',
  'adminInfrastructure.meter.progress': '{label} : {percent} %',
  'adminInfrastructure.organizations.title': 'Espaces de travail actifs par organisation',
  'adminInfrastructure.snapshot': 'Instantané du {date}',
  'adminInfrastructure.dateUnavailable': 'date indisponible',
};

export function resolveAdminInfrastructureLanguage(language?: string | null): MarketingLanguage {
  return resolveMarketingLanguage(language);
}

export function getAdminInfrastructureCopy(language?: string | null): AdminInfrastructureCopy {
  return resolveAdminInfrastructureLanguage(language) === 'fr' ? adminInfrastructureFr : adminInfrastructureEn;
}

export function formatAdminInfrastructureCopy(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function formatAdminInfrastructureNumber(
  value: number,
  language?: string | null,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(
    resolveAdminInfrastructureLanguage(language) === 'fr' ? 'fr-FR' : 'en-US',
    options,
  ).format(value);
}

export function formatAdminInfrastructurePlural(
  language: string | null | undefined,
  count: number,
  templates: Readonly<{ one: string; other: string }>,
): string {
  const resolvedLanguage = resolveAdminInfrastructureLanguage(language);
  const locale = resolvedLanguage === 'fr' ? 'fr-FR' : 'en-US';
  const template = new Intl.PluralRules(locale).select(count) === 'one' ? templates.one : templates.other;

  return formatAdminInfrastructureCopy(template, { count: new Intl.NumberFormat(locale).format(count) });
}
