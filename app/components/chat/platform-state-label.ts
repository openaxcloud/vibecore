import type { TFunction } from 'i18next';

/*
 * Libellé traduit d'un état de plateforme (déploiement, connexion, présence…).
 *
 * Extrait de BaseChat pour être tenu par un test : un déploiement passe par
 * QUEUED puis BUILDING avant READY ou FAILED, et ces deux états n'avaient pas
 * de cas — la carte « Gérer » affichait « QUEUED » en capitales anglaises
 * pendant qu'« Échec » était traduit (mesuré le 06/09 sur la maquette après
 * un déploiement semé). Le repli sur la valeur brute est voulu pour un état
 * inconnu, jamais pour un état du cycle de vie normal.
 */
export function platformStateLabel(t: TFunction, status: unknown): string {
  const raw = String(status ?? '').trim();
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, '_');

  switch (normalized) {
    case 'active':
      return t('baseChatAst.status.active');
    case 'cancelled':
    case 'canceled':
      return t('baseChatAst.status.cancelled');
    case 'critical':
      return t('baseChatAst.status.critical');
    case 'completed':
      return t('baseChatAst.status.completed');
    case 'connected':
      return t('baseChatAst.status.connected');
    case 'disabled':
      return t('baseChatAst.status.disabled');
    case 'enabled':
      return t('baseChatAst.status.enabled');
    case 'error':
      return t('baseChatAst.status.error');
    case 'failed':
      return t('baseChatAst.status.failed');
    case 'high':
      return t('baseChatAst.status.high');
    case 'info':
      return t('baseChatAst.status.info');
    case 'idle':
      return t('baseChatAst.presence.idle');
    case 'offline':
      return t('baseChatAst.status.offline');
    case 'low':
      return t('baseChatAst.status.low');
    case 'medium':
      return t('baseChatAst.status.medium');
    case 'moderate':
      return t('baseChatAst.status.moderate');
    case 'paused':
      return t('baseChatAst.status.paused');
    case 'queued':
      return t('baseChatAst.status.queued');
    case 'building':
      return t('baseChatAst.status.building');
    case 'pending':
      return t('baseChatAst.status.pending');
    case 'preview':
      return t('baseChatAst.status.preview');
    case 'production':
      return t('baseChatAst.status.production');
    case 'ready':
      return t('baseChatAst.status.ready');
    case 'reconnecting':
      return t('baseChatAst.status.reconnecting');
    case 'running':
      return t('baseChatAst.status.running');
    case 'starting':
      return t('baseChatAst.status.starting');
    case 'stopped':
      return t('baseChatAst.status.stopped');
    case 'staging':
      return t('baseChatAst.status.staging');
    case 'succeeded':
    case 'success':
      return t('baseChatAst.status.succeeded');
    case 'trialing':
      return t('baseChatAst.status.trialing');
    case 'approved':
      return t('baseChatAst.status.approved');
    case 'quarantined':
      return t('baseChatAst.status.quarantined');
    case 'rejected':
      return t('baseChatAst.status.rejected');
    case 'revoked':
      return t('baseChatAst.status.revoked');
    case 'daily':
      return t('baseChatAst.status.daily');
    case 'weekly':
      return t('baseChatAst.status.weekly');
    case 'warn':
    case 'warning':
      return t('baseChatAst.status.warning');
    default:
      return raw || t('baseChatAst.status.unknown');
  }
}
