---
id: BUG-PUBLISH-BOUTONS-001
---

## Bug

**P1 — « la tab déploiements fonctionne pas, aucun bouton fonctionne, c'est pas achevé en réel et à 100% fonctionnel, et la police et les boutons sont trop gros ou pas comme le thème »** (Avi, captures iPhone prod, horloge 10:32).

## 📤 Dispatché

☑ 09/09

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐

## Preuve

**⚠️ DATATION À TRANCHER AVANT TOUT** : les deux captures portent l'horloge **10:32**, soit **3 h avant** que le correctif de tailles n'atteigne la production (run 1577, 13:37, vérifié étape par étape). Et elles montrent le titre « Republier votre application » sur DEUX lignes en très gros — exactement l'état d'AVANT. Vérifié côté dépôt : `875e63f` (titre 30→19 px) **est bien ancêtre** du commit déployé `68d7ac3`, et le SCSS servi à ce commit porte `font-size: 19px !important`. Il est donc probable que ces captures soient celles du point 4 de ce matin, renvoyées. **Cela ne clôt PAS le signalement** : « aucun bouton fonctionne » se vérifie indépendamment, et c'est l'objet de l'audit en cours. **RÉPONSE DE L'AUDIT, et elle me contredit** : il y avait bien des boutons morts — quatre d'un coup, par UNE seule cause (BUG-PUBLISH-ONSUBMIT-FORMDATA-001), plus un menu dont les deux entrées n'en faisaient qu'une (BUG-PUBLISH-REPARER-CIBLE-001). Et « pas comme le thème » se chiffre aussi : vingt couleurs écrites en dur (BUG-PUBLISH-THEME-001). Les trois lignes suivantes portent le détail. ⚠️ **ET JE ME SUIS TROMPÉ EN PREMIÈRE LECTURE** : j'ai annoncé que `onAjusterLesReglages` et `onAnnuler`, déclarés mais jamais passés, rendaient leurs boutons morts. **Faux dans les deux cas**, vérifié dans le code : « Ajuster les réglages » bascule un état LOCAL (`setReglages`) et n'appelle la prop qu'en `?.()` — il fonctionne ; le bouton d'annulation est rendu sous garde `enCours && dernier.id && onAnnuler` — il n'est pas mort, il n'est simplement jamais AFFICHÉ. Une prop manquante n'est pas un bouton mort : il faut lire le `onClick`.

