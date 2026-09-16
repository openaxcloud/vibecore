---
id: BUG-PANEL-LOSS-001
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**NON-DÉFAUT — la « perte de 94–97 % du contenu entre deux chargements identiques » est un artefact de mesure.** Même chargement, même panneau : 91 → 3055 caractères (`integrations`, entre 1,5 s et 3 s), 83 → 1063 (`overview`, entre 3 s et 6 s). Lire tôt donne 97 % et 92 % de « perte » — la magnitude rapportée. Le plancher de 83–91 caractères est PARTAGÉ par deux panneaux au contenu sans rapport : un état commun (en-tête + chargement), pas trois pannes. Capture à 900 ms = état de chargement honnête (rouet, « Loading overview… », squelette).

## 📤

—

## 💻

—

## ✅

**NON-DÉFAUT**

## Preuve

`PERFORMANCE.md` + `paint-timeline.json` + captures EARLY/LATE. Clôture sans test au titre de l'exception NON-DÉFAUT de la règle 16. Contre-épreuves : 384 charges directes → 0 enveloppe `error`, `data` identique octet pour octet ; forcer l'enveloppe d'erreur ne coûte que 14–30 % du rendu.

