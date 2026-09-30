---
id: BUG-DEPLOY-SURVEILLANCE-TIERS-001
---

## Bug

**P2 — rien ne vérifie qu'un service tourne bien sur le dernier commit ayant touché SON code.**

Le déploiement ne reconstruit que les tiers modifiés — c'est voulu et économe. Conséquence : les huit services portent normalement des tags différents, et **l'écart de tags n'est donc pas un signal exploitable**. Il n'existe en revanche aucun contrôle de ce qui compte vraiment : pour chaque tier, le tag servi correspond-il au dernier commit ayant modifié ce tier ?

## 📤 Dispatché

☑ 2026-09-30

## 💻 Codé

☐

## ✅ Testé live

☐

## Preuve

**Comment le trou s'est révélé.** `admin` est resté sur `d4a6f1df28` pendant que les autres avançaient. Personne ne l'a vu — on ne l'a trouvé qu'en le cherchant, plusieurs jours après. Après mesure, ce retard était **légitime** (zéro commit sur `apps/admin/`), mais le fait demeure : **si le retard avait été illégitime, rien ne l'aurait signalé non plus.** L'absence d'alerte ne distinguait pas les deux cas.

**Le contrôle qui manque**, et il est calculable sans rien installer — pour chaque tier :

1. le dernier commit de `main` touchant les chemins de ce tier ;
2. le tag servi pour ce tier (valeurs Helm) ;
3. rougir si (1) n'est pas un ancêtre de (2).

⚠️ **Le piège à éviter en l'écrivant** : ne PAS comparer les tags entre eux. Un écart est normal. La seule comparaison qui a du sens est tier par tier, contre l'historique de ses propres fichiers.

⚠️ **Et la limite à énoncer** : ce contrôle dit qu'un tier est à jour, pas que le code servi fait ce qu'on croit. Un tag juste ne remplace pas un témoin littéral cherché dans l'image.
