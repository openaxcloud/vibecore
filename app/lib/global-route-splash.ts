export type RouteNavigationState = 'idle' | 'loading' | 'submitting';

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.replace(/\/+$/u, '') || '/';
  }

  return pathname;
}

/**
 * BUG-IDE-PANEL-SPLASH — ouvrir/basculer un panneau de service dans l'IDE
 * (rail gauche, palette « + », onglets mobiles) change uniquement `?panel=`
 * via `setSearchParams`. React Router traite ça comme une navigation : le
 * `navigation.state` passe à `loading` le temps que les loaders revalident,
 * alors que le document et la page rendue ne changent PAS. Recouvrir cette UI
 * déjà rendue d'un splash plein écran donnait l'impression d'un rechargement
 * complet de l'IDE (panneau agent, onglets et library masqués).
 *
 * Une navigation « même pathname, seul le search change » n'est donc jamais
 * une vraie navigation de page : chaque panneau possède déjà son squelette
 * local.
 */
export function isSamePathnameSearchNavigation({
  currentPathname,
  targetPathname,
}: {
  currentPathname: string;
  targetPathname?: string;
}): boolean {
  if (!targetPathname) {
    return false;
  }

  return normalizePathname(targetPathname) === normalizePathname(currentPathname);
}

/**
 * Le splash de marque plein écran n'est légitime que pour une vraie
 * navigation inter-pages (pathname différent) ou le boot initial. Toute
 * revalidation ou navigation search-param sur la page courante garde l'UI
 * rendue visible — seule la barre de progression fine reste.
 */
export function shouldShowGlobalRouteSplash({
  navigationState,
  currentPathname,
  targetPathname,
  localSkeletonVisible = false,
}: {
  navigationState: RouteNavigationState;
  currentPathname: string;
  targetPathname?: string;
  localSkeletonVisible?: boolean;
}): boolean {
  if (navigationState === 'idle') {
    return false;
  }

  if (localSkeletonVisible) {
    return false;
  }

  return !isSamePathnameSearchNavigation({ currentPathname, targetPathname });
}
