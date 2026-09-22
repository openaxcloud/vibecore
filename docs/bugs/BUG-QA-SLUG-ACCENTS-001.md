---
id: BUG-QA-SLUG-ACCENTS-001
---

## Bug

**Le nom d'un projet accentué produit une URL mutilée et définitive : « Crée une page web simple » devient `/@org/cr-e-une-page-web-simple`.** Le correctif **existe déjà** dans `services/api/src/slugify.ts` : `baseSlug()` applique `normalize('NFD')` puis retire les marques combinantes **avant** le filtre `[^a-z0-9]`, et l'en-tête du fichier documente précisément ce symptôme (« *Without that step every accented letter collapsed to a dash… "Créez une page de tarification" → cr-ez-une-page-de-tarification* ») en avertissant qu'il ne faut pas dupliquer l'implémentation « *in prisma-store.ts and app.ts* ». **C'est exactement ce qui s'est produit** : `services/api/src/app.ts` **n'importe jamais `slugify`** — uniquement `slugifyRouteSegment` (ligne 173, pour la résolution d'URL). Les chemins de **création** réimplémentent le slug en ligne, sans retirer les diacritiques : `slug: body.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-')` — **5 occurrences** : **18893** (`POST /orgs`), **20026** (`POST /orgs/:orgId/projects`), **20135** (`POST /orgs/:orgId/projects/from-template`), **20205** (`POST /orgs/:orgId/projects/from-ai`), **20747** (`POST /orgs/:orgId/projects/import/github`). Le côté **lecture** normalise correctement (`slugifyRouteSegment`), le côté **écriture** non : c'est la dérive exacte que le fichier partagé cherchait à empêcher. **Portée** : tout nom de projet **ou d'organisation** contenant un accent — donc l'essentiel des noms en français, et le premier mot des prompts générés par l'IA. L'URL est figée à la création et accompagne le projet pour toute sa vie. **Impact** : cosmétique mais permanent et visible — l'adresse partagée d'un projet porte `cr-e-` au lieu de `cree-`. Aucune erreur de résolution constatée (le slug stocké est celui utilisé dans l'URL, et sa normalisation est idempotente).

## 📤

☐

## 💻

☐

## ✅

✅ **28/08** reproduit live de bout en bout sur env de test au SHA `040dd2976d`

## Preuve

**Repro** : créer un projet depuis `/projects/new` avec le prompt « Crée une page web simple avec un titre et un bouton ». Résultat observé : redirection vers **`/@qa-sweep-org/cr-e-une-page-web-simple`**, et `GET /orgs/:orgId/projects` confirme `slug = "cr-e-une-page-web-simple"` pour `name = "Crée une page web simple"` (`sourceType: ai`). **Correctif** : importer `slugify` depuis `./slugify.js` et remplacer les **5** expressions en ligne par `slugify(name)` — le module partagé existe déjà et est testé.

