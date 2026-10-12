# Mesures de production — 11 octobre 2026

## Déploiement et contraste public (A-28)

Le workflow [38156140310](https://github.com/openaxcloud/vibecore/actions/runs/38156140310) est terminé avec conclusion `success`, pour le commit `4f7c07f7a38e47f6e08c4a2a64de46382622af21` (fusion #701). Les artefacts rollout et manifest ont été téléchargés via le connecteur GitHub. Le manifest déclare le web reconstruit et déployé depuis ce commit, digest `sha256:6272f54550f6315cc4a29053646af2890459e56af7b576f9ff27d6b59823e600`. La dernière capture à 17:52:55 UTC montre deux réplicas web mis à jour, prêts et disponibles, et deux pods web Running/ready ; commande terminée à zéro et preuve complète. Extrait et empreintes des fichiers sources dans `mesures/2026-10-11-web-deploye.json`. Limite : ce format de capture ne conserve pas les imageID des conteneurs ; aucune comparaison directe du digest exécuté n'a été possible.

Mesures Chromium en production sur `e-code.ai`, de 17:59 UTC à la reprise des cinq lectures incomplètes vers 18:05 UTC : `/pricing`, `/partners`, `/deployments`, `/status`, `/about`, `/careers`, `/contact`, `/mobile`, `/desktop`, `/ai`, `/ai-agent`, `/bounties`. Largeurs 390, 768 et 1440 px ; thèmes clair et sombre vérifiés dans le DOM.

72 combinaisons, toutes avec un témoin positif après reprise : 420 mesures de boutons orange actifs à fond opaque. Aucun ratio sous 4,5:1 ; minimum 5,1784:1. Toutes les pages répondent 200, aucun débordement horizontal mesuré. Calcul par extraction de la fonction `contrastRatio` existante dans `tests/e2e/ui-details.spec.ts`, sans réécriture de sa formule. Résultats détaillés dans `mesures/2026-10-11-contraste-public.json`.

Limites : seuls les boutons orange à fond opaque sélectionnés sont mesurés ; cette lecture ne prouve pas l'accessibilité de tous les textes, fonds transparents, dégradés, composants internes ou autres moteurs de navigateur.

## Parcours tarifaire (A-1, A-3)

La page française propose Pro à 29 euros, cinq places. Aux trois largeurs, le lien Pro mensuel vise `/subscribe?plan=pro&interval=monthly` ; après activation du bouton accessible « Afficher les tarifs annuels », le lien vise `interval=annual` et le montant 278,40 euros est visible. Pas de débordement horizontal sur ces lectures.

Aucune transaction Stripe n'a été exécutée. Le clic sans compte n'a pas démontré l'arrivée au paiement ; A-3 ne peut donc pas être clos de bout en bout sur cette seule observation.

## File GitHub

52 demandes d'annulation (33 lors du premier passage, 19 lors du second) ne visant que des workflows de propositions en brouillon : état `queued` relu et absence de job `in_progress` vérifiée avant chaque demande. À chaque passage, neuf candidats ont été préservés parce qu'un job avait commencé. Le journal conserve chaque identifiant, branche et commit dans `mesures/2026-10-11-annulations-attente.jsonl`.

Ces annulations ne donnent aucun verdict sur le code. Avant réactivation d'une branche concernée, relancer les workflows de tests complets, puis les agrégateurs. Les propositions #709 et #710 et les déploiements de main ont été préservés.

## Premier correctif de reprise de l’agent servi (#710)

Le déploiement [38165474193](https://github.com/openaxcloud/vibecore/actions/runs/38165474193) est terminé avec succès. Le manifeste désigne le web reconstruit depuis `80f1de14794b134a7073d20b708254d690ff6626`, digest `sha256:158999199081796edcceab5c48935763ae43a5d7cb91436345e8515b9096d4ba`. À 19:37:28 UTC, le Deployment web compte trois réplicas prêts, deux mis à jour et deux disponibles. Deux pods du nouveau ReplicaSet sont Running/ready ; l’ancien pod est encore présent dans la capture. Commande terminée à zéro, preuve complète. Mesure : `mesures/2026-10-11-reprise-agent-deployee.json`. Cette capture ne contient toujours pas les imageID exécutés.

Réserve nouvelle : le manifeste ne renseigne pas le sourceSha des huit images réutilisées et déclare `fullyTraceable: false`. Il ne prouve donc pas la provenance complète de la release. Le correctif de recherche paginée de la base des étages (#709) reste à déployer et son résultat à remesurer.

## Offre annuelle conservée jusqu’à la connexion (A-3)

La lecture HTTP de production conserve `plan=pro&interval=annual` de `/subscribe` à `/upgrade`, puis dans le `returnTo` de `/login`, y compris après passage de `e-code.ai` à `app.e-code.ai`. La page de connexion finale répond 200. Mesure : `mesures/2026-10-11-tarif-jusqua-connexion.json`. La suite après authentification et le paiement Stripe restent non mesurés.


## Correctifs de livraison #709 — release 408e9f84

Le workflow [38169434734](https://github.com/openaxcloud/vibecore/actions/runs/38169434734)
est terminé avec succès. Les contrôles de vulnérabilités, protections Helm
vivantes, rollout et imageIDs exécutés ont passé. Le manifeste indique neuf
références reconstruites depuis `408e9f847afadf2cc75ba764b3211c36d0bc2c35`,
`fullyTraceable: true` et aucun trou de provenance déclaré. Sept services sont
marqués rollés. Les références du captureur et de l’agent d’espace sont
reconstruites mais marquées non rollées : le manifeste ne prouve pas que ces
deux nouvelles images tournent.

À 21:02:48 UTC, le web compte trois réplicas prêts, deux mis à jour et deux
disponibles ; les deux nouveaux pods et l’ancien sont encore présents. La
commande de capture termine à zéro avec preuve complète. Le digest web déclaré
est `sha256:2e2ba42b6b0798bb23d362b7a465e2b3d5bdc485b4ddb009c41b6ab6e45c24a1`.
Mesure et empreintes : `mesures/2026-10-11-livraison-408.json`.

La provenance des neuf références est désormais explicite, contrairement au
manifeste 80f1de14. Limite conservée : la capture ne contient pas les imageIDs
bruts ; le résultat vert de leur comparaison vient du workflow, et uniquement
des services qu’il compare. Aucun effacement client ni achat Stripe n’a été
exécuté pour ces mesures.

## Livraisons 27273f19 et b0ddb2c9

Les workflows 38171920340 et 38175136988 sont réussis. Captures finales : 21:48:36 UTC et 22:09:08 UTC, sorties à zéro et evidenceComplete=true. #712 est donc livré dans le web reconstruit b0ddb2c9 ; sa reprise après fermeture reste à mesurer dans un parcours authentifié.

Les deux manifestes déclarent fullyTraceable=false. Les sources manquantes des références réutilisées sont retrouvées par correspondance exacte des digests avec les manifestes antérieurs de livraisons réussies et signées, sans transformer cette reconstruction en preuve de conteneur exécuté. Sept services sont rollés ; screenshotter et workspaceAgent ne le sont pas. Les deux mesures JSON conservent séparément le manifeste natif, la preuve historique et cette limite. Aucun paiement ni effacement client exécuté.


## Lot IDE #714 — release 83d1c63e

Le [workflow 38181578340](https://github.com/openaxcloud/vibecore/actions/runs/38181578340) est réussi. La capture termine le 12 octobre à 00:30:58 UTC, sortie zéro et `evidenceComplete=true`. Le manifeste déclare neuf références reconstruites depuis `83d1c63e1c4d360ffd359378c74ab8fb2f6f3669`, `fullyTraceable=true`, sans lacune de provenance. Sept services sont rollés et ont passé la comparaison des imageIDs du workflow.

Le captureur et l’agent d’espace restent marqués non rollés : leurs nouvelles références ne prouvent pas que ces conteneurs tournent. Ce workflow n’archive pas les imageIDs bruts. Le lot A-8/A-9/A-11/A-12/A-14/A-16/A-17/B-22/B-24 est livré dans le web reconstruit ; les parcours authentifiés correspondants ne sont pas remesurés en production. Mesure limitée et empreintes des deux artefacts : `mesures/2026-10-12-livraison-83.json`. Aucun paiement ni effacement client exécuté.

## Lot outillage #716 — release b7a8b4b3

Le [workflow 38186261396](https://github.com/openaxcloud/vibecore/actions/runs/38186261396) est réussi. La capture termine le 12 octobre à 01:34:31 UTC, sortie zéro et `evidenceComplete=true`. Les neuf références sont reconstruites depuis `b7a8b4b339628fd98fd0898b397cceb4e70fd71f`, avec neuf signatures vérifiées, `fullyTraceable=true` et aucune lacune de provenance. Sept services sont rollés. Le captureur et l’agent d’espace restent non rollés ; leurs références reconstruites ne prouvent pas qu’ils tournent.

Mesure limitée et empreintes : `mesures/2026-10-12-livraison-b7.json`. L’installation distante à neuf et les parcours authentifiés restent non remesurés. Les lots #715 et #717 sont fusionnés après cette release, mais leur livraison n’est pas établie ici.
