---
id: BUG-QA-I18N-COUNT-003
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
annotation: "b"
---

## Bug

**« buckets » affiché en double et non traduit** dans l'en-tête du graphe d'activité : `bucketCount` rendait déjà « 24 intervalles » et le fragment suivant rajoutait « buckets · pic » → `24 intervallesbuckets · pic 9/bucket`.

## 📤

✅

## 💻

✅

## ✅

✅

## Preuve

Une seule clé `baseChatAst.counts.bucketsPeak`, pluriel FR/EN, unité traduite.

