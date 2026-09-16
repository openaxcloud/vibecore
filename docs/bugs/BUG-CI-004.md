---
id: BUG-CI-004
---

## Bug

**`??` inatteignable dans `services/api` — 2ᵉ blocage de Production CI.** `services/api/src/app.ts:33130` : `((existing?.metadata ?? {}) as Record<string, unknown>) ?? {}`. L'opérande de droite ne peut jamais s'exécuter ; TypeScript **5.8.3** (version résolue par le lockfile, donc celle de la CI) en fait une ERREUR TS2869. Masqué pendant 4 jours car l'étape `Typecheck` suit immédiatement la garde i18n : reverdir l'i18n seul n'aurait fait que déplacer le rouge d'une étape.

## 📤 Dispatché

✅ 11/08

## 💻 Codé

✅ `9fc8a243` (sur `main`)

## ✅ Testé live

☐

## Preuve

Correctif strictement inerte : `(x ?? {}) ?? {}` ≡ `(x ?? {})`. AVANT `pnpm run typecheck` → `services/api typecheck: Failed`. APRÈS → « workspace packages passed ». Ne bloquait PAS le déploiement : `deploy-main.yml` construit via Cloud Build et ne lance pas `pnpm run typecheck`.

