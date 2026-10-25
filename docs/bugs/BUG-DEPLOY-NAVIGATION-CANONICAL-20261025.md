---
id: BUG-DEPLOY-NAVIGATION-CANONICAL-20261025
---

# Publish et Domaines : achever le parcours unique de déploiement

## Bug

**La grille masque le doublon Domains, mais URL mobile, anciens layouts et page projet historique ouvrent encore une interface concurrente.** L'audit complémentaire du 25 octobre distingue cette consolidation partielle préexistante des corrections de fiabilité de #784.

## 📤 Dispatché

25 octobre 2026 : delta séparé de #784, branche `fix/deploy-single-navigation-20261025`, base `66455751c`. Aucun changement de la tête #784 en CI pour préparer ce lot.

## 💻 Codé

Premier lot local commité `15dd78791`, non intégré à main : la page historique Domains redirige après autorisation, ses opérations métier restent identiques et ses erreurs POST sont rendues explicitement (HTTP400). Les entrées IDE historiques affichent le même hôte Déploiement, sans migration destructrice des layouts ni suppression backend. Notice organisation et diagnostic TLS conservés. Réglages avancés disponibles dans le formulaire ; URLs des déploiements non READY exclues des liens présentés comme publiés.

L'audit complémentaire révèle une autre divergence : le bouton Publish principal et la navigation dashboard ouvrent encore la page Déploiements autonome. Celle-ci possède détection serveur/statique, choix de machine et délai de build de 610 secondes, absents du panneau IDE. Une simple redirection perdrait ces capacités. Leur partage et la consolidation de ces portes sont implémentés dans un complément distinct du lot Domains déjà testé, commité `2ae6d39d3`, revu indépendamment et validé en recette navigateur locale. Le formulaire partagé conserve la détection, les modes explicites, la taille de machine et les fournisseurs avancés ; le transport IDE conserve le délai de 610 secondes pour publication et republication. Historique détaillé, logs horodatés et confirmations sont portés. La détection respecte le workspace choisi et refuse une sélection étrangère au projet avant toute lecture. Les quatre réserves de revue sont levées : workspace du bouton Publish, clé de reprise, QR/lien Usage et libellés traduits. Les brouillons restent en mémoire par projet/workspace, sans stockage persistant des variables. Les preuves navigateur définitives sont jointes ci-dessous ; la CI et la livraison GitHub restent distinctes de cette validation locale.

## ✅ Testé live

Lot Domains : **6/6 recettes Chromium compilées passées**, 115829 ms, sans retry/omission. Les trois portes historiques, le maintien du sous-onglet au redimensionnement, l'assistant et les détails repliables, puis un POST historique invalide sans création de domaine sont vérifiés. Contre-épreuve mobile rouge sur le build précédent conservée. **190 tests contrôlés**, typage web, build, lint, scanner i18n et revue indépendante verts. [Reçu, captures et limites](deploy-canonical-navigation-2026-10-25/README.md).

Ces résultats ne certifient pas encore l'unification des deux parcours Publish. Aucune publication cliente, mutation DNS, validation production ou parité Replit revendiquée. Pile locale de cette recette arrêtée et conteneurs éphémères supprimés.

## Limites à vérifier

- Les trois entrées historiques rejoignent Déploiement → Domaines, puis permettent Logs/Manage sans réinitialisation lors d'un redimensionnement.
- La notice de portée organisation et les erreurs TLS restent présentes.
- Un ancien formulaire ouvert avant mise à jour conserve son diagnostic d'erreur POST.
- Les champs avancés repliés restent inclus dans FormData ; leur masquage visuel ne supprime aucune configuration.
- Le brouillon complet de l'assistant et les fournisseurs externes ne sont pas couverts par la seule conservation du brouillon Domains.

## Requalification après CI de #788

Le scanner a signalé un faux positif sur une empreinte SHA-256 associée au chemin `useKeybindings.ts` dans le reçu. Représentation corrigée sans changer les 36 chemins/empreintes, revue indépendante et scan Gitleaks 8.21.2 exact verts ; aucune exception ajoutée.

La CI suivante a révélé trois gardes restantes : ancien composant DeploySubNav devenu orphelin, contrat du wrapper commun sans hook, et ancien test français de la route désormais redirigée. Contre-épreuve locale : 3 échecs ; correctif `7e21b2987` : 179 tests/30 fichiers verts (incluant 23 tests des gardes), typage web/lint/i18n verts et revue indépendante favorable. La navigation canonique est conservée et le hook workspace est isolé dans le composant Deploy. Nouvelle compilation réussie et recette navigateur **9/9 verte en 222,9 s**, zéro retry/skip/flaky, sur `7e21b2987`. 37 sources, 2 suppressions et 2308 fichiers compilés inchangés après la recette. [Requalification après CI](publish-canonical-flow-2026-10-25/ci-followup/README.md).

## Recettes historiques et contraste du formulaire

Trois recettes E2E historiques dépendaient de l’ancienne page autonome : contre-épreuve 3/3 rouges. Elles sont migrées sans dérogation, en conservant géométrie/compte/thèmes, deux champs et seuils de contraste ; le premier déploiement exige désormais Publier actif et aucun Republier aux trois largeurs. Premier run migré : 8/10 verts, mais contraste des placeholders trop proche des valeurs en clair (7,12) et sombre (6,89), au-dessus du maximum 6 prévu par le contrat.

Le correctif `8b51f92ff` étend uniquement les tokens accessibles existants au formulaire Publish sur desktop, sans modifier les valeurs saisies ni les autres panneaux. Revue indépendante, 23 tests ciblés, typage web, lint et i18n verts. Nouvelle compilation et recette combinée **19/19 vertes en 298,2 s**, deux workers, zéro retry/skip/flaky. Contrastes mesurés : clair 4,54 (valeurs 16,67), sombre 5,26 (valeurs 18,07), sur les deux champs. 38 sources, 2 suppressions et 2307 fichiers compilés inchangés après la recette sur `8b51f92ff`. [Recette complète et captures](publish-canonical-flow-2026-10-25/legacy-e2e-followup/README.md).

## Intégration des travaux concurrents

Main `b502b1446` (#782 et #786) intégré sans rebase. Revue indépendante : 14 fichiers entrants strictement identiques ; BFF limité aux 4 lignes Deploy de ce lot, document restauration inchangé sémantiquement (guillemets JSON du frontmatter), index régénéré à 488 entrées. Combinaison : 234 tests/35 fichiers + 12 gardes/2 fichiers verts, typages web et API stricts verts. Les sources UI restent identiques à la recette `8b51f92ff`.

La première capture mobile avait été prise pendant la transition ; un complément ciblé attend désormais le champ dans le viewport et passe 1/1 en 91,6 s, sans modifier le produit. La preuve visuelle a été corrigée, sans réattribuer les 19 tests initiaux à la combinaison intégrée. Compilation intégrée réussie et recette complète **19/19 verte en 273,2 s** sur `663d9d36d`, deux workers, zéro retry/skip/flaky. API redémarrée sur ces sources ; 51 sources/tests, 2 suppressions et 2307 fichiers compilés inchangés. Captures mobile et contraste inspectées. [Preuve intégrée finale](publish-canonical-flow-2026-10-25/integration-final/README.md). Pile QA arrêtée et conteneurs éphémères supprimés.
