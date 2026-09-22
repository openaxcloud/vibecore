---
id: BUG-CI-001
---

## Bug

Le spec des types de déploiement attend encore que `scheduled` soit indisponible alors que le backend scheduler le marque disponible, ce qui casse la suite globale

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

✅

## Preuve

Le spec reflète désormais le contrat backend : `static`, `autoscale` et `scheduled` sont disponibles, `reserved-vm` reste indisponible. Test ciblé : 5/5 ; suite globale : 515 fichiers et 3 850 tests verts le 2026-07-14.

