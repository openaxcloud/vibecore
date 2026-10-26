---
id: BUG-PUBLIC-CTA-DUPLICATE-TAB-20261026
---

# CTA publics : deux arrêts clavier pour une seule navigation

États : dispatché ☑ ; intégré main ☐ ; testé production ☐. Correctif local préparé, recette compilée après en attente.

Quatre URLs : /bounties, /marketing/bounties (même composant), /marketing/deployments, /marketing/teams. Chaque page présente quatre liens contenant un bouton, soit12paires source uniques. Vrai Tab reproduit lien→bouton de même texte/destination en FR/EN à320/1440 ; référence géométrique supplémentaire48cas.

Correction locale : Button asChild contenant Link dans Bounties, PublicTeamPage, PublicDeploymentsPage et PublicDeploymentsSections. Aucun changement sharedUi/IDE, destination, contenu ou action backend.

Preuves et limites : [dossier de recette](ui-public-semantics-2026-10-26/README.md), [revue indépendante](ui-public-semantics-2026-10-26/independent-review.md). Six tests DOM rouges→verts ;21tests existants verts. Le clavier et les dimensions du build corrigé restent à valider ; aucun résultat production.

Mise à jour locale : recette compilée commune réussie sur cc5574d67 (voir [preuves après](ui-public-semantics-2026-10-26/after13999/README.md)). Les mentions « en attente » ci-dessus décrivent le stade initial ; intégration main et production demeurent non revendiquées.
