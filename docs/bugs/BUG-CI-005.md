---
id: BUG-CI-005
---

## Bug

**Corps `URLSearchParams` inter-realm — 34 tests rouges sur le Node 22 de la CI (3ᵉ blocage).** `TypeError: Request constructor: Expected init.body ("URLSearchParams {}") to be an instance of URLSearchParams.` Les specs en environnement **jsdom** construisent un `URLSearchParams` du realm jsdom, passé à un `Request` d'**undici** dont le contrôle de marque est strict sur Node 22 — permissif sur Node 24 (poste de dev), d'où « vert en local, rouge en CI ». Resté invisible tant que la CI s'arrêtait avant l'étape « Unit tests ».

## 📤 Dispatché

✅ 11/08

## 💻 Codé

✅ `399d4bcc` (sur `main`)

## ✅ Testé live

☐

## Preuve

Preuve du diagnostic : **seuls** les `*.spec.tsx` (jsdom) échouent — les `*.spec.ts` équivalents, même motif mais environnement node (realm d'undici), passent tous. Correctif `.toString()` sur **20 sites** de specs `.tsx`, tous porteurs d'un `content-type: application/x-www-form-urlencoded` explicite (vérifié site par site) : octets identiques, `request.formData()` relit à l'identique. `app/components/workbench/Preview.tsx:1239` volontairement NON modifié — code de production, realm unique, et seul site `.tsx` sans `content-type` explicite. ⚠️ Le rouge n'est PAS reproductible en local (Node 24 ici, Node 22 en CI) : le local prouve la non-régression (6031 tests verts), la CI prouve le correctif.

