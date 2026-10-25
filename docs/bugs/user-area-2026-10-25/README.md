# Zone utilisateur : navigation, saisie et menus

Complément local préparé à partir de #791, dans un worktree distinct. Aucune modification du produit #791 soumis pendant sa CI. Pas de production, compte réel, achat, abonnement, suppression, publication cliente ou DNS. Les API de cette recette sont des fixtures synthétiques locales ; elles refusent les mutations avec HTTP 503. Les tests de routeur mémoire ne constituent pas une validation backend.

## Défauts reproduits et corrections

| Défaut | Avant | Après |
| --- | --- | --- |
| Dialogue Données : focus perdu | Échap/Annuler rendent le focus à body | Retour à l'ouvreur, description ARIA associée, confirmation vidée à réouverture |
| Erreur Facturation hors écran | Après HTTP 503, alerte à y=-551px et focus sur body | Alerte focalisée et visible, par exemple y=335 px à 320 px ; valeurs conservées, erreur répétée également accessible |
| Recherche Projets et historique | Navigation/Retour/Avancer réécrivent ancien filtre ; réponse A efface frappe AB | Écritures inutiles supprimées, attente navigation, distinction réponse locale/navigation externe, frappe ultérieure conservée |
| Nom de projet en liste mobile | Seulement 79,3 px pour le titre, « Applicati… » | Bloc texte pleine largeur mobile, nom complet et mots longs à la ligne |
| Effacement recherche | Champ y=405, hauteur 44, bouton y=427, hauteur 44, déborde de 22 px | Bouton contenu dans le champ ; Framer ne remplace plus la translation nécessaire à son placement |
| Titre Facturation comprimé à 640 px et zoom 200 % | Quatre lignes, bloc de 314 px | Actions empilées localement : deux lignes, bloc de 194 px ; liens et traitements inchangés |
| Menu projet mobile | Ouverture clavier scrollY114→0, ouvreur hors écran, menuhidden/focus sur body | Mode non modal limité à ProjectCardMenu ; scroll conservé, menu visible, clavier/Échap/retour du focus/extérieur fonctionnels |

La preuve rouge du premier correctif recherche est conservée dans `first-fix/`. Les réponses retardées et la collision d'un lien PUSH avec une recherche locale ont été ajoutées à la contre-épreuve. Aucun test rouge n'a été transformé en skip.

## Matrice exacte

| Surface | Tailles/modes | Résultat et portée |
| --- | --- | --- |
| Données/dialogue et Connexions | 320,360,390, paysage844×390,768,820,1024,1280,1440,1920,2560 ; FR/EN×clair/sombre |88 observations, 8 groupes d’interactions : saisie/resize, focus initial, 5 Tab confinés, Échap/Annuler, réouverture, Connexions→Retour. Aucune mutation |
| Dashboard et liste Projets |12 tailles incluant 640×400 de reflow,320→2560 ; FR/EN×clair/sombre |96 observations ciblées : largeur document ; titres de la liste Projets et bouton d’effacement contenus ; effacement fonctionnel. Ne valide pas toute la palette dashboard : défaut ouvert ci-dessous |
| Recherche Projets |Chromium compilé, requêtes.data retardées de 350 ms, resize390→320→1440 |Navigation/Retour/Avancer et frappe pendant chargement verts ; détails dans les deux reçus dédiés |
| Facturation |11 tailles de 320→2560×FR/EN×clair/sombre +4 groupes d’interactions |48 observations : géométrie contrôles, valeurs conservées,HTTP 503 répété visible/focalisé ; reflow 640, hauteur réduite320, pinch 200 % |
| Menus Projets |320/390/820/1440×FR/EN×clair/sombre |16 parcours : scroll préservé, menu contenu, clavier/extérieur, renommage/brouillonresize/Échap, confirmation suppression annulée ; zéro POST |
| Contraste |5 routes (/billing,/account-settings/data,/account-settings/connected,/projects,/dashboard), FR,390px, clair/sombre |682 éléments textuels sur fonds simples évalués ; minimum 4,87:1, aucun sous 4,5:1. Dégradés/opacité et contrôles désactivés exclus ; pas un audit de tous les états |
| Zoom |Desktop natif 200 %, reflow 640×400 et pinch Chromium 200 % |[20 cas natifs et 12 groupes d’interactions](native-zoom/README.md), cinq pages × FR/EN × clair/sombre : fenêtre1280 → CSS640, DPR2, échellevisuelle1. Redimensionnement physique pendant saisie vérifié ; zoom réglé au démarrage, pas basculé pendant saisie. Connexions exclue de cette matrice native. Pinch distinct mesuré à échelle2 |
| Safe areas/clavier virtuel |Hauteur de fenêtre réduite et maintien de saisie vérifiés |Pas de clavier OS réel ni encoche. Emulation.setSafeAreaInsets indisponible dans ce Chromium ; aucune validation matérielle revendiquée |
| Autres routes/panneaux, Safari, voix réelle |—|Non validés par ce lot |

Chromium 154.0.8037.57. Données/Facturation/Projets vérifiés sur port 5899 ; menus sur build consolidé, port 5999. Les sources des surfaces inchangées ont été contrôlées par empreinte entre les builds. Les reçus gardent leurs URL exactes. Les services backend réels et la version déployée ne sont pas couverts.

## Défaut partagé conservé, non corrigé ici

