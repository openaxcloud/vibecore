# Métrique de réconciliation — B-21

Le point de l’inventaire « rien n’existe » est périmé : main après #709 déclare déjà `workspace_runtime_reseed_total`, avec une garde des métriques littérales appelées dans les trois services examinés. Le registre continue volontairement de refuser les noms inconnus.

La garde existante passait aussi si ses répertoires étaient absents. La reprise exige des sources dans chaque service, des appels effectivement lus et le témoin de la métrique de réconciliation. Deux tests passent ; retirer uniquement la déclaration de cette métrique rend un test rouge, le contrôle des doublons reste vert. Après restauration, les deux tests repassent au vert. Aucune modification de la déclaration ou du comportement du registre n’est livrée en doublon. Lint ciblé vert. Cette mesure concerne les noms littéraux reconnus par la garde, pas toutes les expressions dynamiques possibles.
