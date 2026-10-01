---
id: BUG-DEPLOY-ADMIN-NON-RECONSTRUIT-001
---

## Bug

**NON-DÉFAUT — retiré après mesure.** J'avais signalé que l'image `admin` « n'est pas reconstruite comme les sept autres services ». **C'est faux, et l'entrée aurait envoyé quelqu'un chasser un défaut qui n'existe pas.**

## 📤 Dispatché

☑ 2026-09-30

## 💻 Codé

— sans objet.

## ✅ Testé live

☑ 2026-09-30 — établi comme NON-DÉFAUT (exception de la règle 16 : rien à épingler).

## Preuve

**Le déploiement ne construit QUE les tiers dont le code a changé.** `deploy-main.yml` porte une étape `Detect changed tiers` qui rend, pour le déploiement observé :

```
Tiers to build -> runtime=false web=true wsagent=… admin=…
```

et `admin` n'est déclenché que par :

```
grep -Eq '^(apps/admin/|infra/cloudbuild/admin-tier\.yaml)'
```

**Mesuré : ZÉRO commit n'a touché `apps/admin/` ni `admin-tier.yaml`** entre `d4a6f1df28` et la tête de `main`. Le « retard » d'`admin` n'en était donc pas un : son code n'avait pas changé, il n'y avait rien à reconstruire. Un tier à l'ancien tag quand son code n'a pas bougé est le **comportement voulu**, et il économise un build à chaque déploiement.

⚠️ **Ce que ça invalide, et qui compte plus que cette entrée** : comparer les tags entre services n'est **pas** un signal de santé. Un écart de tags est normal par construction. J'avais pris cet écart pour un défaut — l'erreur est de ma part, pas du déploiement.

**Ce qui reste, et qui est le vrai sujet**, consigné à part : rien ne vérifie qu'un tier donné tourne bien sur le dernier commit ayant touché SON code. C'est un trou de surveillance réel, et il ne se voit pas en regardant des tags. Voir `BUG-DEPLOY-SURVEILLANCE-TIERS-001`.

L'`echec du tag running-admin` relevé dans les journaux est cohérent avec ce fonctionnement : on ne peut pas étiqueter `running-admin` pour un SHA dont l'image `admin` n'a jamais été construite. C'est un bruit de journal, pas une panne.
