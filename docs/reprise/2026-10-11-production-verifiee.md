# Mesures de production — 11 octobre 2026

## Déploiement et contraste public (A-28)

Le workflow [38156140310](https://github.com/openaxcloud/vibecore/actions/runs/38156140310) est terminé avec conclusion `success`, pour le commit `4f7c07f7a38e47f6e08c4a2a64de46382622af21` (fusion #701). Les artefacts rollout et manifest sont listés par l'API mais leur téléchargement retourne 403 dans cet environnement ; les identifiants d'images des pods n'ont donc pas été relus directement ici.

Mesures Chromium en production sur `e-code.ai`, de 17:59 UTC à la reprise des cinq lectures incomplètes vers 18:05 UTC : `/pricing`, `/partners`, `/deployments`, `/status`, `/about`, `/careers`, `/contact`, `/mobile`, `/desktop`, `/ai`, `/ai-agent`, `/bounties`. Largeurs 390, 768 et 1440 px ; thèmes clair et sombre vérifiés dans le DOM.

72 combinaisons, toutes avec un témoin positif après reprise : 420 mesures de boutons orange actifs à fond opaque. Aucun ratio sous 4,5:1 ; minimum 5,1784:1. Toutes les pages répondent 200, aucun débordement horizontal mesuré. Calcul par extraction de la fonction `contrastRatio` existante dans `tests/e2e/ui-details.spec.ts`, sans réécriture de sa formule. Résultats détaillés dans `mesures/2026-10-11-contraste-public.json`.

Limites : seuls les boutons orange à fond opaque sélectionnés sont mesurés ; cette lecture ne prouve pas l'accessibilité de tous les textes, fonds transparents, dégradés, composants internes ou autres moteurs de navigateur.

## Parcours tarifaire (A-1, A-3)

La page française propose Pro à 29 euros, cinq places. Aux trois largeurs, le lien Pro mensuel vise `/subscribe?plan=pro&interval=monthly` ; après activation du bouton accessible « Afficher les tarifs annuels », le lien vise `interval=annual` et le montant 278,40 euros est visible. Pas de débordement horizontal sur ces lectures.

Aucune transaction Stripe n'a été exécutée. Le clic sans compte n'a pas démontré l'arrivée au paiement ; A-3 ne peut donc pas être clos de bout en bout sur cette seule observation.

## File GitHub

33 demandes d'annulation ne visant que des workflows de propositions en brouillon : état `queued` relu et absence de job `in_progress` vérifiée avant chaque demande. Neuf candidats ont été préservés parce qu'un job avait commencé. Le journal conserve chaque identifiant, branche et commit dans `mesures/2026-10-11-annulations-attente.jsonl`.

Ces annulations ne donnent aucun verdict sur le code. Avant réactivation d'une branche concernée, relancer les workflows de tests complets, puis les agrégateurs. Les propositions #709 et #710 et les déploiements de main ont été préservés.
