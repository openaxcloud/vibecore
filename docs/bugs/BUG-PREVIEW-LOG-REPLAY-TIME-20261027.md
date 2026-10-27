---
id: BUG-PREVIEW-LOG-REPLAY-TIME-20261027
section: "Preview et vignettes"
---

# Les logs rejoués reçoivent l'heure de reconnexion

## 📤 Dispatché

☑ 27/10 — reproduction isolée de la route de logs sur main `0d6b2edfb`.

## 💻 Codé

☐ — raccordement API partagé à coordonner, hors correctif de capture.

## ✅ Testé live

☐ — les entrées historiques observées ne prouvent pas de nouvelles pannes.

## Preuve isolée

La route WebSocket de `services/api/src/app.ts` initialise `sentCount` à zéro
pour chaque connexion et attribue `new Date()` aux lignes renvoyées par le
manager. L'amont Kubernetes lit un tail de 500 lignes sans horodatage source.
Le client conserve les événements reçus sans déduplication.

L'exécution isolée du corps réel de la route, avec frontières socket, manager,
authentification et horloge contrôlées, rejoue 36 lignes historiques avec une
nouvelle heure sans ajout d'aucune ligne source. Ce mécanisme explique comment
des timestamps regroupés peuvent apparaître après reconnexion ; il n'établit
pas l'origine exacte des 36 entrées observées en production.

Un compteur limité à la longueur du tail peut également manquer une rotation
à longueur constante. La correction doit conserver heure source et identité
des événements, sans dédupliquer seulement leur texte ni inventer une heure.
