# Audit ciblé messages Agent — 29 octobre2026

Build réel local f96ddd270, Chromium, API/runtime synthétiques. Aucune source du dépôt modifiée, aucun prompt envoyé ni appel IA, aucun serveur redémarré. Les mutations et origines externes sont bloquées dans chaque contexte.

## Recette conforme au contrat

`valid-four.cjs`, reçu `valid-four/receipt.json` :390/820/1280 × FR/EN,6parcours exécutés. Contenu long, liste, lien long et tableau Markdown ;4images jointes (MAX_IMAGE_ATTACHMENTS=4). Les messages restent à370/800/303px dans leur panneau, aucun débordement de page. Tableau large défilable horizontalement ; le déplacement jusqu'à la dernière colonne est observé. Aucune conclusion clavier pour le tableau ni contraste/zoom/Safari.

6parcours terminent l'ouverture du menu au clic droit sur une zone noninteractive, Escape, restitution du focus à la ligne, puis activation du bouton Modifier au clavier et préremplissage local du compositeur. Aucune soumission. `pass:true` signifie parcours diagnostique terminé, PAS réussite du raccourci ci-dessous.

## Défaut clavier confirmé, périmètre830/832 réservé

Dans les6formats/langues, la ligne utilisateur est réellement focusable (`tabIndex=0`). Après Shift+Tab puis Tab natifs, `document.activeElement` est la ligne. Shift+F10 ne présente aucun bouton Modifier (`keyboardMenuVisible:false`). Le clic droit sur la même ligne ouvre bien Modifier : ce n'est donc pas un problème de droit/absence de canEdit. Escape restitue le focus correctement dans ce chemin.

Sources : `Messages.client.tsx:154` rend la ligne focusable ; `UserMessage.tsx` étale les gestes mais n'attache ni `menuContextuel.ancre` ni son gestionnaire clavier. `MessageContextMenu.tsx` dispose d'un contrat clavier documenté Entrée/Espace/Shift+F10, mais son abonnement natif de ligne n'écoute que pointeur/contextmenu. Ajouter seulement onKeyDown à la bulle ne reçoit pas les événements ciblant son parent focalisé.

Proposition à coordonner, NON appliquée : raccorder les deux branches UserMessage à l'ancre et traiter l'ouverture clavier au niveau de la ligne réellement focusable (listener natif partagé ou liaison explicite parent). Préserver Enter/Espace sur descendants interactifs, priorités defaultPrevented, fermeture/Escape et focusretour. Fichiers candidats UserMessage.tsx, MessageContextMenu.tsx (+tests comportementaux sur ligne, deux branches) ; éviter un deuxième arrêt de propagation global.

## Contre-preuve importante

Les recettes initiales `first`, `context`, `native-focus` utilisaient8images. Elles débordaient mais violent la limite actuelle4images : ce résultat N'EST PAS un défaut produit établi dans le parcours courant. La recette conforme4images est verte pour la géométrie. Aucun correctif images recommandé sur cette preuve. Les premiers clics droits au centre de liens ont aussi été écartés ; la recette finale vise une zone noninteractive.

Pas de certification globale, pas de production/backend réel, pas de Safari/appareil physique. Captures initiales seulement, pas de vidéo/archive. Tous les navigateurs sont fermés dans finally.
