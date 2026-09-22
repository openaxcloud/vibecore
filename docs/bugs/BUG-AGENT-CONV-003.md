---
id: BUG-AGENT-CONV-003
annotation: "(doublon)"
---

## Bug

**P2 — `GET /api/projects/<id>/ai/conversations/<cid>/transcript` rend `{"message":"Unexpected Server Error"}` sous un statut HTTP 200.** La seconde voie de lecture du fil est cassée, et **silencieusement** : tout appelant qui teste le code de statut conclut que tout va bien. C'est le motif du registre appliqué au protocole — la commande réussit, le résultat est faux. **État en production : NON COUVERT, ce qui n'est pas « non reproduit ».** Seul le chemin **non authentifié** y a été testé, et il rend proprement `401`. Le cas **authentifié** — celui d'Avi, et le seul où la route fait réellement son travail — n'a pas été mesuré. Un `401` sur un appel anonyme ne dit rien de ce que rend la route pour un utilisateur connecté.

## 📤 Dispatché

☑ 10/09

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐

## Preuve

**DOUBLON de la ligne BUG-AGENT-CONV-003 plus bas, et DEUX de ses affirmations sont fausses — corrigées ici plutôt que laissées en place.** Règle 16 : un doublon établi se ferme sans test propre, à condition de le DIRE. (1) « sous un statut HTTP 200 » est FAUX. Mesuré de bout en bout le 10/09 sur le vrai `createRequestHandler` du dépôt : sans `loader`, React Router lève lui-même un **400**, que `sanitizeError` remplace hors développement par `{"message":"Unexpected Server Error"}`. Le corps opaque est réel, le statut 200 ne l'est pas — et c'est cette affirmation qui a fait chercher au mauvais endroit, puisqu'un corps d'erreur sous 200 décrit un tout autre défaut. (2) « une erreur doit sortir en 5xx » vise à côté : il n'y a pas d'erreur serveur à signaler. Le serveur n'expose **aucun** `GET` sur cette route (seulement `PUT`), et aucun client ne la lit — le fil se lit par `/messages`. Router un `GET` vers un point d'entrée inexistant serait le correctif qui « route vers un panneau vide » de la règle 10. **Ce qui a été livré** (`789a6a59`) : un `loader` qui dit à `GET`/`HEAD` ce que l'`action` disait déjà à `POST`/`DELETE`/`PATCH` — **405** avec le code et l'en-tête `Allow: PUT`. épinglé par `app/routes/api.projects.ai.conversations.transcript.methodes.spec.ts`. ⚠️ Reste ouvert et à traiter comme un point DISTINCT : les 34 autres routes `api.*` sans `loader` portent le même mécanisme.

