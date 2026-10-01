---
id: DETTE-CI-ACTION-COMPOSITE-001
section: "2026-10-01 — Chaîne de tests : chemin critique de la porte de release"
---

## Bug

**Dette assumée — la préparation du job E2E n'est pas factorisée, ce qui empêche de sortir le canari iOS dans son propre job.**

## 📤 Dispatché

☑ 2026-09-30 — consigné pour ne pas s'évaporer.

## 💻 Codé

☑ 2026-10-01 — **FERMÉE par #661.** L'action composite
`.github/actions/preparer-pile-e2e/action.yml` existe, les deux jobs l'appellent, et le
canari iOS est sorti dans son propre job, dans le `needs` de personne.

## ✅ Testé live

☐ — le prochain passage E2E de `main` le dira. Ce qui est déjà tenu par un test : un cas de
garde rougit si l'un des deux jobs remonte la préparation en ligne au lieu de passer par
l'action commune, et `etapesRun` **suit** désormais les `uses: ./…`, donc les gardes lisent
ce que le workflow exécute, où que le code habite.

## Preuve

**Le besoin.** Le canari iOS est **non bloquant** et tourne pourtant **dans le job qui porte le contrôle requis** « Playwright local stack ». Il consomme donc le budget d'un contrôle dont dépend toute fusion. C'est structurellement faux : un contrôle non bloquant ne doit pas pouvoir peser sur un contrôle bloquant.

**Pourquoi ce n'est pas fait.** Le canari a besoin de la pile locale complète — dépendances, base, API, web construit, admin — soit **172 lignes de préparation** partagées avec la suite. Le sortir aujourd'hui voudrait dire les **dupliquer**, et deux copies d'une préparation divergent toujours : dans quelques mois le canari testerait un environnement différent de la suite, sans que rien ne le signale. **Un correctif qui installe un futur défaut n'est pas un correctif.**

**Le chemin propre** : extraire la préparation dans une **action composite** (`.github/actions/preparer-pile-e2e/action.yml`), puis l'appeler depuis les deux jobs. GitHub Actions ne connaît pas les ancres YAML ; l'action composite est le seul moyen de partager des étapes sans les recopier.

**Ce qui a été fait à la place, en attendant** : rendre le budget cohérent avec ses propres bornes (plafond 90 → 105) et poser un garde qui rougit si elles redeviennent incohérentes. Le risque immédiat — un job tué qui n'écrit aucun rapport — est supprimé ; la faute structurelle demeure.

⚠️ **À faire avant d'attaquer** : remesurer la préparation. Le 2026-09-30 elle valait **5 min 37 s** mesurées (tranche 2/2 du run 36739771036), alors qu'un chiffre **dérivé** de 13 min circulait et servait de base au calcul de marge. Une dette qu'on reprend sur un chiffre faux se rouvre.


## Clôture — et pourquoi cette fiche a failli disparaître

Cette fiche n'existait que sur la branche de **#634**, la tentative précédente, qui n'a
jamais été fusionnée. **#661 a résolu la dette sans emporter le document qui la décrit** —
en fermant #634 comme « périmée » je l'aurais supprimée avec elle, et la dette aurait
disparu des registres alors qu'elle y avait été consignée exprès « pour ne pas s'évaporer ».

Elle est donc rapatriée ici, puis #634 peut être fermée.

⚠️ **Et la mesure que la fiche réclamait avant d'attaquer a eu raison d'être réclamée** :
elle avertissait qu'un chiffre **dérivé** de 13 min circulait pour la préparation, alors que
la mesure réelle valait **5 min 37 s**. #661 a été dimensionnée sur la mesure, pas sur le
chiffre dérivé.
