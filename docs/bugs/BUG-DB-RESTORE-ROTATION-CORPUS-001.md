---
id: BUG-DB-RESTORE-ROTATION-CORPUS-001
section: "Reprise commerciale du 2026-10-20 — restauration DB"
---

## Défaut et portée

La CI de #745, tête `01cf9e9079a42ca9aa29324c8c9845c2f95d21a3`,
refuse le corpus de rotation : les champs
`DatabaseRestoreExecution.originalSecretEncrypted` et
`DatabaseRestoreExecution.targetConnectionEncrypted` sont déclarés dans le
schéma, mais absents de `ENCRYPTED_COLUMNS`.

Le sweep omettait donc les secrets du journal lors d'un changement de clé.
Leur clé primaire est `restoreId`, et la connexion cible peut être `null`.
L'assertion de correspondance avec le schéma est conservée.

## 📤 Dispatché

20 octobre 2026 : blocage CI signalé par le parent, puis reproduit localement.
Périmètre de correction : `services/api/src/encryption-rotation.ts` et son
fichier de test. Aucune clé réelle ni donnée client n'a été lue.

## 💻 Codé

Correctif local du corpus : deux entrées utilisant `restoreId`.
Non fusionné et non déployé au moment de cette preuve.

La protection contre les écritures concurrentes est également codée localement :
`updateMany` compare la clé primaire et le ciphertext lu. Si aucune ligne ne
correspond plus, la nouvelle valeur est préservée et `conflicts` est incrémenté
dans la colonne et le total, sans incrémenter `rotated`. Aucun réessai automatique
n'utilise l'ancien payload. Le mode `dryRun` n'écrit pas et ne prétend observer
aucun conflit.

## Preuves locales du corpus

Commande exécutée depuis `services/api`, avec le binaire déjà installé :

```sh
../../node_modules/.bin/vitest run src/encryption-rotation.spec.ts --maxWorkers=1 --minWorkers=1
```

- **17:36:55 UTC — rouge discriminant :** 2 échecs, 6 succès. L'assertion de
  schéma nomme exactement les deux colonnes oubliées ; le nouveau test constate
  que trois payloads synthétiques du journal sont absents du décompte.
  Journal : `/tmp/vibecore-encryption-rotation-20261020-red-direct.log`.
- **17:37:28 UTC — vert du corpus :** 8/8 tests réussis.
  Journal : `/tmp/vibecore-encryption-rotation-20261020-green-corpus.log`.
  Le nouveau test parcourt deux journaux avec pagination d'une ligne, conserve
  la cible absente et les métadonnées, puis déchiffre les trois payloads après
  retrait de l'ancienne clé synthétique.
- SHA256 du rotateur sur ce vert :
  `71f373dc0415679741f1c12c5a7d5a92e7a2267fb6c881409b1cb8b68e32cac3`.
- SHA256 du test sur ce vert :
  `89ac24efb734e8bd7b585af314e49b1dd08c43b87060048a8e3ffbb38b039d0a`.

Les opérations cryptographiques sont réelles. La persistance de ce test est
un double de délégués Prisma en mémoire ; ce résultat ne constitue pas une
preuve PostgreSQL, cloud ou production. Un premier lancement via `pnpm exec`
a échoué avant toute exécution de test ; il n'est pas compté comme un rouge
métier (`/tmp/vibecore-encryption-rotation-20261020-red.log`).

## Preuves locales de concurrence

- **17:39:25 UTC — rouge discriminant :** 1 échec, 8 succès. Le test injecte
  une nouvelle valeur juste avant l'écriture du sweep ; la comparaison constate
  qu'elle a été écrasée par la rotation de l'ancienne valeur.
  Journal : `/tmp/vibecore-encryption-rotation-20261020-red-cas.log`.
- **17:40:19 UTC — vert CAS :** 9/9 tests réussis après écriture conditionnelle.
  La nouvelle valeur chiffrée et son plaintext restent intacts ; le résultat est
  `rotated: 0`, `conflicts: 1`, `unreadable: 0` pour cette contre-épreuve.
  Journal : `/tmp/vibecore-encryption-rotation-20261020-green-cas.log`.
