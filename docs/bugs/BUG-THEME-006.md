---
id: BUG-THEME-006
provenance: "extraite de la proposition #161, fermée sans fusion — le constat survit, le code non"
---

## Bug

**P1 — Thème CLAIR : l'orange de marque `#f26207` utilisé comme TEXTE tombe à 3.03–3.22:1** sur `/pricing`, `/enterprise`, `/templates`, `/contact`, `/blog`, `/solutions`, `/marketplace`, `/help`, `/community`, `/customers`, `/integrations`, `/explore`, `/demo`, `/status` (14 routes), aux 3 formats.

## 📤 Dispatché

☑

## 💻 Codé

☑

## ✅ Testé live

☑ **Corrigé + prouvé live 18/08**

## Preuve

**Cause racine** : le design system possédait DÉJÀ le bon token — `--ecode-accent-text`, commenté « AA orange for TEXT/links; fills stay --ecode-accent » — mais **193 utilitaires le contournaient** (`text-[#F26207]` × 50 et `text-[var(--ecode-accent)]` × 143). En prime la valeur claire du token (`#c74e00`) n'était elle-même conforme que sur du blanc pur (4.65:1) et échouait sur les vraies surfaces (4.37 / 4.11 / **3.91** sur le glow chaud). **121 échecs** au balayage. **Correctif** : les 193 utilitaires repointés sur `text-[var(--ecode-accent-text)]` (les fonds/bordures/dégradés gardent `--ecode-accent`, inchangés) + valeur claire durcie à `#b03f08` (≥ 4.96:1 partout).

