---
id: BUG-QA-THUMBNAIL-500-001
---

## Bug

**3 vignettes de projet sur 6 renvoient HTTP 500 avec un corps vide en production.** `GET /api/projects/:id/thumbnail` → **500**, `content-length` absent, 0 octet, en **458 à 869 ms** (projets `…qjtuhjeb`, `…bummu3vk`, `…hrf98xad`). Les 3 autres répondent normalement (302 vers une URL signée, image 1280×800 servie en 450–1531 ms). **Le 500 vient du backend, pas du BFF** : `app/routes/api.projects.$projectId.thumbnail.ts` relaie le statut amont (`error.status === 404 ? 204 : new Response(null, {status: error.status})`) et ne fabrique lui-même qu'un 502. Un 500 ne peut donc provenir que de l'API. Côté API (`services/api/src/app.ts`, `GET /projects/:projectId/thumbnail`), tous les cas prévus rendent **404** — stockage désactivé, objet absent, dépassement de délai (`StorageDeadlineError`) ; le repli final est `sendObjectStorageError(reply, error)`. Un 500 correspond donc à une **erreur de stockage d'objets non anticipée**, distincte du cas « pas encore de vignette ». **Effet utilisateur limité mais réel** : la carte bascule sur « No preview yet », état correct, donc le défaut est silencieux — mais il masque une panne de stockage derrière un message rassurant, et ces 3 projets ne pourront jamais afficher d'aperçu tant que la cause n'est pas traitée.

## 📤

☐

## 💻

☐

## ✅

✅ **27/08** reproduit live prod, 6/6 projets testés

## Preuve

Repro et tableau des statuts : `docs/audit/evidence-2026-08-27/vignettes-tableau-de-bord.md`. ⚠️ **Cause exacte non identifiée** : je n'ai pas accès aux logs de l'API de production depuis cette session pour lire l'erreur derrière `sendObjectStorageError`. À compléter côté exploitation — c'est la première chose à regarder.

