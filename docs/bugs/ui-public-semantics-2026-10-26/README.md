# Audit sémantique public — 26 octobre 2026

Lecture seule et Chromium local sur le build c2823890d, SHA256 serveur `cf30aa36b3b922b28a7e40197b71dc8b17baf79f9193fff91d9d6f9f8b0ebad2`. HEAD source ultérieur ad80c14a5 ne change que admin.billing depuis c282 ; ce fichier est hors audit. Serveur13999 / API6999 synthétique séparés ; provenances PID/startTicks dans provenance.json. Aucun build, changement produit, index, commit ou publication. Pas de panneau IDE ni des 37 routes réservées.

## Dénominateur réellement observé

58 observations =29 états rendus Solutions/Produit ×FR/EN, Chromium1440×900 sombre. Le catalogue contient30IDs : alias /ai-agent/studio sans rendu propre exclu de ce complément, état /solutions/synthetic-unknown404 inclus. `receipt.json` conserve par route les landmarks DOM et arbre accessible Chromium, noms, titres h1–h6, contrôles accessibles sans nom éventuels, imbrications et routes réellement montées. Un unique main sans nom explicite n'est pas classé comme défaut.

6 séquences clavier desktop =3 pages×FR/EN, et8 séquences320×740 =4URLs×FR/EN (`mobile-keyboard.json`). Focus initial programmatique du lien pour isoler le contrôle, puis vrai Tab : la reproduction prouve l'arrêt consécutif, pas un parcours intégral depuis la barre navigateur. Aucun Enter/clic d'inscription/contact ni mutation. Les captures desktop sont accessoires ; ce contrôle n'est pas une nouvelle recette géométrique.

## Défauts reproduits

### Doubles arrêts clavier : 4 URLs, 3 composants de page + section différée

`/bounties`, `/marketing/bounties`, `/marketing/deployments`, `/marketing/teams` ont chacun4 boutons natifs imbriqués dans4 liens natifs. Les2URLs Bounties utilisent le même composant, donc12 paires source uniques,16paires par inventaireURL. FR/EN identiques structurellement.

Exemple /marketing/deployments FR : focus A « Parler à un expert », href /contact-sales → Tab → BUTTON « Parler à un expert » dans ce même A → Tab → A « Consulter la documentation des déploiements », href /docs. Même duplication confirmée à320 et1440. /marketing/teams : « Collaborer gratuitement » /register ; /bounties et /marketing/bounties : « Publier votre première mission » /register. Aucun lien activé. Conséquence : deux arrêts successifs et rôles lien/bouton pour une seule action de navigation.

Propriétaires source publics :
- `app/components/marketing/ecode-exact/pages/Bounties.tsx:91,97,280,286` (2URLs).
- `app/components/marketing/ecode-exact/pages/PublicTeamPage.tsx:54,59,136,141`.
- `app/components/marketing/ecode-exact/pages/PublicDeploymentsPage.tsx:59,69`.
- `app/components/marketing/ecode-exact/pages/PublicDeploymentsSections.tsx:343,349` (CTA différés).

Cause : `EcodeExactUi.tsx:75` Link rend un vrai lien ; Button:135 rend un vrai button par défaut. Le composant propose déjà asChild. Proposition à coordonner avant tout patch : utiliser localement Button asChild contenant Link, garder textes/href/classes/testids et mesures44px, puis vraie régression Tab à un seul arrêt et activation GET sûre. Ne pas changer globalement Button/Link ni le panneau IDE. Aucun patch appliqué ; aucun contrôle frais des PR demandé/effectué pour une modification à ce stade.

### Landmark principal absent : 2 pages

`/marketing/deployments` et `/marketing/teams` :0main DOM visible et0rôle main dans l'arbre accessible en FR/EN. Leurs titres h1 sont présents mais leurs sections sont enfants du div de page entre Navbar et Footer. Propriétaires respectifs `PublicDeploymentsPage.tsx:41` et `PublicTeamPage.tsx:42`.

