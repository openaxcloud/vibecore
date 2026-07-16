# BILLING_LEDGER_CONTRACT — contrat des registres de facturation

schemaVersion: 1
repoCommit: fee92bd0b09159247383814023ae63db8875dd7d
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
