import { startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';

/*
 * RR7's root `Layout` renders the entire <html> document, so the client must
 * hydrate `document` — not a `#root` <div> (the remix-island-era target). Using
 * the div made React try to nest <html> inside it → validateDOMNesting +
 * hydration mismatch (#418) → full client-render fallback (#423).
 */
startTransition(() => {
  hydrateRoot(document, <HydratedRouter />);
});
