# Panneaux : viewport stable et fermeture par Échap

Base réelle `8197fb55ac6813350d991e4adb70c3a444edd8ad`, arbre identique au build Logs `900f09528` utilisé pour les contre-épreuves. Branche distincte de #768 ; aucune reprise de son menu Window options Preview, aucun breakpoint changé. Delta produit limité à `Workbench.client.tsx` (viewport) et aux handlers des feuilles mobiles dans `BaseChat.tsx`.

## Causes et contre-épreuves

Le viewport partagé était `overflow-hidden`, donc susceptible de défiler lors du focus d’un descendant. Ses vues absolues restent montées, y compris Git avec la liste des fichiers importés. Une petite fixture et un fichier long seul ne reproduisaient pas le déplacement. Après import réel d’un README de 240 lignes et de 60 fichiers, Files → sélection README → Editor (fin du document) → Problems → Shell (focus terminal) → Webview, puis répétition, reproduit : hauteur 637, scrollHeight 2768, scrollTop 89 et vues à y=-41. Le test rouge échoue sur `scrollTop === 0`. Aucun DOM, style ou réponse API n’est modifié pour obtenir ce résultat.

`overflow-clip` empêche ce viewport de devenir un scroller, tout en conservant les vues montées et le défilement interne du fichier/terminal. `min-h-0` borne son comportement de flex item. Les captures Shell avant/après montrent respectivement la barre hors écran et les contrôles sous l’en-tête.

Panels ne ferme pas avec Échap sur son bouton focalisé ; une contre-épreuve séparée montre le même défaut dans la recherche du sélecteur d’onglets. Le raccourci global écoute en capture et consomme Échap, tandis que les handlers de ces feuilles attendaient sa propagation. Leur écoute passe en capture à la même frontière window et rend le focus au déclencheur avec `preventScroll`. Aucun changement au catalogue ou au moteur des raccourcis. La cible de retour est conservée lors d’un passage entre feuilles.

## Recette corrigée

API/PostgreSQL locaux réels, import ZIP réel, Chromium système, application compilée ; aucune réponse API simulée. Ports : web 5230, API 3019, PostgreSQL 55443. Node 24.19.0/pnpm 9.14.4. Configuration exacte jointe. Budget 90 s par cas, un worker, zéro retry ; aucun délai artificiel/clic forcé.

| Périmètre | Résultat |
| --- | --- |
| 390×844 et 1180×757 : Panels et sélecteur d’onglets | 4 succès directs ; ouverture clavier, focus contrôlé, Échap deux fois, retour au déclencheur, fermeture par bouton |
| 1180×757 : Files/Editor/Problems/Shell/Webview | Succès direct ; 3 cycles, scrollTop 0 et vues sous l’en-tête ; bouton Find Shell ouvre/ferme la recherche ; bouton DevTools ouvre/ferme son panneau |
| 390×844 : mêmes transitions | Succès direct lors de la reprise ciblée ; 3 cycles, Find Shell et Ports actionnés par appui tactile, ouverture/fermeture confirmée |
| 1280×900 : desktop | Succès direct ; pas d’en-tête mobile, palette All tools → Webview et DevTools deux fois |

Le premier passage corrigé donne **6 succès / 1 échec**, sans retry/skip. Le rouge téléphone recherchait DevTools desktop, masqué par conception à 390 : c’est une erreur de recette, distincte des rouges produit. La recette choisit désormais le contrôle Ports visible au téléphone et conserve toutes les assertions géométriques. Reprise de ce seul scénario : **1 succès direct en 31,4 s**. Ne pas présenter ces résultats comme un unique run 7/7. Le produit n’a pas changé entre ces deux passages.

Le README sélectionné est retrouvé jusqu’à sa dernière ligne après les passages dans Webview, sans réécriture de contenu. Aucun test n’exécute de commande, effacement de terminal, import sur projet réel ou modification de configuration. Le menu bas mobile reste présent et utilisé. Build complet : succès ; 11 gardes ciblées (index et raccourcis) passent. Hooks normaux typecheck/lint avant commit ; verdict dans la PR. Pas de suite locale exhaustive.

## Provenance et limites

`receipt.json` contient les blobs produit compilés, les compteurs par run et les mesures ; les groupes SHA-256 du manifeste compilé se concatènent. 5 829 empreintes de sources suivies sont comparées sans différence après recette, 2 306 fichiers compilés conservés localement. Les quatre captures ont été inspectées : données exclusivement synthétiques, aucun compte réel, secret ou cookie. Rapports bruts, traces réseau et manifestes complets restent privés.

Preuve locale, pas production/Safari. Shell reste « Connecting to workspace » sur ce banc : les contrôles UI sont exercés, mais ni session distante active ni persistance d’un processus runtime ne sont certifiées. Le test ne prétend pas couvrir toutes les actions ou tous les panneaux. Les transitions naturelles ne sont pas une garantie contre toutes les courses possibles. Revue indépendante et CI de la tête publiée restent nécessaires.

Après cette comparaison, le hook a refusé trois écarts de présentation dans BaseChat (deux lignes vides et un commentaire à convertir en bloc). Ils sont corrigés sans changement d’instruction : `TypeScript.transpileModule` ESNext/ReactJSX avec suppression des commentaires produit un JavaScript octet pour octet identique avant/après. Le reçu distingue donc le blob compilé du blob publié et conserve l’empreinte de cette contre-vérification ; aucun nouveau build ni test navigateur n’est prétendu après cette correction de présentation. Le premier contrôle lexical brut n’était pas adapté au TSX et n’a pas servi de preuve d’équivalence. Les hooks normaux sont rejoués pour le commit final.