Palette Dashboard 320 : options 1317,656 px dans listbox 269 px ; contenu coupé malgré absence de débordement du document. `SaaSLayout.tsx` réservé à #788. Contre-épreuve CSS temporaire : min-width:0 ramène les options à 269 px. Voir `deferred/` et `BUG-DASHBOARD-PALETTE-WIDTH-20261025.md`. Le patch proposé contient uniquement le lien résultat mesuré ; il n'est pas appliqué. Vérifier et intégrer après #788, sans relancer sa CI pour ce défaut indépendant.

Le statut des menus, de la palette, des titres et du reflow est distinct : aucun verdict global « toute la plateforme validée » n'est tiré des captures.

## Reproduction locale

Dépendances du dépôt installées et Chromium disponible. Les scripts sous `scripts/` sont les sondes utilisées, avec import Playwright rendu relatif au dépôt ; ils écrivent dans `/tmp/account-next`, `/tmp/projects-ui`, `/tmp/ui-next`. Créer ces dossiers. Copier `fixtures/extra.json` vers `/tmp/ui-next/extra.json`, puis lancer `node fixtures/fixture.cjs` depuis ce dossier de preuves. Servir le build **depuis la racine du worktree qui possède build/client**, avec `SAAS_API_URL=http://127.0.0.1:3199`, HOST 127.0.0.1 et PORT local. Passer `UI_BASE_URL` aux scripts qui le proposent ; `contrast.cjs` exige désormais également `UI_BASE_URL` local explicite. Aucun script de fixture n'est importé par le produit.

Le navigateur bloque les requêtes tierces. Les erreurs de démarrage Vite/serveur statique rencontrées au début ont été distinguées des défauts produit ; elles ne sont pas des verdicts UI.

## Validation du code

104 tests ciblés verts, lint global : 0 erreur / 52 avertissements préexistants, typage web strict et build verts. Les gardes source obsolètes sur aria-selected et titre tronqué ont été migrées vers les exigences actuelles, avec contre-épreuves rouges conservées et revue indépendante. Les autres menus Dropdown gardent leur comportement modal par défaut.

Reste avant intégration : revue/CI requise, intégration de main courant, fusion normale puis vérification de la livraison autorisée. Le lot ne doit pas être décrit comme livré tant que ces étapes n'ont pas abouti.

## Distinction avec le menu IDE de #788

`tests/e2e/ide-panel-visibility.spec.ts:62` vérifie les variantes `panels` et `tabs` à 390 px : `BaseChat.tsx`, `mobile-more-menu-sheet` et `mobile-tab-switcher`. Ces composants ne sont pas le `ProjectCardMenu` corrigé ici. Les 16 parcours Projets incluent quatre cas à 390 px, avec scroll 107 → 107 et `escapeFocus=true`. Le retry CI signalé sur #788 ne prouve pas que notre correctif traite son problème ; aucun changement des composants IDE dans ce lot.

## Contre-vérification de l’installation locale

La suite complète sur les dépendances initialement partagées a terminé avec 10 282 succès, 9 échecs et 7 skips existants (1 322 fichiers). Les neuf échecs concernent six fichiers : gardes shell-quote, compression, ws et Tinypool installés à des versions anciennes ; compilation HMR et installation admin appelant pnpm global 11 au lieu du 9.14.4 épinglé. Ce résultat rouge est conservé, pas requalifié en succès.

Après détachement des 21 liens de dépendances dans le seul worktree de ce lot, installation pnpm 9.14.4 avec lockfile gelé : shell-quote 1.11.0, compression 1.8.2, ws 8.22.0 et Tinypool 2.1.2. Aucun manifeste ni lockfile modifié ; aucun arbre partagé modifié. Les six fichiers précédemment en échec, les 104 tests UI/inventaire et les huit gardes CI #790 ont été rejoués : 138 tests verts (124 + 14), sans skip ajouté. La suite complète n’a pas été répétée après installation.

Après installation corrigée, build, typage strict et lint (0 erreur / 52 avertissements) passent. Les parcours existants ont été rejoués sur le nouveau build servi au port 6099 : 88 observations Compte, 96 Dashboard/Projets, 48 Facturation, 16 menus, navigation Retour/Avancer retardée et saisie pendant chargement. Les reçus sont conservés dans `locked-install/`, séparés des premières mesures. Les fichiers produit sont identiques au commit `6312f78c2` ; les fusions locales préservent Fleet #789 et CI #790.

La revue documentaire indépendante confirme les comptes et limites. Les sorties complètes des contre-tests et du lint, ainsi que les extraits horodatés de la suite initiale et du build avec empreintes des journaux bruts, sont archivés dans `locked-install/`. Le contraste remesuré sur 6099 reste à 682 textes, minimum 4,87:1, aucun sous 4,5:1 dans le périmètre défini.

## Dernier correctif visuel : actions Facturation

L’inspection des captures à zoom natif a révélé un titre comprimé malgré des contrôles de débordement verts. [Correction et contre-épreuves](billing-heading/README.md) : un wrapper local, aucune modification du shell #788. Sur le build final 6199 : 36 mesures de l’en-tête, 48 observations Facturation, et les 20 cas / 12 interactions de zoom natif rejoués. Build, typage strict, 67 tests ciblés et lint ciblé verts. Les autres sources produit restent identiques au lot mesuré sur 6099.
