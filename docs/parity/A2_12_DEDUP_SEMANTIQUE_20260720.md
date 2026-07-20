# A2-12 — Passe de déduplication sémantique des 336 constats (2026-07-20)

schemaVersion: 1
repoCommit: 3f387c55
reviewer: UNKNOWN

Pièce de preuve de la clôture de **P0-A2-12** (« 336 constats ≠ 336 tâches
uniques »). Condition de clôture : passe de déduplication sémantique revue +
provenance origine complétée **ou ACCEPTED_RISK** (→
`UNK-LEGACY-ORIGIN-PROVENANCE`, UNKNOWN_REGISTRY.yaml).

## 1. Méthode (reproductible)

1. **Deux proposeurs indépendants** (agents distincts, prompts différents,
   aucun échange) ont lu `LEGACY_FINDING_REGISTRY.yaml` (336 constats) avec la
   même consigne stricte : ne proposer un groupe que si les constats exigent
   **le même livrable concret** ; doute → abstention.
2. **Critère d'application = intersection au niveau work item** : une fusion
   n'est appliquée que si les DEUX proposeurs relient la même paire de work
   items canoniques (WI courant du constat A ↔ WI courant du constat B).
   Machine-vérifiable : chaque paire proposée est projetée sur
   (canonicalWorkItemId_A, canonicalWorkItemId_B) puis intersectée.
3. Chaque fusion retenue a été **revérifiée à la main** sur les textes et
   `originRef` du registre avant application.

## 2. Propositions verbatim des deux proposeurs

Proposeur A :

    {"ids":["RPD-24","RB-L073","CM-34"],"reason":"cinq pages légales relues/approuvées par un juriste"}
    {"ids":["OUT-EF-04","BD-21"],"reason":"identifiants OAuth connecteurs GitHub/GitLab/Netlify/Vercel/Supabase à renseigner"}
    {"ids":["BD-22","CM-22"],"reason":"prouver déploiement et rollback des providers externes"}
    {"ids":["BD-20","GLC-L132","CM-29"],"reason":"exercice de restauration Cloud SQL (base) prouvé"}

Proposeur B :

    {"ids":["BD-21","OUT-EF-04"],"reason":"Mêmes identifiants OAuth des 5 connecteurs à renseigner (origine BD-21)"}
    {"ids":["BD-22","RB-L072"],"reason":"Même preuve déploiement+rollback des providers externes (origine BD-22)"}
    {"ids":["RPD-24","CM-34"],"reason":"Même relecture juriste des pages légales (PR-LEGAL-01)"}

## 3. Intersection → 3 fusions appliquées

| Fusion | Proposeur A | Proposeur B | Vérif manuelle | Application |
|---|---|---|---|---|
| OUT-EF-04 ↔ BD-21 | ✔ (paire exacte) | ✔ (paire exacte) | `originRef` de OUT-EF-04 = « BD-21 » | OUT-EF-04 `duplicateOf: BD-21` ; BD-21 rejoint **WI-0079** (trackedBy déjà « BD-21 ») |
| RPD-24 ↔ CM-34 | ✔ (avec RB-L073) | ✔ (paire exacte) | même livrable « pages légales relues par juriste », même pointeur PR-LEGAL-01 | RPD-24 `duplicateOf: CM-34` → **WI-0055** ; **WI-0096 supprimé** (RB-L073 était DÉJÀ dans WI-0055 — pas une fusion nouvelle) |
| BD-22 ↔ WI-0044 | ✔ (via CM-22 ∈ WI-0044) | ✔ (via RB-L072 ∈ WI-0044) | CM-22 et RB-L072 ont `originRef: BD-22` ; WI-0044 a `trackedBy: BD-22` | BD-22 rejoint **WI-0044** (il en est l'origine — pas de duplicateOf) |

## 4. Sur-regroupement corrigé (découvert pendant la vérification)

`WI-0033` agrégeait **les 27 constats BD-01→BD-27 en un seul work item**,
uniquement parce que leur `originRef` était le NOM DE FICHIER
« BOLT_DEBT_REGISTRY » — pas un chantier. Or ces 27 dettes sont des livrables
distincts (bouton sync, restauration PITR, identifiants OAuth, hébergeur
externe…), avec des owners et des échéances différents que l'agrégat écrasait.
Correction : WI-0033 = BD-01 seul ; BD-02..BD-27 (hors BD-21/BD-22 fusionnés
ci-dessus) deviennent 24 work items par livrable, **WI-0100..WI-0123**, chacun
portant le statut/owner/targetDate de son constat.

Les groupes `PR-*` (ex. WI-0084 = 23 constats QA sous PR-QA-01) sont
CONSERVÉS : leur clé est un pointeur de chantier réel, pas un nom de fichier —
c'est la méthode documentée du regroupement mécanique.

## 5. Candidats NON appliqués (traçés, pas balayés)

- **BD-20 (→ WI-0118) ↔ WI-0051** (« exercice de restauration ») : proposé par
  A seul ; B s'est abstenu. Nuance réelle : BD-20 vise l'interrupteur PITR
  éteint en prod, WI-0051 l'exercice de restore + RTO/RPO. Laissés distincts.
- **RB-L073 dans le groupe juriste** : proposé par A ; déjà membre de WI-0055
  par le regroupement mécanique — aucun changement nécessaire.
- **CM-22 / RB-L072** : déjà co-membres de WI-0044 — la proposition des deux
  agents a servi de confirmation pour y rattacher BD-22.

## 6. Résultat et invariants machine

- `sourceFindingCount` = **336**, inchangé ; SHA-256 certifié de la liste des
  IDs **inchangé** (`121218ffdf51…`, `check-plan-completeness.mjs` vert).
- `canonicalWorkItemCount` : 99 → **122** (24 splits − 1 fusion). Ce nombre
  est CALCULÉ et re-vérifié par le validateur (`items réels == compte`).
- Mapping **bijectif** vérifié : chaque constat couvert par exactement UN work
  item, et `canonicalWorkItemId` de chaque constat == le work item qui le
  liste.
- Preuve négative rejouée : retirer un ID du registre casse le build
  (compte + SHA).

## 7. Limite de provenance origine → ACCEPTED_RISK

Le fichier/ligne d'ORIGINE dans les 29 anciens documents n'a pas été capturé
par l'audit de couverture du 19/07. La provenance enregistrée est la version
du plan qui a matérialisé les constats (`sourceFile@sourceHash` + `sourceLine`
+ `originRef`). Risque accepté et justifié dans
`UNKNOWN_REGISTRY.yaml#UNK-LEGACY-ORIGIN-PROVENANCE` : les textes des 336
constats sont préservés verbatim et hashés — la traçabilité du CONTENU est
complète, seule la coordonnée dans les documents historiques manque, et ces
documents existent toujours dans l'historique git si un litige l'exige.
