---
id: BUG-DEPLOY-LIVE
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

Déploiement statique servi **blanc** : le HTML était préfixé alors que le déploiement a une origine dédiée.

## 📤

✅

## 💻

✅ `949f0748`

## ✅

✅

## Preuve

Rouge→vert (1/3 échoue avant). Suite `services/api` 180 fichiers / 1559 tests verts. CD vert, prod.

