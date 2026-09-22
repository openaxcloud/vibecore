---
id: BUG-DB-001
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

**`POST /projects/:id/database/provision` accepte (202) puis reste bloqué en `PROVISIONING` sans jamais échouer.** L'API crée l'enregistrement d'instance et annonce `clusterName` / `tier: shared`, mais si la plateforme n'a pas de quoi satisfaire la demande, rien ne le signale : ni délai d'expiration, ni statut `FAILED`, ni message. Côté IDE le bouton reste sur « Création… » indéfiniment.

## 📤

✅ 12/08

## 💻

☑ 09/09

## ✅

☐

## Preuve

Repro API directe (jeton de session réel, projet `cmspnxpg9…`) : **HTTP 202** en 2,2 s, `{"status":"PROVISIONING","clusterName":"db-cmspnxpg900040nf9dq8oeu3e","tier":"shared","created":true}` ; puis `GET /projects/:id/database` renvoie `development=PROVISIONING` à 25/50/75/100/125/**150 s**, sans changement ni erreur. ⚠️ **Honnêteté sur la cause** : dans CET environnement, l'aboutissement est **impossible par construction** — aucun opérateur CNPG n'est installé (`kubectl get crd **Revérifié le 09/09** : la colonne Codé était restée à ☐ alors que le correctif ET sa garde existent. Contrôlé en exécutant les gardes, pas en les lisant — épinglé par `services/api/src/database-provision-retry.spec.ts` (vertes ce jour). ⚠️ « Testé live » reste ☐ : j'ai vérifié des GARDES, pas un écran.

