---
id: BUG-MESURE-AXE-AVEUGLE-001
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**Neuvième forme du faux négatif de mesure, et la plus retorse : une mesure techniquement CORRECTE sur un axe qui ne discrimine rien.** Ni cible absente, ni motif cassé, ni commande malformée — juste une dimension qui ne sépare pas ce qu'on croit qu'elle sépare.

## 📤

☑

## 💻

☑

## ✅

☑

## Preuve

**Mesuré le 15/09.** Question posée : « qui écrit dans les fichiers de suivi ? ». `git log --format='%an'` rend « Claude 115, openaxcloud 24 » — exact, et **sans aucun sens** : **toutes les sessions partagent la même identité git**. J'ai failli le rapporter tel quel, et il aurait fait conclure que notre session est le point chaud. **Le bon axe** : le numéro de PR porté par le sujet du commit. Résultat inverse — sur 141 commits en 14 jours, **3 sont à nous**, 21 à d'autres PR, 117 sans numéro de PR (dont 11 `Merge`). **Le geste** : avant de lire un comptage par catégorie, se demander **si la catégorie sépare vraiment les cas** — un axe partagé par tous les acteurs ne mesure que lui-même. Complète les règles 14 (le motif), 20 (la cible) et 21 (le moniteur) : celle-ci porte sur **la dimension**.

