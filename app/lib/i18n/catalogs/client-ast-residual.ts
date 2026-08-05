import { normalizeSupportedLanguage } from '~/lib/i18n/language';

export const clientAstResidualEn = {
  'clientAst.settings.netlify.refreshing': 'Refreshing…',
  'clientAst.settings.netlify.refresh': 'Refresh',
  'clientAst.settings.supabase.selectProject': 'Select project {project}',
  'clientAst.chat.file.remove': 'Remove {file}',
  'clientAst.chat.presence.viewers_one': '{count} viewer',
  'clientAst.chat.presence.viewers_other': '{count} viewers',
  'clientAst.chat.presence.moreViewers_one': '{count} more viewer',
  'clientAst.chat.presence.moreViewers_other': '{count} more viewers',
  'clientAst.chat.presence.status.typing': 'typing',
  'clientAst.chat.presence.status.viewing': 'viewing',
  'clientAst.chat.presence.status.idle': 'idle',
  'clientAst.chat.presence.entryTitle': '{name} ({status})',
  'clientAst.chat.presence.entryAria': '{name} {status}',
  'clientAst.chat.send.stop': 'Stop generation',
  'clientAst.chat.send.message': 'Send message',
  'clientAst.chat.attachments.limit_one': 'You can attach up to {count} image per message.',
  'clientAst.chat.attachments.limit_other': 'You can attach up to {count} images per message.',
  'clientAst.chat.attachments.size': 'Images must be {size} or smaller.',
  'clientAst.chat.technical.conversationCreate': 'AI conversation creation failed (HTTP {status}).',
  'clientAst.chat.technical.transcriptSync': 'AI transcript synchronization failed (HTTP {status}).',
  'clientAst.chat.technical.transcriptLoad': 'AI transcript loading failed (HTTP {status}).',
  'clientAst.dashboard.stat.view': 'View {label}',
  'clientAst.deploy.github.initialCommit': 'Initial commit from E-Code',
  'clientAst.deploy.github.updateCommit': 'Update from E-Code',
  'clientAst.deploy.github.referenceCreateFailed': 'Git reference creation failed: {reason}',
  'clientAst.deploy.github.operationsFailed': 'Git operations failed: {reason}',
  'clientAst.deploy.github.unknownError': 'Unknown error',
  'clientAst.deploy.netlify.statusCheckFailed': 'Deployment status check failed (HTTP {status}).',
  'clientAst.git.detachedHead': 'HEAD @ {branch}',
  'clientAst.git.commitLoadFailed': 'Commit loading failed (HTTP {status}).',
  'clientAst.git.conflictLoadFailed': 'Conflict loading failed (HTTP {status}).',
  'clientAst.ui.filter.remove': 'Remove {label} filter',
  'clientAst.ui.slider.value': 'Slider value',
  'clientAst.ui.theme.toggle': 'Toggle theme',
} as const;

export type ClientAstResidualKey = keyof typeof clientAstResidualEn;
export type ClientAstResidualCopy = Readonly<Record<ClientAstResidualKey, string>>;
export type ClientAstStorageUnit = 'MB' | 'GB';

export const clientAstResidualFr: ClientAstResidualCopy = {
  'clientAst.settings.netlify.refreshing': 'Actualisation…',
  'clientAst.settings.netlify.refresh': 'Actualiser',
  'clientAst.settings.supabase.selectProject': 'Sélectionner le projet {project}',
  'clientAst.chat.file.remove': 'Retirer {file}',
  'clientAst.chat.presence.viewers_one': '{count} personne consulte',
  'clientAst.chat.presence.viewers_other': '{count} personnes consultent',
  'clientAst.chat.presence.moreViewers_one': '{count} personne supplémentaire',
  'clientAst.chat.presence.moreViewers_other': '{count} personnes supplémentaires',
  'clientAst.chat.presence.status.typing': 'saisie en cours',
  'clientAst.chat.presence.status.viewing': 'consultation en cours',
  'clientAst.chat.presence.status.idle': 'aucune activité',
  'clientAst.chat.presence.entryTitle': '{name} ({status})',
  'clientAst.chat.presence.entryAria': '{name} — {status}',
  'clientAst.chat.send.stop': 'Arrêter la génération',
  'clientAst.chat.send.message': 'Envoyer le message',
  'clientAst.chat.attachments.limit_one': 'Vous pouvez joindre au maximum {count} image par message.',
  'clientAst.chat.attachments.limit_other': 'Vous pouvez joindre au maximum {count} images par message.',
  'clientAst.chat.attachments.size': 'Les images ne doivent pas dépasser {size}.',
  'clientAst.chat.technical.conversationCreate': 'Échec de la création de la conversation IA (HTTP {status}).',
  'clientAst.chat.technical.transcriptSync': 'Échec de la synchronisation de la transcription IA (HTTP {status}).',
  'clientAst.chat.technical.transcriptLoad': 'Échec du chargement de la transcription IA (HTTP {status}).',
  'clientAst.dashboard.stat.view': 'Afficher {label}',
  'clientAst.deploy.github.initialCommit': 'Commit initial depuis E-Code',
  'clientAst.deploy.github.updateCommit': 'Mise à jour depuis E-Code',
  'clientAst.deploy.github.referenceCreateFailed': 'Échec de la création de la référence Git : {reason}',
  'clientAst.deploy.github.operationsFailed': 'Échec des opérations Git : {reason}',
  'clientAst.deploy.github.unknownError': 'Erreur inconnue',
  'clientAst.deploy.netlify.statusCheckFailed': 'Échec de la vérification du déploiement (HTTP {status}).',
  'clientAst.git.detachedHead': 'HEAD @ {branch}',
  'clientAst.git.commitLoadFailed': 'Échec du chargement du commit (HTTP {status}).',
  'clientAst.git.conflictLoadFailed': 'Échec du chargement du conflit (HTTP {status}).',
  'clientAst.ui.filter.remove': 'Retirer le filtre {label}',
  'clientAst.ui.slider.value': 'Valeur du curseur',
  'clientAst.ui.theme.toggle': 'Changer de thème',
};

export function getClientAstResidualCopy(language?: string | null): ClientAstResidualCopy {
  return normalizeSupportedLanguage(language) === 'fr' ? clientAstResidualFr : clientAstResidualEn;
}

export function formatClientAstResidualCopy(
  template: string,
  values: Readonly<Record<string, string | number | bigint>> = {},
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (token, key: string) => {
    const value = values[key];

    return value === undefined ? token : String(value);
  });
}

export function formatClientAstResidualNumber(value: number, language?: string | null): string {
  const locale = normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';

  return new Intl.NumberFormat(locale).format(value);
}

export function formatClientAstResidualPlural(
  language: string | null | undefined,
  count: number,
  templates: Readonly<{ one: string; other: string }>,
): string {
  const locale = normalizeSupportedLanguage(language) === 'fr' ? 'fr-FR' : 'en-US';
  const suffix = new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other';

  return formatClientAstResidualCopy(templates[suffix], {
    count: formatClientAstResidualNumber(count, language),
  });
}

export function formatClientAstStorage(value: number, unit: ClientAstStorageUnit, language?: string | null): string {
  const french = normalizeSupportedLanguage(language) === 'fr';
  const number = new Intl.NumberFormat(french ? 'fr-FR' : 'en-US').format(value);

  return `${number}${french ? '\u00a0' : ' '}${unit}`;
}
