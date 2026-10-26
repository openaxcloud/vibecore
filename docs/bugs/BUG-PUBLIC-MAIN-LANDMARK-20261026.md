---
id: BUG-PUBLIC-MAIN-LANDMARK-20261026
---

# Pages publiques équipes et déploiements sans repère principal

États : dispatché ☑ ; intégré main ☐ ; testé production ☐. Correctif local préparé, recette compilée après en attente.

/marketing/deployments et /marketing/teams exposent zéro main dans le DOM et l’arbre accessible Chromium, en FR/EN. Le h1 est présent ; les sections sont directement dans le div de page.

Correction locale : main autour du contenu, sections différées incluses, navbar/footer exclus, dans PublicDeploymentsPage et PublicTeamPage. Aucun shell partagé ou panneau IDE modifié.

Preuves : [recette et dénominateurs](ui-public-semantics-2026-10-26/README.md), [tests et revue](ui-public-semantics-2026-10-26/independent-review.md). Le test DOM vérifie1main/1h1 et nav/footer horsmain. La recette compilée après, les lecteurs d’écran et la production ne sont pas validés.
