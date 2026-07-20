# REMEDIATION_VERDICT_20260720 — plan de remédiation après verdict du relecteur

schemaVersion: 1
repoCommit: 57febeab
reviewer: UNKNOWN

Verdict OpenAI-Codex (lot 57febeab) : **22 P0 signés → CLOSED ; 33 refusés →
rouverts ; 0/14 contrats signés**. Niveau inchangé : `contractsPresent` /
`NOT_APPROVED`. Ce document priorise la remédiation ; l'état par point vit
dans P0_REGISTRY.yaml (reviewVerdict/refusalType/refusalReason).

## 1. Corrections rapides (heures→jours, débloquent des re-soumissions)

| # | Points | Refus | Action |
|---|---|---|---|
| R1 | P0-V4-1, P0-V4-2, P0-V3-02 | hashes Gallery obsolètes (fad9… vs 1f5f…) | re-capturer le rendu Gallery, re-hasher, mettre à jour SOURCE_REGISTRY + citations, rejouer les vérifs |
| R2 | P0-LS-14 | claim absolu « no model selector anywhere » | reformuler en observation BORNÉE (surfaces observées + date + hash), purger le claim absolu partout |
| R3 | P0-A2-10 | Gallery est DECIDED, pas OPEN | aligner DEC-GALLERY-NO-SELF-PUBLISH → DECIDED dans DECISION_REGISTRY + le P0 |
| R4 | P0-LS-13 | prix sans contexte geo/locale/cohorte/hash | enrichir CHAQUE entrée de PRICE_OBSERVATION_REGISTRY (geo, locale, cohorte, hash du snapshot source) |
| R5 | P0-EX-10 | CI fait `--check` seulement | la CI GÉNÈRE le statut puis compare + publie l'artefact (petit patch workflow) |

## 2. Vrais chantiers (semaines, code + preuves)

| # | Points | Refus | Chantier |
|---|---|---|---|
| C1 | P0-V3-12 | pas de vrai ledger double-entrée | implémenter le BILLING_LEDGER double-entrée (schéma, migrations, invariants débit=crédit, preuves) — lié à DEC-BILLING-LEGACY-VS-LEDGER |
| C2 | P0-EX-02 | aucun générateur d'IMPLEMENTATION_STATUS | écrire le générateur (dérive l'état des preuves/commits, plus de YAML manuel) + brancher en CI |
| C3 | P0-EX-04 | le code Import suit l'ancienne machine | aligner services/api sur la machine contractuelle (QUARANTINED / AWAITING_USER_ACTION / commit atomique) + tests |
| C4 | P0-A2-09 | WIF prouvé GKE seulement | preuves live des 2 chemins WIF manquants |
| C5 | 14 contrats §2.3 | 0/14 signés | durcir chaque contrat (contenu, invariants, préconditions) puis re-soumettre à signature — raisons détaillées à consigner dès transmission |

## 3. Bloquant côté relecteur / Avi

- **22 refus sans raison détaillée transmise** (refusalType `A_PRECISER`) :
  P0-A2-01, A2-03, A2-05, A2-07, A2-13, A2-14, P0-B-01, P0-EX-05, EX-07,
  EX-08, P0-LS-03, LS-04, LS-06, LS-16, P0-V3-03, V3-04, V3-08, V3-09,
  V3-10, V3-11, V3-13, P0-V4-3. **Obtenir le rapport détaillé du relecteur**
  puis inscrire chaque raison verbatim et re-trier (rapide vs chantier).
  Rien n'a été inventé : sans verbatim, pas de raison fabriquée.

## 4. Règle de re-soumission

Un point rouvert ne repasse PROVEN qu'avec la remédiation faite + artefact
rejouable, et ne passe CLOSED qu'avec une nouvelle signature du relecteur.
