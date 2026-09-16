---
id: BUG-AGENT-WEBCLONE-002
---

## Bug

**P0 — le garde DNS anti-SSRF rendait TOUTE lecture d'URL impossible : `/api/web-search` (le widget 🌐) répondait 502 `FETCH_FAILED` sur n'importe quelle URL, et la référence web automatique de l'agent en héritait — elle n'aurait jamais rien lu en production.** Mesuré le 08/09 sur une pile complète locale (Postgres 16 + pgvector, Redis, API, build de production) : `POST /api/web-search {"url":"https://nodejs.org/en"}` → **502 en 31 ms**, journal serveur `Web URL fetch transport error: TypeError: Invalid IP address: undefined`, alors qu'un `https.request` direct depuis le même processus rendait **200**. **Cause** : Node appelle le crochet `lookup` avec `options = {"hints":32,"all":true}` (mesuré) et attend alors `callback(err, adresses[])` ; le code répondait TOUJOURS `callback(err, adresse, famille)` — une chaîne là où un tableau est attendu. **PRÉEXISTANT** : identique dans `0f578f4:app/routes/api.web-search.ts:154`, donc antérieur à tout ce lot ; le widget 🌐 était cassé en production depuis l'ajout de ce garde.

## 📤 Dispatché

☑ 08/09

## 💻 Codé

☑ 08/09 — **DÉPLOYÉ EN PRODUCTION** : run `deploy-main` **1553** vert de bout en bout sur `6b52cae` (barrière franchie, image web construite, scan de vulnérabilités et signatures cosign verts, `helm upgrade` 13:01→13:05 UTC, rollout vérifié, imageIDs des pods conformes au manifeste de release, aucun rollback). `createValidatingLookup` exporté et testable : rend un **tableau** quand `options.all`, `adresse + famille` sinon ; la validation SSRF est inchangée (une seule adresse privée rejette tout le lot).

## ✅ Testé live

✅ **08/09 — preuve live de bout en bout sur pile complète locale** : (1) `POST /api/web-search` → **200 en 287 ms**, `success:true`, titre « Node.js — Run JavaScript Everywhere », 2 659 caractères de contenu ; (2) `POST /api/chat` avec un vrai `projectId` et « Clone le site https://nodejs.org/en » → progression **« Reading nodejs.org » puis « Read nodejs.org: 6 page(s), 2 stylesheet(s) »**, journal `chat.webReference` `{pages:6, stylesheets:2, crawl:true, cloneIntent:true, errors:["ROBOTS_DISALLOWED"], blockChars:29844, durationMs:1061}` — le crawl, le respect de robots.txt et le bloc observé fonctionnent en réel ; (3) sans `projectId` : **zéro** ligne `chat.webReference`, le garde du chemin quota tient. Épinglé par `safe-fetch.spec.ts` (4 cas : forme tableau, forme adresse+famille, rejet d'un lot contenant une adresse privée dans les DEUX formes, résolution vide et erreur DNS). **Contre-épreuve** : branche `options.all` retirée → 1 rouge sur « rend un TABLEAU quand Node demande all:true » ; restaurée → 14 verts. **NON vérifié** : la génération par le modèle (aucune clé LLM dans le bac à sable) et la production elle-même.

