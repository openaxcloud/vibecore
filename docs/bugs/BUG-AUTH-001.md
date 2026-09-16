---
id: BUG-AUTH-001
---

## Bug

**P3 — posture d'authentification incohérente : `/workspace-settings` rend un `200` à un visiteur NON authentifié**, là où `/account-settings`, `/billing`, `/usage`, `/api-keys`, `/organization-members`, `/security-settings`, `/dashboard`, `/projects` et `/admin` renvoient tous un **`302`** vers la connexion. Cause : la garde n'est pas centralisée mais **implémentée route par route via les loaders de données** — `account-settings._index.tsx:104` intercepte le `401` et redirige (`isReauthRedirect`), tandis que le loader de `app/routes/workspace-settings.tsx` ne fait **que résoudre la locale** et n'appelle aucune donnée serveur, donc rien ne déclenche la redirection. **Pas de fuite de données constatée** : la page non authentifiée ne rend qu'une coquille (« Loading E-Code », 0 identifiant, 0 e-mail, 0 slug d'organisation) et les appels client suivants échouent en `401`. Le risque est **structurel** : le jour où ce loader lira la moindre donnée serveur, la page devient une fuite, sans que rien ne le signale.

## 📤 Dispatché

☐

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐ **Constaté live 15/08**

## Preuve

`curl` sans aucun cookie sur l'env d'audit : `/workspace-settings` → **200** (`<title>Workspace settings — E-Code</title>`), `/account-settings` → **302**, `/billing` → **302**. Corps extrait et analysé : 24 ko, texte visible = « Workspace settings — E-Code Loading E-Code », aucune donnée. Code sur `origin/main` : `app/routes/workspace-settings.tsx` (loader = `resolveRequestLocale` seul) vs `app/routes/account-settings._index.tsx:104`. ⚠️ **Lot sécurité — consigné seulement**, laissé à la session dédiée. **REPRIS LE 10/09 — MESURÉ, PAS CORRIGÉ, ET VOICI POURQUOI (arbitrage à trancher par Avi).** Mesures : le fichier entier fait 26 lignes, son `loader` ne résout qu'une locale, et `grep -E "apiRequest

