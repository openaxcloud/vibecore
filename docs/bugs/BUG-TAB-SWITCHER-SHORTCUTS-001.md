---
id: BUG-TAB-SWITCHER-SHORTCUTS-001
---

## Bug

**P3 — Sélecteur d'onglets sur iPhone : les quatre raccourcis du bas (Secrets, Base de données, Paramètres, Nouvel onglet) ont la même taille que les onglets ouverts au-dessus** (Avi, 07/09 08:21, entourés en rouge : « les carrés doivent être plus petits que les carrés au-dessus, et tous de même taille »). Mesuré : onglets et raccourcis à 102 px figés tous les deux — c'était voulu le 06/09 (AV-UX point 3, « même famille ») ; Avi tranche autrement.

## 📤 Dispatché

☑ 07/09

## 💻 Codé

☑ 07/09 (`main`, déployé run 1523 d484982, 09:52 UTC) — raccourcis à 72 px figés (quatre tuiles égales), icône 32 px / glyphe 18 px, libellé 12 px ; même rayon, même bordure, même fond ; les onglets gardent 102 px. Épinglé par `app/styles/av-ux-12points.spec.ts` (point 3, sens inversé et dit) + `tests/e2e/ide-mobile-chrome.spec.ts` (sélecteur d'onglets : quatre raccourcis égaux, ≥ 20 px plus bas que les onglets, ≥ 44 px, libellés entiers).

## ✅ Testé live

☐

## Preuve

07/09 08:21.

