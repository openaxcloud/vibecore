---
id: BUG-PANEL-CACHE-BUSY-HANDOFF-20261111
section: "Chargement des panneaux de l'IDE, 11 novembre 2026"
---

# Le chargement du panneau doit suivre son contenu commité, pas le cache partagé

## Bug

Le cache partagé peut être rempli ou évincé entre le rendu et l'effet initial. Le chargement silencieux doit suivre le contenu réellement commité par l'instance.

## Constat et différences entre branches

`ProjectIdeApiServicePanel` initialise son contenu depuis le cache pendant le rendu. Son effet initial relisait
ensuite le cache partagé pour décider si le chargement était silencieux. Un autre consommateur peut modifier
cette entrée entre les deux étapes sans modifier le contenu réellement affiché par cette instance.

La branche expérimentale initialise `busy` depuis le cache au rendu. Si une autre instance réchauffe le cache
avant l'effet passif, un chargement devenu silencieux à tort peut laisser `busy=true` après sa réponse, car son
`finally` ne modifie pas cet état. Une erreur peut également laisser Retry désactivé. La contre-épreuve sur
`da4bab705e1f5ddc3792c6d0d9f7ee19237d2613` reproduit le défaut avec succès, HTTP400 et deux consommateurs dont un démonté.

Sur main avant PR897, notamment `1f617129d37495a36289b75c8280163c8427663a`, `busy` commence à `false`. Le même
réchauffement masque alors le loader et son Retry lent alors que l'instance est froide. Une éviction après
un rendu contenant déjà des données rend à tort le refresh occupant et son erreur peut effacer le contenu.
Le blocage permanent propre à l'initialisation expérimentale n'est pas revendiqué sur cette version de main.

Le correctif commun décide du mode silencieux depuis le contenu commité par l'instance ou le payload SSR
entrant. Un ref est synchronisé par effet avant l'effet de chargement ; il suit aussi les réponses et les
échecs de Retry qui effacent le contenu. Chaque branche conserve sa propre initialisation de busy. Délais,
retries, requêtes partagées et verrouillage des mutations restent inchangés.

## Lien avec le signal CI

Le premier essai du run E2E [43101204189](https://github.com/openaxcloud/vibecore/actions/runs/43101204189) a expiré
avec `Run full scan` désactivé, des données affichées et aucun scan actif, puis son retry a réussi. La trace
conservée appartient au retry. **La causalité de cet échec CI reste non établie**. Aucun changement d'horloge,
d'assertion ou de retry E2E n'est présenté comme sa correction prouvée.

## 📤 Dispatché

Correction expérimentale revue sur 8335f9ba ; port main séparé après PR896 ; intégration normale de main vers la branche expérimentale préparée après PR897.

## 💻 Codé

Correction expérimentale publiée dans PR893 ; port ciblé PR897 fusionné dans main `746cf2e7`. La résolution vers la branche expérimentale conserve son BaseChat exact et enrichit ses tests.

## ✅ Testé live

Pas de recette applicative ou production revendiquée par cette fiche. Les validations locales et CI ne prouvent pas la cause du premier essai E2E.

## Vérifications et conservation des contrats

Les tests exécutent le vrai composant extrait par AST, ses vrais hooks, cache et coordinateur, et des réponses
différées. Un layout effect impose le remplissage ou l'éviction avant les effets passifs sans sommeil arbitraire.
Les témoins couvrent succès, HTTP400, enveloppe erreur HTTP200, Retry, StrictMode, consommateurs doublons,
démontage, contenu ancien, remplacement latest-wins, transport ignorant l'annulation et navigation keyée entre
projets, panneaux et clés workspace. Ils n'affirment pas une recette Deployments complète.

La fusion vers la branche expérimentale conserve ses tests existants, y compris l'éviction par remise à zéro.
Elle ajoute l'éviction normale par la capacité réelle du cache, sa réponse en erreur, un payload initial null,
le contenu acquis après montage puis évincé et le contenu effacé après un Retry échoué. Aucun test antérieur
n'est supprimé. Le code de BaseChat expérimental n'est pas remplacé par celui de main.

Les contre-épreuves rétablissent la décision depuis le cache partagé ou retirent seulement la synchronisation
du ref. Le générateur officiel reconstruit l'index depuis toutes les fiches expérimentales ; les autres fiches
restent byte-identiques. Le preset lint complet, le format et les types ciblés complètent les tests locaux.
Le build/typecheck globaux, les contrôles du futur commit et la recette navigateur authentifiée restent nécessaires.
