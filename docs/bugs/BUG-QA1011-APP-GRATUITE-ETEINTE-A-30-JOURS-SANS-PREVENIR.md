---
id: BUG-QA1011-APP-GRATUITE-ETEINTE-A-30-JOURS-SANS-PREVENIR
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Constat

**Une application publiée au forfait gratuit est ÉTEINTE automatiquement au bout de 30 jours, et rien ne le dit au
client** : ni la page de prix, ni les textes de publication.

- `packages/billing/src/starter-rate-card.ts` : `publishedProjectTtlDays = 30`, recopié de Replit (« This published
  link will automatically go down after 30 days », relevé le 2026-07-20). Replit l'AFFICHE ; nous non.
- Tout forfait non payant devient `starter` (`toEntitlementPlanKey`, branche par défaut) : la règle s'applique donc
  au gratuit.
- La règle est APPLIQUÉE : le balayage des déploiements (`stopExpiredServerDeployments`, `app.ts` ~37416) arrête la
  charge et marque `expiredAt` ; le relais répond alors 410.
- Recherche du « 30 jours » dans le catalogue marketing et dans les catalogues de publication : rien trouvé.

## En production (2026-10-11, lecture seule)

0 application éteinte par cette règle ; les 7 déploiements existants sont internes (entreprise) et tous en échec
(voir BUG-QA1011-PUBLICATION-ECHOUE-AU-BUILD). **Aucun client touché aujourd'hui.** Le premier client gratuit qui
publiera verra son application disparaître au 30e jour, sans avertissement.

## Voisin, déjà signalé

Le plafond « un seul projet publié actif » (`maxActivePublishedProjects = 1`) existe dans le même fichier, mais
l'API ne l'appelle nulle part (0 appel). C'est l'inverse : la page l'annonce, le code ne l'applique pas.

## Décision à prendre

Annoncer les 30 jours là où le client publie et sur la page de prix, ou retirer la règle.

## 📤

☐ signalé le 2026-10-11 (session QA), non traité

## 💻

☐

## ✅

☐

## Preuve

Code lu sur `main` `112ff6a90f` ; lecture seule de la table `Deployment` en production.
