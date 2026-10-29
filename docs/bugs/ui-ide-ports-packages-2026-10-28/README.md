# Ports et Packages — état fonctionnel et accessible

`browser-before.json` : quatre observations de la vraie route IDE compilée sur le serveur partagé18999, FR/EN,1280×900. GET des panneaux interceptés dans chaque contexte avec visibilité vide ou gestionnaire npm. Clic pnpm local uniquement. Quatre tentatives automatiques POST runtime/boot ont été bloquées503 ; huit requêtes de polices externes bloquées. Zéro erreur JavaScript. Aucun projet, paquet ou port réellement modifié. Les navigateurs ont été fermés ; serveur et fixture partagés conservés.

Les captures originales et le harness sont conservés dans `/workspace/ui-ide-four-panels-audit` ; aucune capture ne prouve la correction compilée après modification.

`ports-packages-accessibility.spec.tsx` extrait par AST les deux fonctions JSX réelles et leurs parseurs de BaseChat, utilise React et les catalogues FR/EN réels. Les primitives visuelles et le statut workspace sont des seams de test ; ce n’est pas une route complète. Six cas Ports couvrent public/private/absence en deux langues ; deux cas Packages vérifient les quatre états accessibles avant/après sélection et l’absence de soumission.

`unit-before.txt` : trois échecs et cinq succès. `unit-after.txt` : huit succès. La proposition conserve les libellés de badge existants et change seulement la valeur fonctionnelle de repli et aria-pressed. Aucune assertion affaiblie. Build, typage et recette compilée finale relèvent du lot commun ; aucune certification responsive globale, lecteur d’écran réel ou production.

## Recette après build assemblé4537

[Reçu](after-assembled/receipt.json) : quatre contextes de route complète locale, Chromium1280×900, FR/EN, thème clair observé. Ports visibilité absente : badge traduit préservé, bouton Rendre privé/Make private et champ caché private. Packages : état initial npm sélectionné, clic pnpm puis états false/true/false/false. Aucun formulaire soumis. Les deux surfaces mesurées ne débordent pas horizontalement de leur propre boîte. Aucune erreur JavaScript.

Quatre POST automatiques runtime/boot bloqués503 ; huit GET de polices externes bloqués. Les messages runtime/mémoire indisponibles visibles hors périmètre reflètent le transport synthétique limité, pas une validation fonctionnelle de ces services. Les quatre captures sont conservées ; Ports FR et Packages FR inspectées visuellement. Aucun test mobile390 supplémentaire, thème sombre, lecteur d’écran ni API réelle dans cette reprise. Le navigateur a été fermé ; serveur18999/fixture8499 partagés préservés. Empreintes source/bundle dans source.json ; aucune modification produit pendant la recette.
