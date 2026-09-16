---
id: BUG-AGENT-PATH-001
---

## Bug

**P2 — fil de l'agent sur téléphone : le chemin d'un fichier créé est tronqué** (« src/components/ver… », 204 px pour 487 mesurés avec `probe-messages.mjs`), le verbe et le chemin empilés à gauche des pastilles ; résumé « Afficher la commande » de 44 px pour 12 px de texte. Tableau, URL longue, code, citation : rien d'autre ne déborde (les blocs de code défilent).

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`) — **déployé run 1490 (84a913c), 10:27 UTC** — le chemin se replie dans sa place (`white-space: normal`, `overflow-wrap: anywhere`) au lieu d’être coupé, un chemin court garde sa ligne (densité AGM-01 intacte), cible de 44 px conservée ; résumé 44 px de cible hors flux (32 px visibles). Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§6, CSS + forme du balisage d'`Artifact.tsx`) + `tests/e2e/ide-mobile-chrome.spec.ts` (« fil de l'agent »).

## ✅ Testé live

☐

## Preuve

Sonde locale 06/09.

