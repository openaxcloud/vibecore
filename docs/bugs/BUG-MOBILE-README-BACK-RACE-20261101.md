---
id: BUG-MOBILE-README-BACK-RACE-20261101
---

## Bug

P1 — à 390 px, choisir README puis quitter immédiatement vers le tableau de bord peut laisser Library dans l’historique. Retour n’ouvre alors pas l’éditeur. #883 : première tentative échouée, reprise réussie.

## 📤 Dispatché

☑ 01/11 — diagnostic et correction séparés, base exacte 5dea2523b68b36adf6709bd28c7576c31cb3198f. Ne pas modifier #883 pendant sa validation.

## 💻 Codé

☐ — branche fix/mobile-readme-back-race-20261101, non intégrée sur main. Le chargement racine n’est plus relancé pour un changement du seul paramètre panel vers editor dans le même IDE ; langues, routes, formulaires et revalidation explicite conservent leur comportement.

## ✅ Testé live

☐ — aucune production ni iPhone physique. Reproduction locale compilée : 10 passages sans délai, puis 3 échecs sur 3 avec réponse réelle du chargeur racine retardée de 750 ms. Trace de première tentative : navigation editor interrompue par dashboard, retour vers panel=files. Après correction finale : 18/18 parcours Chromium de restauration et 6/6 répétitions supplémentaires à 390 px passent sans reprise ; 53 tests unitaires racine, 6 tests index, build, typage et lint passent. WebKit reste non validé : échec de connexion local HTTP/cookie Secure avant le scénario. [Preuves](mobile-readme-back-20261101/README.md).
