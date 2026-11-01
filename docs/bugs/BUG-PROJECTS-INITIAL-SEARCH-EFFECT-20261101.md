---
id: BUG-PROJECTS-INITIAL-SEARCH-EFFECT-20261101
section: "Interface et navigation"
---

# La synchronisation initiale de recherche efface une saisie précoce

## 📤 Dispatché

☑ 01/11 — analyser l’échec unitaire sur main `7ecd1d85`, run `41339721137`,
`projects.search-navigation.spec.tsx:102` : navigation attendue `loading`, reçue `idle`.
Le contrôle de livraison a bloqué le build ; aucun déploiement de ce correctif démontré.

## 💻 Codé

☑ — correction locale préparée : mémoriser l’identité de localisation déjà consommée
par `useState` et ne resynchroniser que lors d’un changement effectif. L’effet initial
et son rejeu StrictMode préservent ainsi la saisie, sans désactiver Back/Forward,
PUSH, REPLACE ni la conservation des caractères saisis pendant une navigation.
Le test de saisie concurrente tient les chargements A puis AB avec des promesses ;
il vérifie A et AB dans le champ, l’URL intermédiaire A puis l’URL finale AB.

## ✅ Testé live

☐ — aucune recette navigateur en production ; validations locales jsdom seulement.

## Preuves et limites

Deux régressions déterministes injectent A après le commit DOM et avant les effets
passifs, en mode normal et StrictMode. Elles échouent sur le produit inchangé de
main et passent après correction ; les huit scénarios historiques passent aussi.
Une revue indépendante reproduit séparément cette fenêtre sans instrumentation
du produit et vérifie la conservation du même élément DOM.

Cette course suffit à produire une saisie vide et une navigation idle. Le log CI
ne trace pas l’ordre des effets : elle n’est pas présentée comme reconstitution
certaine de cette exécution. Une seconde sonde d’observation volontairement tardive
reproduit idle/loading avec A conservé, donc un symptôme distinct du snapshot CI.
Aucun timeout augmenté, assertion supprimée, appel fournisseur ou relance CI.
