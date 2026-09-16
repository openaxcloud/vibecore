---
id: BUG-DEPLOY-001
---

## Bug

Le log de build d'un server deploy affiche « Deployment ready: <url> » AVANT l'issue réelle du build : le flux générique loggue prématurément, et un deploy FAILED expose donc une URL « ready » qui 502. Constaté live sur `cmrmb9igi…` (15/07) — a conduit à tester une URL d'un build échoué.

## 📤 Dispatché

✅

## 💻 Codé

✅ `523795af`

## ✅ Testé live

✅ **15/07**

## Preuve

`createDeploymentLogs` ne fabrique plus applied/ready pour provider=server. Preuve live : deploy cassé exprès (`cmrmkmfck…`, build `exit 1`) → FAILED, logs = étapes réelles uniquement, zéro « Deployment ready ». `docs/deploy-evidence/2026-07-15-phase-b/`

