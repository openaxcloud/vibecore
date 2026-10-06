---
id: DETTE-I18N-EXEMPTIONS-5-NOVEMBRE
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Dette

**À désamorcer AVANT le 2026-11-05 : huit exemptions de `scripts/i18n/source-allowlist.json` expirent ce
jour-là. Le lendemain, `Install, test, build, scan` rougit sur TOUTES les branches et `main`, sans qu'une
ligne de code ait changé.**

C'est la même bombe que le 2026-10-04 : six exemptions avaient expiré pendant une coupure réseau et la CI de
toute la plateforme était rouge par le TEMPS (corrigé par #671). Cette fois, on a un mois.

## Les huit entrées (lues sur `main` d3d34ef4c le 2026-10-06)

Toutes couvrent du code DORMANT ou hors du produit. Aucune ne porte un texte qu'un client lit aujourd'hui.

| id | fichier | ce que dit la justification |
|---|---|---|
| dormant-workspace-sdk-client-diagnostic | packages/workspace-sdk/src/index.ts | client jamais instancié en production |
| skill-audit-proof-cli-diagnostics | services/api/scripts/skill-audit-proof.ts | script de preuve CI, pas importé par l'API |
| dormant-deployment-provider-guard | services/api/src/deployments.ts | garde sans appelant en production |
| dormant-api-skill-disclosure-invariants | services/api/src/skill-disclosure.ts | session de preuve sans import en production |
| dormant-agent-auto-accept-decisions | app/utils/agent-auto-accept.ts | décisions d'acceptation automatique, code dormant |
| dormant-mobile-biometric-reasons | apps/mobile/src/biometric.ts | discriminants typés, jamais affichés |
| dormant-lifecycle-state-machine-diagnostics | services/api/src/lifecycle-state-machines.ts | diagnostics de machine à états |
| dormant-capacity-policy-estimates | services/api/src/capacity-policy.ts | estimations de politique de capacité |

## Désamorcer, entrée par entrée (pas prolonger en bloc)

Pour chacune, une des deux voies, et vérifier l'affirmation « sans appelant » par un `grep` avec un contrôle
positif avant de la croire :
1. **le code est vraiment mort** → le supprimer, et l'exemption avec ;
2. **le texte n'est pas destiné à un client** (script CI, discriminant typé) → l'exemption devient PERMANENTE avec
   cette justification, plutôt qu'une date qui reviendra exploser.

Prolonger les huit dates d'un mois sans rien regarder, c'est remettre la même bombe en place.

## 📤

☐ à prendre par la session qui a fait #671, ou par la session interface

## 💻

☐

## ✅

☐

## Preuve

Échéance lue dans `scripts/i18n/source-allowlist.json` sur `main` d3d34ef4c. Le précédent du 2026-10-04 est
documenté dans #671. Point ouvert jusqu'à ce que les huit entrées soient traitées.
