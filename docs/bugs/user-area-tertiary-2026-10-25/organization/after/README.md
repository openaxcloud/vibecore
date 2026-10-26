# Recette du correctif compilé — 9499

Serveur local9499, API synthétique isolée4399, mêmes données que baseline9399. Build et typage validés par parent; tête de base01006910d plus le delta des4routes (source.patch et source-build.sha256). Aucun fichier produit modifié pendant cette recette.

matrix.json:80observations, cinq routes × quatrelargeurs320/390/768/1440 ×FR/EN ×clair/sombre. Document contenu80/80; aucun débordement du nom de rôle sur les64observations des4routes corrigées; audit-logs demeure contenu16/16. Zéro erreurJavaScript.20captures320. Le tableau permissions garde son défilement horizontal intentionnel; les ellipses du shell, éléments hors écran etsr-only restent exclus du verdict.

Ces résultats utilisent le build corrigé, contrairement à ../counterproof.json qui injectait une correctionDOM temporaire. Les captures ../*-320.png et ../matrix.json représentent le buildAVANT. Les fixtures sont identiques et n'ont pas été changées pendant la matrice.

Parcours dansinteractions.json/log: mêmes7groupes quebaseline (4formulaires clavier/saisie brouillon/resize/Back; filtreAudit/resize/pagination;2GET503-Recharger). Aucun submit de rôle/invitation, export, acceptation, accès extérieur ni backendréel. Tiersbloqués(ycomprisGoogleFonts). Limites identiques auREADMEparent: pas production, pas nouveauxformats/zoom/contraste ni permissionsbackend.

Verdict final:7/7groupes terminés sans erreurJS, aucun appel nonGET tenté; failures.json restauré{}. Navigateurs fermés par les deux harnesses. Source gelée, aucun index/commit/push.
