# BILLING_LEDGER_CONTRACT — contrat des registres de facturation

schemaVersion: 1
repoCommit: fee92bd0b09159247383814023ae63db8875dd7d
reviewer: UNKNOWN
reviewVerdict: REFUSED — 0/14 contrats signés (lot 57febeab, OpenAI-Codex, 2026-07-20)
refusalReason: shadow wallet pas ledger double-entrée (verbatim relecteur, transmis 20/07)
reviewCloseCriterion: corriger — shadow wallet pas ledger double-entrée — puis re-soumettre à signature
Source de vérité prix: `docs/parity/RATE_CARD.json` est GÉNÉRÉ depuis
`packages/billing` (rate-card.ts commit `1ea573b4`, agent-routing.ts commit
`dc2d6c9d`) — les lignes DB `RateCard`/`AgentRoutingCard` actives priment au
runtime. Ne PAS retaper ces prix ailleurs.

## Registres (tous implémentés, schema.prisma)

| registre | rôle | append-only | versionné |
|---|---|---|---|
| RateCard | prix compute deploy (tailles machine, 18u/CPU-s + 2u/GiB-s) | oui (nouvelle version = INSERT) | oui, `version` unique + `active` |
| AgentRoutingCard | routage mode→modèle + revient + multiplicateur | oui | oui, + effectiveFrom/effectiveTo/sourceDate |
| AiCostLedger | coût provider par appel LLM (reason chat.completion.*) | oui | n/a (stampe le prix appliqué) |
| AgentCallLog | par appel routé: mode, switches, escalade, modèle RÉEL, coût millicents, crédits, marge, routingCardVersion | oui | stampe routingCardVersion |
| CreditWallet / CreditPack / CreditLedger | solde org, packs (expiry 6 mois, earliest-first), mouvements (GRANT/CONSUMPTION/PAYG_CHARGE/…) | CreditLedger: oui | n/a |
| AgentCheckpoint | 1 checkpoint/requête (buildTier, turboMode, rawProviderCents, creditCents) | oui | n/a |
| UsageEvent / QuotaLedger / QuotaOverride | compteurs quota | oui | n/a |

## Invariants

- I-BIL-1: un changement de prix est une NOUVELLE version de carte — l'historique
  n'est jamais muté; chaque événement de metering stampe la version utilisée.
- I-BIL-2: crédits arrondis AU CENT SUPÉRIEUR, plancher 1¢ sur tout appel
  facturé consommant des tokens; jamais 0 pour une machine active (plancher
  1 unité compute).
- I-BIL-3: marge = (prix − revient)/prix, calculée live; une marge négative
  BLOQUE la publication (409) sauf confirmation explicite auditée.
- I-BIL-4: le classifieur du harness n'est JAMAIS facturé à l'utilisateur
  (billedToUser=false); son coût de revient reste visible dans AgentCallLog.
- I-BIL-5: les crédits/marges d'AgentCallLog sont recalculés SERVEUR depuis la
  carte active — le client n'est jamais autoritatif.

## Flags de bascule

BILLING_CREDITS_ENABLED (débit réel) / BILLING_CREDITS_SHADOW (calcul sans
débit — état prod actuel: SHADOW). MODEL_REGISTRY_DB=true rendrait le registre
ModelConfig autoritatif (dormant).

## Grand livre CANONIQUE à double entrée (C1 / P0-V3-12, 2026-07-20)

Décision Avi : **nouveau ledger adopté, ancien porte-monnaie (`CreditWallet.
balanceCents`) abandonné, AUCUNE migration de soldes**. Le grand livre canonique
double-entrée devient la source de vérité des soldes.

Modèles (migration `0078_double_entry_ledger`) : `LedgerAccount` (compte typé
ASSET/LIABILITY/REVENUE/EXPENSE/EQUITY, par devise), `LedgerTransaction`
(idempotente, `reversalOfId` pour la compensation, `rateCardVersion` stampée),
`LedgerEntry` (DEBIT/CREDIT, `amountMinor` BigInt exact), `LedgerReservation`
(durable, remplace la réservation en-mémoire de #27), `LedgerFxRate` (rationnel
`num/den` + `cutoffAt`), `LedgerReconciliationRun`.

Invariants :
- **I-LED-1** double entrée stricte : Σ débits == Σ crédits **par devise**, validé
  AVANT écriture (déséquilibre refusé, jamais posté).
- **I-LED-2** décimal exact (`bigint` unités mineures, jamais de flottant) ; FX
  rationnel exact + arrondi déterministe + **cutoff** honoré.
- **I-LED-3** immutabilité : transactions/entrées postées append-only au niveau DB
  (triggers `BEFORE UPDATE/DELETE` ET `BEFORE TRUNCATE`) ; correction = nouvelle
  transaction **inverse** (`reversalOfId`), jamais une mutation.
- **I-LED-4** hard limit aux frontières sûres : un mouvement qui dépasserait la
  frontière est refusé en entier, rien de posté (jamais de corruption).

Cycle réservation (durable) : `reserve` (transfert available→reserved) → `commit`
= `settle` (recognition revenue ± taxe, remboursement du reliquat) → `compensate`
(écriture inverse, remboursement au crédit disponible) OU `release` (annulation/
timeout, retour intégral). **Débit = uniquement au settle** ; pas de commit ⇒ pas de
débit.

Rapprochement : `reconcile(ledger, external)` compare GCP/Stripe ↔ ledger et
détecte tout écart (MISSING/AMOUNT_MISMATCH), persisté en `LedgerReconciliationRun`.

Preuve (39 tests, dont 7 durables contre un vrai Postgres) :
`docs/deploy-evidence/2026-07-20-double-entry-ledger/`.

État : **PROVEN_REVIEW_PENDING** — implémenté + prouvé sur branche
`feat/billing-double-entry-ledger` (PR ouverte, non mergée). Câblage de l'endpoint
import sur `LedgerStore` = à la convergence avec #27. Budgets/taxes/refunds/
chargebacks modélisés par les primitives ; proration calendaire + capture/void
Stripe réels = follow-ups.
