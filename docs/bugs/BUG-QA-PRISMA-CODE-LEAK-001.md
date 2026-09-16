---
id: BUG-QA-PRISMA-CODE-LEAK-001
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**P2 (fuite d'information interne) — le gestionnaire d'erreurs global de l'API renvoie au client le code d'erreur Prisma BRUT.** `services/api/src/app.ts` : `const code = (error as Error & { code?: string }).code ?? 'API_ERROR';` puis `reply.code(statusCode).send({ error: …, code })`. Le **message** est correctement assaini (« Internal server error » générique pour les 5xx), **mais le champ `code` ne l'est pas** : pour une `PrismaClientKnownRequestError`, `error.code` est le code Prisma. Toute erreur de persistance non interceptée expose donc à l'appelant la classe exacte de la panne — `P2002` (unicité), `P2003` (clé étrangère), `P2022` (colonne absente), `P2025` (enregistrement absent), `P2037` (connexions épuisées)… Conséquences : divulgation de la pile de persistance et du type de contrainte violée, utile à qui cartographie le schéma ; et des clients pourraient se mettre à brancher sur des codes internes Prisma, qui ne sont pas un contrat d'API. 🔁 **DEUX REPRODUCTIONS LIVE INDÉPENDANTES, sur deux codes et deux familles de routes différentes — ce point n'est donc pas théorique.** **(1) 27/08** — `GET /billing/subscription` → **500** `{"error":"Internal server error","code":"P2003"}`, sous épuisement du pool de connexions. **(2) 01/09** — `POST /auth/register` → **500** `{"error":"Internal server error","code":"P2022"}`, sur une route d'**authentification publique**, donc accessible **sans être authentifié**. Ce que la seconde divulgue concrètement à un anonyme : que la persistance est Prisma, et que la base présente un **décalage de schéma** — c'est-à-dire l'existence d'une fenêtre de migration en cours, information d'exploitation qu'aucun client n'a à connaître. Le déclencheur était banal : une bascule d'image par `kubectl set image`, qui ne joue pas le hook Helm de migration (voir `docs/DEPLOY_RUNBOOK.md`). Il ne faut donc **ni une attaque, ni une panne exotique** pour l'observer.

## 📤

☐

## 💻

☐

## ✅

✅ **27/08 puis 01/09** — deux reproductions live datées

## Preuve

**Preuve (1)**, env de test, SHA `040dd2976d` : `curl -H "authorization: Bearer <token>" https://api.<lb>.sslip.io/billing/subscription` → **500** `{"error":"Internal server error","code":"P2003"}` ; rejoué → identique. Logs API : `"type":"PrismaClientKnownRequestError"`, « Too many database connections opened… » sur `prisma.session.findUnique()`. **Preuve (2)**, même env après bascule vers `fce8639ab3` : `curl -X POST https://api.34.163.208.161.sslip.io/auth/register -d '{…}'` → **HTTP 500** `{"error":"Internal server error","code":"P2022"}`, **sans en-tête d'autorisation**. Cause sous-jacente : 4 migrations non appliquées (`0081_project_checkpoint`, `0082_db_migration_execution`, `0083_account_lockout`, `0083_session_idle_timeout`) — confirmées ensuite par un `prisma migrate deploy` qui les a jouées, après quoi la même requête rend **201**. ⚠️ **Non rejoué sur la production** : provoquer une panne de persistance en prod est écarté. Le constat repose sur le code de `main` — le même binaire — et sur deux reproductions indépendantes en environnement de test. **Correctif proposé** : n'exposer que des codes applicatifs connus (liste blanche `VALIDATION_ERROR`, `AUTH_*`, `PANEL_*`…) et rabattre tout code non reconnu — a fortiori tout code `P` suivi de chiffres — sur `API_ERROR`, en conservant le code réel dans le log et Sentry, ce que le handler fait déjà. **Épinglage attendu (règle 16)** : un test sur `setErrorHandler` qui lui passe une `PrismaClientKnownRequestError` et vérifie que le corps rendu porte `API_ERROR` et jamais `P####`. 📌 *Note de traçabilité* : cette entrée existait déjà sur la branche non mergée `wip/audit-env-remainder` et était **absente de `main`** — comme 28 autres constats QA. Elle est portée ici parce que `main` est la source de vérité.

