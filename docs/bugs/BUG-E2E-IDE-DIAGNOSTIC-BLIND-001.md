---
id: BUG-E2E-IDE-DIAGNOSTIC-BLIND-001
section: "2026-10-18 — Vérification avant commercialisation"
---

## Bug

P2 — Le diagnostic des échecs E2E du panneau base de données ne distinguait pas un panneau externe en chargement d'un panneau absent. Ses indicateurs dépendaient du titre « All databases » / « Toutes les bases de données », précisément absent lors de l'échec. Son tableau `responses: []` ne distinguait pas une requête jamais émise, une requête encore pendante et une requête échouée avant réponse. Les observateurs réseau étaient détachés avant le dernier échantillon DOM.

Le rouge produit reste distinct et ouvert : sur main `b827b122`, le test `ide-mobile-chrome.spec.ts` échoue sur le titre après trois tentatives dans le [run 39165426875](https://github.com/openaxcloud/vibecore/actions/runs/39165426875). Les métadonnées de ce run ont été transmises par la session parente ; le rapport navigateur n'a pas pu être matérialisé localement, le proxy retournant CONNECT 403. Aucun contournement effectué. Ni une requête retardée localement ni une duplication possible de chargement ne permettent d'attribuer la cause CI.

## 📤 Dispatché

📤 Pris en charge le 18/10/2026, périmètre diagnostic uniquement.

## 💻 Codé

☐ Correctif préparé sur branche dédiée ; pas encore fusionné sur main.

- Le conteneur réel `ide-service-panel[data-panel=database]`, sa visibilité, son chargement externe `aria-busy`, la présence et la visibilité du titre sont observés indépendamment. Le chargement interne reste un indicateur séparé.
- Les événements navigateur `request`, `response`, `requestfinished`, `requestfailed` sont corrélés par objet Request. Une réponse reçue avec corps encore en cours reste distinguée d'une requête terminée. Les observateurs restent attachés jusqu'après le dernier échantillon et la capture des métadonnées.
- Les requêtes vers trois familles de chemins sont classées, sans émettre leur URL, paramètres, identifiants de projet, en-têtes, corps ou texte d'erreur brut. Les méthodes et codes d'erreur sont limités à des listes connues. La borne de 24 requêtes est accompagnée d'un compteur de troncature ; les échantillons DOM conservent leur borne de 16 et l'attente diagnostique bornée existante.
- Le second scénario « Mes données » utilise le même diagnostic. Aucun changement aux assertions, délais de scénario, retries, waivers ou contrôles CI. Aucun changement au code produit.

## ✅ Testé live

☐ Aucun test production ni correction de la panne produit revendiqués. Les requêtes APIRequestContext de préparation et les appels serveur vers l'API ne sont pas des événements Page et restent hors de ce collecteur.

## Preuve

- Deux contre-exemples DOM échouent contre le collecteur antérieur : chargement externe sans titre et titre sans conteneur correspondant. Après correction, `scripts/ide-failure-metadata.spec.ts` vérifie 18 cas : EN/FR, conteneur masqué, premier titre masqué, absence de valeurs privées, transitions réseau, échecs sans réponse, requêtes simultanées, troncature, instantané immuable et durée des observateurs. Tests unitaires avec DOM jsdom et événements réseau instrumentés ; ils ne simulent pas une réussite du parcours produit.
- Le typecheck strict ciblé comprend les deux helpers, le test unitaire et le fichier E2E consommateur. Le chargement Playwright `--list` retrouve 45 scénarios Chromium ; il ne les exécute pas et n'est pas une preuve E2E verte.
- Les quatre fichiers TypeScript sont compilés en JavaScript. Une contre-épreuve du helper compilé avec Chromium système et un serveur HTTP local de test confirme six observations : conteneur occupé sans titre, attente sans réponse, corps reçu partiellement, fin de requête, annulation `ERR_ABORTED` et retrait final des observateurs. Cette preuve porte sur le collecteur, pas sur l'application. ESLint des quatre fichiers : zéro erreur et zéro avertissement ; 16 tests du générateur d'index passent également. Aucun build produit relancé pour ce changement de tests uniquement.
- Aucune dépendance ni code cloud ajouté. Les imports Playwright du nouveau module sont des types effacés à la compilation. Aucun paiement, fournisseur IA, donnée client, PostgreSQL ou Docker utilisé pour cette tranche.
