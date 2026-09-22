---
id: BUG-THEME-016
provenance: "extraite de la proposition #161, fermée sans fusion — le constat survit, le code non"
---

## Bug

**P2 — Thème SOMBRE : texte blanc sur le bleu d'action `#0099ff` = 3.00:1** (pastille de langue active et tout contrôle rempli en `--vc-action-primary`), sur 17 routes publiques et les 3 formats ; le clair passait à 4.95:1.

## 📤 Dispatché

☑

## 💻 Codé

☑

## ✅ Testé live

☑ **Corrigé + prouvé live 18/08**

## Preuve

**Cause racine** : la paire `--vc-action-primary` / `--vc-action-primary-foreground` valait `#0099ff` / `#ffffff` — 3.00:1, correct pour une bordure ou une icône (WCAG 1.4.11 = 3:1) mais **sous AA pour le libellé d'un bouton plein**. **Correctif** : le REMPLISSAGE reçoit son propre bleu `--vc-action-primary: #0c74c0` (4.91:1 avec du blanc) ; `--vc-ide-accent-action: #0099ff` reste l'accent des bordures, icônes et anneaux de focus.

