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
| A-13 | Session depuis accueil | [#662](https://github.com/openaxcloud/vibecore/pull/662) | Préparé : fix/reprise-oauth-inscription-20261011 (b226ce61), 31 tests avec A-19 ; pas servi ; intégré dans fix/reprise-parcours-client-20261011, non livré | Non | Non remesuré |
| A-14 | Lecture IDE avortée | [#376](https://github.com/openaxcloud/vibecore/pull/376) | Intégré dans #714 (83d1c63e), contrôles CI complets verts ; livraison à suivre | Oui, #714 | Suite #714 non servie à ce relevé |
| A-15 | Nouvelle tentative Vercel | [#370](https://github.com/openaxcloud/vibecore/pull/370) | Préparé : fix/reprise-vercel-20261011 (5fe5867b), types/build et contre-épreuve ; pas servi ; intégré dans fix/reprise-parcours-client-20261011, non livré | Non | Non remesuré |
| A-16 | Actualisation fichiers et partage | [#559](https://github.com/openaxcloud/vibecore/pull/559) | Intégré dans #714 (83d1c63e), contrôles CI complets verts ; livraison à suivre | Oui, #714 | Suite #714 non servie à ce relevé |
| A-17 | Domaines en doublon | [#379](https://github.com/openaxcloud/vibecore/pull/379) | Intégré dans #714 (83d1c63e), contrôles CI complets verts ; livraison à suivre | Oui, #714 | Suite #714 non servie à ce relevé |
| A-18 | Commande interrompue et installation | Voir état | Fusionné #712 (b0ddb2c9), livraison 38175136988 réussie | Oui | Livraison prouvée ; parcours utilisateur non remesuré |
| A-19 | OAuth inscription | [#394](https://github.com/openaxcloud/vibecore/pull/394) | Préparé : fix/reprise-oauth-inscription-20261011 (b226ce61), 31 tests avec A-13 ; fournisseurs réellement disponibles seulement ; intégré dans fix/reprise-parcours-client-20261011, non livré | Non | Non remesuré |
| A-20 | Lecteur sans instantané | Voir état | Instruit et préparé : fix/reprise-lecteur-validation-20261011 (6ef38e27), le lecteur ne peut plus créer un instantané ; deux tests HTTP ; intégré dans fix/reprise-parcours-client-20261011, non livré | Non | Non remesuré |
| A-21 | Texte de suppression du compte | [#703](https://github.com/openaxcloud/vibecore/pull/703) | Préparé : fix/reprise-suppression-honnete-20261011 (98c67343), texte honnête ; automatisation de purge encore ouverte ; intégré dans fix/reprise-parcours-client-20261011, non livré | Non | Non remesuré |
| A-22 | E-mail suppression inactive | [#704](https://github.com/openaxcloud/vibecore/pull/704) | Préparé avec A-21 : avertissement conditionné au drapeau réel de purge, contre-épreuve du mode actif ; pas servi ; intégré dans fix/reprise-parcours-client-20261011, non livré | Non | Non remesuré |
| A-23 | Vocabulaire economy retiré | [#595](https://github.com/openaxcloud/vibecore/pull/595) | Préparé : fix/reprise-messages-client-20261011 (927daefa), 89 tests avec A-24 ; pas servi ; intégré dans fix/reprise-parcours-client-20261011, non livré | Non | Non remesuré |
| A-24 | Messages sans jargon | Voir état | Préparé avec A-23 : erreurs publiques sans jargon ; détail interne conservé dans le journal ; intégré dans fix/reprise-parcours-client-20261011, non livré | Non | Non remesuré |
| A-25 | État unknown | [#658](https://github.com/openaxcloud/vibecore/pull/658) | Fusionné #712 (b0ddb2c9), livraison 38175136988 réussie | Oui | Livraison prouvée ; parcours utilisateur non remesuré |
| A-26 | Consigne de périmètre | Voir état | Fusionné #712 (b0ddb2c9), livraison 38175136988 réussie | Oui | Livraison prouvée ; parcours utilisateur non remesuré |
| A-27 | Brochures sur identifiants arbitraires | [#423](https://github.com/openaxcloud/vibecore/pull/423) | Préparé : fix/reprise-routes-publiques-20261011 (3fa0ac36), 22 tests ; routes canoniques et authentification conservées ; intégré dans fix/reprise-parcours-client-20261011, non livré | Non | Non remesuré |
| A-28 | Contraste de quinze boutons | [#701](https://github.com/openaxcloud/vibecore/pull/701) | Servi : #701 / 4f7c07f7 ; 72 combinaisons page-format-thème, 420 boutons orange opaques, zéro sous 4,5:1 | Oui | 72 combinaisons mesurées, 420 boutons conformes |
| A-29 | Texte orange | [#283](https://github.com/openaxcloud/vibecore/pull/283) | Préparé : fix/reprise-interfaces-lisibles-20261011 (f3caf8d7), 66 tests avec A-30/A-31/A-33/A-34 ; pas servi ; intégré dans fix/reprise-parcours-client-20261011, non livré | Non | Non remesuré |
| A-30 | Encre du CTA | [#512](https://github.com/openaxcloud/vibecore/pull/512) | Préparé dans interfaces f3caf8d7 ; jetons et assertion sur ratio de contraste ; pas servi ; intégré dans fix/reprise-parcours-client-20261011, non livré | Non | Non remesuré |
| A-31 | Libellés mobiles 9 px | [#434](https://github.com/openaxcloud/vibecore/pull/434) | Préparé dans interfaces f3caf8d7 ; Sass et Chromium réels : 12 px mobile contre 11 px ancien ; pas servi ; intégré dans fix/reprise-parcours-client-20261011, non livré | Non | Non remesuré |
| A-32 | Case à cocher | [#560](https://github.com/openaxcloud/vibecore/pull/560) | Ancienne branche obsolète : mécanisme actuel et sept gardes déjà identiques sur main ; taille réelle au toucher en production non remesurée | Oui | Non remesuré |
| A-33 | Exemples de champs bureau | [#652](https://github.com/openaxcloud/vibecore/pull/652) | Préparé dans interfaces f3caf8d7 ; exemples de champ distincts des valeurs ; pas servi ; intégré dans fix/reprise-parcours-client-20261011, non livré | Non | Non remesuré |
| A-34 | Onglet mobile coupé | [#620](https://github.com/openaxcloud/vibecore/pull/620) | Préparé dans interfaces f3caf8d7 ; mécanisme mobile conservé et gardé ; pas servi ; intégré dans fix/reprise-parcours-client-20261011, non livré | Non | Non remesuré |
| A-35 | SSRF et DNS rebinding | [#362](https://github.com/openaxcloud/vibecore/pull/362) | Partiel : fix/reprise-ssrf-20261011 (e69e6c15) ; 20 cas captureur dont Chromium et serveurs réels, trois contre-épreuves TCP rouges ; pinning des connexions, redirections externes et autres protocoles encore ouverts | Non | Non remesuré |
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
| B-12 | Installation à neuf | [#125](https://github.com/openaxcloud/vibecore/pull/125) | Partiel : fix/reprise-installation-20261011 (10dbba89), neuf gardes Helm/Bash/CI ; validation complète garde une erreur de secret déjà sur main, installation distante non rejouée | Non | Non remesuré |
| B-13 | Mémoire agent non configurée | [#142](https://github.com/openaxcloud/vibecore/pull/142) | Préparé : fix/reprise-memoire-20261011 (8b9bbb87), erreur de configuration explicite et localisée ; pas servi | Non | Non remesuré |
| B-14 | Extinction locale | Voir état | Préparé : fix/reprise-extinction-20261011 (b235179f), contre-épreuve Bash ; pas servi | Non | Non remesuré |
| B-15 | Porte E2E multi-spécification | Voir état | Préparé : fix/reprise-porte-e2e-20261011 (13438268), dix tests et deux contre-épreuves ; pas servi | Non | Non remesuré |
| B-16 | Composants morts lot 1 | [#340](https://github.com/openaxcloud/vibecore/pull/340) | Préparé : chore/reprise-composants-morts-20261011 (e9b3be54), 14 modules retirés, 46 tests ; pas servi | Non | Non remesuré |
| B-17 | Composants morts cliquet | [#324](https://github.com/openaxcloud/vibecore/pull/324) | Préparé avec B-16 : détecteur AST et trois exceptions explicites ; réintroduction réelle détectée | Non | Non remesuré |
| B-18 | Nettoyage complémentaire 1 | Voir état | Reconcilié avec B-16 : 1488 sources et 449 composants examinés, aucun import entrant sur les 14 retirés ; autres branches non fusionnées par titre | Non | Non remesuré |
| B-19 | Nettoyage complémentaire 2 | Voir état | Doublons gardés hors fusion ; nettoyage des anciennes surfaces recouvre A-27, à intégrer une seule fois | Non | Non remesuré |
| B-20 | Contrats anti-abus | [#79](https://github.com/openaxcloud/vibecore/pull/79) | Préparé et poussé : fix/reprise-gardes-locataires-20261011 (67255fb0), 88 tests API, trois gardes métriques et deux preuves PostgreSQL ; chart désactivé et isolation GCP non provisionnée | Non | Non remesuré |
| B-21 | Métrique non déclarée | Voir état | Déclaration historique déjà sur main ; garde AST renforcée pour appels optionnels dans B-20, contre-épreuve rouge puis verte | Oui | Non remesuré |
| B-22 | Agent écrit | [#409](https://github.com/openaxcloud/vibecore/pull/409) | Intégré dans #714 (83d1c63e), contrôles CI complets verts ; livraison à suivre | Oui, #714 | Suite #714 non servie à ce relevé |
| B-23 | Curseur effort | [#424](https://github.com/openaxcloud/vibecore/pull/424) | Ancienne branche obsolète : curseur actuel par modèle et 19 gardes déjà sur main ; deux-crans ancien non livré | Oui | Non remesuré |
| B-24 | Revue visible | Voir état | Intégré dans #714 (83d1c63e), contrôles CI complets verts ; livraison à suivre | Oui, #714 | Suite #714 non servie à ce relevé |
| B-25 | Audit externe 158 points | [#352](https://github.com/openaxcloud/vibecore/pull/352) | Registre de 158 points déjà identique sur main ; pas de doublon de workflows importé | Oui | Non remesuré |
| B-26 | Manques pour lancement | [#574](https://github.com/openaxcloud/vibecore/pull/574) | Préservé dans docs/reprise-registres-20261011 (331bbc60) ; pas encore sur main | Non | Non remesuré |
| B-27 | Verdict des propositions | [#590](https://github.com/openaxcloud/vibecore/pull/590) | Préservé dans registres 331bbc60 ; pas encore sur main | Non | Non remesuré |
| B-28 | Huit branches obsolètes | [#608](https://github.com/openaxcloud/vibecore/pull/608) | Préservé dans registres 331bbc60 ; avertissement de régression conservé | Non | Non remesuré |
| B-29 | Deux bugs session mobile | [#618](https://github.com/openaxcloud/vibecore/pull/618) | Préservé dans registres 331bbc60, index régénéré ; pas encore sur main | Non | Non remesuré |
| B-30 | Remesure mobile 390 | [#623](https://github.com/openaxcloud/vibecore/pull/623) | Préservé dans registres 331bbc60 ; mesures anciennes conservées sans les présenter comme actuelles | Non | Non remesuré |
| B-31 | Méthode fusion et inventaire | [#637](https://github.com/openaxcloud/vibecore/pull/637) | Méthode archivée dans registres 331bbc60 sans remplacer les instructions actuelles | Non | Non remesuré |
| B-32 | Fiches infrastructure | Voir état | Fiches de dette conservées ; code B-1/B-9 fusionné #709 | Oui | Non remesuré |
| B-33 | Mesure cohérente mais fausse | Voir état | Fichier plus récent de main conservé ; ancienne version de 81 lignes non importée | Oui | Non remesuré |
| B-34 | Saut d’hôte et URL | Voir état | Préservé dans registres 331bbc60 ; propagation de langue et paramètres éprouvée séparément par A-3/A-13/A-27 | Non | Non remesuré |
| B-35 | Trois règles de méthode | Voir état | Règles de famine, deux propositions et détecteur conservées dans registres 331bbc60 | Non | Non remesuré |
| B-36 | Partage et comptage des places | [#700](https://github.com/openaxcloud/vibecore/pull/700) | Fiche conservée ; correctif A-4 déjà servi, parcours authentifié à remesurer | Non | Non remesuré |

## États et limites

📤 Dispatché : reprise engagée. 💻 Codé : #709, #710, #712 et #714 fusionnés. Les preuves de livraison ne remplacent pas les scénarios utilisateurs authentifiés ; les réserves figurent dans chaque ligne.

La machine de cette reprise dispose d’environ 9 Go disponibles et aucun swap ; ce relevé ne remplace pas celui de l’ancienne machine. Installation avec pnpm 9.14.4 et verrouillage conservé. Accès GitHub via le plugin ; aucun credential GCP, Kubernetes ou Stripe disponible dans cet environnement. Aucune valeur de secret copiée.

Les propositions existantes restent sources de travail, pas preuves suffisantes. Les indices de bugs sont dérivés : `node scripts/migrer-inventaire-bugs.mjs --index`. Les clients Prisma se régénèrent. Une annulation reste une absence de verdict ; les agrégateurs se relancent après les tests qu’ils lisent.

## Mesures de validation de cette reprise

- Gardes de livraison, gardes transversales et index : 262/262 tests verts, après utilisation de pnpm 9.14.4 aussi dans les sous-processus.
- Rendu Helm : valeurs par défaut, production, clé ancienne absente et désactivation de test ; vert. Contre-épreuve avec le gabarit main imposant false : rouge.
- PR #701 : 28 tests voisins verts. Le rapport E2E 11706259450 révèle une erreur de syntaxe dans ui-details.spec.ts, pas un verdict de contraste. Async replacé sur la fonction ; correction poussée sur la branche existante au commit 94da33ad328b5da2dca934ee6776cf576695369d. Playwright collecte désormais 21 tests dans ce fichier. CI relancée par ce push.
- Le téléchargement du navigateur local est tronqué dans cet environnement. Aucun test pixel ni test live revendiqué.

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

Le déploiement #709 est réussi à 21:02 UTC. La proposition #711, fusionnée
par une autre session, construit son étage runtime. #712 est fusionnée ; sa
livraison attend la précédente. Une seule proposition est prête à ce constat :
#713, tenue par une autre session. Le lot IDE est en validation locale finale.
Aucune annulation de livraison n’a été effectuée.

Les branches de préparation nécessitent leur intégration finale et les contrôles
GitHub avant fusion. Les réserves externes portent sur Stripe, la politique de
quota stockage, la protection GitHub et les preuves GCS/Kubernetes de purge.

## Relevé à 22:45 UTC

#714 est fusionné après succès du verdict E2E, des quatre audits français, de CodeQL, des builds bureau et de Production CI. Une cible de menu de message de 28 px a réellement échoué à 390 et 768 px ; le correctif rend 44 px et garde 28 px au bureau. Le détecteur navigateur existant est repris dans une fixture Sass/Chromium ; retirer le correctif rend la garde rouge. #713 reste ouverte ; le lot parcours est le prochain lot client. Les scripts de preuve de #713 ont été relus et corrigés au lint dans une branche distincte, sans modifier le travail de son auteur.

Les manifestes 27273f19 et b0ddb2c9 déclarent une provenance incomplète des références réutilisées. Une correspondance exacte de digest avec les manifestes antérieurs signés retrouve leur source : cela ne prouve les conteneurs exécutés que pour les sept services rollés. Captureur et agent d’espace restent hors preuve de rollout. Voir mesures/2026-10-11-livraison-272.json et mesures/2026-10-11-livraison-b0.json.
