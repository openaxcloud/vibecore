# Reprise de l’inventaire E-Code du 11 octobre 2026

Source : inventaire fourni par Avi, daté de 14:45 UTC. Relevé initial GitHub : main `c7a6fa5025c18419988173179f8f30044d0253b3`.

Aucune ligne ci-dessous ne constitue une preuve de production. Les preuves antérieures sont celles de l’inventaire transmis ; la reprise distingue préparation, fusion et vérification live.

## Urgence et ordre

Déploiement du partage `38145240168` en cours ; déploiement du tarif Pro `38147529814` en attente. Ne pas fusionner de documentaire ou lancer un rollout supplémentaire pendant cette attente. Clé Stripe à renouveler uniquement après preuve du bon forfait servi, puis créer le prix annuel Pro à 278,40 € et renseigner son ID.

Ne jamais intégrer `fix/forfait-pro-cinq-places`, `fix/reouverture-garde-la-version-utilisateur` ou `fix/agent-interrompu-tour-jamais-parti`. Conserver le menu mobile, l’IDE existant et la remise annuelle de 20 %.

## Correspondance complète

| Point | Objet | Proposition / branche | État de reprise |
|---|---|---|---|
| A-1 | Pro facture Team | [#705](https://github.com/openaxcloud/vibecore/pull/705) | Fusionné ; déploiement 38147529814 en attente |
| A-2 | Tarif annuel Pro Stripe | Voir état | Clé Stripe et tarif annuel à provisionner ; aucun accès Stripe ici |
| A-3 | Offre conservée au paiement | Voir état | Déjà codé selon inventaire ; à vérifier après livraison web |
| A-4 | Partage en lecture seulement | [#700](https://github.com/openaxcloud/vibecore/pull/700) | Fusionné ; déploiement 38145240168 en cours |
| A-5 | Octets stockage et URL signée | [#414](https://github.com/openaxcloud/vibecore/pull/414) | GitHub : mise en brouillon pendant la reprise, tête `130c29f58c` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-6 | Purge physique de compte | [#52](https://github.com/openaxcloud/vibecore/pull/52) | Réserves expertes et conflits à lever ; preuve réelle à reprendre |
| A-7 | Reprise du tour interrompu | Voir état | Deux branches complémentaires intégrées dans des arbres main séparés : 4 et 24 tests verts ; types complets verts pour la reprise après fermeture ; pas encore livrées |
| A-8 | Préserver le travail au retour | Voir état | Partiellement servi selon inventaire ; branches de rattrapage à comparer |
| A-9 | Relecture impossible / conflit | [#555](https://github.com/openaxcloud/vibecore/pull/555) | GitHub : mise en brouillon pendant la reprise, tête `cf33e718b1` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-10 | Frappe au chargement | Voir état | Déjà corrigé ; ancienne branche interdite |
| A-11 | Envois répétés de conversation | [#666](https://github.com/openaxcloud/vibecore/pull/666) | GitHub : mise en brouillon pendant la reprise, tête `337e907d4a` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-12 | Historique en échec | [#556](https://github.com/openaxcloud/vibecore/pull/556) | GitHub : mise en brouillon pendant la reprise, tête `39dd254481` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-13 | Session depuis accueil | [#662](https://github.com/openaxcloud/vibecore/pull/662) | GitHub : mise en brouillon pendant la reprise, tête `0edd050b4b` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-14 | Lecture IDE avortée | [#376](https://github.com/openaxcloud/vibecore/pull/376) | GitHub : mise en brouillon pendant la reprise, tête `dbda036371` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-15 | Nouvelle tentative Vercel | [#370](https://github.com/openaxcloud/vibecore/pull/370) | GitHub : mise en brouillon pendant la reprise, tête `abd253be3f` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-16 | Actualisation fichiers et partage | [#559](https://github.com/openaxcloud/vibecore/pull/559) | GitHub : mise en brouillon pendant la reprise, tête `3f46552586` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-17 | Domaines en doublon | [#379](https://github.com/openaxcloud/vibecore/pull/379) | GitHub : mise en brouillon pendant la reprise, tête `6e994bafe5` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-18 | Commande interrompue et installation | Voir état | Branche fix/commande-coupee-et-installation-tuee à éprouver |
| A-19 | OAuth inscription | [#394](https://github.com/openaxcloud/vibecore/pull/394) | GitHub : mise en brouillon pendant la reprise, tête `069ef53b83` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-20 | Lecteur sans instantané | Voir état | Cause établie : create_snapshot manquait parmi les outils de mutation ; 2 tests verts, lecture refusée à 403 et autorisation éditeur maintenue ; pas encore livré |
| A-21 | Texte de suppression du compte | [#703](https://github.com/openaxcloud/vibecore/pull/703) | GitHub : brouillon, tête `3497e83d01` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-22 | E-mail suppression inactive | [#704](https://github.com/openaxcloud/vibecore/pull/704) | GitHub : brouillon, tête `b854116236` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-23 | Vocabulaire economy retiré | [#595](https://github.com/openaxcloud/vibecore/pull/595) | GitHub : mise en brouillon pendant la reprise, tête `b450a113b3` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-24 | Messages sans jargon | Voir état | Branche fix/messages-sans-jargon à éprouver |
| A-25 | État unknown | [#658](https://github.com/openaxcloud/vibecore/pull/658) | GitHub : mise en brouillon pendant la reprise, tête `11002c88c1` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-26 | Consigne de périmètre | Voir état | Branche fix/consigne-portee-n-est-pas-un-refus à éprouver |
| A-27 | Brochures sur identifiants arbitraires | [#423](https://github.com/openaxcloud/vibecore/pull/423) | GitHub : mise en brouillon pendant la reprise, tête `75769fc271` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-28 | Contraste de quinze boutons | [#701](https://github.com/openaxcloud/vibecore/pull/701) | Essai de fusion réel sans conflit ; Syntaxe E2E corrigée sur la branche au commit 94da33ad32 ; 28 tests voisins verts et 434 tests Chromium collectés ; nouveaux contrôles en cours |
| A-29 | Texte orange | [#283](https://github.com/openaxcloud/vibecore/pull/283) | GitHub : mise en brouillon pendant la reprise, tête `fa9e0c62f0` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-30 | Encre du CTA | [#512](https://github.com/openaxcloud/vibecore/pull/512) | GitHub : mise en brouillon pendant la reprise, tête `fd1de91fef` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-31 | Libellés mobiles 9 px | [#434](https://github.com/openaxcloud/vibecore/pull/434) | GitHub : mise en brouillon pendant la reprise, tête `e864220fc9` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-32 | Case à cocher | [#560](https://github.com/openaxcloud/vibecore/pull/560) | GitHub : mise en brouillon pendant la reprise, tête `06b75bf036` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-33 | Exemples de champs bureau | [#652](https://github.com/openaxcloud/vibecore/pull/652) | GitHub : mise en brouillon pendant la reprise, tête `fa08b1e533` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-34 | Onglet mobile coupé | [#620](https://github.com/openaxcloud/vibecore/pull/620) | GitHub : brouillon, tête `a385056ac3` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| A-35 | SSRF et DNS rebinding | [#362](https://github.com/openaxcloud/vibecore/pull/362) | Contrôle des adresses résolues et refus par défaut à vérifier |
| B-1 | Déclencher correctif de livraison | Voir état | Correction préparée, comportement testé ; pas fusionnée |
| B-2 | Base des tiers | [#669](https://github.com/openaxcloud/vibecore/pull/669) | GitHub : mise en brouillon pendant la reprise, tête `inconnue` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| B-3 | Audit français bloquant | Voir état | Branche ci/audit-francais-requis ; livrer après tarif Pro et audit vert |
| B-4 | Audit français aveugle | [#668](https://github.com/openaxcloud/vibecore/pull/668) | GitHub : mise en brouillon pendant la reprise, tête `4f1ca15424` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| B-5 | Cache navigateurs | [#648](https://github.com/openaxcloud/vibecore/pull/648) | GitHub : mise en brouillon pendant la reprise, tête `d35d38e3b9` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| B-6 | E2E documentaire | [#448](https://github.com/openaxcloud/vibecore/pull/448) | GitHub : mise en brouillon pendant la reprise, tête `af567e8bd2` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| B-7 | Builds Electron dépassés | [#366](https://github.com/openaxcloud/vibecore/pull/366) | GitHub : mise en brouillon pendant la reprise, tête `67e9a984b7` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| B-8 | Tiers comparés à leur propre code | [#632](https://github.com/openaxcloud/vibecore/pull/632) | GitHub : mise en brouillon pendant la reprise, tête `63f3c493f2` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| B-9 | Quatre protections Helm | Voir état | Correction préparée, rendu Helm testé ; pas fusionnée ni mesurée dans le cluster |
| B-10 | Carte des secrets | [#607](https://github.com/openaxcloud/vibecore/pull/607) | GitHub : mise en brouillon pendant la reprise, tête `402431aee6` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| B-11 | Exemple environnement complet | [#606](https://github.com/openaxcloud/vibecore/pull/606) | GitHub : mise en brouillon pendant la reprise, tête `8b7b3a4843` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| B-12 | Installation à neuf | [#125](https://github.com/openaxcloud/vibecore/pull/125) | GitHub : mise en brouillon pendant la reprise, tête `1e14d78e2f` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| B-13 | Mémoire agent non configurée | [#142](https://github.com/openaxcloud/vibecore/pull/142) | GitHub : brouillon, tête `0b87955af4` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| B-14 | Extinction locale | Voir état | Branche fix/pile-locale-extinction-complete à éprouver |
| B-15 | Porte E2E multi-spécification | Voir état | Branche fix/porte-e2e-spec-seul à éprouver |
| B-16 | Composants morts lot 1 | [#340](https://github.com/openaxcloud/vibecore/pull/340) | GitHub : mise en brouillon pendant la reprise, tête `5cbfc045b8` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| B-17 | Composants morts cliquet | [#324](https://github.com/openaxcloud/vibecore/pull/324) | Choisir un seul travail commun avec B-16 |
| B-18 | Nettoyage complémentaire 1 | Voir état | Identifier branche ; ne pas supprimer sur la seule base du titre |
| B-19 | Nettoyage complémentaire 2 | Voir état | Identifier doublon avant intégration |
| B-20 | Contrats anti-abus | [#79](https://github.com/openaxcloud/vibecore/pull/79) | Vérifier aussi le drapeau effectif en production |
| B-21 | Métrique non déclarée | Voir état | Reproduire et corriger avec B-20 |
| B-22 | Agent écrit | [#409](https://github.com/openaxcloud/vibecore/pull/409) | GitHub : mise en brouillon pendant la reprise, tête `98b863c8a5` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| B-23 | Curseur effort | [#424](https://github.com/openaxcloud/vibecore/pull/424) | GitHub : mise en brouillon pendant la reprise, tête `ea8b72ca0e` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| B-24 | Revue visible | Voir état | Branche fix/revue-visible-avec-application-auto à éprouver |
| B-25 | Audit externe 158 points | [#352](https://github.com/openaxcloud/vibecore/pull/352) | GitHub : mise en brouillon pendant la reprise, tête `464f8c4f83` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| B-26 | Manques pour lancement | [#574](https://github.com/openaxcloud/vibecore/pull/574) | GitHub : mise en brouillon pendant la reprise, tête `52341bd2d2` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| B-27 | Verdict des propositions | [#590](https://github.com/openaxcloud/vibecore/pull/590) | GitHub : mise en brouillon pendant la reprise, tête `0196638c55` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| B-28 | Huit branches obsolètes | [#608](https://github.com/openaxcloud/vibecore/pull/608) | GitHub : mise en brouillon pendant la reprise, tête `cbcdaf1c39` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| B-29 | Deux bugs session mobile | [#618](https://github.com/openaxcloud/vibecore/pull/618) | GitHub : mise en brouillon pendant la reprise, tête `4d2b711ce7` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| B-30 | Remesure mobile 390 | [#623](https://github.com/openaxcloud/vibecore/pull/623) | Preuves iPhone toujours distinctes de Chromium |
| B-31 | Méthode fusion et inventaire | [#637](https://github.com/openaxcloud/vibecore/pull/637) | GitHub : mise en brouillon pendant la reprise, tête `fa523cca75` ; lire l’écart puis essayer une fusion réelle et jouer les tests |
| B-32 | Fiches infrastructure | Voir état | Deux fiches sources récupérées ; index régénéré depuis docs/bugs |
| B-33 | Mesure cohérente mais fausse | Voir état | Conserver la version main postérieure |
| B-34 | Saut d’hôte et URL | Voir état | Branche documentaire à identifier et préserver |
| B-35 | Trois règles de méthode | Voir état | Conserver mesures et méthode ; branche à identifier |
| B-36 | Partage et comptage des places | [#700](https://github.com/openaxcloud/vibecore/pull/700) | Réparé par A-4 ; conserver fiche historique |

## États et limites

📤 Dispatché : reprise engagée. 💻 Codé : aucun nouveau correctif de cette reprise encore sur main. ✅ Testé live : aucun nouveau point clos.

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
