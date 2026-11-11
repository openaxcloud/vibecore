---
id: BUG-PANEL-CACHE-BUSY-HANDOFF-20261111
---

# Un panneau froid reste occupé après le remplissage du cache partagé

## Constat

`ProjectIdeApiServicePanel` initialise `busy` depuis le cache lu pendant son rendu. Son effet initial relisait ensuite
le cache partagé pour décider si le chargement était silencieux. Si un autre consommateur remplit le cache entre
ces deux étapes, l'instance froide conserve `busy=true`, même après sa réponse réussie, car le `finally` d'un
chargement silencieux ne modifie pas cet état. Une réponse en erreur laisse également le bouton Retry désactivé.

La contre-épreuve exécute le vrai composant extrait par AST, le cache et la coordination des requêtes. Un layout
effect impose cette interférence avant les effets passifs. Trois cas échouent sur la source
`da4bab705e1f5ddc3792c6d0d9f7ee19237d2613` : réponse réussie, erreur HTTP 400 et deux consommateurs dont un démonté.
Le correctif choisit le mode silencieux depuis le contenu effectivement commité par l'instance, ou le payload SSR
qu'elle reçoit. Il ne modifie ni les délais, ni les retries, ni le verrouillage des mutations concurrentes.

## Lien avec le signal CI

Le run E2E [43101204189](https://github.com/openaxcloud/vibecore/actions/runs/43101204189) contient un premier essai
expiré sur `security scan preserves timeout across history hydration`, puis un retry réussi. Le snapshot du premier
essai montre `Run full scan` désactivé, des données affichées et aucun scan actif. Ces symptômes sont compatibles
avec le défaut reproduit, mais **la causalité de cet échec CI reste non établie** : l'artefact conserve uniquement
la trace du retry réussi. La première trace réseau et le déroulement des effets manquent. Aucun changement de
l'horloge de test n'est présenté comme une correction prouvée.

## 📤 Dispatché

Diagnostic et correctif local préparés le 11 novembre 2026, revus indépendamment sur la base 8335f9ba.

## 💻 Codé

Correctif local uniquement, non publié à la rédaction de cette fiche.

## ✅ Testé live

Non validé. Pas de recette applicative ou production.

## Vérification locale et limites

Les 71 tests ciblés passent : récupération de panneaux sur HTTP loopback, quatorze contrôles du cache concurrent,
session de scan, timeout/annulation, provider, cache et requêtes partagées. Les contrôles couvrent aussi le
changement de projet ou de panneau avec la clé de montage utilisée par l'application, les réponses tardives et
un contenu réellement initialisé depuis un cache ancien. La revue indépendante sur la base
`8335f9ba0f7632fcaca9a630cac2b862df3d721e` ajoute huit cas : StrictMode avec consommateurs SSR/froid, Retry après
HTTP 400 ou enveloppe erreur HTTP 200, éviction après rendu, transport obsolète ignorant son annulation et
retour entre scopes projet/panneau/workspace. En restaurant uniquement le composant d'origine, huit des
quatorze cas de cache échouent et les six témoins de continuité passent. Les deux versions de base du composant
sont identiques. Les six contrats de l'inventaire passent aussi après génération officielle à 627 fiches, les
626 fiches préexistantes restant strictement identiques. Le premier essai E2E CI n'est pas reproduit dans
l'application complète.

Lint avec le preset du dépôt, format et TypeScript strict ciblé sont vérifiés. Le build complet, le typecheck
global, les contrôles requis du futur commit et la recette navigateur authentifiée restent nécessaires.
