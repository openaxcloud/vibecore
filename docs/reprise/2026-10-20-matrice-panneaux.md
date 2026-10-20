# Matrice des panneaux — 20 octobre 2026

Référence source : `9c8f6bc6d95a97ddf54a52a932a6c07aff4f2828`. Preuves fonctionnelles figées à 16:20 UTC ; cartographie source enrichie à 16:29:07 UTC puis figée à 16:31:15 UTC. Cette réconciliation n’ajoute aucun reçu d’exécution et ne valide pas les travaux concurrents. Cette matrice ne certifie aucun panneau entièrement fonctionnel. Aucun nouveau test, navigateur, accès base ou lecture de secret n’a été exécuté pour la produire. Le [relevé JSON](mesures/2026-10-20-matrice-panneaux.json) conserve les dates, environnements, empreintes et limites de chaque action.

Le périmètre comprend 31 surfaces IDE canoniques, les recettes locales DB/intégrations/historique, les diagnostics éditeur/fichiers et le banc physique de restauration candidat. L’inventaire final couvre 171 fichiers source au même SHA, 19 alias IDE, 19 URLs settings et 34 sections admin distinctes des 31 panneaux IDE ; ce sont des périmètres de source, pas des fonctions testées. Les parcours compte, facturation, administration et réglages globaux n’ont qu’un examen partiel ; leurs boutons ne sont pas validés. NON TESTÉ signifie sans reçu action par action dans ce périmètre, sans affirmer que personne ne l’a jamais essayé.

Les recettes locales utilisent un vrai backend HTTP, Prisma et PostgreSQL avec des données synthétiques. Cela ne prouve pas l’exécution cloud, l’accès fournisseur, la publication ni la facturation. Les mocks/TestApiStore et fixtures Kubernetes des suites isolées restent distincts. Une désactivation ou un refus honnête n’est pas une fonction achevée.

Le workflow de déploiement main9c8 est déclaré réussi à 14:58:11 UTC, avec rollout et comparaison imageIDs ; les imageIDs bruts n’ont pas été récupérés. Les accès HTTPS publics échouent au proxy CONNECT 403 avant l’origine : version servie et parcours en production restent inconnus. Voir le [reçu de déploiement](mesures/2026-10-20-deployment-9c8f6bc6.json).

## Actions réellement exercées

Pour toutes les recettes UI ci-dessous, les autorisations sont celles de la propre identité QA. Aucune matrice inter-utilisateurs/inter-organisations n’est prouvée. Les dates sont en UTC.

