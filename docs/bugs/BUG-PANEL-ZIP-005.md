---
id: BUG-PANEL-ZIP-005
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**P0 candidat — À L'ÉCHELLE, Safari télécharge le projet ENTIER en archive NEUF fois par ouverture à froid.** Confirmé sur un projet représentatif (401 fichiers de source RÉELLE, 3,73 Mio bruts) : `zipCalls=9`, charge utile **5 316 429 octets décodés par appel** (5,07 Mio, base64 d'un ZIP de 3,8 Mio — **+33 % rien qu'en base64**), soit **15,2 Mio observés dans la fenêtre de mesure** et ~46 Mio si les 9 aboutissent (~13 Mio compressés sur le fil, 1,44 Mio par appel). Sur le starter à 7 fichiers c'était 4 appels de 3 Ko : **invisible à petite échelle, le défaut ne se voit QU'à l'échelle.** Les traces de pile nomment la cause : **1 appel direct** depuis `ProjectWorkspaceProvider` et **8 depuis `loadRuntimeFiles`** — `loadProjectStorageFiles` est le REPLI utilisé quand le chargement runtime échoue ou rend 0 fichier, et il n'a **ni mise en commun des requêtes en vol, ni limite de reprise**. Même classe que BUG-PANEL-PERF-004(b), mais sur une charge utile de plusieurs mégaoctets. Les réponses arrivent à 15,0 / 15,6 / 16,0 s — **après** que le panneau a peint (11,6 s) : elles continuent en fond.

## 📤

—

## 💻

—

## ✅

❌

## Preuve

`zip-webkit-scale-run1.log` (traces de pile complètes), `zip-chromium-scale.log`, `zip-at-scale.mjs`, `zip-webkit-only.mjs`. Chromium au même moment : **1** appel. **Limite : un seul passage à l'échelle pour le chiffre 9** (le ×4 sur le petit projet, lui, est reproduit deux fois). Mac sur bonne liaison — sur réseau mobile ces mégaoctets coûtent bien davantage.

