---
id: BUG-PANEL-CACHE-BUSY-HANDOFF-20261111
section: "Chargement des panneaux de l'IDE, 11 novembre 2026"
---

# Le chargement du panneau doit suivre son contenu commité, pas le cache partagé

## Bug

Un cache rempli après le rendu froid supprime le chargement et son Retry lent. Une éviction après rendu rend le contenu commité occupé, puis son échec peut l’effacer.

## Constat sur main

Dans `ProjectIdeApiServicePanel`, le rendu initialise le contenu depuis le cache. L'effet initial relit ensuite
le cache partagé pour décider si la requête est silencieuse. Un autre consommateur peut remplir ou évincer
cette entrée entre les deux étapes, sans modifier le contenu réellement affiché par cette instance.

Sur la base main `1f617129d37495a36289b75c8280163c8427663a`, `busy` est initialisé à `false`. Si le cache se remplit
après un rendu froid, le chargement reste silencieux alors que cette instance n'a pas de contenu : le panneau
non-database peut afficher son consommateur vide à la place du chargement, et le Retry de chargement lent
n'apparaît pas. Inversement, si le cache est évincé après un rendu déjà initialisé, le chargement devient
occupant sans nécessité et son échec efface le contenu que l'instance avait pourtant commité.

Le correctif choisit le mode silencieux d'après le contenu effectivement commité par l'instance, ou son payload
SSR entrant. Il conserve l'initialisation `busy=false` de main, les délais, les retries, les requêtes partagées
et le verrouillage des mutations. Aucun autre comportement de la branche expérimentale n'est importé.

## Différence avec la branche expérimentale et le signal CI

La branche expérimentale initialise déjà `busy` depuis le cache au rendu. Le même désaccord peut alors laisser
`busy=true` définitivement après une réponse. Cette initialisation ne figure pas dans main et n'est pas ajoutée
par ce port. La régression validée ici concerne le chargement et la conservation du contenu de main, pas un
blocage permanent de busy qui aurait été observé sur cette version.

Le premier essai du run E2E [43101204189](https://github.com/openaxcloud/vibecore/actions/runs/43101204189) a expiré
avec `Run full scan` désactivé, puis son retry a réussi. La trace conservée appartient au retry. **La causalité
de cet échec CI reste non établie**. Aucun changement d'horloge, d'assertion ou de retry E2E n'est inclus.

## 📤 Dispatché

Port ciblé préparé et vérifié le 12 novembre 2026 sur le contenu exact de main après PR896.

## 💻 Codé

Correctif local uniquement, non publié à la rédaction de cette fiche.

## ✅ Testé live

Non validé. Pas de recette applicative ou production.

## Vérification locale et limites

La suite exécute le vrai composant de main extrait par AST, son vrai cache, son coordinateur et les primitives
UI réellement présentes. Le remplissage ou l'éviction sont imposés par un layout effect avant les effets
passifs, sans sommeil arbitraire ni remplacement des hooks. Les tests couvrent succès, erreur HTTP, enveloppe
erreur, Retry, consommateurs doublons, démontage, StrictMode, contenu ancien, remplacement latest-wins et
navigation keyée entre projets, panneaux et clés workspace. Un payload initial null, une charge utile acquise après montage puis évincée et un contenu effacé après un Retry échoué sont également vérifiés. Les tests préexistants restent inchangés.

Les contre-épreuves restaurent seulement le composant original de main sous les nouveaux tests. Elles ne
substituent pas le composant expérimental. Le générateur officiel produit l'index à partir des fiches exactes
de main, sans modifier aucune fiche préexistante. La vérification workspace porte sur la clé et le paramètre
du wrapper générique, pas sur une session Deployments complète.

Lint avec le preset complet du dépôt sur les fichiers touchés, format et TypeScript strict ciblé sont vérifiés.
Le build et le typecheck globaux, les contrôles requis du futur commit, le replay E2E et la recette navigateur
authentifiée web/tablette/mobile restent nécessaires. Aucune validation live n'est revendiquée.
