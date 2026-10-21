---
id: BUG-UX-SNAPSHOT-QUOTA-001
---

# Un quota d’instantanés dépassé est présenté comme une attente temporaire

## 📤 Dispatché

Revue #753 du 21 octobre 2026, après HTTP 429 réel sur une organisation synthétique ayant cinq instantanés.

## 💻 Codé

Correctif sur la branche de #753, non intégré à main. assertQuota émet QUOTA_EXCEEDED ; enterprise-api.server conserve le code, mais actionError de projects.$projectId.snapshots le perdait. Le catalogue traitait tout 429 comme rateLimited. La route lit désormais le code ; FR/EN distinguent le quota atteint du débit temporairement limité, sans changer les quotas ni promettre une date de renouvellement.

## ✅ Testé live

Production non vérifiée. Dix-sept tests de route passent, dont les contrats QUOTA_EXCEEDED, RATE_LIMITED et 429 sans code. Ils ne remplacent pas la recette réelle : [résultats et limites](ux-confirmation-2026-10-21/review/README.md).

La version finale est également vérifiée dans Chromium avec deux HTTP 429 réels FR/EN : message quotaExceeded visible, cinq instantanés conservés. Voir quota-final.txt et les captures dans la recette.
