---
id: BUG-LOGS-JSON-001
---

## Bug

**P2 — la ligne JSON brute de l'agent s'affiche telle quelle** dans « Journaux du serveur » de la Webview (27 fois `{"level":"error","service":"workspace-agent","event":"preview.proxy.unreachable","port":5173,"error":"fetch failed"}`) et dans le panneau Problèmes (« 27 occurrences détectées », message brut). Captures iPhone d'Avi 06/09 10:35–10:36. Même mécanisme que BUG-DEBUG-I18N-001, corrigé la veille pour le seul Débogueur (règle 7 : viser la règle, pas la première occurrence).

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`) — **déployé run 1490 (84a913c), 10:27 UTC** — `texteRuntimeLisible` pour le `<pre>` de la Webview (« [error] workspace-agent · preview.proxy.unreachable · port 5173 · fetch failed »), `ligneRuntimeLisible` sur le message d'un problème. Épinglé par `app/lib/ide/runtime-log-line.spec.ts` (ligne exacte de la capture) + `app/styles/ide-mobile-panels.spec.ts` (§7, câblage Preview.tsx / BaseChat.tsx).

## 💻 Codé (suite, 30/09)

☑ 30/09 — le correctif du 06/09 ne couvrait qu'UNE surface. Mesuré en prod le
30/09 à 390 px : la carte de démarrage de la Webview affichait encore
`{"level":"error","service":"workspace-agent",…}`. Les trois cartes
(préparation, démarrage, application non démarrée) passent maintenant par
`journalLisible`, qui ne réécrit que les lignes JSON et garde l'indentation des
autres. Épinglé par `app/components/workbench/Preview.journaux-lisibles.spec.tsx`,
qui rend les trois cartes. Contre-épreuves : JSON laissé passer → 3 rouges ;
toutes les lignes rognées → 3 rouges (indentation perdue).

## ✅ Testé live

☐

## Preuve

Captures 06/09 10:35, 10:36.

