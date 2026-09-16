---
id: BUG-BUILD-002
---

## Bug

**P1 — le tier `admin` était INCONSTRUCTIBLE : `app/` manquait au contexte Docker.** `apps/admin` consomme la source de l'application web via l'alias `~/*` du workspace (`src/i18n.ts` importe `~/lib/i18n/catalogs/admin` et `~/lib/i18n/language` ; son `vite.config` alias `~` vers `../../app`), mais `infra/docker/node-service.Dockerfile` ne copiait que `apps`, `packages` et `services` — `app/` n'existait pas dans le conteneur. **Invisible en local** (le dépôt entier y est, `tsc --noEmit` exit 0) : le défaut ne se manifestait qu'au build d'image.

## 📤 Dispatché

📤 **Dispatché**

## 💻 Codé

💻 **Codé — mergé sur `main` (SHA `d839c4f65b`, merge `ac1ed19d81`)**

## ✅ Testé live

✅ **PROUVÉ par un build Docker RÉEL 18/08**

## Preuve

**Repro avant correction** : en recopiant exactement ce que le Dockerfile copie (apps+packages+services, sans `app/`) dans un répertoire témoin → **les deux mêmes `TS2307`, mêmes lignes et colonnes** que Cloud Build. Avec `app/` ajouté → `tsc --noEmit` exit 0 **et** `vite build` réussi. **Preuve définitive** : build Cloud Build réel de l'image admin depuis `origin/main` sur le projet d'audit → **SUCCESS en 5 min 27 s**, étapes `prime-cache`/`build-service`/`scan-image` toutes SUCCESS, image poussée (`admin:admin-fix-check`, `sha256:a04b4125…`). Correctif : `COPY app ./app` dans le SEUL étage `build` — l'étage `runtime` ne reprend que `/runtime`, donc aucune des six images partageant ce Dockerfile ne grossit (vérifié sur `main` : 0 occurrence dans l'étage runtime). Garde `apps/admin/src/build-context.spec.ts`, vérifié rouge→vert.

