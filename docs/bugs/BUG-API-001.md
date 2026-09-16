---
id: BUG-API-001
---

## Bug

Le gate global TypeScript est bloqué par cinq erreurs TS18046 dans `services/api/src/prisma-store.ts` lorsque le code Prisma inspecte un `error` de type `unknown`

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

✅

## Preuve

Type guard Prisma explicite, sans cast `any` ni changement de contrat métier. Store spec : 6 tests verts, 3 intégrations DB skippées ; typecheck API et `pnpm typecheck` global verts ; lint root 0 erreur. Correctif backend `a64d685c`.

