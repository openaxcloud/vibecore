# Fermeture d’onglet déplacée par le scroll snap — diagnostic local

## Observation et essais conservés

Sur le build local de `69592374`, la fermeture du Webview déplacé échoue après désépinglage par le menu visible. Le clic natif est émis, mais le bouton n’en est pas la cible : le début du geste atteint la bande d’onglets, sa fin atteint le bouton de fermeture, puis le clic est attribué à la bande. Dans l’essai instrumenté sans défilement doux, `scrollLeft` passe de **137 à 172 px** entre les événements. Le même onglet reste présent ; l’assertion de suppression échoue.

| Reçu | Variante de diagnostic | Verdict |
| --- | --- | --- |
| `initial-red.json` | Produit compilé, pas de modification CSS de diagnostic | 0/1, échec de fermeture |
| `events-red.json` | Observation des événements natifs | 0/1, échec de fermeture |
| `no-smooth-red.json` | CSS injecté : `scroll-behavior: auto` seul | 0/1 ; down sur tablist, up sur fermeture, clic sur tablist ; scroll 137→172 |
| `no-smooth-no-snap-green.json` | CSS injecté : auto et `scroll-snap-type: none` | 1/1 ; fermeture et Retour exercés |
| `no-snap-only-green.json` | CSS injecté : `scroll-snap-type: none` seul | 1/1 ; comportement smooth conservé, fermeture et Retour exercés |

Chaque passage a zéro retry et zéro skip. Les reçus conservent le temps du cas, le temps global du rapport, l’empreinte du rapport original, les assertions et les événements. Dans le dernier essai, down/up/click atteignent tous le bouton de fermeture avec `scrollLeft=137` inchangé ; l’onglet disparaît et l’URL passe à `deployments`. Le test poursuit ensuite le Retour vers Webview.

## Portée de la conclusion

Ces essais A/B isolent le scroll snap comme facteur nécessaire au défaut reproduit : désactiver smooth seul ne suffit pas ; désactiver snap seul suffit dans l’essai isolé. Les verts sont des **diagnostics avec CSS injecté dans la page**, pas une validation du futur build produit.

Le correctif produit est limité aux bandes desktop : `@media (min-width: 1024px) { .bolt-project-tabs { scroll-snap-type: none; } }`. Il conserve le défilement doux et les comportements mobiles. Au terme des diagnostics A/B, la compilation et la recette restaient à effectuer ; leur résultat local ultérieur est consigné ci-dessous. Aucune CI ni production verte n’est revendiquée ici. Aucun clic forcé ni nouvelle attente fixe ne remplace le geste natif. L’assertion de suppression reste inchangée.

## Confidentialité

Aucune trace réseau ZIP ni rapport brut n’est publié. Les JSON sont des extractions sur liste blanche. Les cibles d’événements ont été réduites à leur tag/classe/rôle, sans HTML enfant ni texte ; les URL à leur chemin et panneau. Les identifiants techniques restants désignent les projets et onglets synthétiques locaux. Les erreurs console génériques du banc sont conservées sans attribution causale au clic.

## Recette du build corrigé et captures

Le build local du commit `d0ef212609d3af7f652cc216427ecb7a55570723` passe les **7 cas directement, zéro retry, zéro omission**, en 63,902 s pour le rapport complet. Le reçu expurgé `compiled-local-green.json` conserve les verdicts et l’empreinte du rapport original. Le cas fermeture puis Retour passe en 5,901 s. Ce résultat complète les diagnostics A/B ci-dessus ; la suite générale reste suivie séparément et aucune livraison en production n’est attestée ici.

`before-close-click.jpeg` est une frame avant le clic du passage rouge instrumenté, extraite du screencast local (800×450, viewport 1280×720). Les événements des reçus JSON établissent la perte du clic ; cette image seule ne l’établit pas. `after-closed-tab-back.png` montre le Webview sélectionné après fermeture puis Retour sur le build corrigé, et non l’état intermédiaire fermé. Les deux captures ont été inspectées ; `images.json` donne leurs empreintes et leur provenance. Seules les images ont été extraites de la trace, aucun contenu réseau ni ZIP n’est publié.
