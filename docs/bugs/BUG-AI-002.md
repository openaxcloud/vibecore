---
id: BUG-AI-002
---

## Bug

**P1 — un `403 AI_MODEL_PLAN_BLOCKED` arrivait a l'utilisateur en « Internal server error ».** Il ne pouvait rien faire, alors qu'avec le vrai message il change de modele.

## 📤 Dispatché

☐

## 💻 Codé

☐

## ✅ Testé live

☐ **CORRIGE, en attente de livraison**

## Preuve

`aiGatewayCompletion` ecrasait TOUTE reponse non-ok de la passerelle en `502 AI_GATEWAY_REQUEST_FAILED`. La passerelle preserve pourtant son statut reel (403 plan, 429 quota, 400 requete). **Mesure du 01/09** : 4 demandes avec fournisseur explicite, `upstreamStatus: 403` cote journal, `502 {"error":"Internal server error"}` cote utilisateur. **Correctif** : un statut 4xx est repercute tel quel avec son code et son message ; un 5xx amont reste un 502, car l'utilisateur n'y peut rien et le message interne ne doit pas fuir. **Le motif existe sur 2 AUTRES sites** (`SERVER_DEPLOY_BUILD_FAILED` ligne ~7236, `SERVER_DEPLOY_MANAGER_FAILED` ligne ~7309) : hors perimetre de ce correctif car ils appellent un service interne dont les statuts ne sont pas actionnables par l'utilisateur final — a re-examiner separement, ce n'est PAS une certification.

