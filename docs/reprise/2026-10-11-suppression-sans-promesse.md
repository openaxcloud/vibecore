# A-21 et A-22 — demande enregistrée, pas de purge promise

Les deux branches sont fusionnées réellement sur main 80f1de14. Seul l’index dérivé entre en conflit : il est régénéré. L’écran indique que la demande est enregistrée, visible par l’équipe et annulable pendant son délai ; il précise que la suppression définitive n’est pas automatique. L’avertissement d’inactivité dépend de la même activation que l’action de suppression.

17 assertions web/index et deux assertions API passent. Revenir au catalogue de main rend les deux langues rouges ; retirer uniquement la condition d’activation fait partir un e-mail et rend le test négatif rouge, tandis que le cas actif reste vert. Les types web et API, la construction React Router et le lint web/test passent. Le lint général d’app.ts a 327 erreurs déjà présentes sur main ; la comparaison des diagnostics avant/après ne trouve aucune nouvelle erreur. Les imports relatifs du test API sont vérifiés avec la convention des services, pas celle des routes web.

Aucune suppression de données n’est activée par ce lot. La purge physique A-6 n’est pas déclarée prouvée. Les comptes, envois et données de production n’ont pas été modifiés par ces validations. État : préparé, pas fusionné sur main et pas servi.