Proposition locale : main autour du contenu de page, en laissant navbar/footer hors main et en incluant les sections différées Deployments. Pas d'ajout de main dans un shell partagé sans contrôler les autres consommateurs. Aucun patch appliqué.

## Autres résultats et limites

Chaque état observé expose exactement1h1. Les27 autres états rendent1main accessible. Aucun contrôle sans nom accessible parmi les rôles button/link/textbox/combobox/checkbox/radio/switch/slider/searchbox non ignorés dans l'arbre Chromium initial. Cela ne couvre pas les contrôles de menus fermés, tous les états dynamiques, tooltips, descriptions, live regions ni lecteurs d'écran réels.

Saut h1→h3 dans les cartes hero /marketing/deployments ; signal de hiérarchie à examiner avec le contenu, pas qualification automatique de violation. La404 solutions passe également h1→h3 dans son footer. Aucun h1 multiple observé.

0pageerror.132GET tiers GoogleFonts bloqués dans la recette principale ;0mutation tentée dans son reçu. Le supplément mobile bloque aussi tout nonGET/tiers mais n'en compte pas les interceptions : ne pas attribuer132 à toute l'exécution. API fixture rejette toute mutation et tout GET non prévu, guard SSR interdit fetch externe. Aucun résultat production, Safari/Firefox, lecteur d'écran ou certification WCAG/contraste. Aucun nouveau test produit exécuté. Arrêt des processus propres vérifié séparément dans cleanup.json.

## État du correctif local

Les quatre composants et le test ont été corrigés après contrôle frais de32PR ouvertes sans chevauchement (`open-pr-files.json`). Douze paires source deviennent Button asChild > Link ; main entoure le contenu des deux pages, navbar/footer exclus. Textes, destinations, icônes et styles conservés, revue indépendante favorable dans `independent-review.md`.

Validation source :6tests nouveaux rouges avant puis6verts, plus21tests de catalogues existants verts, soit27tests/3fichiers. Lint initial2erreurs d’espacement conservées puis corrigées ; lint final et Prettier5fichiers verts. La cible inexistante public-deployments.spec.ts passée à la commande n’a pas été exécutée. Aucun build ni typage exécuté dans ce worktree.

La baseline ciblée supplémentaire `before/receipt.json` contient48observations (3pages×4largeurs320/768/1024/1440×FR/EN×2thèmes),192CTA tous≥44px et sans débordement intrinsèque,48séquences clavier avec double arrêt,0pageerror. Ce sont des preuves AVANT le correctif, distinctes des58observations sémantiques et8séquences mobiles initiales ; ne pas les additionner comme pages distinctes. Le premier démarrage avant disponibilité HTTP a échoué connexion refusée, conservé dans before/startup-race.json et geometry-before.txt ; reprise après HTTP200.

La recette du build corrigé n’est PAS exécutée. Géométrie flex/cascade lien-bouton, Range/hauteurs44px, Tab/Enter sur GET sûr/Back devront être vérifiés sur le build commun. Le harness geometry.cjs est préparé avec PHASE=after et UI_BASE explicite, sans aucune mutation autorisée. Aucun résultat main, production ou WCAG global.

Scripts archivés exacts sous *.cjs.executed.txt ; copies *.cjs rendues portables avec UI_REPO_ROOT (défaut répertoire courant) pour les dépendances. geometry.cjs contient déjà les branches après préparées mais non exécutées. routes-plan.json est la cartographie historique, pas une preuve de toutes ses validations. Les anciens chemins absolus des reçus sont des éléments de provenance. Aucun secret ni donnée réelle ; les requêtes sont anonymes synthétiques.

Serveurs propres arrêtés : cleanup.json et initial-cleanup.json montrent les PID résiduels en état Z sans cmdline, ports libres, aucun processus serveur vivant ; ne pas prétendre disparition des entrées /proc. Navigateurs fermés.

Archivage : seules les lignes blanches finales de trois logs ont été normalisées pour git diff --check ; résultats et erreurs conservés.
