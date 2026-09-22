---
id: BUG-E2E-PASTILLE-001
---

## Bug

**La barrière de livraison refuse des commits sur un test qui passe 6 fois sur 6 en local : `ide-mobile-chrome.spec.ts:2759` « elle se peint sur le fil, et sur rien d'autre » échoue en CI sur sa PRÉCONDITION** (« la pastille doit apparaître quand on remonte le fil », 20 s d'attente, 3 tentatives sur 3), alors que le test frère `ide-mobile-chrome.spec.ts:1135`, qui exerce la MÊME pastille, passe dans le même run. Le test ne touche pas `/api/chat` : il pose son fil par l'API (`preparerUnProjet` → `PUT …/transcript`), donc aucun chemin serveur de la référence web n'y participe. Historique du même test depuis son ajout (`60b227f`, 08/09 18:49) : `60b227f` vert, `db44917` vert, `67acc7b` vert, `c3e9ed6` **rouge 3/3**. Et avant lui, la même suite avait déjà refusé `a0611a5` — un commit DOCUMENTAIRE — sur un test encore différent (« Effacer l'historique »), ce qu'aucun changement de code ne peut expliquer.

## 📤 Dispatché

☑ 08/09

## 💻 Codé

☐ — **NON-DÉFAUT DE CODE, établi** : rien à corriger dans le produit ; le test est instable en CI

## ✅ Testé live

✅ 08/09 — **contrôle décisif obtenu**

## Preuve

**Mesuré le 08/09 sur `c3e9ed6`, build de production local (Postgres 16 + pgvector, Redis, API, `react-router build`) : 6 exécutions, 6 verts** — 3 projets (chromium, tablet, mobile) en 1,1 min, puis 3 relances chromium à 21,0 / 20,9 / 21,1 s. **Contrôle impossible ici** : cette session n'a pas le droit de relancer un workflow (`rerun_failed_jobs` et `run_workflow` rendent tous deux `403 Resource not accessible by integration`), donc la relance du MÊME commit — le seul contrôle qui trancherait (règle 2) — n'a pas pu être prise. **CONTRÔLE DÉCISIF, obtenu autrement** : `bf3951b` (autre session) CONTIENT mes trois commits — `afa3d9c` en est un ancêtre, vérifié par `git merge-base --is-ancestor` — et son E2E est **VERTE**, barrière de livraison franchie, ce test compris. Le même code, le même test, vert. Mon changement n'est donc PAS la cause, et la relance que cette session ne pouvait pas déclencher a eu lieu de fait. **Piste restante, non vérifiée** : la précondition dépend du fil qui déborde ET d'un événement de défilement qui se pose ; sous contention CI, `attendreLeFilStable` peut rendre la main avant la fin du rendu — à durcir par la session qui possède ce test, sur la base du compteur d'intermittence déjà présent dans la barrière (règle 17).

