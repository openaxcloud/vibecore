# Lot UI avec le contrat backend #809 intégré

Main `d788a5495861b1d9a9a221ef431887525de06034`, fusion locale `cc0427bb88c408051b9a7255517d5a4e600751b2`. Aucun rebase ; les commits validés sont conservés. L'index a fusionné textuellement sans conflit mais devait être régénéré : il contient maintenant 516 entrées, les deux fiches UI et contrat étant présentes.

## Préservation et revue

Les 16 fichiers UI sont inchangés depuis `08819f834`. Les 13 fichiers produit/tests de #809 sont identiques à main. Les corrections focus #799 et génération portfolio #806 sont conservées ; l'ancien starter portfolio reste absent. Deux revues : préservation du merge, puis lecture indépendante du contrat UI désormais intégré.

La propagation lane-done des champs optionnels, le résultat final prioritaire, les états interrompus et partiels, les fichiers émis distincts des fichiers appliqués et les déclarations de vérification distinctes d'une exécution observée sont cohérents. Aucun type partagé dupliqué, aucune interface backend concurrente ajoutée.

## Validation locale du code intégré

- 211 tests dans 23 fichiers réussis : UI, index, focus, portfolio et orchestration du contrat #809.
- Build client/SSR réussi ; typage web `tsconfig.web.json` réussi sans diagnostic avec tas6GiB.
- Lint app : zéro erreur, 52 avertissements préexistants. Formatage des sources modifiées réussi.
- Quatre témoins navigateur focus réussis : onglets390px et panneaux1180px, chacun sans retard puis avec chunk Chat.client retenu. Après remplacement du shell, Escape retrouve le nouveau déclencheur.
- Chromium local, données synthétiques et harnais isolé ; aucun projet client ni backend de production modifié. Serveurs propres arrêtés avec identité vérifiée.

Les preuves de la cible tactile et des notifications des lots précédents restent liées à leurs sources, qui n'ont pas changé. Le défaut de palette au remplacement du shell, l'incident de capture/stockage de vignette et le cas CI historique de sélecteur390 absent restent ouverts ; cette intégration ne les déclare pas résolus.

Cette publication est une mise à jour de la PR brouillon #807, pas une livraison. La nouvelle tête exige ses propres verdicts CI. Toute fusion reste conditionnée aux protections et au rollout vérifié de #809 (run40299284819), suivi par la coordination parent.