| Action et date | Backend / résultat | Persistance et rechargement | Échecs et limites | Preuve |
|---|---|---|---|---|
| Database : ouvrir, attendre, Réessayer — 19/10 01:36 et 02:56 | API/PG réels ; liste de 128 tables récupérée. | Lecture réelle ; pas écriture métier ni reload complet. | Réponse réelle retenue ; premier état erreur du second essai explicitement simulé. Ancien build, pas main9c8. | [Réessai](mesures/2026-10-19-database-loading-retry-browser.json), [poll60s](mesures/2026-10-19-database-real-60s-poll.json) |
| DB dédiée : capacités/historique/fenêtre dev+prod, demandes restore directes et lecture UI — 20/10 09:59/11:13 | API/PG ; GET 200, POST 503 ; instances ACTIVE synthétiques. | Journal et secrets inchangés ; affichage conservé après reload sur 3 formats. | Aucun clic sauvegarde/restauration, aucun CNPG ; Fin non vérifiée est un refus. | [API](2026-10-20-restauration-preuves/qa-api-evidence.json), [UI](2026-10-20-restauration-preuves/checkpoint-browser.json) |
| Checkpoint combiné : POST BFF EN/FR formulaire/JSON — 20/10 12:43 | BFF compilé→API→Prisma/PG ;503, not_started. | Empreintes avant/après identiques ; mémoire agent vide. | HTTP direct, pas clic ; aucun restore fichiers/DB/mémoire. | [Reçu](2026-10-20-restauration-preuves/nosnapshot-http.json) |
| Historique sans snapshot : ouvrir, activer contrôle désactivé, relire — 20/10 12:42 | UI réelle ; zéro POST restauration, quatre messages préservés. | Conversation persistée relue identique sur 3 formats ; pas navigation complète. | Runtime indisponible ; génération et différences non testées. Libellé différentiel tronqué dans capture mobile main. | [Reçu](2026-10-20-restauration-preuves/nosnapshot-browser.json) |
| Intégrations : configurer sans token, lire Connected, demander Sync — 20/10 10:34 | Config par POST direct 200 ; Sync désactivé et POST 503. | Config relue ; Sync ne modifie pas état/lastSync ; rechargement dans 3 formats. | Pas clic Connecter, OAuth, accès fournisseur ou synchronisation réelle. | [Reçu versionné](mesures/2026-10-20-integration-honesty-local.json) ; script détaillé local non livré |
| Webhook : Ajouter, remplir et soumettre — 20/10 10:34 | Vrais clics/formulaire desktop, API/PG ;200 et entrée créée. | Événements relus ; entrée visible après rechargement dans 3 formats. | URL synthétique ; livraison/métriques inconnues ; suspendre/supprimer/flux/clés non testés. | [Reçu versionné](mesures/2026-10-20-integration-honesty-local.json) ; captures locales non livrées |
| Éditeur/fichiers : récupérer archive, tenter entrée Monaco — 20/10 13:57/13:59 | HTTP 200, 9 fichiers synthétiques avec README attendu. | Aucune écriture/onglets persistants prouvés. | Assertions initiales Monaco rouges ; suite de recette non atteinte. | L1, artefacts locaux non livrés |
| Panneau flottant : déplacer/redimensionner, formats/langue, dashboard/retour, ancrer/flotter/fermer — 20/10 11:47 | UI/API/PG réels ; parcours passé dans diagnostic. | Panneau restauré après navigation/rechargement du diagnostic. | Google Fonts volontairement refusé ; recettes réseau normal rouges, cause non attribuée. Candidat non fusionné. | L2, artefacts locaux non livrés |
| Restauration physique : backup+WAL, bascule sonde, relecture/redémarrage — 20/10 13:53 | PostgreSQL physique/API/Prisma  ; 202, concurrence 409 ; sonde 503 puis 200. | Deux lignes attendues relues, journal durable, cible après restart, autre environnement inchangé. | Banc candidat hors UI, cloud/CNPG absents ; fencing distribué non prouvé et P1 découvert ensuite. | [Reçu candidat](mesures/2026-10-20-restore-physical-final.json) |

La lisibilité des neuf libellés d’historique a aussi été mesurée sur trois formats dans un candidat non fusionné : c’est une preuve visuelle/actionabilité trial, pas l’exécution d’Afficher le chat ou d’Examiner les différences. Les polices locales servies ne constituent pas une preuve métier.

## Les 31 panneaux

Le rapprochement final confirme des trous de graphe sur **17 surfaces** : callbacks, sous-composants ou intentions dynamiques non entièrement reliés. Les détails actualisés (notamment agent, éditeur et secrets) remplacent ceux du premier inventaire. Les contrôles extraits ne sont pas comptés comme des fonctions exécutées. Le JSON conserve ces trous, sans importer le grand inventaire JSX local.

