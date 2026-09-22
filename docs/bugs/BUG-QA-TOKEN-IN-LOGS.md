---
id: BUG-QA-TOKEN-IN-LOGS
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

**Un jeton porteur VIVANT est écrit en clair dans les logs de l'API à chaque connexion WebSocket.** Le sérialiseur `req` du logger journalisait `request.url` verbatim. Les endpoints WS du runtime portent leur credential en **query string** — un navigateur ne peut pas poser d'en-tête sur une poignée de main WebSocket, donc c'est structurel. L'option `redact` de pino (`*.token`) ne parcourt que des **propriétés d'objet** : elle n'a jamais vu le jeton noyé dans la chaîne `url`. Le masquage existant ne couvrait que les jetons de capacité du **chemin** (`/chat-shares/<token>`).

## 📤

✅ 12/08

## 💻

✅ branche `fix/qa-token-in-logs` **`f2be7b22`** (**non mergée**)

## ✅

✅ **12/08** fuite prouvée live

## Preuve

Scan des logs du pod api partagé (cluster de test) : **9 occurrences** d'un jeton vivant, toutes sur `…/ports/watch?token=…`, `…/files/watch?token=…`, `…/terminal?sessionId=…&token=…`. Correctif `redactUrlCredentials()` — pure et totale, opère sur la chaîne brute (pas `new URL()`) pour encaisser une URL relative ou malformée dans le chemin de journalisation ; masque la VALEUR des paramètres porteurs (token, access_token, api_key, secret, password, signature, client_secret…) en **conservant** chemin et paramètres de diagnostic (`sessionId`, `cols`, `rows`, `managed`). Tests **10/10**, rouge→vert vérifié (2/10 échouent sans le câblage). **LOT SENSIBLE (sécurité) : PROUVÉ, NON MERGÉ.** ⚠️ **Correctif de SURFACE** : la cause profonde est que des jetons circulent en query string — ils atterrissent aussi dans les logs d'accès nginx, les en-têtes `Referer` et l'historique du navigateur. Le vrai traitement est le sous-protocole WebSocket ou un jeton éphémère à usage unique. À arbitrer.

