---
id: BUG-QA-MONITORING-CRASH-001
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

**Le panneau Supervision plantait à 100 %** — `ReferenceError: language is not defined`. `ProjectMonitoringPanel` ne récupérait que `t` de `useTranslation()` alors que son corps appelait déjà `formatBaseChatAstDateTime(language, …)` et `formatBaseChatAstNumber(language, …)` à **cinq** endroits. Les composants voisins (`ProjectMonitoringDeploymentTimeline`, `…ActivitySparkline`) le résolvaient déjà correctement.

## 📤

✅

## 💻

✅ **`3b81b10b`**

## ✅

✅ **13/08**

## Preuve

`const { t, i18n } = useTranslation(); const language = resolvedBaseChatLanguage(i18n);`. **Vérifié live** : le panneau rend son contenu complet (« Supervision · Mis à jour à l'instant · 15m 1h 24h · Actualiser »), **zéro** `language is not defined`, **aucune** boundary d'erreur.

