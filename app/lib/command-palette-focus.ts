/*
 * BUG-MOB-PALETTE-KEYBOARD-001 — « ouvrir un panneau depuis la palette
 * Commandes ne bascule pas la vue / la palette reste » (iPhone, ~390 px).
 *
 * La palette met `autoFocus` sur son champ de recherche. Sur un pointeur
 * FIN (souris, trackpad) c'est le bon réflexe : on ouvre, on tape. Sur un
 * téléphone, ce même `autoFocus` lève le clavier logiciel dès l'ouverture,
 * et c'est lui qui casse la sélection :
 *
 * - le clavier réduit le viewport VISUEL (~45 % de la hauteur) sans réduire
 *   le viewport de MISE EN PAGE, or la feuille est en `position: fixed`
 *   ancrée au second : la moitié basse de la liste est « à l'écran » pour la
 *   mise en page mais physiquement sous le clavier ;
 * - au relâchement du doigt, le clavier se referme, la mise en page se
 *   ré-étale et le `click` est résolu contre la NOUVELLE géométrie : il
 *   atterrit sur une autre ligne, ou hors de la feuille — d'où « rien ne
 *   bascule » et « la palette reste ».
 *
 * Rien de tout ça n'existe en émulation de navigateur de bureau (aucun
 * clavier logiciel), ce qui explique pourquoi la palette se comporte
 * correctement à ~600 px sur un Mac et échoue sur l'appareil réel.
 *
 * Règle : on garde l'auto-focus partout où un pointeur fin est disponible —
 * y compris une tablette AVEC clavier/trackpad, cas explicitement voulu par
 * SCR-006 — et on ne le lève que sur les appareils purement tactiles, où
 * l'utilisateur touche le champ lui-même quand il veut filtrer.
 */
export interface PointerCapabilities {
  /** `(pointer: coarse)` — le pointeur PRINCIPAL est un doigt. */
  coarsePointer: boolean;

  /** `(any-pointer: fine)` — un pointeur fin existe (souris, trackpad, stylet). */
  finePointer: boolean;
}

export function shouldAutoFocusCommandPalette(capabilities: PointerCapabilities): boolean {
  return !capabilities.coarsePointer || capabilities.finePointer;
}

export function readPointerCapabilities(): PointerCapabilities {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return { coarsePointer: false, finePointer: true };
  }

  return {
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    finePointer: window.matchMedia('(any-pointer: fine)').matches,
  };
}
