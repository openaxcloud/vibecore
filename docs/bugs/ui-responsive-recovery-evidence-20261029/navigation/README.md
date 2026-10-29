# Navigation ciblée après #852 — 29 octobre 2026

Base compilée `fe790924209dbbd79d11eeb73b82cb9c315fe401`, serveur 21999 fourni et possédé par root. Aucun fichier produit/dépôt modifié, aucune installation, aucune trace 834 consultée.

## Résultats acquis

| Recette | Formats CSS | Résultat |
| --- | --- | --- |
| `search-handoff/receipt.json` | 390×900, 768×900 | 2/2 : saisie alpha et sélection1–4 avant libération de l’état IDE/archive ; ancien input réellement détaché, focus/sélection conservés. Navigation Agent attendue, Retour Search conserve alpha sans voler le focus, Avancer Agent. |
| `interrupted-gate-proven/receipt.json` | 390×900, 768×900 | 2/2 : Settings ouvert, quatre GET réellement suspendus et zéro réponse ; passage Files puis libération des quatre réponses. README ouvert au clavier Enter ; deux cycles Retour Files / Avancer Editor. URL et surface finale Editor concordent, Settings n’est pas visible. |

Zéro erreur JavaScript dans ces quatre recettes. Les quatre GET Settings constituent une observation de transport (montages possibles), sans cause de duplication ni incident backend établi. Aucune commande ou sauvegarde réelle : boot/workspace/search sont des réponses synthétiques interceptées dans le navigateur, toutes autres mutations et requêtes externes bloquées, WebSockets fermées.

## Précédents essais conservés

- `interrupted/` : 2 essais arrêtés par un sélecteur de harnais périmé `feature-settings`, palette bien visible.
- `interrupted-selector-fixed/` : 1 essai arrêté par le rôle treeitem erroné ; README était visible. Le locator final reprend `.bolt-file-tree-node` et le nom exact des tests existants.
- `interrupted-final/` : 2 parcours verts, mais compteur de requêtes absent ; ne suffit pas seul à prouver la suspension réseau. `interrupted-gate-proven/` ajoute cette preuve sans changer les assertions de navigation.

## Limites

Chromium local, FR, thème clair, fixtures isolées. Pas Safari/WebKit, appareil physique, clavier virtuel, production ni backend/runtime réel. Pas de certification du focus/caret de l’éditeur après Retour : seule ouverture clavier, visibilité et concordance URL/surface sont exercées ici. Pas de certification complète Settings, des sauvegardes, du remplacement interprojet ou du flaky CI Search/834. Aucun défaut produit nouveau reproduit dans ce périmètre ; aucun correctif proposé. Menus réservés non audités ; Aster/Git/IA non manipulés. Tous les navigateurs de ces scripts sont fermés ; aucun serveur partagé arrêté.
