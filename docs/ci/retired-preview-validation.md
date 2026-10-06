---
id: BUG-AUDIT-CI-PREVIEW-001
---

## Bug

La PR Claude #636 retire un aperçu Cloudflare abandonné mais le test de marque lisait encore son fichier supprimé, bloquant Production CI.

## 📤 Dispatché

☑ 06/10/2026 — Codex, intégration de la PR #636 existante.

## 💻 Codé

☐ Correctif proposé : assertions de marque conservées pour les surfaces présentes, garde explicite de retrait de l'ancien workflow, garde des trois contrôles requis de Claude conservé. Fusion et contrôles du SHA courant à confirmer.

## ✅ Testé live

☐ Aucun changement de produit. Validation de la chaîne GitHub après fusion requise.

## Preuve

`app/runtime-branding.spec.ts` et `tests/guards/controles-requis-existent.spec.ts` exécutés ensemble sur la branche remise à jour avec main. La nouvelle assertion vérifie également que Release Validation n'attend pas Deploy Preview.
