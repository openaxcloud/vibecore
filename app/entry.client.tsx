import { startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';

import {
  cablerLeChargeurDeSecours,
  chargerLesCataloguesDuDocument,
  prechargerLeReste,
} from './lib/i18n/catalogues-client';
import { startCatalogueHydration } from './lib/i18n/startup-catalogues';
import { estCheminPublic } from './lib/i18n/surfaces';

/*
 * RR7's root `Layout` renders the entire <html> document, so the client must
 * hydrate `document` — not a `#root` <div> (the remix-island-era target). Using
 * the div made React try to nest <html> inside it → validateDOMNesting +
 * hydration mismatch (#418) → full client-render fallback (#423).
 */
function hydrater() {
  (globalThis as any).__vibecoreStartupMark?.('hydrate-requested');
  startTransition(() => {
    hydrateRoot(document, <HydratedRouter />);
  });
}

/*
 * BUG-PERF-I18N-RACINE-001 : le catalogue de la langue du document arrive par
 * un JSON préchargé depuis <head>, plus par le graphe statique de root.tsx.
 * L'hydratation l'ATTEND — le serveur a rendu les libellés traduits, et un
 * client qui hydraterait sans eux les remplacerait par « Unavailable ».
 *
 * En cas d'échec, garder les libellés SSR et proposer une reprise explicite.
 * Hydrater sans catalogue remplaçait les libellés par « Unavailable » et
 * déclenchait des erreurs d'hydratation. Le chargement est borné côté réseau.
 */
/*
 * BUG-PERF-I18N-SURFACE-001 : le document ne charge que les tranches dont sa
 * route a besoin. `surfacesRequises` est fermée par défaut — /ide, /chat,
 * /projects et toute route inconnue prennent les DEUX tranches AVANT
 * l'hydratation, donc l'IDE n'ouvre jamais un panneau sur des clés brutes.
 * Seuls les chemins publics listés obtiennent le régime allégé, et ils vont
 * chercher le reste dès que le navigateur est au repos.
 */
(globalThis as any).__vibecoreStartupMark?.('entry-module-evaluated');

const lang = document.documentElement.lang;

cablerLeChargeurDeSecours();

startCatalogueHydration(() => chargerLesCataloguesDuDocument(lang, window.location.pathname), demarrer);

function demarrer() {
  (globalThis as any).__vibecoreStartupMark?.('catalogues-ready');
  hydrater();

  if (estCheminPublic(window.location.pathname)) {
    prechargerLeReste(lang);
  }
}
