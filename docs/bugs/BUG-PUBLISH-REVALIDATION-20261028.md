---
id: BUG-PUBLISH-REVALIDATION-20261028
---

# Publication automatique pendant une nouvelle détection

## Bug

Sur main `9ec6ebf75`, le formulaire conserve son ancienne détection pendant
la revalidation React Router. Le bouton Publier reste actif en mode automatique
alors que le nouveau résultat est encore attendu. Reproduction avec le composant
réel, `createMemoryRouter`, les vrais fetchers et un loader local retenu : la
détection serveur précédente autorise une soumission avant le résultat statique.
Aucun fournisseur ni projet client n'est utilisé.

Le seul état du fetcher ne suffit pas : pendant `router.revalidate()`, le routeur
annonce `revalidation=loading` alors que le fetcher peut rester `idle` avec ses
anciennes données. Le formulaire attend donc la fin de la détection ET de la
revalidation en mode automatique. Un choix explicite du mode reste utilisable.

Le montage canonique est déjà indexé par projet/espace : le contrôle correspondant
isole correctement une nouvelle détection. Une réutilisation directe sans cette
clé expose des données antérieures, mais aucune fuite interprojet n'est démontrée
dans le parcours canonique. Aucun changement BaseChat/Workbench dans ce lot.

## 📤 Dispatché

☑ 28/10/2026 — audit Publish indépendant des PR #828/#829.

## 💻 Codé

☐ — correctif local ; non fusionné, non livré.

## ✅ Testé live

☐ — pas de publication fournisseur ni de recette authentifiée en production.
Les tests locaux utilisent des chargeurs isolés et conservent le témoin rouge.