| Panneau | Fonctions identifiées dans main | Couverture de ce relevé |
|---|---|---|
| agent | Composer/envoyer/arrêter une demande, modes Agent/Assistant/Plan, puissance, pièces jointes et dictée, mentions et commandes, messages/outils, branches et historique/restauration. Options conditionnées par projectIdeMode et fournisseurs ; sélectionner un modèle n’est pas présumé visible dans l’IDE courant. | PARTIEL — Historique sans archive : contrôle désactivé, quatre messages préservés. Génération/exécution non éprouvées. |
| editor | Ouvrir un fichier, modifier/enregistrer, onglets, navigation par symbole, recherche/remplacement, historique, comparaison/restauration de version ; sous-composants de l’éditeur encore à suivre. | PARTIEL — Archive reçue mais assertions Monaco rouges ; navigation flottante seulement en diagnostic réseau. |
| preview | Aperçu URL/port, rechargement, navigation, modes d’appareil, ouverture externe, capture/inspection visuelle, console et commandes de démarrage/reprise. | NON TESTÉ : aucun reçu action par action examiné. |
| files | Arborescence, ouvrir, créer fichier/dossier, renommer, supprimer, importer/téléverser, télécharger/exporter, rechercher, historique et verrouillage ; effets répartis entre callbacks et store. | PARTIEL — Neuf fichiers reçus ; recette onglets/Monaco rouge. Création/édition/renommage/suppression non prouvés. |
| search | Requête, options de recherche, résultats, ouvrir un fichier à une ligne, remplacement ; dépendance au workspace et à l’éditeur. | NON TESTÉ : aucun reçu action par action examiné. |
| locks | Lister/rechercher/filtrer les chemins verrouillés, sélectionner, déverrouiller une sélection ou tout déverrouiller ; état workbench via unlockFile/unlockFolder. | NON TESTÉ : aucun reçu action par action examiné. |
| overview | Affichage synthétique du projet et de son état ; composant sans contrôle interactif propre détecté. | NON TESTÉ : aucun reçu action par action examiné. |
| studio | Supervision des propositions de patches, réparations, consensus multi-agent, branches de conversation et mémoire ; actualiser et déplier le détail d’un consensus. | NON TESTÉ : aucun reçu action par action examiné. |
| problems | Lire les diagnostics et ouvrir le fichier/ligne ; données provenant de l’éditeur. | NON TESTÉ : aucun reçu action par action examiné. |
| database | Sélection dev/prod, provisionner/réessayer, aperçu, données/tables/requête SQL, configuration/connexion, secrets, sauvegardes et restauration. Une désactivation ou un refus n’établit pas la restauration. | PARTIEL — Lecture/réessai mobile, capacités/refus API dev/prod et rechargement dans 3 formats. Aucun restore cloud/depuis UI. |
| object-storage | Statut, buckets et objets, créer/supprimer bucket, URL d’upload/download, déplacer/supprimer/exporter un objet ; dépend du stockage configuré. | NON TESTÉ : aucun reçu action par action examiné. |
| packages | Lister/rechercher paquets, installer paquet/tous, audit et versions obsolètes ; exécution dans workspace. | NON TESTÉ : aucun reçu action par action examiné. |
| skills | Catalogue, détails, installation/désinstallation, approbation/révocation, activation/désactivation ; dépendance au catalogue et droits. | NON TESTÉ : aucun reçu action par action examiné. |
| monitoring | Lire métriques, choisir fenêtre/série et actualiser ; données runtime requises. | NON TESTÉ : aucun reçu action par action examiné. |
| ports | Lister les ports, choisir port principal et visibilité ; dépendance au workspace actif. | NON TESTÉ : aucun reçu action par action examiné. |
| extensions | Catalogue MCP, installer, supprimer, activer/désactiver une extension ; dépendance aux installations MCP. | NON TESTÉ : aucun reçu action par action examiné. |
| integrations | Connecter/déconnecter fournisseur, synchroniser, webhooks créer/activer/supprimer, clés API créer/révoquer, streams créer/activer ; distinguer configuration et effets externes. | PARTIEL — Configuration par POST direct ; webhook créé par UI desktop et relu/rechargé ; Sync refuse 503. |
| workflows | Créer/modifier/supprimer workflow, bouton Run, planification, lancement immédiat, tâches créer/modifier/supprimer/déplacer/réordonner ; dépendance à l’exécuteur. | NON TESTÉ : aucun reçu action par action examiné. |
| debugger | Configurations, breakpoints, expressions surveillées, début/fin session ; quatre commandes de contrôle signalées par le reviewer comme sans handler dans main. | NON TESTÉ : aucun reçu action par action examiné. |
| deployments | Publier, consulter déploiements, annuler, redéployer, rollback ; sous-vue Domaines réutilisée ; dépendance à l’infrastructure de publication. | NON TESTÉ : aucun reçu action par action examiné. |
| security | Lire alertes et activité, configurer protections, scanner, masquer/réafficher vulnérabilité ; dépendance aux sources d’analyse. | NON TESTÉ : aucun reçu action par action examiné. |
| env | Lister/rechercher, ajouter/modifier/supprimer variable d’environnement, révéler/copier selon contrôle ; stockage serveur. | NON TESTÉ : aucun reçu action par action examiné. |
| secrets | Lister, créer/modifier/supprimer, révéler/copier un secret, filtrer ; garde par permissions à vérifier par recette. | NON TESTÉ : aucun reçu action par action examiné. |
| git | Statut/diff, stage/discard/restore, commit/push/pull/sync, remote, branches, stash, cherry-pick, conflits, PR ; dépendance au dépôt/runtime/credentials. | NON TESTÉ : aucun reçu action par action examiné. |
| activity | Lire/filtrer l’activité, ouvrir détails et états ; aucun branchement mutation BFF propre. | NON TESTÉ : aucun reçu action par action examiné. |
| terminal | Terminal interactif, scripts, processus, restart/stop workspace, SSH ajouter/générer/supprimer/connecter/déconnecter, git SSH ; sous-vues env/secrets/ports réutilisées. | NON TESTÉ : aucun reçu action par action examiné. |
| logs | Lire/filtrer, reprendre suivi, actualiser, téléchargement, mode scindé ; dépendance aux flux de journaux. | NON TESTÉ : aucun reçu action par action examiné. |
| collaborators | Présence/commentaires, lien de partage, permissions terminal, partage IA ; invitations/membres délégués à sous-composants à suivre. | NON TESTÉ : aucun reçu action par action examiné. |
| domains | Lister/ajouter, vérifier DNS, configurer domaine ; délégué également depuis Déploiements. | NON TESTÉ : aucun reçu action par action examiné. |
| snapshots | Créer checkpoint, liste et détails/diff, restaurer checkpoint ; restauration de données requiert un backend capable. | PARTIEL — Refus BFF combiné ; contrôle historique désactivé sans archive. Aucun restore effectif depuis UI. |
| settings | Profil, mot de passe, sessions, vérification email, suppression compte, préférences/clavier/notifications, credentials et routage IA. | NON TESTÉ : aucun reçu action par action examiné. |

