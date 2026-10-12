# Reprise de l’inventaire E-Code du 11 octobre 2026

Source : inventaire fourni par Avi, daté de 14:45 UTC. Relevé initial GitHub : main `c7a6fa5025c18419988173179f8f30044d0253b3`.

Mise à jour de reprise : préparation, fusion et preuve live sont distinctes. Les branches préparées ci-dessous ne sont pas livrées. Livraison réussie : `408e9f847afadf2cc75ba764b3211c36d0bc2c35` / `38169434734` à 21:02 UTC. Main a ensuite avancé à `27273f19029058e5e5da9e39bf46ada8d430c066` (#711 d’une autre session), puis `b0ddb2c9506dfb89a57b7758d0be39647e053997` (#712). Les livraisons #711 (38171920340) et #712 (38175136988) sont réussies, captures finales à 21:48:36 et 22:09:08 UTC. Le lot IDE #714 est fusionné à 83d1c63e après tous les contrôles verts ; sa livraison reste à suivre.

## Urgence et ordre

Déploiements du partage `38145240168` et du tarif Pro `38147529814` réussis. Pour A-1, le manifeste et le contrôle des imageIDs prouvent la livraison de l’image web c7a6fa5025 ; aucune transaction client n’a été déclenchée. Clé Stripe à renouveler uniquement après preuve du bon forfait servi, puis créer le prix annuel Pro à 278,40 € et renseigner son ID.

Ne jamais intégrer `fix/forfait-pro-cinq-places`, `fix/reouverture-garde-la-version-utilisateur` ou `fix/agent-interrompu-tour-jamais-parti`. Conserver le menu mobile, l’IDE existant et la remise annuelle de 20 %.

## Correspondance complète

| Point | Objet | Proposition / branche | Préparation | Sur main | Vérification live |
|---|---|---|---|---|---|
| A-1 | Pro facture Team | [#705](https://github.com/openaxcloud/vibecore/pull/705) | Servi : correctif #705, Pro 29 € et cinq places mesurés ; aucune transaction client déclenchée | Oui | Tarif et provenance vérifiés |
| A-2 | Tarif annuel Pro Stripe | Voir état | Bloqué externe : clé Stripe valide et prix annuel Pro 278,40 € à créer, puis ID à enregistrer | Non | Non remesuré |
| A-3 | Offre conservée au paiement | Voir état | Redirections réelles mesurées : offre et intervalle conservés jusqu’au login ; après authentification/paiement non mesuré | Oui | Paramètres conservés jusqu’au login ; paiement non mesuré |
| A-4 | Partage en lecture seulement | [#700](https://github.com/openaxcloud/vibecore/pull/700) | Servi : déploiement du correctif #700 réussi ; parcours authentifié de rachat à remesurer | Oui | Livraison prouvée ; rachat authentifié à remesurer |
| A-5 | Octets stockage et URL signée | [#414](https://github.com/openaxcloud/vibecore/pull/414) | Préparé : fix/reprise-stockage-20261011 (ee26ca2e), 92 tests ; quota non configuré, réservation atomique et preuve GCS ouvertes | Non | Non remesuré |
| A-6 | Purge physique de compte | [#52](https://github.com/openaxcloud/vibecore/pull/52) | En reprise : fix/reprise-purge-20261011 ; 29 tests PostgreSQL API et 19 de verrous réels verts, 173 tests hors base ; types/build réussis, branche ef555d6d poussée ; preuve GCS/PVC récente absente | Non | Non remesuré |
| A-7 | Reprise du tour interrompu | Voir état | Premier correctif #710 servi (80f1de1479) ; reprise après fermeture fusionnée #712 (b0ddb2c9), livraison 38175136988 réussie | Partiel | Deux correctifs livrés ; parcours après fermeture non remesuré |
| A-8 | Préserver le travail au retour | Voir état | Intégré dans #714 (83d1c63e), contrôles CI complets verts ; livraison à suivre | Oui, #714 | Suite #714 non servie à ce relevé |
| A-9 | Relecture impossible / conflit | [#555](https://github.com/openaxcloud/vibecore/pull/555) | Intégré dans #714 (83d1c63e), contrôles CI complets verts ; livraison à suivre | Oui, #714 | Suite #714 non servie à ce relevé |
| A-10 | Frappe au chargement | Voir état | Déjà sur main : handoff du composeur et sept gardes ; ancienne branche conservée hors fusion | Oui | Non remesuré |
| A-11 | Envois répétés de conversation | [#666](https://github.com/openaxcloud/vibecore/pull/666) | Intégré dans #714 (83d1c63e), contrôles CI complets verts ; livraison à suivre | Oui, #714 | Suite #714 non servie à ce relevé |
| A-12 | Historique en échec | [#556](https://github.com/openaxcloud/vibecore/pull/556) | Intégré dans #714 (83d1c63e), contrôles CI complets verts ; livraison à suivre | Oui, #714 | Suite #714 non servie à ce relevé |
| A-13 | Session depuis accueil | [#662](https://github.com/openaxcloud/vibecore/pull/662) ; [#715](https://github.com/openaxcloud/vibecore/pull/715) | Intégré dans #715, tête 0f701269 ; contrôles relancés après correction des anciens tests OAuth incompatibles avec A-19 ; 16 cas OAuth locaux verts, contre-épreuve de destination rouge ; non fusionné ni servi | Non | Non remesuré |
| A-14 | Lecture IDE avortée | [#376](https://github.com/openaxcloud/vibecore/pull/376) | Intégré dans #714 (83d1c63e), contrôles CI complets verts ; livraison à suivre | Oui, #714 | Suite #714 non servie à ce relevé |
| A-15 | Nouvelle tentative Vercel | [#370](https://github.com/openaxcloud/vibecore/pull/370) ; [#715](https://github.com/openaxcloud/vibecore/pull/715) | Intégré dans #715, tête 0f701269 ; contrôles relancés après correction des anciens tests OAuth incompatibles avec A-19 ; 16 cas OAuth locaux verts, contre-épreuve de destination rouge ; non fusionné ni servi | Non | Non remesuré |
| A-16 | Actualisation fichiers et partage | [#559](https://github.com/openaxcloud/vibecore/pull/559) | Intégré dans #714 (83d1c63e), contrôles CI complets verts ; livraison à suivre | Oui, #714 | Suite #714 non servie à ce relevé |
| A-17 | Domaines en doublon | [#379](https://github.com/openaxcloud/vibecore/pull/379) | Intégré dans #714 (83d1c63e), contrôles CI complets verts ; livraison à suivre | Oui, #714 | Suite #714 non servie à ce relevé |
| A-18 | Commande interrompue et installation | Voir état | Fusionné #712 (b0ddb2c9), livraison 38175136988 réussie | Oui | Livraison prouvée ; parcours utilisateur non remesuré |
| A-19 | OAuth inscription | [#394](https://github.com/openaxcloud/vibecore/pull/394) ; [#715](https://github.com/openaxcloud/vibecore/pull/715) | Intégré dans #715, tête 0f701269 ; contrôles relancés après correction des anciens tests OAuth incompatibles avec A-19 ; 16 cas OAuth locaux verts, contre-épreuve de destination rouge ; non fusionné ni servi | Non | Non remesuré |
| A-20 | Lecteur sans instantané | Voir état ; [#715](https://github.com/openaxcloud/vibecore/pull/715) | Intégré dans #715, tête 0f701269 ; contrôles relancés après correction des anciens tests OAuth incompatibles avec A-19 ; 16 cas OAuth locaux verts, contre-épreuve de destination rouge ; non fusionné ni servi | Non | Non remesuré |
| A-21 | Texte de suppression du compte | [#703](https://github.com/openaxcloud/vibecore/pull/703) ; [#715](https://github.com/openaxcloud/vibecore/pull/715) | Intégré dans #715, tête 0f701269 ; contrôles relancés après correction des anciens tests OAuth incompatibles avec A-19 ; 16 cas OAuth locaux verts, contre-épreuve de destination rouge ; non fusionné ni servi | Non | Non remesuré |
| A-22 | E-mail suppression inactive | [#704](https://github.com/openaxcloud/vibecore/pull/704) ; [#715](https://github.com/openaxcloud/vibecore/pull/715) | Intégré dans #715, tête 0f701269 ; contrôles relancés après correction des anciens tests OAuth incompatibles avec A-19 ; 16 cas OAuth locaux verts, contre-épreuve de destination rouge ; non fusionné ni servi | Non | Non remesuré |
| A-23 | Vocabulaire economy retiré | [#595](https://github.com/openaxcloud/vibecore/pull/595) ; [#715](https://github.com/openaxcloud/vibecore/pull/715) | Intégré dans #715, tête 0f701269 ; contrôles relancés après correction des anciens tests OAuth incompatibles avec A-19 ; 16 cas OAuth locaux verts, contre-épreuve de destination rouge ; non fusionné ni servi | Non | Non remesuré |
| A-24 | Messages sans jargon | Voir état ; [#715](https://github.com/openaxcloud/vibecore/pull/715) | Intégré dans #715, tête 0f701269 ; contrôles relancés après correction des anciens tests OAuth incompatibles avec A-19 ; 16 cas OAuth locaux verts, contre-épreuve de destination rouge ; non fusionné ni servi | Non | Non remesuré |
| A-25 | État unknown | [#658](https://github.com/openaxcloud/vibecore/pull/658) | Fusionné #712 (b0ddb2c9), livraison 38175136988 réussie | Oui | Livraison prouvée ; parcours utilisateur non remesuré |
| A-26 | Consigne de périmètre | Voir état | Fusionné #712 (b0ddb2c9), livraison 38175136988 réussie | Oui | Livraison prouvée ; parcours utilisateur non remesuré |
| A-27 | Brochures sur identifiants arbitraires | [#423](https://github.com/openaxcloud/vibecore/pull/423) ; [#715](https://github.com/openaxcloud/vibecore/pull/715) | Intégré dans #715, tête 0f701269 ; contrôles relancés après correction des anciens tests OAuth incompatibles avec A-19 ; 16 cas OAuth locaux verts, contre-épreuve de destination rouge ; non fusionné ni servi | Non | Non remesuré |
| A-28 | Contraste de quinze boutons | [#701](https://github.com/openaxcloud/vibecore/pull/701) | Servi : #701 / 4f7c07f7 ; 72 combinaisons page-format-thème, 420 boutons orange opaques, zéro sous 4,5:1 | Oui | 72 combinaisons mesurées, 420 boutons conformes |
| A-29 | Texte orange | [#283](https://github.com/openaxcloud/vibecore/pull/283) ; [#715](https://github.com/openaxcloud/vibecore/pull/715) | Intégré dans #715, tête 0f701269 ; contrôles relancés après correction des anciens tests OAuth incompatibles avec A-19 ; 16 cas OAuth locaux verts, contre-épreuve de destination rouge ; non fusionné ni servi | Non | Non remesuré |
| A-30 | Encre du CTA | [#512](https://github.com/openaxcloud/vibecore/pull/512) ; [#715](https://github.com/openaxcloud/vibecore/pull/715) | Intégré dans #715, tête 0f701269 ; contrôles relancés après correction des anciens tests OAuth incompatibles avec A-19 ; 16 cas OAuth locaux verts, contre-épreuve de destination rouge ; non fusionné ni servi | Non | Non remesuré |
| A-31 | Libellés mobiles 9 px | [#434](https://github.com/openaxcloud/vibecore/pull/434) ; [#715](https://github.com/openaxcloud/vibecore/pull/715) | Intégré dans #715, tête 0f701269 ; contrôles relancés après correction des anciens tests OAuth incompatibles avec A-19 ; 16 cas OAuth locaux verts, contre-épreuve de destination rouge ; non fusionné ni servi | Non | Non remesuré |
| A-32 | Case à cocher | [#560](https://github.com/openaxcloud/vibecore/pull/560) | Ancienne branche obsolète : mécanisme actuel et sept gardes déjà identiques sur main ; taille réelle au toucher en production non remesurée | Oui | Non remesuré |
| A-33 | Exemples de champs bureau | [#652](https://github.com/openaxcloud/vibecore/pull/652) ; [#715](https://github.com/openaxcloud/vibecore/pull/715) | Intégré dans #715, tête 0f701269 ; contrôles relancés après correction des anciens tests OAuth incompatibles avec A-19 ; 16 cas OAuth locaux verts, contre-épreuve de destination rouge ; non fusionné ni servi | Non | Non remesuré |
| A-34 | Onglet mobile coupé | [#620](https://github.com/openaxcloud/vibecore/pull/620) ; [#715](https://github.com/openaxcloud/vibecore/pull/715) | Intégré dans #715, tête 0f701269 ; contrôles relancés après correction des anciens tests OAuth incompatibles avec A-19 ; 16 cas OAuth locaux verts, contre-épreuve de destination rouge ; non fusionné ni servi | Non | Non remesuré |
| A-35 | SSRF et DNS rebinding | [#362](https://github.com/openaxcloud/vibecore/pull/362) ; [#717](https://github.com/openaxcloud/vibecore/pull/717) | Intégré dans #717 (0b21e764), 154 cas distincts tenus après fusion réelle de main ; connexions HTTP/Git/navigateur figées et imageIDs du captureur vérifiés lors de livraison ; CI en cours, non servi | Non | Non remesuré |
| B-1 | Déclencher correctif de livraison | Voir état | Fusionné #709 / 408e9f84 ; wrapper exécuté, déploiement existant réutilisé ; dispatch après changement exclusivement workflow à remesurer | Oui, #709 | Non remesuré |
| B-2 | Base des tiers | [#669](https://github.com/openaxcloud/vibecore/pull/669) | Fusionné #709 : pagination et ancêtre par étage ; manifeste de la nouvelle livraison à contrôler | Oui, #709 | Non remesuré |
| B-3 | Audit français bloquant | Voir état | Fusionné #709 : audit et refus par défaut ; réglage de protection GitHub bloqué (HTTP 403) | Oui, #709 | Non remesuré |
| B-4 | Audit français aveugle | [#668](https://github.com/openaxcloud/vibecore/pull/668) | Audit français vert dans les contrôles de #709 ; audit actuel de toutes les pages de production à remesurer | Oui, #709 | Non remesuré |
| B-5 | Cache navigateurs | [#648](https://github.com/openaxcloud/vibecore/pull/648) | Fusionné #709 : cache par moteurs, clé de canary corrigée ; usages mesurés dans CI, coût chronométré à remesurer | Oui, #709 | Non remesuré |
| B-6 | E2E documentaire | [#448](https://github.com/openaxcloud/vibecore/pull/448) | Fusionné #709 : sélection E2E documentaire corrigée et gardée | Oui, #709 | Non remesuré |
| B-7 | Builds Electron dépassés | [#366](https://github.com/openaxcloud/vibecore/pull/366) | Fusionné #709 : bureau dédoublonné et annulation des builds dépassés ; contrôles verts | Oui, #709 | Non remesuré |
| B-8 | Tiers comparés à leur propre code | [#632](https://github.com/openaxcloud/vibecore/pull/632) | Fusionné #709 : comparaison de chaque étage à son propre code ; nouvelle provenance de livraison à vérifier | Oui, #709 | Non remesuré |
| B-9 | Quatre protections Helm | Voir état | Fusionné #709 : quatre valeurs et contrôle live en refus par défaut ; contrôle de la release vivante passé et livraison réussie | Oui, #709 | Contrôle de la release vivante et déploiement réussis |
| B-10 | Carte des secrets | [#607](https://github.com/openaxcloud/vibecore/pull/607) | Fusionné #709 : carte des secrets ; aucune valeur de secret publiée, carte sans effet direct Helm | Oui, #709 | Non remesuré |
| B-11 | Exemple environnement complet | [#606](https://github.com/openaxcloud/vibecore/pull/606) | Fusionné #709 : exemple complet avec garde ; contrôles verts | Oui, #709 | Non remesuré |
| B-12 | Installation à neuf | [#125](https://github.com/openaxcloud/vibecore/pull/125) ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente ; installation distante non rejouée, prérequis de secret déjà absent sur main | Oui, #716 | Non servi à ce relevé |
| B-13 | Mémoire agent non configurée | [#142](https://github.com/openaxcloud/vibecore/pull/142) ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente | Oui, #716 | Non servi à ce relevé |
| B-14 | Extinction locale | Voir état ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente | Oui, #716 | Non servi à ce relevé |
| B-15 | Porte E2E multi-spécification | Voir état ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente | Oui, #716 | Non servi à ce relevé |
| B-16 | Composants morts lot 1 | [#340](https://github.com/openaxcloud/vibecore/pull/340) ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente | Oui, #716 | Non servi à ce relevé |
| B-17 | Composants morts cliquet | [#324](https://github.com/openaxcloud/vibecore/pull/324) ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente | Oui, #716 | Non servi à ce relevé |
| B-18 | Nettoyage complémentaire 1 | Voir état ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente | Oui, #716 | Non servi à ce relevé |
| B-19 | Nettoyage complémentaire 2 | Voir état ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente | Oui, #716 | Non servi à ce relevé |
| B-20 | Contrats anti-abus | [#79](https://github.com/openaxcloud/vibecore/pull/79) | Préparé et poussé : fix/reprise-gardes-locataires-20261011 (67255fb0), 88 tests API, trois gardes métriques et deux preuves PostgreSQL ; chart désactivé et isolation GCP non provisionnée | Non | Non remesuré |
| B-21 | Métrique non déclarée | Voir état ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente | Oui, #716 | Non servi à ce relevé |
| B-22 | Agent écrit | [#409](https://github.com/openaxcloud/vibecore/pull/409) | Intégré dans #714 (83d1c63e), contrôles CI complets verts ; livraison à suivre | Oui, #714 | Suite #714 non servie à ce relevé |
| B-23 | Curseur effort | [#424](https://github.com/openaxcloud/vibecore/pull/424) | Ancienne branche obsolète : curseur actuel par modèle et 19 gardes déjà sur main ; deux-crans ancien non livré | Oui | Non remesuré |
| B-24 | Revue visible | Voir état | Intégré dans #714 (83d1c63e), contrôles CI complets verts ; livraison à suivre | Oui, #714 | Suite #714 non servie à ce relevé |
| B-25 | Audit externe 158 points | [#352](https://github.com/openaxcloud/vibecore/pull/352) ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente | Oui, #716 | Non servi à ce relevé |
| B-26 | Manques pour lancement | [#574](https://github.com/openaxcloud/vibecore/pull/574) ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente | Oui, #716 | Non servi à ce relevé |
| B-27 | Verdict des propositions | [#590](https://github.com/openaxcloud/vibecore/pull/590) ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente | Oui, #716 | Non servi à ce relevé |
| B-28 | Huit branches obsolètes | [#608](https://github.com/openaxcloud/vibecore/pull/608) ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente | Oui, #716 | Non servi à ce relevé |
| B-29 | Deux bugs session mobile | [#618](https://github.com/openaxcloud/vibecore/pull/618) ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente | Oui, #716 | Non servi à ce relevé |
| B-30 | Remesure mobile 390 | [#623](https://github.com/openaxcloud/vibecore/pull/623) ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente | Oui, #716 | Non servi à ce relevé |
| B-31 | Méthode fusion et inventaire | [#637](https://github.com/openaxcloud/vibecore/pull/637) ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente | Oui, #716 | Non servi à ce relevé |
| B-32 | Fiches infrastructure | Voir état ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente | Oui, #716 | Non servi à ce relevé |
| B-33 | Mesure cohérente mais fausse | Voir état ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente ; document plus récent de main conservé | Oui, #716 | Non servi à ce relevé |
| B-34 | Saut d’hôte et URL | Voir état ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente | Oui, #716 | Non servi à ce relevé |
| B-35 | Trois règles de méthode | Voir état ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente | Oui, #716 | Non servi à ce relevé |
| B-36 | Partage et comptage des places | [#700](https://github.com/openaxcloud/vibecore/pull/700) ; [#716](https://github.com/openaxcloud/vibecore/pull/716) | Intégré dans #716, tête ced24607 ; 110 cas locaux distincts tenus, types et builds réussis ; tous les contrôles CI verts ; fusionné #716 à b7a8b4b3, livraison 38186261396 en attente | Oui, #716 | Non servi à ce relevé |

## États et limites

📤 Dispatché : reprise engagée. 💻 Codé : #709, #710, #712 et #714 fusionnés. Les preuves de livraison ne remplacent pas les scénarios utilisateurs authentifiés ; les réserves figurent dans chaque ligne.

L’environnement actuel est limité à 16 Go de mémoire cgroup et quatre CPU ; la mémoire est mesurée avant les constructions, une seule construction web à la fois. Ce relevé ne remplace pas celui de l’ancienne machine. Installation avec pnpm 9.14.4 et verrouillage conservé. Accès GitHub via le plugin ; aucun credential GCP, Kubernetes ou Stripe disponible dans cet environnement. Aucune valeur de secret copiée.

Les propositions existantes restent sources de travail, pas preuves suffisantes. Les indices de bugs sont dérivés : `node scripts/migrer-inventaire-bugs.mjs --index`. Les clients Prisma se régénèrent. Une annulation reste une absence de verdict ; les agrégateurs se relancent après les tests qu’ils lisent.

## Mesures de validation de cette reprise

- Gardes de livraison, gardes transversales et index : 262/262 tests verts, après utilisation de pnpm 9.14.4 aussi dans les sous-processus.
- Rendu Helm : valeurs par défaut, production, clé ancienne absente et désactivation de test ; vert. Contre-épreuve avec le gabarit main imposant false : rouge.
- PR #701 : 28 tests voisins verts. Le rapport E2E 11706259450 révèle une erreur de syntaxe dans ui-details.spec.ts, pas un verdict de contraste. Async replacé sur la fonction ; correction poussée sur la branche existante au commit 94da33ad328b5da2dca934ee6776cf576695369d. Playwright collecte désormais 21 tests dans ce fichier. CI relancée par ce push.
- Au relevé initial, le téléchargement navigateur était tronqué. Depuis, le Chromium installé permet des fixtures physiques Sass et captureur ; les mesures publiques de contraste figurent dans le document de production. Ces preuves ont chacune leur périmètre, elles ne constituent pas une validation E2E locale complète.

## Mise à jour après essais réels

Les 47 propositions ont été essayées par une vraie fusion dans un arbre jetable. Le détail est dans [2026-10-11-fusions-reelles.md](2026-10-11-fusions-reelles.md) : 25 sans conflit, 7 avec seulement l’index dérivé, stockage avec seulement quatre fichiers Prisma générés. Cela ne constitue pas un verdict fonctionnel.

B-2 et B-8 sont repris ensemble dans ce lot pour éviter des gardes concurrentes du même déploiement. La comparaison par étage couvre les entrées partagées, les huit services, le captureur d’écran et l’agent d’espace. Un tag absent ou illisible est une erreur explicite. Un défaut supplémentaire du filtre CD a été mesuré : screenshotter + admin reconstruisait uniquement admin. Le filtre runtime inclut désormais screenshotter, avec contre-épreuve rouge avant correction.

Validation élargie : 59 fichiers, 532 tests verts et 1 explicitement ignoré. Le rendu Helm reste une preuve locale, aucune application des valeurs de production n’a été effectuée. La métrique citée en B-21 est déjà déclarée sur main et ses deux gardes passent dans cette suite.

Le déploiement d7993cc69f a réussi dans Actions. Le déploiement urgent c7a6fa5025 a commencé son étage web après attente d’exécuteur ; au dernier contrôle, aucun rollout de ce SHA n’est encore prouvé. Les propositions non urgentes ont été placées en brouillon. Une proposition #708 créée par une autre session est apparue ; elle n’a pas été modifiée.

Stripe existe dans le catalogue des connexions mais n’est pas connecté à cette session. A-2 reste bloqué sur la connexion Stripe et l’accès sécurisé au secret de production. La clé ne doit être renouvelée qu’après preuve de livraison A-1, puis le prix annuel doit être créé et enregistré. Aucune valeur de secret n’a été imprimée.

## B-11 — exemple d’environnement remis à jour

La garde de #606 rougit sur deux variables ajoutées depuis cette branche : DEPLOY_AUTO_SLEEP_WAIT_MS et IDEA_RELAY_RATE_LIMIT_MAX. Les deux clés sont désormais documentées avec les valeurs par défaut lues dans app.ts (240000 ms et 10/minute). Les quatre tests passent. Aucune valeur de secret n’est ajoutée.

## Preuve de livraison A-1

Le workflow [38147529814](https://github.com/openaxcloud/vibecore/actions/runs/38147529814) a réussi. Le manifeste 11708480483 lie l’image web reconstruite au SHA complet c7a6fa5025c18419988173179f8f30044d0253b3, au build Cloud Build f70de3dc-1c57-4685-9f56-4070294624bf et au digest sha256:02e5fb604320a38ea987cf615be04e3a311ba4e6f5934309236526a55e3a2029. Les étapes rollout et correspondance des imageIDs passent ; le fichier 11708240897 termine à 16:12:56 UTC avec commandExitCode=0 et evidenceComplete=true. Le correctif A-1 est donc livré dans l’image web. Aucun paiement client n’a été déclenché.

Le manifeste n’établit pas la provenance des huit images réutilisées (fullyTraceable=false). Ce n’est pas une preuve que tous les services viennent de c7a6fa5025. Ce manque reste à suivre en B-8.

## Validation des propositions prêtes

Les essais locaux de 17 propositions sont consignés dans 2026-10-11-validations-branches.md. Ils ne valent pas validation pixel ni verdict CI. A-11 possède un correctif distinct de #666 : séparation des domaines envoyés, suppression des envois identiques et maintien du remplacement de messages ; 128 tests voisins et types complets verts.

B-5 : cache navigateur intégré avec installation toujours exécutée ; 8 gardes vertes. B-6 : le filtre documentaire est adapté aux quatre tranches actuelles, au canari et à l’agrégateur ; cinq décisions sont exécutées dans de vrais dépôts de test, le verdict reste toujours émis. B-3 : workflow préparé après livraison A-1, sept gardes vertes incluant rouge, annulé et pertinence illisible ; la protection GitHub n’a pas encore été modifiée.

## État à 16:40 UTC

Le dernier lot de gardes locales compte 64 fichiers et 562 tests verts, avec un test explicitement ignoré. La vérification des types des scripts passe. B-7 conserve les travaux Electron déjà en cours et remplace uniquement les travaux en attente d’une même référence. B-10 conserve la carte des noms de secrets ; aucun secret n’est porté dans le dépôt.

Les sept workflows de #701 passent sur f9d0348bd785bcf201c00b448f0d772f666e6f70, dont Production E2E et l’audit français live. La proposition est fusionnée à 16:35:59 UTC ; ce constat ne prouve pas encore la livraison de son nouveau SHA. L’audit français n’est donc plus systématiquement rouge sur cette proposition ; il reste à vérifier son verdict sur main après fusion.

Branches publiées : fix/reprise-livraison-securite-20261011, fix/reprise-tour-refuse-20261011, fix/reprise-agent-20261011 et fix/reprise-lecteur-instantane-20261011. Ces branches ne sont pas encore fusionnées. Le correctif A-11 et le lot de textes A-24/A-26 sont également préparés localement.


## Ordre de livraison après la fusion de #712

Les déploiements #709, #711 et #712 sont réussis. #714 est fusionnée ; son
workflow de livraison 38181578340 attend ses contrôles de main. #713 est
fusionnée à 2cec44b4 après tous les contrôles verts. #715 porte le lot parcours
client ; l’outillage poursuit sa validation locale.
Aucune annulation de livraison n’a été effectuée.

Les branches de préparation nécessitent leur intégration finale et les contrôles
GitHub avant fusion. Les réserves externes portent sur Stripe, la politique de
quota stockage, la protection GitHub et les preuves GCS/Kubernetes de purge.

## Relevé à 22:45 UTC

#714 est fusionné après succès du verdict E2E, des quatre audits français, de CodeQL, des builds bureau et de Production CI. Une cible de menu de message de 28 px a réellement échoué à 390 et 768 px ; le correctif rend 44 px et garde 28 px au bureau. Le détecteur navigateur existant est repris dans une fixture Sass/Chromium ; retirer le correctif rend la garde rouge. #713 est fusionnée ; #715 porte le prochain lot client. Les scripts de preuve de #713 ont été relus et corrigés au lint dans une branche distincte, sans modifier le travail de son auteur.

Les manifestes 27273f19 et b0ddb2c9 déclarent une provenance incomplète des références réutilisées. Une correspondance exacte de digest avec les manifestes antérieurs signés retrouve leur source : cela ne prouve les conteneurs exécutés que pour les sept services rollés. Captureur et agent d’espace restent hors preuve de rollout. Voir mesures/2026-10-11-livraison-272.json et mesures/2026-10-11-livraison-b0.json.

## Suivi à 23:55 UTC

Deux propositions prêtes seulement : #715 (0f701269) et #716 (ced24607).
#715 a révélé deux assertions navigateur qui exigeaient des fournisseurs OAuth
non configurés ; elles sont corrigées sans rétablir les boutons défectueux.
Les cas disponibles et indisponibles restent mesurés par le vrai écran.
#716 a corrigé la lecture multi-document du rendu Helm et une classification
i18n devenue obsolète après retrait du code mort ; Production CI est verte.
La livraison IDE 38181578340 construit encore ses étages ; 38181939698 attend.
Ces deux livraisons ne sont pas déclarées réussies à ce relevé.
Le complément SSRF 28c3f4dc est prêt localement, sans ouvrir de troisième PR.

## Suivi du 12 octobre, après fusion #716

#716 est fusionnée à b7a8b4b3 après tous ses contrôles verts. #717 ouvre le lot
réseau, tête 0b21e764. Les contrôles de #715 au SHA 0f701269 sont tous verts ;
la nouvelle main a imposé un unique conflit d’index dérivé, régénéré. Après
fusion réelle locale : 47 cas d’intégration verts, types et build web réussis.
La mise à jour sera publiée et validée à son propre SHA avant fusion.
La livraison IDE 38181578340 a fini runtime et web et construit l’agent d’espace ;
le déploiement intermédiaire 38181939698 a été remplacé en attente par celui
de #716. Aucune réussite de ces livraisons n’est revendiquée à ce relevé.
Le lot services est en intégration locale, avec les fonctions non prouvées
laissées désactivées. Le quota commercial, la réservation des uploads, les
preuves GCS/PVC et la provision multi-locataires restent ouverts.
