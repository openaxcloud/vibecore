---
id: BUG-PATHS-STUDIO-GIT-001
---

## Bug

**P2 — Chemins de fichier coupés sur téléphone dans le Studio (carte de révision) et dans Git (arbre de travail, ligne de commit).** Trouvé par l'audit WebKitGTK du 06/09 (sonde webkit-probe.mjs, viewport 390 en cadre) : 510 px de chemin pour 297 dans le Studio, 492 px pour 157 dans Git. Même classe que BUG-AGENT-PATH-001.

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`, déployé run 1513 (7298b30), 01:18 UTC — le run 1512 de 523c666 avait été refusé par la porte de préflux rouge sur `main`, corrigée par #488) — repli (`white-space: normal; overflow-wrap: anywhere; text-overflow: clip`) pour `.bolt-project-agent-patch-card strong` et `.bolt-project-git-tool .truncate` sur téléphone. Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§18) + `tests/e2e/ide-mobile-chrome.spec.ts` (Git et Studio : aucun élément coupé).

## ✅ Testé live

☐

## Preuve

Audit WebKitGTK local.

