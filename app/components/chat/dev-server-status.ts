import type { TFunction } from 'i18next';

/*
 * Status-bar "Dev: …" label, extracted from BaseChat.tsx so the
 * BUG-UX-DEV-BLOCKED-STUCK decision (a latched 'error' state must resolve the
 * moment a port really serves) is unit-testable without importing the whole
 * chat surface.
 */

/*
 * REPLI PAR LES JOURNAUX SUPPRIMÉ — il était mort, et doublement.
 *
 * Il cherchait `/Starting preview with (.+)/i` dans les lignes de journal. Or :
 *
 *   1. le libellé réellement émis est `workbenchRuntime.preview.startCommand`,
 *      soit « Starting **the** preview with … » en anglais — le motif ne
 *      correspondait donc même pas à sa propre langue depuis une reformulation
 *      que personne n'a répercutée ;
 *   2. et en français il vaut « Démarrage de l'aperçu avec … », que le motif ne
 *      pouvait structurellement pas reconnaître.
 *
 * Il rendait donc TOUJOURS `undefined`. Son spec ne l'exerçait jamais : tous ses
 * cas passent `logs: []` — vérifié le 2026-09-06, zéro cas avec des journaux non
 * vides. Un repli non testé et non fonctionnel n'est pas un filet, c'est une
 * fausse assurance.
 *
 * `previewServerState.command` est la source STRUCTURÉE, déjà consultée en
 * premier et insensible à la langue. La suppression est donc strictement sans
 * effet observable — c'est ce que prouvent les cas « repli » du spec.
 *
 * Leçon générale : reconnaître un texte d'interface, c'est dépendre d'une chaîne
 * que la traduction ET la réécriture font bouger sans prévenir personne.
 */

export function devServerStatusText(
  t: TFunction,
  input: {
    previews: Array<{ ready?: boolean; serving?: boolean }>;
    workspaceLoading: boolean;
    workspaceError?: string;
    previewServerState: { status: string; command?: string; error?: string };
  },
) {
  const command = input.previewServerState.command;

  /*
   * BUG-UX-DEV-BLOCKED-STUCK: a SERVING port (HTTP answers + live process —
   * the server-side probe) means the dev server runs, even while the aggregate
   * `ready` is still vetoed by a lagging manager status / stale client beacon
   * and even if an earlier transient failure latched previewServerState on
   * 'error'. Reality (a live port) beats the latched state; without this the
   * bar froze on "Dev: blocked" over a serving app.
   */
  if (input.previews.some((preview) => preview.ready !== false || preview.serving === true)) {
    return command ? t('baseChatAst.dev.activeCommand', { command }) : t('baseChatAst.dev.active');
  }

  if (input.workspaceError || input.previewServerState.status === 'error') {
    /*
     * A genuine runtime failure with no live port: show WHY instead of a bare,
     * frozen "Dev: blocked" (truncated — the full message lives in the logs).
     */
    const reason = (input.previewServerState.error ?? input.workspaceError ?? '').trim().replace(/\s+/g, ' ');

    if (reason) {
      return t('baseChatAst.dev.blockedReason', {
        reason: reason.length > 80 ? `${reason.slice(0, 77)}…` : reason,
      });
    }

    return t('baseChatAst.dev.blocked');
  }

  if (input.previewServerState.status === 'static') {
    return t('baseChatAst.dev.static');
  }

  if (
    input.workspaceLoading ||
    input.previewServerState.status === 'starting' ||
    input.previewServerState.status === 'stopping' ||
    command
  ) {
    if (input.previewServerState.status === 'stopping') {
      return command ? t('baseChatAst.dev.stoppingCommand', { command }) : t('baseChatAst.dev.stopping');
    }

    return command ? t('baseChatAst.dev.startingCommand', { command }) : t('baseChatAst.dev.starting');
  }

  return t('baseChatAst.dev.idle');
}
