---
id: BUG-IDE-PANEL-RETRY-PENDING-001
section: "Reprise commerciale du 2026-10-18 — stabilité des panneaux IDE"
---

## Bug

**P2 — le bouton Réessayer d'un panneau encore en chargement ne fait rien.**
Sur la base `c4211323345cc8e0688a191337a04af9e3b2fab9`, le wrapper de panneau
affiche ce bouton après sept secondes. Son gestionnaire appelle `loadPanel`,
qui retourne aussitôt lorsque `loadingPanelRef.current` est vrai. Le GET en
cours n'est ni annulé ni remplacé. Fermer puis rouvrir le panneau rejoint la
même promesse partagée encore pendante.

## 📤 Dispatché

Correctif de récupération autorisé par la session parent, isolé du chantier
palette et de l'enquête sur le titre DB absent en CI.

## 💻 Codé

Correctif local sur `codex/panel-retry-recovery-20261018`, base `c42113233`.
Fusion et déploiement non attestés par cette fiche.

`panel-request.ts` conserve `createSingleFlight` et une promesse logique par
couple projet/panneau. Seul un clic explicite Réessayer remplace sa tentative
HTTP et annule le transport précédent. Tous les consommateurs de cette clé
attendent la relève, y compris après remontage ; aucune autre clé n'est
annulée. Le démontage d'un seul consommateur n'annule pas la requête commune.
L'identité de tentative est changée **avant** l'annulation : ni une réponse,
ni un rejet, ni le nettoyage tardif de l'ancienne tentative ne peuvent
résoudre la nouvelle attente ou retirer son entrée. Une annulation arrête
aussi la boucle de réessais et son attente entre essais.

Le chargement ordinaire, le polling, leur partage, le seuil de sept secondes
et les politiques de réessais HTTP gardent leurs valeurs. Aucun délai,
assertion, exemption ou nombre de tentatives E2E n'est modifié. Les mutations
de formulaire ne passent pas dans le transport remplaçable.

## ✅ Testé live

❌ Pas de preuve en production, Safari ou parcours IDE complet pour ce correctif.
La cause de l'échec CI DB3377 reste inconnue ; ce correctif ne la revendique pas.

## Preuve

