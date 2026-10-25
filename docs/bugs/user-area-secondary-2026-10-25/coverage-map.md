# Cartographie de couverture UI — état après CI #792

La navigation existante est lue dans `workspaceNav`, `orgNav`, `accountNav` et `projectNav` de `SaaSLayout.tsx` à71d080c9c. Cette carte indique ce qui a effectivement été exercé localement par cette mission ; elle ne certifie ni le backend réel ni la production. #791 est fusionnée dans main d09045d5a ; #792 a terminé ses 32 contrôles (30 succès, 2 skips prévus), dont 507 tests E2E sans échec ni relance, puis a été fusionnée normalement sur ef65c1e68 après livraison de d09045d5a. Les corrections suivantes restent isolées.

| Page ou groupe | Couverture locale de la mission | Limite / état |
| --- | --- | --- |
| Dashboard | 12 formats × FR/EN × thèmes ; palette testée séparément | Géométrie ciblée ; pas toutes les actions de création |
| Palette et recherche globale | 88 observations /11 formats et8 groupes clavier ;40 rejoués après intégration | Palette inline ; Échap conserve recherche et affichage |
| Projets | 96 observations Dashboard/Projets ;16 menus ; recherche Retour/Avancer et réponse350ms ; resize pendant frappe | Aucune création/suppression effective ; confirmations annulées |
| Projets récents | Avec Modèles88observations /11formats,8zoom200%,6parcours ;24compteurs | Nombres complets,15/24phrases ellipsées avec label ; noms sur deux lignes et title conservés |
| Compte profil | Navigation48 observations ; nom/fuseau/validation/503 et resize FR/EN | FocusBODY constaté après soumission sans défaut de parcours démontré |
| Compte Données / Connexions | 88 observations /11 formats,8 groupes focus/Échap/Annuler/Retour | Pas suppression compte ni connexion de service |
| Facturation | 48 observations,11formats, erreurs503 répétées ; titre36mesures ; zoom natif | API synthétique ; aucun montant réel changé |
| Paiement / Offres | 88 observations /11formats,8zoom200%,4soumissions503 | Succès uniquement en test unitaire ; aucun portail/achat |
| Notifications / Usage | 88 observations /11formats, erreurs/rollback/Retour/resize | API synthétique ; pas un backend de notification réel |
| Factures / Comparaison des offres | Avant40 observations /5formats ; après88 /11formats,8zoom200%,2RetryGET | Numéro Facture long corrigé et validé sur build7599 |
| Sessions / Sécurité | 88 observations /11formats,8zoom200%,4RetryGET et2Retourclavier | Lecture seule, aucun accès créé/révoqué ; aucune recette MFA réelle |
| Modèles Dashboard | Avec Récents88observations /11formats,8zoom200%,6parcours | CTA44px ; aucune création/importation exécutée |
| Créer un projet | Non exercé par cette mission | Aucune création réelle autorisée pour ces tests |
| Membres organisation |44observations /11formats +zoom200% dans8cas Membres/Clés | Identités intégrales ; aucune invitation/modification de rôle |
| Support | Matrice de quatre modes176 observations /11formats et8 parcours avec Workspace/Desktop | Sujet long contenu, CTA44px ; aucun ticket réel créé |
| Clés API |44observations finales /11formats,zoom200%,Retry et défilement clavier |12échecs desktop initiaux corrigés ; aucune création/révocation/copie |
| Application Desktop | Inclus dans176 observations de quatre modes, avec et sans pont de lecture synthétique | Distinct d’un test Electron réel |
| Paramètres espace de travail | Inclus dans176 observations ; contrôles44px, préférence locale clavier/resize/restauration | Préférences du navigateur temporaire uniquement |
| Organisation : rôles, invitations, audit, SSO, SCIM | Non audité par cette mission | Aucun changement de politique ou nouvel accès |
| Projet : aperçu, paramètres, env, secrets, collaborateurs, logs, activité | Non audité par cette mission | Pas de mutations réelles ni secrets créés |
| Projet : Git / Publish / Déploiement / Domaines | Propriétaire #788 ; pas de recette métier par cette mission | Routes et corrections de navigation conservées à l’intégration |
| Restauration / Fleet | Propriétaire #789 | Pas de recette par cette mission |
| Hub Intégrations | Autre propriétaire actif | Exclu des modifications |
| IDE / Debugger | Debugger #783 déjà livré selon coordination | Pas de moteur modifié ; retry focus menu IDE remonté au parent |
| Accueil public / Tarifs / Login / Signup |176observations et16zoom à7799 ; marketing88+8 aprèsfooter7899 ;24observationsFR/EN/AR et6menus aprèsmarge logique8299 | Phases distinctes ; aucune création de compte/connexion réelle ; contraste mesuré séparément |
| Autres pages publiques / marketing / légales | Non auditées par cette mission | Pas de verdict global |

Formats11 :320,360,390, paysage844×390,768,820,1024,1280,1440,1920,2560. Certaines matrices ajoutent640CSS pour le reflow. Le zoom natif200% est prouvé par fenêtre1280→inner640,DPR2,visualViewport.scale1 ; il ne remplace pas le pinch, ni le changement de zoom pendant saisie. Les redimensionnements pendant saisie sont attestés séparément.

Le contraste mesuré porte sur682 textes de cinq routes, FR390px, clair/sombre, fonds simples : minimum4,87:1 ; dégradés, opacités et contrôles désactivés exclus. Pas d’audit vocal réel, Safari/Firefox complet, clavier virtuel OS ou safe areas matérielles. La production authentifiée n’est pas accessible à cette session ; aucune recette production présumée.

Contraste complémentaire du lot secondaire : quatre cas Workspace compilés (148 textes, lien corrigé à5,73:1 clair et8,16:1 sombre). Public :16cas FR320/1440 clair/sombre,1334mesures,982exclusions, minimum4,7975:1 ; header/footer inclus et neuf sections Accueil montées. Les surfaces translucides et fonds complexes exclus empêchent une certification intégrale.

Livraison #791 confirmée : workflow40237046647 réussi pour d09045d5a2fca53dbd7dbab61b4e505ad251d728, rollout et correspondance des imageIDs réussis. Ce résultat ne remplace pas une recette UI authentifiée en production. #792 est fusionnée ; sa CI main et son déploiement restent suivis séparément.
