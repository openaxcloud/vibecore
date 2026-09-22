---
id: BUG-IDE-MEMORY-001
---

## Bug

**P0 — le `localStorage` saturé casse la boucle de génération : l'agent se fige.** Mémoire IDE persistée sans aucun plafond ni purge : **64 blobs `vibecore.projectIdeMemory:*`**, un par projet, **jamais évincés**, le plus gros à **3,1 Mo**, pour un total de **10 Mo** — la limite du navigateur. Une écriture pendant la génération lève alors `QuotaExceededError`, l'exception remonte dans la boucle et la casse : tâche « En cours » qui grimpe sans fin, aucun fichier écrit, aucune erreur affichée. **Prouvé en direct** sur le navigateur d'Avi (console + réseau capturés) : purge des blobs des autres projets → 9,77 Mo libérés, retour à 0,23 Mo → **plus aucune `QuotaExceededError`, blocage disparu**. ⚠️ Mes correctifs précédents (`d16ffd38` borne de relecture, `bb461e1c` course d'annulation) visaient **le mauvais endroit** : le blocage n'était pas une promesse non dénouée mais une exception synchrone dans le stockage. Correctifs à faire : (b) `setItem` non fatal, (a) plafond + éviction LRU, **et une purge au démarrage** sinon tout navigateur déjà saturé reste cassé.

## 📤 Dispatché

☑

## 💻 Codé

☑ *(`f0d9cc90` — écriture non fatale, plafond + LRU, purge au démarrage ; mergé `da7c017b`, en prod sur `web:da7c017b88`)*

## ✅ Testé live

☐ **Prouvé live 18/08 par purge manuelle ; correctif code à revérifier sur le navigateur d'Avi après recharge du compte Anthropic**

## Preuve

🟠 partiel 19/08

