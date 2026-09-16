---
id: BUG-SECURITY-FIX-AGENT-001
---

## Bug

**P1 — Onglet Sécurité : « Réparer avec l'agent » ne bascule pas sur le panneau Agent et ne lance pas l'agent** (Avi, 08/09 08:2x, point 5 : « quand je clique sur le bouton réparer avec l'agent ça doit me remettre sur le panneau agent et démarrer l'agent avec le prompt en question envoyé par le bouton »). Attendu : un seul geste — bascule de panneau + invite préremplie + envoi. À mesurer : ce que fait le bouton aujourd'hui (remplit-il seulement le composeur ? n'ouvre-t-il rien ?).

## 📤 Dispatché

☑ 08/09

## 💻 Codé

☑ 09/09 — **MESURÉ** : le bouton émettait bien `vibecore:agent-task`, et le gestionnaire déposait bien l'invite… dans la zone de saisie du panneau Agent, que l'utilisateur ne voyait pas — il restait sur Sécurité, et rien ne semblait se passer. La bascule est désormais posée au niveau de l'ÉVÉNEMENT PARTAGÉ, donc valable pour les TROIS surfaces qui l'émettent : Sécurité, conflits Git, et le nouveau bandeau de Publication (règle 7). Deuxième mesure en chemin : `activateMobileTool` attend l'identifiant d'OUTIL (`agent`) et non le nom du panneau (`chat`) — un `panel: 'chat'` ne déclenchait rien. ⚠️ RESTE À FAIRE : l'ENVOI automatique de l'invite (Avi : « démarrer l'agent avec le prompt ») n'est pas branché — l'invite est déposée et la zone de saisie prend le focus, l'utilisateur valide. Et les tailles de police de l'onglet Sécurité ne sont pas encore reprises. **SECONDE MOITIÉ FAITE le 09/09** : l'invite est désormais ENVOYÉE, pas seulement déposée. Avi demandait « démarrer l'agent avec le prompt en question ENVOYÉ par le bouton » ; on laissait un geste de plus à faire — exactement celui que le bouton prétend épargner. Deux gardes : sans `sendMessage` (hors IDE) ou pendant un tour DÉJÀ en cours, l'invite est déposée sans être envoyée — envoyer par-dessus une génération en vol créerait deux tours concurrents sur le même fil. Les rappels sont tenus par référence et non en dépendance de l'effet, sans quoi l'écouteur se réabonnerait à chaque lot de jetons (le mécanisme du point 7).

## ✅ Testé live

☐ live iPhone

## Preuve

épinglé par `tests/e2e/ide-mobile-chrome.spec.ts` « depuis n'importe quel panneau, la demande bascule sur le panneau Agent » — qui vérifie désormais que l'invite PART (message utilisateur dans le fil + composeur vidé), pas seulement qu'elle est déposée. Contre-épreuve : envoi retiré → rouge ; rétabli → 2/2

