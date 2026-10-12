# A-37 — reprise des six échecs de galerie, prérequis absents

## État revalidé avant travail

Travail exclusivement dans `/workspace/vibecore-offline-20261012`, depuis
`fa8ef74572886eebeceb0dd5422cbd9adf877f8b`, arbre initial propre.
Branche de ce lot : `audit/a37-gallery-prerequisites-20261012`.
Les commits `643b320e7`, `5aceeb05e`, `7de14a8f2` et `fa8ef7457`, les deux
corrections d'outillage et leurs journaux validés sont toujours présents.

Nouvelle lecture des manifests : **324 dépendances directes du workspace
conformes au lockfile**, zéro écart. TypeScript 5.8.3, types Node 25.6.0,
Vite 5.4.21 ; Vite et son plugin React partagent toujours le même chemin réel.
[Inventaire du graphe racine](mesures/2026-10-12-galerie-graphe-racine.json).
Cela valide la disponibilité du graphe du dépôt, pas celui des applications
de galerie qui déclarent d'autres versions.

Les **six hashes d'instantanés sont identiques** aux preuves précédentes.
Les diagnostics archivés s'appliquent donc aux mêmes fichiers. Ils ne sont
pas présentés comme une compilation actuelle : les anciens totaux 9/15 et
11/13 restent des résultats historiques sous dépendances de remplacement.

## Verdict par gabarit

| Gabarit | Échec historique et attribution | Blocage actuel |
| --- | --- | --- |
| `vendor-risk-review` | TS2307 SQL.js, TS7016 Express et TS7006 consécutifs ; modules déclarés, absents du graphe utilisé | SQL.js et types SQL.js/Express absents ; versions frontend requises absentes |
| `field-service-inspector` | TS6053 sur `expo/tsconfig.base` ; TS5095 non attribuable au gabarit sans sa configuration héritée | Expo et sa chaîne React Native absents |
| `qbr-generator` | Types Express absents ; TS2769 oppose les deux contextes Vite de l'ancien graphe | Types Express/Node, tsx et versions frontend requises absents |
| `warehouse-layout-planner` | Typecheck et build arrêtés sur TS2307 `three` | Three.js et ses types absents, versions frontend requises absentes |
| `storefront` | SQL.js/Stripe/Stripe JS/types Express absents ; le build ne résout pas `@stripe/stripe-js/pure` | Dépendances SQL/Stripe/types et versions frontend requises absentes |
| `next-dashboard` | Next absent ; diagnostics CSS et `process` non attribuables sans ses déclarations réelles | Next et versions React/types requises absents |

**Aucun défaut intrinsèque de compilation n'est établi** pour ces six
gabarits. Aucune omission de dépendance déclarée n'est démontrée. Le fait
qu'un type implicite apparaisse après perte du module qui devait l'inférer
ne justifie pas un cast ou une modification des sources.

## Liste précise des versions absentes de la copie

Socle commun absent des quatre gabarits Vite (`vendor-risk-review`,
`qbr-generator`, `warehouse-layout-planner`, `storefront`) :
`react@19.2.7`, `react-dom@19.2.7`, `@types/react@19.2.17`,
`@types/react-dom@19.2.3`, `@vitejs/plugin-react@6.0.3`, `vite@8.1.4`.

Compléments absents :

- **vendor-risk-review** : `sql.js@^1.13.0`, `@types/sql.js@^1.4.9`,
  `@types/express@^5.0.0`.
- **qbr-generator** : `@types/express@5.0.6`, `@types/node@24.10.1`,
  `tsx@4.23.1`.
- **warehouse-layout-planner** : `three@0.185.1`, `@types/three@0.185.1`.
- **storefront** : `@stripe/stripe-js@7.6.0`, `stripe@18.5.0`,
  `sql.js@1.13.0`, `@types/sql.js@1.4.9`, `@types/express@4.17.23`,
  `@types/node@24.3.0`, `tsx@4.20.6`.
- **next-dashboard** : `next@16.2.10` et les quatre versions React/types
  du socle commun ci-dessus ; Vite n'est pas requis par ce gabarit.
- **field-service-inspector** : `@expo/metro-runtime@~6.1.2`,
  `@react-native-async-storage/async-storage@2.2.0`, `expo@~54.0.12`,
  `expo-camera@~17.0.8`, `react@19.1.0`, `react-dom@19.1.0`,
  `react-native@0.81.5`, `react-native-svg@15.12.1`,
  `react-native-web@^0.21.0`, `@types/react@~19.1.10`.

Les compilateurs demandés sont présents : TypeScript 7.0.2 pour les quatre
gabarits Vite, 6.0.3 pour Next, 5.9.3 compatible avec `~5.9.2` pour Expo.
Express 5.2.1 est aussi présent et satisfait Vendor/QBR ; Express 4.21.2
reste la version déclarée par Storefront. Les types Node 24.13.3 présents
satisfont Vendor et correspondent à Next, pas aux versions fixes QBR/Storefront.
La présence de Vite 8.0.10 ne satisfait pas la version fixe 8.1.4.

[Inventaire complet par dépendance](mesures/2026-10-12-galerie-prerequis.json) :
version demandée, manifests physiquement présents dans `node_modules/.pnpm`,
résolution racine, compatibilité de version, configurations et hashes.
« Absent » signifie ici absent des paquets décompactés de cette copie ;
aucune recherche ou extraction d'un autre cache n'a été faite. Une version
présente ne certifie pas à elle seule la cohérence de tous ses peers.

## Méthode et limites des preuves

Inventaire en lecture seule via `materializeGalleryDemoApp`, lecture des
`package.json` existants et comparaison des plages avec le semver 7.7.4 local.
Node utilisé explicitement :
`/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node`,
version 24.19.0. Chargeur appelé par chemin absolu :
`/workspace/vibecore-offline-20261012/node_modules/tsx/dist/cli.mjs`,
lien préalablement vérifié vers tsx 4.21.0.
Le processus d'inventaire a rendu le code 0, sa sortie JSON est archivée,
stderr était vide. Aucun compilateur, bundler ou gestionnaire de paquets
n'a été lancé pour les gabarits ; aucun lien n'a été réécrit.

La revue indépendante `review_a37` a lu les six sources, configurations et
diagnostics ; elle confirme l'absence de défaut intrinsèque prouvé et la
classification ci-dessus, sans compilation ni modification.

Les builds `vite build` de Vendor/QBR/Storefront ne contrôlent pas le typage
backend. Les tsconfig de Vendor/Storefront/Warehouse excluent `vite.config.ts`,
contrairement à QBR. Un futur succès de ces seuls builds ne suffirait donc pas
à certifier toutes les sources et configurations des projets.

**Arrêt avant compilation pour prérequis manquants.** Aucun correctif de
gabarit, aucun test rouge/vert artificiel, aucune nouvelle certification de
compilation. Les validations globales et 72 tests du lot précédent restent
leurs preuves historiques ; ils ne sont pas relancés pour ce lot documentaire.
Il faut disposer des graphes propres aux gabarits avant de poursuivre les
typechecks/builds réels. Aucun téléchargement, installation, appel IA, API
GitHub, runtime distant, production, dépense ou push. **A-37 reste ouvert.**