- SHA256 du rotateur sur ce vert CAS :
  `9ce10dbd896264900883efcba41783a0b7d767d5839c58e9c0c8d4e9863fbd46`.
- SHA256 du test sur ce vert CAS :
  `2a509c31fa1178502c528f74d662c82380d59d662fb4ce2969763af1d8ec0e13`.

Formatage des deux fichiers et `git diff --check` réussis. Aucun build,
typecheck global ou nouvelle CI n'est déduit de ce test ciblé. Un conflit doit
être examiné et le corpus recompté avant de retirer une clé ; il ne constitue
pas une rotation achevée.

## Limite révélée par Prisma réel

À **17:42:21 UTC**, une sonde en lecture seule sur PostgreSQL QA isolé et
Prisma 7.8 refuse `where: { originalSecretEncrypted: { not: null } }` :
`originalSecretEncrypted` est obligatoire et Prisma rejette cet argument
null. Le même filtre est accepté pour les champs optionnels
`targetConnectionEncrypted` et `ProjectSecret.valueEncrypted`.

Reçu sans valeur secrète :
`/workspace/vibecore-audit-artifacts/restore-admission-owner-race/prisma-null-filter-result.json`.
Cette preuve révèle une limite du double des neuf tests précédents ; leur
vert ne prouvait pas l'exécution du sweep contre Prisma.

Correction locale : les deux lectures (`encryptionCorpusStatus` et le sweep)
ne produisent plus de filtre SQL `not: null`. La validation de valeur existante
ignore toujours les payloads nulls, vides ou non textuels, après progression du
curseur. Le corpus reste complet pour les colonnes obligatoires et optionnelles.

- **17:47:14 UTC — vert unitaire final :** 10/10 tests réussis, dont un cas
  parcourant cinq journaux par pages d'une ligne, avec des cibles nulles au début,
  au milieu et à la fin. Sept payloads sont comptés et ré-encryptés ; les deux
  connexions après des pages nulles restent déchiffrables.
  Journal : `/tmp/vibecore-encryption-rotation-20261020-green-null-pagination.log`.
- SHA256 final du rotateur :
  `749518ebe6dbcbc510e03244b8f0f05b124a0535a7166099507717c60b6901df`.
- SHA256 final du test :
  `bf38c6080b1ebda1f1d48a4e42e569d467523a9f315fb7db8e2f58f0f9e3eb3e`.

La contre-épreuve rouge complète du rotateur sur PostgreSQL n'a pas été
exécutée : son lancement a été interrompu avant création d'un reçu.
Elle n'est pas revendiquée. Après clarification et récupération de l'exécuteur,
la validation finale a réellement exécuté le rotateur corrigé sur PostgreSQL.

**17:55:14–17:56:18 UTC — 30/30 tests repository verts, zéro saut.** Le
nouveau cas observe un conflit SQL pendant une bascule réelle : aucune ligne
concurrente n'est écrasée, le conflit est compté, les deux champs du journal
sont parcourus, puis un nouveau sweep et un recomptage permettent de relire
les payloads synthétiques sans l'ancienne clé. Les empreintes des sources
testées sont conservées dans les
[preuves structurées](../reprise/mesures/2026-10-20-restore-auth-rotation.json).
La base dédiée, ses volumes et ses credentials sont supprimés à 17:58:33 UTC ;
la base QA partagée est restée accessible, sans mutation par ce banc.

## ✅ Testé live

Non : aucun essai en production et aucune rotation sur des secrets réels.
Les validations PostgreSQL du protocole et les validations globales de #745
restent distinctes de ces tests locaux.

## Interaction avec une restauration active

Le protocole comparait les ciphertexts du secret courant et du journal.
Deux échecs ciblés sur PostgreSQL ont reproduit le défaut à 17:41:09 UTC :
ré-encrypter séparément deux valeurs identiques utilise des IV distincts.
Le correctif compare les valeurs déchiffrées lorsque les ciphertexts diffèrent ;
les contrôles de propriétaire, version, cible, phase et exclusion restent
indépendants. Les deux cas passent dans la suite finale de 30 tests, tandis
qu'une valeur différente reste refusée. Ce résultat local ne démontre pas
l'exclusion distribuée, une rotation de production ni une restauration cloud.
