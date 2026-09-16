---
id: BUG-IDE-STATE-007
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**P1 — plafond de croissance : au-delà d'une certaine taille de projet, l'état de l'IDE n'est NI écrit localement NI relu de façon fiable.** Reproduit en production (`be197c3e38`), projet de 401 fichiers, 3 ouvertures à froid : `write degraded {outcome: skipped-too-large}` **3/3**, et `Failed to restore project IDE state AbortError` + `Failed to load project IDE memory.` **2/3**. Chiffres : charge utile `ide-state` = **4 053 595 o (3,87 Mio)** contre un plafond par entrée `IDE_MEMORY_ENTRY_CAP_BYTES` de **524 288 o** — **dépassement ×7,7**. Inspection du `localStorage` : **l'entrée du projet est absente** (seule reste une entrée d'espace de travail de 2 808 o) — rien n'est écrit. Les deux défauts se composent : trop gros pour le cache local → aucun repli → tout dépend du réseau → 3,87 Mio à ramener en moins de `PROJECT_IDE_MEMORY_LOAD_TIMEOUT_MS` = **5 000 ms**, sinon `AbortError` et état perdu. Conséquence utilisateur : disposition, fichier sélectionné et onglets perdus à l'ouverture, par intermittence, **et cela empire à mesure que le projet grandit**. Même famille que le `localStorage` saturé déjà vécu par Avi — le commentaire de `ide-memory-budget.ts` le nomme explicitement. Aggravé par la course corrigée dans #442 : l'état est demandé 2 à 10 fois par ouverture, soit jusqu'à **38,7 Mio** d'`ide-state` transférés en une seule ouverture.

## 📤

—

## 💻

—

## ✅

❌

## Preuve

`docs/audit/evidence/2026-09-04-panneaux-instables/PERFORMANCE.md` + `ide-state-scale.mjs`. SHA prod vérifié identique avant ET après. #442 supprime les répétitions mais **ne corrige ni le plafond de 512 Kio ni le délai de 5 s** — ce point reste entier.

