---
id: BUG-THEME-008
provenance: "extraite de la proposition #161, fermée sans fusion — le constat survit, le code non"
---

## Bug

**P1 — Zone CONNECTÉE, thème SOMBRE : les CTA d'action (« Créer un projet », « Créer une clé », « Obtenir l'app bureau », « Créer ») affichent du blanc sur l'orange `#f97316` = 2.8:1** sur `/dashboard`, `/projects`, `/api-keys`, `/desktop-settings`, aux 3 formats ; le clair passait à 5.18:1.

## 📤 Dispatché

☑

## 💻 Codé

☑

## ✅ Testé live

☑ **Corrigé + prouvé live 18/08**

## Preuve

**Cause racine** : même classe que BUG-THEME-003 — **29 éléments** appariaient `bg-[var(--vc-ide-accent-action)]` avec un `text-white` **codé en dur**, alors que le shell zone-connectée remappe cet accent sur `--vc-action-primary` (`#f97316` en sombre) dont le premier plan prévu est `--vc-action-primary-foreground` = `#111827`. Le composant `.vc-sidebar-cta` faisait DÉJÀ correctement le rendu (`#111827` sur orange), ce qui prouve l'intention. **Correctif** : les 29 éléments passent à la paire appariée `bg-[var(--vc-action-primary)]` + `text-[var(--vc-action-primary-foreground)]`.

