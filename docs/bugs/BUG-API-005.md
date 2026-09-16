---
id: BUG-API-005
---

## Bug

**P2 — une fonctionnalité non câblée dans l'environnement est annoncée à l'utilisateur comme une panne du serveur.** `GET /agent-memory` (panneau « Studio de l'agent ») répond `503 {"error":"Internal server error","code":"AGENT_MEMORY_UNCONFIGURED"}`. Le `code` est exact — la mémoire d'agent n'est simplement pas configurée ici — mais la moitié lisible par un humain dit « erreur interne du serveur », ce qui envoie l'opérateur, le support ou un client d'API chercher un crash qui n'a jamais eu lieu. Même classe que **BUG-STORAGE-001** (cause de configuration présentée comme autre chose). **Cause racine** : le handler d'erreur masque `message` derrière le générique `INTERNAL_SERVER_ERROR` pour tout 5xx *sauf* si l'erreur porte un `publicMessage` (`services/api/src/app.ts:8835` — `statusCode >= 500 ? (error.publicMessage ?? appPublicEnglish('INTERNAL_SERVER_ERROR')) : error.message`) ; `AgentMemoryConfigurationError` n'en posait pas.

## 📤 Dispatché

✅

## 💻 Codé

✅ `c6b560d8`

## ✅ Testé live

☐ *(corrigé + testé unitairement ; à revalider live après déploiement)*

## Preuve

**Constaté live 17/08** — env d'audit `vibecore-audit-test-20260807`, build `1c68880b39`, tenant QA isolé, projet `cmsx94mln01ne0nhe0qi2ctw6`, balayage des 16 panneaux IDE × 3 formats : seul `/agent-memory` sort du lot (les 15 autres panneaux répondent correctement). **Correctif** : `publicMessage` posé sur `AgentMemoryConfigurationError` via l'échappatoire que les autres 5xx intentionnels utilisent déjà (`WORKSPACE_STARTING`, `AI_GATEWAY_UNAVAILABLE`, `MCP_MARKETPLACE_UNAVAILABLE`), + clé `AGENT_MEMORY_UNCONFIGURED` au catalogue public EN/FR (639→640 clés). La posture de masquage est **inchangée** : le générique reste le défaut pour toute erreur non codée, et `message` continue de porter le détail interne vers les logs. **Preuves** : `services/api/src/tests/agent-memory-unconfigured.spec.ts` 3/3 (contrat 503+code ; `publicMessage` présent et « internal server error » absent ; détail interne préservé côté logs) ; gardes de source i18n + suite agent-memory 34/34 ; typecheck API 0 erreur.

