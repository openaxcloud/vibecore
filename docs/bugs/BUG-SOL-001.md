---
id: BUG-SOL-001
---

## Bug

Le chemin public `/solutions/internal-ai` aboutit sur une 404 au lieu de la page Internal AI

## 📤 Dispatché

✅

## 💻 Codé

✅ `8c965f19` (poussé sur `main`)

## ✅ Testé live

✅ **24/07**

## Preuve

Le code de redirection n'avait **jamais été commité** (le tableau sur-revendiquait) : `solutionPages` n'avait que `internal-ai-builder`. Ajout d'un alias 308 dans le loader `solutions.$slug.tsx` + spec 3/3 (redirect / page canonique servie / slug inconnu 404). **AVANT (prod 6d57a401)** : `/solutions/internal-ai` → **404**. **APRÈS déploiement (prod web `7287c27d83`)** : `curl` → **HTTP 308 → `/solutions/internal-ai-builder`** puis chaîne suivie → **200**.

