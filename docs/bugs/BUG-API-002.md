---
id: BUG-API-002
---

## Bug

Le scheduler local interroge `ScheduledTask` à chaque tick alors que la relation n'existe pas dans la base locale

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

✅

## Preuve

La migration existante `0069_scheduled_tasks` était en attente, pas absente. Le `predev` API déploie désormais les migrations avant le scheduler. Validé sur PostgreSQL 16 vierge (72 migrations, second passage no-op, tables/enums/index/PK/FK), puis sur la base locale `:55432` : statut à jour, `/health` 200 et ticks à 500 ms sans erreur ; 58 tests verts, 3 intégrations DB skippées.

