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
