---
id: BUG-SEC-002
---

## Bug

**P1 sécurité — le jeton de session est transmis en clair dans la QUERY STRING de l'ouverture du terminal, et se retrouve donc en clair dans les journaux serveur.** Route observée : `GET /api/runtime/workspaces/<id>/terminal?sessionId=…&cols=80&rows=24&managed=1&**token=session_…**`. Un jeton porteur placé dans l'URL fuite mécaniquement partout où l'URL est journalisée ou relayée : logs applicatifs, logs d'ingress, en-têtes `Referer`, historiques de proxy. Ici il est **directement lisible dans `kubectl logs`** du pod API. Un jeton de session doit voyager dans un en-tête `Authorization`, un cookie, ou via le sous-protocole WebSocket (`Sec-WebSocket-Protocol`) — jamais dans l'URL.

## 📤 Dispatché

☐

## 💻 Codé

☐

## ✅ Testé live

☐ **Constaté live 15/08**

## Preuve

Extrait brut des logs du pod API (env d'audit, jeton de test tronqué ici) : `"url":"/api/runtime/workspaces/<id>/terminal?sessionId=terminal-1786830254914-aed6k8wzlm&cols=80&rows=24&token=session_K_h5…"`. **Lot sécurité — consigné seulement**, non corrigé ici, conformément à la consigne de laisser les lots sensibles à la session dédiée. **MISE À JOUR DU 09/09, en relisant le code plutôt qu'en le supposant — UNE MOITIÉ EST CORRIGÉE, PAS L'AUTRE, et il faut dire laquelle.** ✅ La fuite VERS NOS JOURNAUX est fermée : `services/api/src/log-redaction.ts` (BUG-QA-TOKEN-IN-LOGS) lave l'URL avant qu'elle n'atteigne le journal — le `redact` de Pino ne parcourt que des propriétés d'objet (`*.token`) et ne voyait donc rien dans la CHAÎNE `url`. Vingt et une valeurs de paramètres sont traitées comme des identifiants (`token`, `access_token`, `sig`, `code`, `secret`…), comparées en minuscules, et le reste de l'URL est conservé pour rester diagnostiquable. épinglé par `services/api/src/log-redaction.spec.ts`. ❌ **CE QUI RESTE, et ce n'est pas un détail** : le jeton VOYAGE toujours dans la query string. Le module le dit lui-même — « Browsers cannot set headers on a WebSocket handshake, so the runtime WS endpoints carry their bearer credential as a QUERY PARAMETER ». Il reste donc lisible partout où l'URL est journalisée HORS de notre application : ingress, proxys, `Referer`. Le correctif de fond est celui écrit plus haut — sous-protocole `Sec-WebSocket-Protocol` — et il touche les trois points d'entrée runtime (`terminal`, `ports/watch`, `files/watch`), client ET serveur ET agent d'espace de travail. Je NE le prends PAS au détour d'un autre lot : une erreur sur ce chemin coupe l'IDE entier, et la consigne de laisser les lots sensibles à la session dédiée tient.

