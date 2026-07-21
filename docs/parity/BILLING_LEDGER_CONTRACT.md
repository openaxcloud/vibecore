# BILLING_LEDGER_CONTRACT — grand livre canonique à double entrée

contractId: CTR-BILLING-LEDGER
contractVersion: 2
schemaVersion: 2
repoCommit: 1692f981
reviewer: UNKNOWN
expectedReviewer: OpenAI-Codex
signatureResult: PENDING_REVIEW   # v1 REFUSED (lot 57febeab : « shadow wallet pas ledger double-entrée ») — v2 réécrit sur l'implémentation réelle, re-soumission requise
implementationAnchor: "PR #28 (branche feat/billing-double-entry-ledger, commit edb35f6e) — NON MERGÉE ; migration 0078 (enums + triggers d'immutabilité), moteur pur ledger-core.ts, store durable ledger-store.ts, réservation ledger-reservation.ts, rapprochement ledger-reconciliation.ts ; 39 tests dont 7 contre vrai Postgres"

## 1. Objet

Le grand livre CANONIQUE à double entrée remplace le porte-monnaie mono-écriture
(`CreditWallet.balanceCents`) et la réservation d'import in-process. Décision :
DEC-BILLING-LEGACY-VS-LEDGER (ledger adopté, wallet abandonné, zéro migration de
soldes — pas d'utilisateurs réels). Les registres historiques (RateCard,
AgentRoutingCard, AiCostLedger, AgentCallLog, UsageEvent/QuotaLedger) restent la
source des PRIX et du METERING ; les MOUVEMENTS d'argent/crédits passent par le
ledger.

## 2. Préconditions

- P-LED-1 : tout montant est un entier en unités mineures (`bigint`) avec devise
  attachée — JAMAIS un flottant.
- P-LED-2 : tout mouvement référence un plan de comptes typé
  (ASSET/LIABILITY/REVENUE/EXPENSE/EQUITY — enum `LedgerAccountType`).
- P-LED-3 : toute écriture porte une `reason` métier (ex. `import.settle`,
  `reservation.compensate`) et peut porter une clé d'idempotence (unicité
  enforced par le store).
- P-LED-4 : le travail PAYANT exige une réservation ACTIVE préalable
  (`LedgerReservationStatus: ACTIVE→COMMITTED|COMPENSATED|RELEASED|EXPIRED`) —
  aucun débit final sans commit du travail.

## 3. Invariants (nommés, testés)

- **I-LED-1 (équilibre)** : chaque transaction postée équilibre PAR DEVISE —
  Σ débits == Σ crédits ; une transaction déséquilibrée est REFUSÉE entière.
- **I-LED-2 (FX déterministe)** : un mouvement multi-devises passe par un compte
  de clearing FX ; chaque devise équilibre exactement ; le taux appliqué est
  ENREGISTRÉ et l'arrondi déterministe.
- **I-LED-3 (immutabilité)** : transactions et écritures postées sont IMMUABLES
  (triggers Postgres, migration 0078) ; une correction est une NOUVELLE
  transaction inverse (`reverseEntries`) — l'inverse + l'original s'annulent par
  (compte, devise) ; jamais une mutation du passé.
- **I-LED-4 (limites fail-closed)** : les plafonds/budgets sont vérifiés AVANT
  le post ; un mouvement qui percerait une limite est refusé EN ENTIER — jamais
  de partiel, jamais de solde corrompu.
- **I-LED-5 (rapprochement)** : un job de rapprochement compare le ledger aux
  compteurs dérivés et produit `OK|DISCREPANCY` (`LedgerReconciliationStatus`) —
  une divergence est un événement enregistré, pas un écrasement.

## 4. Tests négatifs (exigés, existants sur la branche #28)

- transaction déséquilibrée → refus (I-LED-1) ;
- mutation UPDATE/DELETE d'une écriture postée → REFUSÉE PAR TRIGGER Postgres
  (prouvé contre vrai Postgres, pas un mock) ;
- dépassement de limite → refus entier (I-LED-4) ;
- double post avec même clé d'idempotence → une seule transaction ;
- débit final sans réservation commit → refus (P-LED-4).

## 5. Compatibilité

- Ancien monde : `CreditWallet/CreditLedger` = SHADOW hérité, lecture seule à
  terme ; AUCUNE migration de soldes (données fictives purgées — décision).
- `RATE_CARD.json` reste GÉNÉRÉ depuis `packages/billing` (prix) ; le ledger ne
  redéfinit aucun prix.
- Rapprochement PSP (Stripe) et coûts GCP : consommateurs du ledger, pas
  l'inverse ; cutoff/périodes à contractualiser au branchement Stripe réel.

## 6. Metering & prix (inchangé — registres historiques, prouvés)

Source de vérité prix : `docs/parity/RATE_CARD.json` GÉNÉRÉ depuis
`packages/billing` (rate-card.ts `1ea573b4`, agent-routing.ts `dc2d6c9d`) ; les
lignes DB `RateCard`/`AgentRoutingCard` actives priment au runtime.

| registre | rôle | append-only | versionné |
|---|---|---|---|
| RateCard | prix compute deploy (18u/CPU-s + 2u/GiB-s) | oui (INSERT) | oui, `version` + `active` |
| AgentRoutingCard | routage mode→modèle + revient + multiplicateur | oui | oui, effectiveFrom/To |
| AiCostLedger | coût provider par appel LLM | oui | stampe le prix appliqué |
| AgentCallLog | par appel routé : modèle réel, coût, crédits, marge, routingCardVersion | oui | stampe la version |
| CreditWallet / CreditPack / CreditLedger | HÉRITÉ (shadow) — remplacé par le ledger | CreditLedger : oui | n/a |
| AgentCheckpoint | 1 checkpoint/requête | oui | n/a |
| UsageEvent / QuotaLedger / QuotaOverride | compteurs quota | oui | n/a |

- I-BIL-1 : changement de prix = NOUVELLE version de carte ; le metering stampe
  la version — l'historique n'est jamais muté.
- I-BIL-2 : crédits arrondis AU CENT SUPÉRIEUR, plancher 1¢ par appel facturé ;
  jamais 0 pour une machine active.
- I-BIL-3 : marge négative BLOQUE la publication (409) sauf confirmation auditée.
- I-BIL-4 : le classifieur du harness n'est JAMAIS facturé (billedToUser=false).
- I-BIL-5 : crédits/marges recalculés SERVEUR — le client jamais autoritatif.

Flags : BILLING_CREDITS_ENABLED (débit réel) / BILLING_CREDITS_SHADOW (état
prod actuel : SHADOW). MODEL_REGISTRY_DB dormant.

## 7. Résultat de signature

- v1 : REFUSED (RR-20260720-CODEX-01) — « shadow wallet pas ledger double-entrée ».
- v2 (ce document) : **PENDING_REVIEW** — l'implémentation existe (PR #28,
  39 tests dont 7 Postgres réels) mais N'EST PAS MERGÉE ; la signature exige
  merge + reçu de revue COMPLET. Rien d'auto-clôturé.
