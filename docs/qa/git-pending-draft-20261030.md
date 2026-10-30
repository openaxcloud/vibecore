# Saisie pendant une mutation de l'origine Git — 30 octobre 2026

Ce lot inclut le correctif de génération de #858 et ajoute la conservation du
brouillon saisi pendant une mutation. Il vise une seule livraison coordonnée ;
la branche de #858 est laissée intacte pendant ses contrôles.

## Preuve et portée

Avec les vrais GitTab et Settings, une sauvegarde retient son POST ; l'utilisateur
modifie de nouveau URL et branche ; la réponse 200 déclenche un GET reflétant
l'URL effectivement envoyée. Avant correction, l'effet de synchronisation écrase
la nouvelle URL. Le retrait de l'origine l'efface également. Un seul POST part,
vers la cible attendue : perte de brouillon locale, pas perte serveur démontrée.

La révision du brouillon est rattachée à la génération projet/workspace. Le succès
acquitte seulement la révision envoyée. Les métadonnées rafraîchissent les champs
intacts, sans écraser une édition ultérieure ; le changement de contexte remet
toujours les champs à zéro. Pas de changement backend ou de permission.

## Tests réellement exécutés

- Composants : trois cas rouges et trois contrôles verts avant correction ; les
  six passent ensuite. La suite Git complète passe : 158 tests / 25 fichiers,
  aucun ignoré. Typecheck web, lint, diff-check et 16 tests d'inventaire passent.
- Revue indépendante favorable du blob produit
  `b38050584dedac36aabd518235c6c02292217cad` ; 22 tests de revue recouvrent la suite
  précédente, sans être additionnés.
- Navigateur : quatre rouges sur le blob #858 `9fb4a8c118`, sauvegarde/retrait
  aux largeurs 320/1440. La branche après l'assertion URL rouge n'est pas évaluée.
  Sur le candidat, les quatre cas passent directement : 4,1/3,0/4,5/4,2 s ;
  nouvelle URL et nouvelle branche conservées, GET de rafraîchissement observé,
  un POST contrôlé par cas, zéro autre mutation bloquée. Aucun retry ni skip.
- Même recette Playwright, délais et assertions avant/après, hash SHA256
  `3e29433522d5555d2ce2085bc550bc88029da5d05bcb1dc3c6cbf599a22221c9`.
- Client et SSR construits avec succès, sans rebuild redondant par la recette.
  SSR SHA256 `fcddc96a1e2b45f3881dc6db28111924ee4b2052ccd6017d6261820772cde64e`.

[Reçu navigateur compact](git-pending-draft-20261030.json). Les preuves locales
complètes et captures synthétiques sont dans `/workspace/git-pending-browser-20261030`.
Le serveur précédent a été arrêté et son port vérifié fermé avant le démarrage
du candidat. Aucun incident de serveur périmé sur ce lot. Les quatre ports de
recette sont fermés après nettoyage.

## Limites

API/PostgreSQL réels exclusivement locaux pour comptes et projets synthétiques ;
GET/POST Git interceptés. Chromium système 154.0.8037.57, pas navigateur CI ou
Safari matériel. Aucun OAuth, Git fournisseur, DNS, publication cliente ou test
de production authentifiée. Les quatre scénarios ne couvrent pas tous les
ordonnancements possibles. La cause historique B→A #834 reste indéterminée.
Les autres preuves de #858 restent dans
[le compte rendu navigation](project-navigation-identity-20261030.md).
