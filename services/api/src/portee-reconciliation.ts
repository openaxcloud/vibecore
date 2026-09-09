/**
 * CE QUE LA RÉCONCILIATION A LE DROIT D'ÉCRIRE.
 *
 * `reconcileRuntimeSeedFromPersisted` écrit dans DEUX cas : le fichier est
 * absent du workspace, ou il est présent avec un contenu DIFFÉRENT de celui du
 * stockage. La seconde branche écrase alors le fichier du pod.
 *
 * Au provisionnement à froid, le pod est vide : `diverged` vaut toujours zéro et
 * cette branche ne s'exécute jamais. C'est ce qui la rendait sûre, et c'est
 * pourquoi l'appel n'existait que sur les routes à froid — par NÉCESSITÉ, pas
 * par oubli. J'ai lu une contrainte délibérée comme un trou.
 *
 * Sur un workspace CHAUD, la divergence est l'état normal : l'utilisateur vient
 * d'éditer un fichier, ou l'agent a écrit quelque chose que le stockage n'a pas
 * encore. Y appliquer la même règle revient à écraser le travail vivant par une
 * version plus ancienne — une écriture qui RÉGRESSE, la même famille que
 * l'instantané périmé qui raccourcissait un message déjà persisté.
 *
 * Mesuré le 2026-09-09 : brancher la réconciliation sur l'ouverture a fait
 * tomber `ide-panel-smoke › renders every panel in-place without stale
 * missing-import errors or full reloads`. Le rechargement plein écran n'est que
 * le symptôme visible ; le risque réel est la perte d'une édition.
 *
 * La règle est donc asymétrique, et c'est voulu :
 *
 *   absent ......................... on écrit, à froid comme à chaud
 *   présent, identique ............. on n'écrit pas
 *   présent, différent, à FROID .... on écrit (le pod part de vide)
 *   présent, différent, à CHAUD .... ON N'ÉCRIT PAS
 *
 * Le cas d'Avi — `src/main.tsx` purement ABSENT du pod — reste réparé, puisqu'il
 * relève de la première ligne.
 */

export interface EtatDuFichier {
  /** Le chemin existe déjà dans le workspace. */
  present: boolean;

  /** Son contenu est identique à celui du stockage. Sans objet si absent. */
  contenuIdentique?: boolean;

  /** Le workspace est vivant : un serveur de dev y tourne, l'utilisateur y édite. */
  workspaceChaud: boolean;
}

export function doitEcrireDansWorkspace(etat: EtatDuFichier): boolean {
  if (!etat.present) {
    return true;
  }

  if (etat.contenuIdentique) {
    return false;
  }

  /*
   * Présent et divergent. À froid le pod part de vide, donc ce cas n'arrive
   * qu'après un ensemencement partiel et l'écriture est la bonne réponse. À
   * chaud, la divergence signifie que quelqu'un a écrit APRÈS le stockage :
   * écraser reviendrait à remonter le temps.
   */
  return !etat.workspaceChaud;
}
