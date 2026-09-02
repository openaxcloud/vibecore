/**
 * Faut-il appliquer une disposition restaurée par-dessus la disposition courante ?
 *
 * Le défaut, mesuré le 2026-09-02 : la restauration de l'état IDE n'aboutissait
 * jamais (garde posé à l'entrée, voir `project-ide-restore-guard`). Une fois
 * réparée, elle a commencé à s'appliquer — y compris APRÈS que l'utilisateur
 * ait modifié sa disposition.
 *
 * Tracé, sur un même chargement :
 *     [ACTION]    split demandé   à t = 24 104 ms
 *     [RESTAURE]  appliqué        à t = 24 361 ms
 *     [RESTAURE]  appliqué        à t = 24 455 ms
 *     → split vertical : 0. Le geste de l'utilisateur avait disparu.
 *
 * La règle retenue est la plus prudente qui traite le cas : on ne restaure que
 * si la disposition courante est encore celle par DÉFAUT, c'est-à-dire si
 * personne n'y a touché. Dès qu'elle en diffère, l'état à l'écran est plus
 * récent que celui qu'on a lu, et c'est lui qui fait foi.
 *
 * C'est la même leçon que pour la mémoire de projet : une version plus ancienne
 * ne doit jamais écraser une version plus récente en silence.
 */
export function laDispositionPeutEtreRestauree(courante: unknown, parDefaut: unknown): boolean {
  return sontStructurellementEgaux(courante, parDefaut);
}

/**
 * Égalité structurelle, insensible à l'ordre des clés.
 *
 * Une comparaison de chaînes JSON dépendrait de l'ordre d'insertion : deux
 * dispositions identiques construites par deux chemins différents seraient
 * jugées différentes, et on refuserait une restauration légitime.
 */
function sontStructurellementEgaux(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    return false;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }

    return a.every((valeur, index) => sontStructurellementEgaux(valeur, b[index]));
  }

  const clesA = Object.keys(a as Record<string, unknown>);
  const clesB = Object.keys(b as Record<string, unknown>);

  if (clesA.length !== clesB.length) {
    return false;
  }

  return clesA.every(
    (cle) =>
      Object.prototype.hasOwnProperty.call(b, cle) &&
      sontStructurellementEgaux((a as Record<string, unknown>)[cle], (b as Record<string, unknown>)[cle]),
  );
}
