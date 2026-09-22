---
id: BUG-RUNTIME-STATUS-DRIFT-001
---

## Bug

**125 espaces de travail se déclarent `RUNNING` en base ; il en tourne UN dans le cluster.** Mesuré le 2026-08-30 sur la production : `select status,count(*) from "Workspace" group by status` rend **RUNNING 125**, STOPPED 79, PENDING 63, STARTING 10, FAILED 6 — tandis que `kubectl get pods -n workspaces` n'en compte **qu'un seul**. Un seul enregistrement a été mis à jour dans les 24 dernières heures. **Ce que voit l'utilisateur** : l'IDE lit le statut, affiche « en cours d'exécution », et chaque opération sur un fichier répond `425`. Vérifié sur un projet dont la ligne dit `RUNNING` depuis le 21/08 : lecture ET écriture rendent 425. **Cause distincte de BUG-RUNTIME-COLD-START-001 (PR #268)** : là c'est le déclencheur de provisionnement, ici le statut qui n'est jamais réconcilié quand un pod disparaît autrement que par un arrêt volontaire — éviction, réduction de nœuds, reclamation. Le cron `inactivity-gc` arrête les inactifs mais ne remet pas à jour un statut dont le pod s'est évaporé. **Ouvert, sans correctif** : la réconciliation est un chantier à part, et #268 traite le symptôme rencontré.

## 📤 Dispatché

🔴

## 💻 Codé

☐

## ✅ Testé live

☐

