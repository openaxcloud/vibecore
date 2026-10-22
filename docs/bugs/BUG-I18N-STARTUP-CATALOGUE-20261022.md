---
id: BUG-I18N-STARTUP-CATALOGUE-20261022
---

# Chargement des traductions : attente sans limite avant la connexion

## Constat

Sur le bundle local, maintenir une requête de catalogue public en attente empêche l’hydratation : le logo reste affiché, sans formulaire de connexion. Une réponse 503 déclenche au contraire l’hydratation sans les libellés, avec erreurs React et textes « Unavailable ». Cela reproduit deux défauts de robustesse ; la cause de l’incident production observé le 22 octobre reste non établie.

## 📤 Dispatché

☑ — correctif indépendant demandé le 22 octobre 2026, hors éditeur et API.

## 💻 Codé

☐ — branche fix/login-catalogue-recovery-20261022, pas fusionnée sur main. Requête entière bornée (en-têtes et corps), abandon, validation HTTP/JSON, message SSR autonome et bouton Réessayer avant hydratation. Les attributs SSR sont restaurés avant que React prenne la main.

## ✅ Testé live

☐ — validation locale uniquement ; ni production ni connexion authentifiée certifiées. Recette reproductible et résultats dans docs/reprise/login-catalogue-recovery-2026-10-22/README.md.

## Revue CI du premier candidat

Le premier commit e3244fb a révélé six résidus i18n et un titre h1 caché précédant celui des pages publiques. Le correctif suivant emploie les catalogues centraux rendus côté serveur, des codes de diagnostic structurés et un titre h2 pour l’alerte. Scanner effectif et recette typography existante doivent passer avant publication ; aucune exemption ajoutée. Preuves de revalidation : docs/reprise/login-catalogue-recovery-2026-10-22/ci-corrections/README.md.
