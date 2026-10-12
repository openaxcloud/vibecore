---
id: BUG-REDIS-CHUTE-AU-BANC-001
---

## Bug

**À ÉTABLIR — Redis est tombé pendant un passage de banc en local, sous une charge qui n'était pas décrite comme extraordinaire.** Remonté le 2026-09-30 par la session qui tenait le banc.

## 📤 Dispatché

☑ 2026-09-30 — consigné par la session livraisons.

## 💻 Codé

☐

## ✅ Testé live

☐

## Preuve

**RIEN N'EST ÉTABLI, et c'est le point de cette entrée.** Ce qu'on sait tient en une phrase : un Redis local est tombé pendant un passage de banc. On ne sait pas encore s'il s'agit d'un défaut du produit ou d'une limite de la machine de développement.

⚠️ **Ne pas transformer ça en inquiétude sur la production tant que les mesures ci-dessous ne sont pas faites.** Le Redis local et celui de production n'ont ni la même mémoire, ni la même configuration d'éviction, ni la même persistance. La machine de développement, elle, tournait le même jour à 8 Go avec quelques dizaines de mégaoctets libres et du swap massif — un processus qui tombe dans ces conditions ne dit rien du produit.

**Ce qu'il faut mesurer, dans cet ordre :**

1. **La cause de la chute, pas le fait.** Tué par le système faute de mémoire, sorti seul, ou refusant des connexions ? Les trois ont des remèdes opposés. Le journal du conteneur et le code de sortie tranchent.
2. **La mémoire de l'instance locale au moment de la chute**, et sa politique `maxmemory-policy`. Un Redis sans limite sur une machine saturée est tué par le système ; ce n'est pas un défaut du produit.
3. **La comparaison avec la production** : `maxmemory`, politique d'éviction, persistance. Tant qu'elle n'est pas faite, on ne peut rien dire de la production.
4. **La charge réelle** au moment de la chute — nombre de connexions, taille des clés. « Pas extraordinaire » est une impression, pas une mesure.

**Ce qui rendrait l'inquiétude légitime** : une chute reproductible sur une machine NON saturée, avec une charge chiffrée et inférieure à ce que la production encaisse.
