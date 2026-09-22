---
id: BUG-USR-006
---

## Bug

**(P2) 404 console à chaque rendu du dashboard/projects.** Le proxy `/api/projects/:id/thumbnail` (`api.projects.$projectId.thumbnail.ts`) renvoyait **404** quand un projet n'a pas encore d'aperçu ; l'`<img>` des cartes projet loggait donc `Failed to load resource: 404` en console à **chaque** rendu de `/dashboard`, `/projects`, `/recent-projects`, pour **chaque** projet brouillon (le payload projet API ne porte aucun flag thumbnail → l'URL est toujours construite). Constaté live (compte QA jetable) : 1 projet → 1 erreur 404 par chargement.

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ `fix/user-area-batch2` (voir SHA PR)

## ✅ Testé live

☐ *(AVANT live prod ; APRÈS spec + CI, pas déployé)*

## Preuve

AVANT : console prod `Failed to load resource: the server responded with a status of 404 () @ /api/projects/…/thumbnail`. FIX : le proxy renvoie **204 No Content** au lieu de 404 pour « pas d'aperçu » (l'`<img>` déclenche toujours `onError` → placeholder « No preview yet », mais un 2xx **n'est pas** loggé en erreur console) ; le param projet manquant reste un vrai 404. APRÈS : `api.projects.$projectId.thumbnail.spec.ts` **7/7** (302 signé / 204 no-url / 204 backend-throw / 404 id manquant). *(Même défaut noté BUG-USR-002 en consigné dans PR #111 ; corrigé ici.)*

