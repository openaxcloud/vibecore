---
id: BUG-CHAT-REFLEXION-SILENCIEUSE-001
section: "Mesures sur vrais tours de production — 2026-09-28/29"
---

## Bug

**P0 — régression introduite par #592 : un tour de construction Power pouvait être coupé par le chien de garde client.** #592 a fait passer la réflexion Anthropic de `disabled` à `adaptive` + `display: summarized` sur le fil, sans le correctif d'accompagnement : `ai@4.3.16` ne transmet le raisonnement au navigateur qu'avec `mergeIntoDataStream(dataStream, { sendReasoning: true })` (défaut `false`, `node_modules/ai/dist/index.mjs:6117`). Opus réfléchissait donc EN SILENCE, et le chien de garde (`STREAM_STALL_MS = 50 000`, `Chat.client.tsx`) arrêtait le tour. Leçon (Avi, 29/09) : une fonctionnalité réactivée sans son correctif d'accompagnement n'est pas « à moitié livrée », c'est une régression — elle part avec #594 ou pas du tout.

## 📤 Dispatché

☑ 28/09

## 💻 Codé

☑ #594 (`00c70ab924`) — `sendReasoning: true` aux deux appels, épinglé par `app/lib/.server/llm/reflexion-envoyee-au-client.spec.ts`. ☑ servi le 2026-09-30 : `web`, `api`, `worker`, `workspace-manager` en `a9e99cbdc1` (déploiements `36642317474` puis `36650325168`, ce dernier en `force_tiers=runtime` — le calcul des tiers partait du dernier déploiement réussi d'avant le rollback et n'avait pas reconstruit l'API). Rollback levé.

## ✅ Testé live

☑ 2026-09-30 — vrai tour de construction Power, `claude-opus-5`, projet `cmund7mbu00360n859i3706w4` : `finishReason: stop`, 18 871 jetons, **aucune coupure** ; le raisonnement s'écoule de 27 s à 117 s dans le bandeau de réflexion (texte `<div class="__boltThought__">`, puis signature `j:`), **replié dès son premier rendu** (`aria-expanded=false`, contenu masqué, 53 px), toujours replié en fin de tour avec 7 025 caractères. Preuve live + épinglé par `app/lib/.server/llm/reflexion-envoyee-au-client.spec.ts` et `app/components/chat/reflexion-repliee.spec.tsx`.

## Preuve

**Reproduit en production le 28/09** sur `web:5cd5e6db75` : projet `cmul79vkb000v0n8ajxcin1no`, mode `power`, `claude-opus-5` ; voies des sous-agents finies à ~30 s, puis aucun octet pendant 60 s, puis `AbortError: BodyStreamBuffer was aborted` côté client à ~84 s ; aucun `onfinish` serveur. **Portée réelle mesurée le 29/09** : aucun tour Power d'utilisateur réel dans les journaux entre le déploiement de #592 et le rollback — personne n'a été touché.

**Rollback décidé par Avi le 29/09** — raisonnement : le risque était réel et le bénéfice de rester sur `5cd5e6db75` nul (le raisonnement ne s'affichait pas de toute façon) ; on échange une fonctionnalité invisible contre une génération qui ne se coupe pas. `helm rollback vibecore 1229` → révision 1231 : `web`=`7f573aaf00`, `api`/`worker`=`d4a6f1df28`, 2/2 prêts, 0 redémarrage, bundle serveur `server-build-DFO5a4hO.js` sans le marqueur `chat.fournisseur.bascule`. **Vérifié sur un vrai tour Power après rollback** (projet `cmumn4uds00060n85fgcu2pes`) : `finishReason: stop`, 7 162 jetons, premier texte à 31,7 s, flux fermé normalement à 101 s, aucune coupure. ⚠️ Le rollback retire aussi temporairement les correctifs de #592 (refus de fichiers, écart du pod, repli déclaré, sauts du fil) : la production ne doit pas rester dessus — remise en avant dès que #594 et #596 sont vertes ET servies.
