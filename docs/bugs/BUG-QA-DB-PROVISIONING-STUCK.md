---
id: BUG-QA-DB-PROVISIONING-STUCK
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

**`PROVISIONING` éternel** et ressource CNPG empoisonnée.

## 📤

✅

## 💻

✅ `1348bf9f`

## ✅

✅

## Preuve

Reproduit en réel : `Database APPLIED=false — ERROR: role "t_<projet>" does not exist (42704)`. Le rôle propriétaire était créé « best-effort » et la CR posée quand même ; la ligne était écrite en `PROVISIONING` puis l'échec avalé (`non-fatal`), rendant le réessai impossible (contrainte unique + `{created:false}`). Corrigé des deux côtés. 4/4, rouge→vert (3/4 échouent avant).

