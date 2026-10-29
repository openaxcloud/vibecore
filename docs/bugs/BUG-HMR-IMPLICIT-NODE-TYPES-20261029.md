---
id: BUG-HMR-IMPLICIT-NODE-TYPES-20261029
section: "Agent et messages"
---

# L'injection HMR casse un build TypeScript sans types Node

## 📤 Dispatché

☑ 29/10 — cinq TS2580 dans une recette ; reproduction isolée avec TypeScript et Vite réels.

## 💻 Codé

☐ — correctif sur branche séparée, non fusionné.

## ✅ Testé live

☐ — aucun projet client modifié ni recette production du correctif.

## Cause reproduite

Une configuration `defineConfig` valide compile avec Vite et TypeScript sans
`@types/node`. Après `ensureViteHmrConfig`, le même build échoue : les cinq accès
à `process.env` introduits par le bloc E-Code demandent une déclaration globale
Node absente. La reproduction avec `tsc` réel produit exactement cinq TS2580 aux
positions `7:9`, `12:32`, `13:23`, `14:17` et `14:53`, comme le build de la recette
rapporté le 29 octobre. Les anciens tests fournissaient explicitement les types
Node et ne couvraient pas cette configuration.

## Périmètre du correctif

Lire l'environnement Node global dans le code injecté sans imposer de types
ambiants supplémentaires au projet. Conserver le routage HMR, le port 5173, les
formes de configuration supportées et les paramètres écrits par l'utilisateur.
La mise à niveau vise uniquement les blocs reconnus comme générés par E-Code.
Aucune dépendance ajoutée au projet, aucune installation ni mutation du projet
client, aucun changement de permission ou de politique réseau.

## Limites

Ce correctif ne répare ni le JSX invalide généré dans App.tsx, ni la terminaison
inconnue du flux fournisseur. Les erreurs TypeScript dans du code utilisateur
qui emploie lui-même `process` restent à traiter selon les dépendances de ce
projet ; l'injecteur ne doit pas les dissimuler.

## Validation isolée

60 tests passent : compilation TypeScript sans types Node, chargement des
configurations ESM/CJS, HMR et port effectifs, build Vite réel, migration des
anciens blocs, préservation du binding `process` utilisateur et idempotence.
Revue indépendante favorable, avec 16 tests supplémentaires exécutés par le
relecteur. Aucun appel fournisseur.

Les blocs générés qui ont ensuite été personnalisés ou reformattés ne sont pas
migrés automatiquement : le remplacement exige le texte exact reconnu. Cette
restriction protège le code utilisateur et borne la réparation historique.
