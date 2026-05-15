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
};
