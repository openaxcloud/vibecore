/**
 * French translation bundle. Sprint 7 / Phase 0 #7.
 *
 * Mirror the English keys exactly. Untranslated keys fall back to the
 * English seed automatically via `t()`.
 */

import type { TranslationBundle } from '~/lib/i18n/dictionary';

export const fr: TranslationBundle = {
  // Patch review panel
  'patchReview.title': 'Fichiers modifiés',
  'patchReview.filesCount': '{count} fichiers',
  'patchReview.aggregateAriaLabel': '{added} ajoutées, {removed} supprimées sur {files} fichiers',
  'patchReview.applyAll': 'Tout appliquer ({count})',
  'patchReview.applying': 'Application…',
  'patchReview.noChanges': 'Contenu identique au fichier sur disque.',
  'patchReview.streaming': 'Patch en cours de stream…',

  // File mentions palette
  'mentions.empty': 'Aucun fichier correspondant',

  // Slash commands palette
  'slashCommands.empty': 'Aucune commande correspondante',

  // Plan checklist
  'plan.progressLabel': '{completed} / {total} terminées',
  'plan.progressLabelWithFailed': '{completed} / {total} terminées · {failed} échouées',
  'plan.statusPending': 'En attente',
  'plan.statusInProgress': 'En cours',
  'plan.statusCompleted': 'Terminé',
  'plan.statusFailed': 'Échec',

  // Conversation branches dropdown
  'branches.ariaLabel': 'Branches de conversation ({count})',
  'branches.trigger.title': 'Parcourir les branches de conversation',
  'branches.row.switch': 'Basculer vers {label}',
  'branches.row.rename': 'Renommer {label}',
  'branches.row.delete': 'Supprimer {label}',
  'branches.row.deleteTitle': 'Supprimer la branche (et ses descendantes)',
  'branches.row.renameTitle': 'Renommer la branche',
  'branches.switchedToast': 'Conversation changée',
  'branches.switchFailedToast': 'Impossible de basculer — conversation manquante',
  'branches.renamePrompt': 'Renommer la branche',
  'branches.emptyTitleToast': 'Le titre ne peut pas être vide',
  'branches.deleteConfirm': 'Supprimer cette branche et ses sous-branches ?',
  'branches.deletedToast': 'Branche supprimée',

  // Share view
  'share.fallbackTitle': 'Conversation partagée',
  'share.metaPrefix': 'Partagée depuis le projet',
  'share.disclaimer': 'Aperçu en lecture seule de la conversation. {count} message{plural} dans le lot.',
  'share.errorTitle': 'Lien de partage indisponible',
  'share.errorDefault': "Le contenu du lien n'a pas pu être décodé.",
  'share.forkButton': 'Forker cette conversation (connexion requise)',

  // Presence avatars
  'presence.viewersAriaLabel': '{count} observateurs',
  'presence.overflowAriaLabel': '{count} observateurs supplémentaires',
  'presence.statusTyping': 'en train de taper',
  'presence.statusViewing': 'regarde',
  'presence.statusIdle': 'inactif',

  // Share button
  'shareButton.label': 'Partager cette conversation',
  'shareButton.disabled': 'Envoie au moins un message avant de partager',
  'shareButton.enabled': 'Copier un lien de partage de cette conversation',
  'shareButton.copiedToast': 'Lien de partage copié dans le presse-papier',
  'shareButton.errorCouldNotBuild': 'Impossible de construire le lien de partage',
  'shareButton.errorClipboard': 'Lien construit mais la copie a échoué',
};
