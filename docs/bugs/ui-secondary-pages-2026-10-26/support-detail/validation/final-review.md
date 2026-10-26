# Revue indépendante du correctif Support — avant build regroupé

26 octobre2026, worktree `/workspace/vibecore-ui-safecontent`. **Avis favorable : aucun bloquant identifié dans le delta final relu.** Aucun fichier source/index modifié par la revue, aucune relance de tests ni fusion. Backend/CI #798 hors périmètre.

Empreintes relues : route `6e2f60ab50e84a7f620476f1388d815b1ddab48027c98e1d509e92806fae5104`, catalogue `bb133aa5b01b41a1d1237b2d7cc34539216b0f6b5749f135e8954d15bf0db6f4`, nouveau testDataRouter `b3f8bff82d19531da92e802860b80d35ee5ca1fea761d123b3b762076f4ab569`.

## Contrat et états

- L'action frontend attend toujours le même apiRequestPOST validé avant toute réponse de succès. Accept contenant text/html garde le302PRG vers ticket/langue ; requête données (Accept*/* observé sur le formulaire compilé par le propriétaire) reçoit seulement `{sent:true}`, avec headers privés existants, sans texte du message ni identifiant utilisateur. Validation, destinationAPI, traitement erreurs/Retry-After et réauth restent inchangés. Ce changement de réponsefrontend est explicite ; aucun contratbackend modifié.
- Brouillon contrôlé remonté au parent et rattaché au ticketId. Guard parent actif tant que texte nonvide, y compris pendant POST. Le hook existant laisse passer les soumissions/changementsquery sur même pathname. Aucune nouvelle persistance, copie de texte dans l'URL ou inférence depuis le fil des messages.
- Conversation existante maintenue pendant revalidation mêmechemin, avec aria-busy/status ; changement de pathname utilise encore le skeleton pour ne pas afficher l'ancien ticket comme nouveau. Une erreurloader peut cacher la conversation mais le brouillon reste dans l'étatparent tant que celui-ci reste monté.
- Snapshot exact au submit. Chaque nouvel objetactionData.sent est consommé unefois, même sanssnapshot ; clear seulementsi ticket/bodycourants correspondent à la soumission. Les changements pendantPOST restent présents et protégés ; ancienneack n'est pas réutilisée pour la seconde soumission. Aucun recours àUNSAFErouter/subscribe.
- Confirmation « Abandonner » vide état etsnapshot avantproceed. Le casA→B→RetourA est désormais couvert et ne ressuscite plus le texte abandonné. Cancel/Escape reset leblocker et gardent le brouillon ; champvide ne bloque pas.

## Preuves de tests relues

`support-tests-final.log` :28testsverts,2fichiers (15contrats/i18n +13DataRouter). Pas de rerun de revue.

Le nouveau fichier utilise createMemoryRouter/RouterProvider réels, guard et ConfirmationDialog réels ; seul shell/locale sont simplifiés. Cas400/503 avec revalidationdifférée forcée ET politiqueRouterpar défaut ; POSTpending avec tentative de départ ; querylocaleGET ; vide/cancel/Escape/discard ; succèsrapide coalescé etdifféré ; éditionpending ; deuxsuccès etancienneack ; POSTannuléparGET mêmechemin puisréponse tardive ; abandonA→B→A. Le testd'action distinct démontre attente de l'API avantack, absenceécho etno-store ; PRGHTML etréauth restent vérifiés.

La réserve initiale démontage du champ/guard pendantloading est résolue, ainsi que la perte suranciennepropositionA→B→A. Le libellé du test « retaining content during delayed reload » signifie maintien du composant : son assertion attend bien un champvide aprèsack explicitependantloading, conformément au contrat (message accepté).

## Limites restantes

Build/typecheck regroupés etrecette navigateurcompiled après ce delta restent attendus à ce stade : focusEscape réel, confirmation320/paysage, POSTsimulé succès/erreur, éditionpendantattente etRetour doivent être distingués des testsjsdom. Pas de recettebackendréel ni production.

Un POSTaccepté côtébackend mais dont l'ackréseau n'arrivejamais ne peut pas être reconnu avec certitude : le brouillon est conservé. L'absence de garantieanti-doublon réseau/idempotence préexistante n'est pas résolue par une gardeUI. Une destruction complète de page/processus ne persiste pas le texte ; beforeunload protège seulement selon les capacités du navigateur. Le testlocaleGET conserve le texte mais mocke la langue, ce n'est pas une certification de toutes les traductionsdynamiques.
