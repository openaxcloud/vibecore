import { useStore } from '@nanostores/react';
import { useTranslation } from 'react-i18next';

import { formatEcrituresEnAttentePluriel, getEcrituresEnAttenteCopy } from '~/lib/i18n/catalogs/ecritures-en-attente';
import { demarrageRefusePourQuotaStore, ecrituresEnAttenteStore } from '~/lib/runtime/ecritures-en-attente';
import { restartWorkspace } from '~/routes/projects.$projectId.ide.helpers';

/**
 * BUG-QA0928-RUNTIME-ID-PROJET — ce que l'utilisateur ne savait pas.
 *
 * Deux situations, un seul avis au-dessus du composeur :
 *   - AVANT : le démarrage a été refusé pour quota → l'agent ne pourra rien
 *     écrire ; on le dit avant qu'il travaille ;
 *   - APRÈS : des fichiers ont été produits mais pas écrits → combien, pourquoi,
 *     et qu'ils sont gardés (ou pas, si le navigateur a refusé d'en garder copie).
 *
 * Même règle que « la génération s'est arrêtée en route » : dire ce qui s'est
 * passé ET quoi faire, sans code d'erreur. L'avis ne se ferme pas : il disparaît
 * quand la cause disparaît (file rejouée, démarrage réussi).
 */
export function AvisEcrituresEnAttente() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getEcrituresEnAttenteCopy(language);
  const { ecritures, conservees } = useStore(ecrituresEnAttenteStore);
  const quota = useStore(demarrageRefusePourQuotaStore);

  if (ecritures.length === 0 && !quota) {
    return null;
  }

  const titre =
    ecritures.length > 0
      ? formatEcrituresEnAttentePluriel(language, ecritures.length, {
          one: copy['ecrituresEnAttente.titre_one'],
          other: copy['ecrituresEnAttente.titre_other'],
        })
      : undefined;

  const cause =
    ecritures.length > 0
      ? quota
        ? copy['ecrituresEnAttente.quota']
        : copy['ecrituresEnAttente.demarrage']
      : copy['ecrituresEnAttente.quotaAvantEnvoi'];

  return (
    <div className="bolt-agent-avis-ecritures" role="alert" data-testid="avis-ecritures-en-attente">
      {titre ? <strong>{titre}</strong> : null}
      <span>{cause}</span>
      {ecritures.length > 0 ? (
        <span>{conservees ? copy['ecrituresEnAttente.conserves'] : copy['ecrituresEnAttente.nonConserves']}</span>
      ) : null}
      <button type="button" onClick={() => restartWorkspace()}>
        {copy['ecrituresEnAttente.redemarrer']}
      </button>
    </div>
  );
}
