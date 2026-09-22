---
id: BUG-THEME-011
provenance: "extraite de la proposition #161, fermée sans fusion — le constat survit, le code non"
---

## Bug

**P2 — le token shadcn `--primary` était déclaré à l'IDENTIQUE dans les deux thèmes**, donc `text-primary` donnait le même orange `#f56505` sur page claire : **2.90:1** sur `#f5f7fa` (compteurs « 50K+ / 30s / 100% / 24/7 » de `/ai-agent`) et 3.11:1 sur blanc (lien sous-traitants de `/dpa`).

## 📤 Dispatché

☑

## 💻 Codé

☑

## ✅ Testé live

☑ **Corrigé + prouvé live 18/08**

## Preuve

`--primary: 24 96% 49%` figurait tel quel dans le bloc de base ET dans le bloc clair — rien ne « suivait » le thème. Assombri pour le CLAIR uniquement en `20 91% 36%`, ce qui corrige les deux sens d'usage : **5.90:1 en texte**, et `bg-primary` avec son premier plan blanc passe de 3.11:1 à **5.90:1**. Le sombre est **volontairement inchangé** : `--primary` sert À LA FOIS `bg-primary` et `text-primary`, et `--primary-foreground` est aussi utilisé sur des surfaces qui ne sont PAS `bg-primary` — l'avoir basculé en quasi-noir a mis de l'encre sombre sur une pastille sombre de `/blog` à **1.04:1**, une régression pire que le défaut visé. Conséquence assumée : le blanc sur remplissage orange passe désormais en CLAIR (5.90:1) et reste sous AA en SOMBRE (2.98:1) — cette moitié-là relève de **BUG-DESIGN-012** et attend l'arbitrage d'Avi.

