---
id: BUG-THEME-011
---

## Bug

**P1 — PANNEAU D'ACCROCHE DE `/login` ET `/register` : tout le texte est BLANC sur l'orange de marque, dans les DEUX thèmes.** Titre, corps, puces de fonctionnalités et libellés de statistiques.

## 📤 Dispatché

☐

## 💻 Codé

☑

## ✅ Testé live

☐ **Reproduit live 31/08, correctif poussé**

## Preuve

**Reproduction** (balayage de contraste par pixels rendus, prod `e-code.ai/login` et `/register`, bureau 1440, thèmes clair ET sombre) : titre **2,70:1**, corps **2,40:1**, libellés de statistiques **2,05:1** — onze éléments sous 4,5. Le panneau est un dégradé `--ecode-orange` → `#f99d25`. **Le blanc est irrattrapable** : même à pleine opacité il plafonne à 2,62:1 sur le ton le plus foncé. **Correctif** : encre sombre `#111827`, déjà le parti retenu ailleurs (les boutons d'action posent la même encre sur l'orange, 5,51:1 mesuré en prod). Rampe d'opacité conservée, plancher remonté de 72 % à 80 % (à 72 % l'encre retombait à 4,18:1). **Remesuré sur la vraie page après application : 2,70 → 6,58 / 2,40 → 6,94 / 2,05 → 6,13.** **Garde-fou** : `auth-hero-contrast.spec.ts`, 6 cas, contre-vérifiés un par un.

