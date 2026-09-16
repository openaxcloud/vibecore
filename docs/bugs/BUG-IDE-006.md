---
id: BUG-IDE-006
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

**« Démarrage » silencieux et sans fin quand le dev server ne peut pas démarrer.** Pendant ~20 min, la barre d'état a affiché « Dév. : démarrage (npm run dev) » et « Aperçu — Détection » alors que dans le pod `node_modules` était **vide** et **aucun processus vite** n'existait : l'install ne pouvait pas aboutir. Aucun message d'erreur, aucun délai d'expiration, aucune action de reprise n'a été proposée à l'utilisateur — l'IDE est indiscernable d'un démarrage lent.

## 📤 Dispatché

✅ 12/08

## 💻 Codé

☑ **10/09**

## ✅ Testé live

✅ **12/08** observé live ; ☐ écran à revoir après déploiement

## Preuve

⚠️ **La cause sous-jacente était un artefact de l'environnement de test** (DNS cassé dans le namespace `workspaces`, cf. blocage #6 du runbook : la NetworkPolicy `allow-dns-clusterip` manquait, donc `registry.npmjs.org` était irrésolvable). Une fois la policy reposée, l'install a abouti (41 modules) et vite a démarré (« Aperçu 5173 »). **Le défaut produit retenu n'est donc PAS l'échec d'install, mais l'absence totale de remontée** : une install impossible doit devenir une erreur actionnable, pas un « démarrage » perpétuel. Lot **SÛR** (UI/état honnête). **10/09 — LA CAUSE ÉTAIT UN ARTEFACT, LE DÉFAUT NE L'EST PAS, et c'est ce que je corrige.** Que l'installation ait échoué pour une NetworkPolicy DNS manquante est hors de portée du navigateur ; que l'écran n'ait RIEN dit pendant vingt minutes ne l'est pas. Le rouet qui tourne AFFIRME une progression : l'écran d'un démarrage impossible était rigoureusement le même que celui d'un démarrage lent — même famille que BUG-UX-014, BUG-CREATE-004 et BUG-PREVIEW-REMOUNT-001, mais avec une affirmation IMPLICITE, ce qui la rend plus difficile à voir. Correctif : `app/lib/ide/demarrage-bloque.ts` compte le silence depuis le dernier CHANGEMENT D'ÉTAPE — jamais depuis l'ouverture, sans quoi tout démarrage lent mais sain serait accusé (un faux « c'est planté » serait un mensonge d'état de plus). Au-delà de 3 min : le rouet DISPARAÎT, la phrase dit ce qui se passe, et « Relancer le démarrage » offre une sortie — le MÊME geste que l'écran d'échec, extrait pour ne pas diverger en deux copies. Les DEUX écrans de démarrage le reçoivent (règle 7) : l'utilisateur ne choisit pas lequel il voit. ⚠️ Le module ne DIAGNOSTIQUE rien : prétendre nommer la cause depuis le client serait inventer. épinglé par `app/lib/ide/demarrage-bloque.spec.ts` (14 tests : la décision, les deux bords du seuil, et le CÂBLAGE aux deux écrans). Contre-épreuve dans les trois sens : un seul écran câblé → rouge ; l'étape retirée des dépendances de l'effet → rouge ; le rouet remis sous le message → rouge. **☐ Testé live** : l'écran ne se voit qu'avec un démarrage réellement bloqué, que je ne peux pas provoquer d'ici.