- Régression sur le wrapper réel extrait par AST, avec hooks React et bouton
  réels, DOM jsdom et serveur HTTP loopback sur port éphémère : avant
  branchement, **deux tests rouges** (aucune relève après clic ; trois appels
  de transport malgré l'annulation pendant le backoff).
- Après correction, le scénario HTTP vérifie deux consommateurs d'une même
  clé, fermeture de la connexion A avant envoi de sa réponse, nouvelle requête
  B, remontage avant réponse B, deux contenus B et cache B ; l'autre clé est
  conservée. Les réponses sont des fixtures explicites, **pas une vraie base**.
  Les dépendances UI/store/localisation hors wrapper sont remplacées ; ce
  test ne prétend pas monter tout `BaseChat` ni le routeur de production.
- Contre-épreuves : retirer l'annulation fait rougir le scénario HTTP ; retirer
  la garde d'identité fait rougir les deux cas où A résout/rejette avant B.
  Les cas A tardif après B et les requêtes d'une autre clé restent vérifiés.
- Tests de non-régression :
  `app/components/chat/panel-retry-recovery.spec.tsx`,
  `app/lib/ide/panel-request.spec.ts`,
  `app/components/chat/panel-single-flight.spec.ts`,
  `app/lib/ide/single-flight.spec.ts`,
  `app/lib/ide/panel-payload-cache.spec.ts`.
- Journaux locaux : `/tmp/vibecore-panel-retry-red.log`,
  `/tmp/vibecore-panel-retry-no-abort-red.log`,
  `/tmp/vibecore-panel-retry-no-fence-red.log`,
  `/tmp/vibecore-panel-retry-green.log`. Un seul worker ; mémoire cgroup
  mesurée avant les contre-épreuves : **4,29 GiB / 16 GiB**.

## Validation locale du candidat

Sur la base `c4211323345cc8e0688a191337a04af9e3b2fab9`, arbre contenant
uniquement le correctif, ses tests et cette fiche :

- **40/40 tests, six fichiers, aucun saut**, dont les 34 tests ci-dessus et les
  six gardes `scripts/index-a-jour.spec.mjs`. Exécution Vitest **3.2.6** sous
  Node **24.19.0**, avec le lien local TypeScript revenu à la version verrouillée
  **5.8.3** ; durée 21,09 s. Journal :
  `/tmp/vibecore-panel-retry-final-tests.log`.
- ESLint : **zéro diagnostic** dans les cinq fichiers TypeScript touchés.
  Journal : `/tmp/vibecore-panel-retry-eslint-final.log`.
- Typecheck produit web : **code 0, zéro diagnostic**, TypeScript verrouillé
  **5.8.3**, commande `node node_modules/typescript/bin/tsc --project
  tsconfig.web.json --noEmit --pretty false`. Configuration du dépôt inchangée,
  dont son `skipLibCheck: true` préexistant. Mémoire avant lancement, après
  nettoyage du build/navigateur de l'autre worktree : **4,33 GiB / 16 GiB**.
  Journal : `/tmp/vibecore-panel-retry-web-typecheck.log`.
- Index régénéré par `node scripts/migrer-inventaire-bugs.mjs --index` :
  **433 entrées**. Aucun changement manuel du fichier dérivé.

Commande de tests :

```sh
node node_modules/vitest/vitest.mjs run \
  --config /tmp/vibecore-panel-retry-vitest.config.mjs \
  app/components/chat/panel-retry-recovery.spec.tsx \
  app/lib/ide/panel-request.spec.ts \
  app/components/chat/panel-single-flight.spec.ts \
  app/lib/ide/single-flight.spec.ts \
  app/lib/ide/panel-payload-cache.spec.ts \
  scripts/index-a-jour.spec.mjs
```

Cette configuration locale fixe la racine au worktree, l'alias `~` à son
répertoire `app`, un seul worker et `fileParallelism: false`. Les dépendances
sont montées par des liens propres au worktree, dont les paquets `@vibecore`
pointent vers ses propres sources ; aucun lien partagé, manifeste ou lockfile
n'est modifié. Une première invocation des gardes d'index par `node --test`
était incompatible avec leur import Vitest : elle n'est pas comptée comme
validation. Le verdict ci-dessus provient de leur exécution par Vitest.

Le build intégré du lot UI, la CI et le parcours navigateur complet restent
à la charge de la session parent après regroupement ; ils ne sont pas attestés
par ces tests de composant/transport.

`BaseChat.tsx` porte déjà `@ts-nocheck` sur la base. Le correctif n'ajoute ni
ne retire cette directive : le branchement est exercé par extraction du
wrapper réel, sans présenter le typecheck global comme une vérification
statique de ce fichier.

Un contrôle supplémentaire des quatre fichiers helper/tests avec TypeScript
**5.9.3**, via `/tmp/vibecore-panel-retry-tsconfig.json`, a terminé sans
diagnostic (`/tmp/vibecore-panel-retry-typecheck.log`). Cette configuration
étend `tsconfig.json`, limite `files` à ces quatre fichiers, utilise les types
Node et impose `skipLibCheck: false`. Ce contrôle supplémentaire n'est **pas**
celui de la toolchain verrouillée : avec 5.8.3, cette vérification stricte des
bibliothèques rencontrait les déclarations DOM/Node de `TextEncoder` et
`TextDecoder` incompatibles dans l'installation disponible. Aucun manifeste,
lockfile ou fichier de configuration du dépôt n'a été modifié pour l'éviter.

## Limites du diagnostic

L'annulation porte sur le GET navigateur vers le serveur web. Le proxy web
possède un timeout de trente secondes vers l'API, mais ne transmet pas le
signal du navigateur à ces appels. Aucun arrêt de travail SQL/Kubernetes
côté serveur n'est donc revendiqué.

Le titre « Toutes les bases de données » est rendu dès le montage de la vue
racine de `DatabaseWorkbench`. Son wrapper peut retenir ce montage pendant
son propre GET ; le Workbench charge ensuite le même endpoint avec son
fetcher. Cette duplication n'est pas modifiée ici, sa causalité CI n'étant
pas établie. Le GET initial attend projet puis dashboard/connexions/variables/
secrets/instantanés ; l'inspection des tables SQL ne démarre qu'avec
`schemaKey`, après clic sur une carte. Lire ces chemins ne mesure pas leur
latence en CI.

Un autre défaut potentiel reste distinct : le Workbench reconnaît un `error`
chaîne mais pas l'enveloppe `error` objet de la route. Une première réponse
wrapper réussie suivie d'un échec du fetcher interne peut donc être présentée
comme une liste vide. Ce chemin n'est ni corrigé ni revendiqué testé ici.
