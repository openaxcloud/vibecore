---
id: BUG-QA-PRISMA-CODE-LEAK-001
---

## Bug

**Le gestionnaire d'erreurs global de l'API renvoie au client le code d'erreur Prisma brut.** `services/api/src/app.ts:8779` (sur `origin/main`) : `const code = (error as Error & { code?: string }).code ?? 'API_ERROR';` puis `reply.code(statusCode).send({ error: …, code })`. Le **message** est correctement assaini (« Internal server error » générique pour les 5xx, via `appPublicEnglish('INTERNAL_SERVER_ERROR')`), **mais le champ `code` ne l'est pas** : pour une `PrismaClientKnownRequestError`, `error.code` est le code Prisma. Toute erreur de persistance non interceptée expose donc à l'appelant la classe exacte de la panne — `P2002` (contrainte d'unicité), `P2003` (clé étrangère), `P2025` (enregistrement absent), `P2037` (connexions épuisées)… Conséquences : (a) divulgation de la pile de persistance (Prisma/PostgreSQL) et du type de contrainte violée, utile à un attaquant pour cartographier le schéma ; (b) des clients pourraient se mettre à brancher sur des codes internes Prisma, qui ne sont pas un contrat d'API. ⚠️ **À ne PAS confondre avec un défaut de facturation.** Le 500 qui a révélé ce comportement (`GET /billing/subscription` et `/billing/usage` → `{"error":"Internal server error","code":"P2003"}`) est un **artefact de capacité de l'environnement de test**, pas un bug produit : les logs API montrent « *Too many database connections opened: remaining connection slots are reserved for roles with privileges of the pg_use_reserved_connections role* » sur `prisma.session.findUnique()`. L'instance Cloud SQL d'audit est un **`db-g1-small`** avec **5 réplicas API** et un balayage navigateur concurrent — le runbook §2 précise d'ailleurs que le « comportement sous charge réelle » n'est plus prouvé sur cet environnement. **Le défaut retenu ici est uniquement la fuite du code**, pas le 500.

## 📤

☐

## 💻

☐

## ✅

✅ **27/08** code confirmé sur `origin/main` + réponse client capturée en réel

## Preuve

**Preuve client** (env de test, SHA `040dd2976d`) : `curl -H "authorization: Bearer <token>" https://api.<lb>.sslip.io/billing/subscription` → **HTTP 500** `{"error":"Internal server error","code":"P2003"}` ; rejoué → identique. **Preuve serveur** : logs du pod API, `"type":"PrismaClientKnownRequestError"`, message « Too many database connections opened… » sur `prisma.session.findUnique()`. **Preuve code** : `git show origin/main:services/api/src/app.ts` → `setErrorHandler` ligne 8735, construction du `code` ligne 8779, envoi ligne 8786. ⚠️ **Non rejoué sur la production** : déclencher une erreur Prisma en prod exigerait de provoquer volontairement une panne de persistance — écarté. Le constat repose sur le **code de `main`**, qui est le même binaire, et sur la reproduction en environnement de test. **Correctif proposé** : n'exposer que des codes applicatifs connus (liste blanche : `VALIDATION_ERROR`, `AUTH_*`, `PANEL_*`…) et rabattre tout code non reconnu — a fortiori tout code commençant par `P` suivi de chiffres — sur `API_ERROR`, en conservant le code réel uniquement dans le log et Sentry (ce que le handler fait déjà ligne 8759).