## Sources exactes et preuves non livrées

Les 171 empreintes du manifeste final figé ont été comparées aux fichiers lus par `git show` au SHA main de référence : aucune différence. Ce contrôle de source n’ajoute aucune preuve d’exécution.

Le manifeste no-snapshot correspond aux 28 fichiers source du main exact. Le manifeste checkpoint antérieur correspond à 9 sur 12 ; le candidat intégrations à 4 sur 7, BaseChat/BFF ayant ensuite évolué. Ces comparaisons attestent des fichiers source, jamais de l’égalité d’un bundle ou d’une nouvelle recette. Voir [no-snapshot](2026-10-20-restauration-preuves/nosnapshot-sources.json), [checkpoint](2026-10-20-restauration-preuves/checkpoint-sources.json) et les comparaisons du JSON. Les SHA historiques complets des builds DB sont conservés dans leurs reçus.

Le banc physique et sa documentation sont suivis dans la branche candidate de restauration, mais absents du main de référence ; leurs liens relatifs ne signifient pas fusion ni déploiement. Les correctifs fencing/CI/transfert en cours ne sont pas déclarés validés par ce banc antérieur.

Ces chemins désignent des artefacts locaux de la session, **non livrés dans le dépôt** ; ne pas les présenter comme liens téléchargeables pour un autre checkout :

