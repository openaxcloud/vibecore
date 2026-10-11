# Provenance des fixtures de livraison

Captures authentifiées en lecture seule du dépôt `openaxcloud/vibecore`, le
11 octobre 2026. Les manifestes sont conservés intégralement ; seules les métadonnées
nécessaires à la validation des runs sont sélectionnées dans les réponses GitHub.

- Run [38165474193](https://github.com/openaxcloud/vibecore/actions/runs/38165474193),
  artefact `11713435281`, `release-manifest-80f1de1479` : web reconstruit depuis
  `80f1de14794b134a7073d20b708254d690ff6626`, huit provenances reprises inconnues.
- Run [38156140310](https://github.com/openaxcloud/vibecore/actions/runs/38156140310),
  artefact `11709879003`, `release-manifest-4f7c07f7a3` : les huit mêmes digests
  attribués à `4f7c07f7a38e47f6e08c4a2a64de46382622af21` ; web plus ancien.
  SHA256 de l'archive téléchargée, conforme aux métadonnées GitHub :
  `98524e225495282959c72ab22de5ff8ee50c409b2a04bda6155b64f170b53e8a`.

Les deux runs étaient terminés avec succès, issus de `push` sur `main`, par
`.github/workflows/deploy-main.yml`. Aucun des deux manifestes seul ne prouve les
neuf images du mélange configuré. La fixture n'affirme pas l'état actuel des pods.
