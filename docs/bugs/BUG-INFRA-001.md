---
id: BUG-INFRA-001
---

## Bug

**P2 — le pool `system-std` de la prod n'a qu'un disque de boot de 50 Go, et chaque déploiement le pousse en `DiskPressure`, ce qui évince des pods.** Constaté pendant le CD du 17/08 : **28 pods `workspace-manager` évincés en ~5 s**, motif `The node had condition: [DiskPressure]`. Le Deployment a récupéré seul (5/5) et le service n'a pas été coupé, mais le mécanisme se répétera à chaque déploiement. Cause : `system-std` = **50 Go `pd-standard`** contre 100 Go (`sandbox-gvisor`) et 200 Go (`sandbox-gvisor-std`) ; capacité éphémère ~45 Gi dont seulement ~17,5 Gi allouables. Chaque CD tire **7 nouvelles images** sur ces nœuds, ce qui franchit le seuil de GC du kubelet (85 % par défaut) avant que le GC ne rattrape.

## 📤 Dispatché

📤 **Dispatché**

## 💻 Codé

☐

## ✅ Testé live

☐ **Constaté live 17/08 — atténué, PAS résolu**

## Preuve

Cache d'images mesuré : **4,9 Gi / 25 images** et **5,9 Gi / 25 images** sur les deux nœuds (donc pas le cache seul en cause : le disque est simplement trop petit pour l'empreinte totale). `DiskPressure` est **oscillant** — relevé à `True` pendant le rollout, retombé à `False` de lui-même à 13:04 et 13:05 une fois le GC d'images passé. **Atténuation appliquée (non disruptive)** : suppression des 28 pods `Evicted` (état terminal, aucun impact service ; tous les Deployments vérifiés READY=DESIRED après coup, prod 200). Gain réel modeste — ça retire le résidu, ça n'empêche pas la récidive. **Vraie remédiation, DISRUPTIVE, non appliquée** : porter le disque de boot de `system-std` de 50 à 200 Go. `--disk-size` n'est pas modifiable en place sur un node pool GKE → il faut créer un pool de remplacement puis migrer (`gcloud container node-pools create system-std-200 --disk-size=200 ...`, puis `cordon`+`drain` progressif de l'ancien, puis suppression). À faire en fenêtre choisie, PAS pendant un déploiement. **À arbitrer par Avi.**

