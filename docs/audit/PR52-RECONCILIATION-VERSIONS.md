# PR #52 — réconciliation de version avant remédiation (16/08)

**À lire avant toute correction.** L'audit expert a porté sur `dfbe5c68` ; la PR #52
est aujourd'hui à `777f5807` (branche `vague3-purge47-hardening`).

## Les deux références ont DIVERGÉ

`git merge-base --is-ancestor dfbe5c68 777f5807` → **faux**. Ce n'est donc pas un simple
« la tête a avancé » : les deux histoires ont divergé, avec **289 commits** présents dans
la tête et absents de la révision auditée. Plusieurs de ces commits traitent précisément
des réserves — l'audit décrit donc partiellement un état **révolu**.

## État réel des 3 réserves SUR LA TÊTE `777f5807`

| Réserve | État constaté sur la tête | Preuve |
|---|---|---|
| **1** — garde appelée avant les lectures au lieu du point de suppression (`account-storage-purge.ts`) | **DÉJÀ CORRIGÉE (à re-prouver)** | `eraseBucket` : `await guard?.()` **ligne 141**, `port.deleteBucket` **ligne 144**. `eraseWorkspace` : `await guard?.()` **ligne 181**, `port.deleteWorkspace` **ligne 184**, précédé du commentaire « guard at the linearisation point — immediately before the… ». La garde est donc bien **après les lectures et juste avant la suppression**, ce que la réserve demandait. |
| **2** — reclaim inline `findUnique` puis `delete` par id, sans garde | **PARTIELLEMENT TRAITÉE — à instruire** | `acquirePurgeGuarantee` ouvre sa transaction par `SELECT pg_advisory_xact_lock(hashtext($1))` sur `account-purge:<userId>`, ce qui **sérialise par utilisateur** et ferme la course autrement qu'un CAS. Reste à vérifier si le `delete` inline subsiste sous ce verrou et si la sérialisation couvre **tous** les chemins concurrents (notamment un renouvellement venant d'un autre process). **La forme CAS demandée (`deleteMany` gardé sur (id, version, leaseExpiresAt<graceCutoff, status), count≠1 ⇒ pas de reclaim) reste plus explicite et testable** — c'est elle qu'il faut viser. |
| **3a** — `renewPurgeLease` peut ressusciter une lease expirée | **DÉJÀ CORRIGÉE** | Le CAS porte désormais `leaseExpiresAt: { gt: now }` dans son `where`, avec un `now` unique partagé entre la garde et la nouvelle expiration. Commit dédié : `7c4da121 fix(purge): interdire le renouvellement d'un lease DÉJÀ EXPIRÉ (R-P5-01)`. |
| **3b** — dernier guard avant tombstone sans verrou jusqu'au commit | **OUVERTE** | Aucun `SELECT … FOR UPDATE` dans `prisma-store.ts` (seule occurrence : un **commentaire** ligne 4620, sur un autre sujet). La ligne `PurgePlan` n'est donc pas verrouillée entre la dernière vérification et le tombstone. |

## Conséquence sur le plan de travail

Le lot n'est pas « 3 réserves à corriger » mais :

1. **3b** — à corriger réellement (verrou `FOR UPDATE` + re-vérification ownership/ACTIVE/lease sous ce verrou, dans la transaction de finalisation).
2. **2** — à instruire puis, très probablement, à convertir en CAS explicite comme demandé.
3. **1 et 3a** — déjà en place : le travail restant est de **les prouver** par les tests d'interleaving réclamés, pas de les réécrire.

⚠️ **À ne pas revendiquer** : tant que les tests d'interleaving sur vrai Postgres n'ont pas
tourné rouge→vert à la tête finale, aucune de ces réserves ne doit être présentée comme
« prouvée » — y compris celles constatées déjà corrigées par lecture de code. Une lecture
de code n'est pas une preuve d'exécution.

## Tests à écrire (inchangés)

- **T21** à corriger : il initialise une expiration à −10 s et accepte le renouvellement ;
  avec 3a en place, `renewPurgeLease` doit rendre **null**.
- **#1** lease perdue pendant les lectures, entre la garde et le delete ⇒ **aucune**
  suppression (bucket ET workspace).
- **#2** owner qui renouvelle entre la lecture et le reclaim inline ⇒ pas de suppression
  du plan, pas de doublon.
- **#3b** perte après le dernier guard mais avant le commit ⇒ pas de tombstone, pas de
  preuve, rollback, compte re-queué.
- ⚠️ Ne pas passer par un eraser injecté qui pose ses propres gardes (piège T22) : les
  tests doivent exercer les vrais chemins.

## Livrable attendu

Diff + sortie brute rouge→vert sur **vrai Postgres** + CI verte + récap expert, le tout à
**UN SEUL SHA** (la tête finale de la branche de remédiation). **NE PAS MERGER EN PROD.**
