/**
 * Détection du pointeur GROSSIER (tactile), et ce qu'elle règle.
 *
 * Déplacée ici depuis `app/components/sidebar/HistoryItem.tsx` le 2026-09-01.
 * Elle y était correcte et bien documentée, mais **rangée dans un fichier de
 * composant** : personne ne va chercher un hook dans un composant de barre
 * latérale. Résultat mesuré ce jour-là : DEUX consommateurs en tout, alors que
 * cinq surfaces au moins en avaient besoin. Le défaut n'était pas la primitive,
 * c'était son adresse.
 *
 * ⚠️ **Penser au clavier ne couvre pas le tactile.** `focus-visible:` rend une
 * commande atteignable au clavier, et ne fait RIEN au doigt : sur un pointeur
 * grossier il n'y a pas de survol, et le focus n'arrive qu'APRÈS le toucher —
 * trop tard pour révéler ce qu'il fallait voir avant de toucher. Les deux se
 * traitent séparément. Constaté sur `QueryHistoryControl`, dont le bouton
 * « supprimer » portait un `focus-visible:` soigné et restait invisible au doigt.
 */
import { useEffect, useState } from 'react';

/**
 * Media query used to detect touch / pen primary-input devices.
 *
 * `(pointer: coarse)` matches phones, tablets and other devices whose primary
 * pointing mechanism has limited accuracy and — crucially — no hover state.
 * Hover-only affordances (e.g. `group-hover:opacity-100`) are unreachable on
 * such devices.
 */
export const COARSE_POINTER_QUERY = '(pointer: coarse)';

/**
 * Resolve whether the current device uses a coarse (touch) primary pointer.
 *
 * Returns `false` during SSR or when `matchMedia` is unavailable so that the
 * default (hover-capable) rendering is used until the client hydrates.
 */
export function resolveCoarsePointer(win: Pick<typeof globalThis, 'matchMedia'> | undefined): boolean {
  if (!win || typeof win.matchMedia !== 'function') {
    return false;
  }

  try {
    return win.matchMedia(COARSE_POINTER_QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * React hook returning `true` when the device's primary pointer is coarse
 * (touch), updating live if the capability changes (e.g. external mouse
 * attached/detached, browser devtools device emulation).
 */
export function useCoarsePointer(): boolean {
  const [isCoarse, setIsCoarse] = useState<boolean>(() =>
    resolveCoarsePointer(typeof window === 'undefined' ? undefined : window),
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mql = window.matchMedia(COARSE_POINTER_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsCoarse(event.matches);

    /*
     * Sync once on mount in case the value changed between the initial render
     * and the effect running.
     */
    setIsCoarse(mql.matches);
    mql.addEventListener('change', onChange);

    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isCoarse;
}
