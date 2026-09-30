---
id: DETTE-CI-ACTION-COMPOSITE-001
---

## Bug

**Dette assumée — la préparation du job E2E n'est pas factorisée, ce qui empêche de sortir le canari iOS dans son propre job.**

## 📤 Dispatché

☑ 2026-09-30 — consigné pour ne pas s'évaporer.

## 💻 Codé

☐

## ✅ Testé live

☐

## Preuve

**Le besoin.** Le canari iOS est **non bloquant** et tourne pourtant **dans le job qui porte le contrôle requis** « Playwright local stack ». Il consomme donc le budget d'un contrôle dont dépend toute fusion. C'est structurellement faux : un contrôle non bloquant ne doit pas pouvoir peser sur un contrôle bloquant.

**Pourquoi ce n'est pas fait.** Le canari a besoin de la pile locale complète — dépendances, base, API, web construit, admin — soit **172 lignes de préparation** partagées avec la suite. Le sortir aujourd'hui voudrait dire les **dupliquer**, et deux copies d'une préparation divergent toujours : dans quelques mois le canari testerait un environnement différent de la suite, sans que rien ne le signale. **Un correctif qui installe un futur défaut n'est pas un correctif.**

**Le chemin propre** : extraire la préparation dans une **action composite** (`.github/actions/preparer-pile-e2e/action.yml`), puis l'appeler depuis les deux jobs. GitHub Actions ne connaît pas les ancres YAML ; l'action composite est le seul moyen de partager des étapes sans les recopier.

**Ce qui a été fait à la place, en attendant** : rendre le budget cohérent avec ses propres bornes (plafond 90 → 105) et poser un garde qui rougit si elles redeviennent incohérentes. Le risque immédiat — un job tué qui n'écrit aucun rapport — est supprimé ; la faute structurelle demeure.

⚠️ **À faire avant d'attaquer** : remesurer la préparation. Le 2026-09-30 elle valait **5 min 37 s** mesurées (tranche 2/2 du run 36739771036), alors qu'un chiffre **dérivé** de 13 min circulait et servait de base au calcul de marge. Une dette qu'on reprend sur un chiffre faux se rouvre.
