# Lot Purge — index des réserves et de leurs preuves

Point d'entrée unique pour le contre-audit de la **PR #52** (`vague3-purge47-hardening`).
Cinq réserves successives d'experts ont été traitées ; chacune est corrigée à la source,
prouvée rouge→vert, et rattachée ci-dessous à son fichier de preuve.

**Tête courante : `6846d68e9239a506c9d7947a5a0852ab8fdc7197`** — PR OPEN / MERGEABLE.

---

## Les cinq réserves

| # | Réserve | SHA audité | Correctif | Preuve |
|---|---|---|---|---|
| 1 | **R-P3-06** — ABA : `unfreezeWorkspace` lisait le fence token puis faisait un `UPDATE` **inconditionnel** par id | `3bd148b4` | CAS atomique `WHERE id AND purgeFrozen AND purgeFenceToken` + CAS versionné pour le reconciler + lectures de barrière fail-closed | [`README.md`](./README.md) · [`pg16-interleaving-run.txt`](./pg16-interleaving-run.txt) · [`pg16-statement-log.txt`](./pg16-statement-log.txt) |
| 2 | **R-P3-07** — `/internal/*` exempté d'auth : un POST **non authentifié** `{graceMs:0}` levait une barrière active | `b8c620c0` | registre `INTERNAL_ROUTE_AUTH` en **default-deny** (route non déclarée → 503) + plancher `graceMs` (route ET manager) + liaison au bail `PurgePlan` vivant | [`README.md`](./README.md) · [`r-p3-07-auth-red-green.txt`](./r-p3-07-auth-red-green.txt) |
| 3 | **403 non traduit** — le refus « stockage gelé » partait en littéral, donc le hook `preSerialization` retombait sur le message **générique** : le client ne savait plus pourquoi son écriture échouait | — | clé catalogue `OBJECT_STORAGE_PURGE_FROZEN` (EN+FR) + `appPublicEnglish(...)` | commit `fix(i18n): le 403 « stockage gelé » n'était pas traduit` · test `localizes the frozen-storage 403 for a French client` |
| 4 | **R-P5-01** — un lease **expiré** pouvait être renouvelé, alors que le manager l'avait déjà jugé mort et pouvait lever la barrière → état interdit « lease valide + barrière levée » | `6a9babdc` | `leaseExpiresAt: { gt: now }` **dans le même CAS**, un seul `now` pour le garde et la nouvelle expiration | [`r-p5-01-lease-renewal.md`](./r-p5-01-lease-renewal.md) |
| 5 | **Disjonction renew/reclaim** — effet de bord du correctif 4 : la suite avait perdu son test de course | — | invariant : `renew` exige `expiry > now`, `reclaim` exige `expiry < now − 60 s` → **disjoints**, la course est impossible | [`r-p5-01-lease-renewal.md`](./r-p5-01-lease-renewal.md#le-test-de-course-retiré-et-ce-qui-le-remplace) |

## Comment lire les preuves

Chaque correctif est accompagné d'une **preuve de discrimination** : les tests sont
rejoués contre le code d'AVANT et doivent échouer. Un test de concurrence qui passe des
deux côtés ne prouve rien, et c'est précisément ainsi que R-P3-06 avait échappé à la
suite existante (son test jouait l'unfreeze retardé *séquentiellement*).

Signatures d'échec attendues contre le code d'avant :

- R-P3-06 : `purgeFrozen=false` alors que `owner-N1` détenait la barrière
- R-P3-07 : `status=200` + barrière levée sans jeton (au lieu de `401`)
- R-P5-01 : `expected 1 to be null` — le lease mort était renouvelé, version portée à 1

## Rejouer

Toutes les commandes sont dans [`README.md`](./README.md) et
[`r-p5-01-lease-renewal.md`](./r-p5-01-lease-renewal.md).

⚠️ Deux pièges de banc qui ont coûté du temps et feront perdre le même temps au
relecteur s'ils ne sont pas connus :

1. **`prisma migrate deploy`, jamais `db push`** — `db push` synchronise le schéma mais
   ne joue pas le SQL des migrations : aucun des 5 triggers (dont l'immuabilité du
   ledger, mig 0078) n'existe, et des tests échouent pour une raison sans rapport avec
   le code. Contrôle : `select count(*) from pg_trigger where not tgisinternal;` → 5.
2. **`PurgePlan.userId` est `@unique`** (singleton par sujet) — trois états de lease
   exigent trois comptes distincts, pas trois plans sur un même utilisateur.

## Réserves assumées (à lire avant de conclure)

- **CronJob : IMPLEMENTED_UNPROVEN.** `accountPurge` **n'existe pas sur `main`** — il est
  introduit par le commit `04e40a6e` du lot lui-même, donc il n'a jamais pu tourner nulle
  part. Validation server-side faite contre l'API réelle du cluster d'audit (zéro objet
  créé) ; **aucune exécution planifiée observée**. Détail et justification dans
  [`r-p5-01-lease-renewal.md`](./r-p5-01-lease-renewal.md#cronjob-de-purge--état-honnête-implemented_unproven-maintenu).
- **Porte i18n rouge** sur 31 résidus des commits antérieurs du lot, **volontairement
  laissés visibles** : neutraliser des constats d'un garde de sécurité dans le code d'un
  autre auteur, sur un lot en contre-audit, ressemblerait à un affaiblissement. Le tri est
  fait et motivé cas par cas ; seul le défaut réellement visible utilisateur (réserve 3) a
  été corrigé, à la source.
- **Playwright ×5 et builds desktop macos/windows : non imputables au lot** — métas SEO sur
  `/usage-limits` (route byte-identique à `main`), `NODE_OPTIONS` exécuté par `cmd`
  (script identique à `main`), `DOMParser` dans electron-builder.
- **Authentification = secret bearer partagé**, pas une identité par appelant. La réserve
  est close telle que déposée ; le namespace interne n'est pas rendu attribuable.
- **Rien n'est déployé.** La PR redevient `CONFLICTING` à chaque merge sur `main` (le job
  `roll-attestation` réécrit les vues parity) — un rebase juste avant merge est nécessaire.
