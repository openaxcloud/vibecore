# Revue indépendante — portail du menu Agent

GO limité sur ComposerToolsPortal SHA256 2e94cf7ec9ba11c329063586aa1ac56356da6291a229ddc0ee472b8aadc3580a et intégration ChatBox lue. Aucun changement produit effectué par le reviewer.

Le conteneur DOM unique conserve le sous-arbre React lors du passage mobile/desktop. Le focus initial clavier est demandé après append et disponibilité du menu, une fois par ouverture. Le focus interne est restauré lors du déplacement du conteneur. Les listeners/observer/RAF sont nettoyés. Le clamp vertical borne la hauteur disponible et la position lorsque l’ancre est hors écran. Aucun changement de contrat backend.

Preuves propriétaires relues : interactions.json (WebSearch réel, brouillon/focus/même nœud, resize, Escape et clic extérieur), palette.json (ColorSchemeDialog réel, couleur/focus/même nœud sur trois redimensionnements, Escape ferme le dialogue sans fermer le menu), zoom.json (18 observations dont9 au zoom natif200%,108 contrôles atteints). Rejeux finaux annoncés exit0, logs silencieux conservés. Aucun rerun redondant.

Limites : harness composants réels et layout synthétique, pas encore build intégré ni production. Les contrôles desktop mesurés34px ne prouvent pas un objectif44px et restent distincts du correctif de troncature. Le GO ne couvre pas le delta GlobalTooltip encore en coordination ni une certification générale d’accessibilité.