- L1 : `/workspace/vibecore-layout-evidence-20261020/browser-743-file-archive-proof.json` et `browser-743-final-neutral-review.json` : archives reçues et échecs Monaco.
- L2 : `/workspace/vibecore-layout-evidence-20261020/fonts-control-review.json` et `handoff-current.md` : parcours diagnostique à réseau contrôlé.
- L3 : `/workspace/vibecore-audit-artifacts/integration-sync/browser-probe.mjs`, `browser-result.json`, `capture-result.json` : détail des interactions et relectures intégrations.
- L4 : copie source immuable `/workspace/vibecore-audit-artifacts/panel-audit-20261020/provenance/source-inventory-20261020T162907Z-0dcdd3e136c4.json` ; inventaire de preuves rapproché `/workspace/vibecore-audit-artifacts/panel-audit-20261020/provenance/evidence-inventory-final-source-20261020T162907Z-f9cb8e336a42.json`. Provenance, empreintes et chemins du manifeste de 171 sources et de `action-catalog.md` dans `/workspace/vibecore-audit-artifacts/panel-audit-20261020/provenance/final-source-snapshot-20261020T162907Z.json`. Les chemins de travail d’origine sont mutables et ne servent plus de cible aux empreintes de cette matrice.
- L5 : `/workspace/vibecore-audit-artifacts/integration-verification/browser-recipe-plan.md` : recette préparée du nouveau candidat, sans passage navigateur attesté au moment de cette relecture.

Captures : les reçus indiquent les inspections du parent/reviewer. Cet inventaire a réinspecté [historique mobile](2026-10-20-restauration-preuves/nosnapshot-mobile.png) et la capture locale non livrée `/workspace/vibecore-audit-artifacts/integration-sync/focused-captures/fr-mobile-webhook.png`. Une capture seule ne prouve pas persistance ou permission.

## Observation source non reproduite

Le graphe Ports montre qu’une intention inconnue peut réécrire un état inchangé et atteindre `ok:true` si les appels GET/PUT réussissent. C’est une observation statique au SHA de référence, sans exécution ni incident allégué. Les deux formulaires UI identifiés émettent `set-primary` et `set-visibility` ; aucun clic fautif actuel n’est établi. Cette observation ne devient pas une action testée et reste à reproduire sur une fixture isolée.

## Limites CI et reste indispensable

Le parent signale smoke 26/31 et contrats 21 GET/auth : pas de nouvelle exécution ici, et ce périmètre est ouverture/rendu/GET, pas tous les boutons. panel-buttons.spec vérifie la présentation ; aucune mutation n’en est déduite. Le [périmètre E2E relu](mesures/2026-10-19-e2e-proof-scope.json) exclut les cas runtime du gate requis et conserve des exemptions préexistantes. Le résumé local WebKit main9c8 annonce 17 passés/3 ignorés, sans Safari réel public ni captures inspectées. L’ancien inventaire 24/81 n’est pas utilisé comme preuve actuelle.

- Établir le parcours inscription→génération agent→exécution→persistance→publication accessible, avec erreurs et permissions réelles.
- Attester Stripe TEST, puis abonnement/paiement/webhooks/quota cohérents sans paiement LIVE.
- Prouver sauvegarde/restauration cloud synthétique sur cible isolée, fencing et quiescence de tous les consommateurs concernés.
- Exercer les actions restantes panneau par panneau, ainsi que les parcours compte/admin, mobile/tablette/desktop et Safari ; résoudre les recettes Monaco/layout rouges.

Les prérequis externes actuels (compte QA/quota, Stripe TEST, cible cloud isolée) restent à vérifier via accès autorisé ; leur existence historique ne suffit pas. Les corrections de lisibilité/fonts sont distinctes des preuves métier essentielles. Aucune estimation de fin n’est justifiée par ce relevé.
