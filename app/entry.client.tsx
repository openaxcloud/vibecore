import { startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';

import { chargerLesCataloguesDuDocument } from './lib/i18n/catalogues-client';

/*
 * RR7's root `Layout` renders the entire <html> document, so the client must
 * hydrate `document` — not a `#root` <div> (the remix-island-era target). Using
 * the div made React try to nest <html> inside it → validateDOMNesting +
 * hydration mismatch (#418) → full client-render fallback (#423).
 */
function hydrater() {
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
 * Si le chargement échoue, on hydrate quand même : une page dégradée mais
 * interactive vaut mieux qu'une page morte. L'erreur est consignée, pas
 * avalée.
 */
chargerLesCataloguesDuDocument(document.documentElement.lang).then(hydrater, (erreur: unknown) => {
  console.error('catalogue i18n non chargé avant hydratation', erreur);
  hydrater();
});
