import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';

import { AGENT_APPLIED_CONTAINER_ID } from './applied-files-notice-id';
import {
  formatAppliedFilesToastCopy,
  formatAppliedFilesToastPlural,
  getAppliedFilesToastCopy,
} from '~/lib/i18n/catalogs/applied-files-toast';
import { generationEstHonnete, type ConstatDeGeneration } from '~/lib/runtime/generation-incomplete';

export { AGENT_APPLIED_CONTAINER_ID } from './applied-files-notice-id';

export const AGENT_APPLIED_TOAST_ID = 'agent-auto-applied-files';

export function AppliedFilesToast({
  files,
  onDismissAll,
  onUndoAll,
  constat,
}: {
  files: string[];
  onDismissAll: () => void;
  onUndoAll: () => void;

  /*
   * Absent = rien à signaler, on garde le message d'origine. Présent et
   * malhonnête, le bandeau DIT que la génération s'est arrêtée en route plutôt
   * que d'annoncer un succès que le disque contredit.
   */
  constat?: ConstatDeGeneration;
}) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getAppliedFilesToastCopy(language);
  const visibleFiles = files.slice(0, 8);
  const remainingCount = Math.max(files.length - visibleFiles.length, 0);

  const appliedTitle = formatAppliedFilesToastPlural(language, files.length, {
    one: copy['appliedFilesToast.title_one'],
    other: copy['appliedFilesToast.title_other'],
  });
  const remainingLabel = formatAppliedFilesToastPlural(language, remainingCount, {
    one: copy['appliedFilesToast.remaining_one'],
    other: copy['appliedFilesToast.remaining_other'],
  });

  return (
    <div className="bolt-agent-applied-toast">
      <div className="bolt-agent-applied-toast-head" role="status" aria-live="polite">
        <strong>{appliedTitle}</strong>
        {constat && !generationEstHonnete(constat) && (
          <span className="bolt-agent-applied-toast-incomplete">
            {copy['appliedFilesToast.incomplete']}
            {constat.entreesManquantes.length > 0
              ? ` ${formatAppliedFilesToastCopy(copy['appliedFilesToast.missingEntry'], {
                  module: constat.entreesManquantes.join(', '),
                })}`
              : ''}
          </span>
        )}
      </div>
      <details>
        <summary>{copy['appliedFilesToast.details']}</summary>
        {(!constat || generationEstHonnete(constat)) && <p>{copy['appliedFilesToast.description']}</p>}
        <ul>
          {visibleFiles.map((file) => (
            <li key={file} title={file}>
              {file}
            </li>
          ))}
          {remainingCount > 0 ? <li>{remainingLabel}</li> : null}
        </ul>
      </details>
      <div className="bolt-agent-applied-toast-actions">
        <button type="button" onClick={onUndoAll}>
          {copy['appliedFilesToast.undoAll']}
        </button>
        <button type="button" onClick={onDismissAll}>
          {copy['appliedFilesToast.dismissAll']}
        </button>
      </div>
    </div>
  );
}

export function showCoalescedAppliedToast(
  files: string[],
  callbacks: { onUndoAll: () => void; onDismissAll?: () => void },

  /*
   * Le constat d'honnêteté du tour, quand il y en a un. Absent = rien à
   * signaler. Présent et malhonnête, le bandeau change de MESSAGE (« la
   * génération s'est arrêtée en route ») ET de TON : une génération qui n'a pas
   * produit son point d'entrée n'est pas un succès, et une coche verte sur un
   * projet qui ne démarre pas est exactement le mensonge que cette garde
   * existe pour empêcher.
   */
  constat?: ConstatDeGeneration,
): void {
  const dismissAll = callbacks.onDismissAll ?? (() => toast.dismiss(AGENT_APPLIED_TOAST_ID));

  const content = (
    <AppliedFilesToast files={files} onDismissAll={dismissAll} onUndoAll={callbacks.onUndoAll} constat={constat} />
  );

  const honnete = !constat || generationEstHonnete(constat);
  const type = honnete ? 'success' : 'warning';

  /*
   * Un bandeau d'avertissement ne se ferme pas tout seul : l'utilisateur doit
   * avoir le temps de lire QUEL module manque avant de relancer.
   */
  const autoClose = honnete ? 4000 : (false as const);

  const active = toast.isActive(AGENT_APPLIED_TOAST_ID);
  const containerId = AGENT_APPLIED_CONTAINER_ID;

  if (active) {
    toast.update(AGENT_APPLIED_TOAST_ID, {
      render: content,
      type,
      autoClose,
      containerId,
      closeButton: false,
    });
  } else {
    toast(content, {
      toastId: AGENT_APPLIED_TOAST_ID,
      type,
      autoClose,
      containerId,
      closeButton: false,
    });
  }
}
