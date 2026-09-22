---
id: BUG-THEME-002
---

## Bug

**P2 — THÈME SOMBRE : le gris tertiaire passe sous le seuil AA sur toute la ligne secondaire des pages publiques.** « No credit card required », « Deploy instantly », « Scale to millions », « Try these popular examples: » (accueil) et « Contact for pricing » (pricing) sont sous 4,5:1.

## 📤 Dispatché

☐

## 💻 Codé

☑

## ✅ Testé live

☑ **Déployé en prod 18/08 (`43ef3ad437`)**

## Preuve

**Reproduction** (même sonde, 390/768/1440, thème sombre) : `rgb(110,118,129)` = `#6e7681` sur `#111315` → **4,05:1** ; sur `#0a0f1c` → **4,16:1**. **Cause racine** : `--vc-ide-text-muted: #6e7681` (`:root[data-theme='dark']`) alimente `--bolt-elements-textTertiary`, donc porte toute la copie secondaire sombre. **Correctif** : `#7d8590` → 4,99:1 / 5,13:1, hiérarchie préservée (`--vc-ide-text-secondary` reste à 11,32:1). Contrats de palette e2e alignés (`tests/e2e/dashboard.spec.ts`, `tests/e2e/ui-details.spec.ts`) et assertions de contraste ajoutées au nouveau spec.

