# Isolation des lectures tardives de l’historique

Base : `9ec6ebf75`. Validation locale synthétique, sans fournisseur IA ni données utilisateur.

## Défaut reproduit

Une lecture de mémoire du projet A, achevée après navigation vers B ou démontage de A, remplaçait les stores globaux `chatId` et `chatMetadata` par ceux de A. Le repli serveur pouvait aussi adopter la conversation de A dans le contexte de B si les deux identités de conversation étaient initialement absentes. La garde d’identité du repli ne distingue pas deux projets sans identité.

Deux reproductions initiales ont échoué sur le hook réel : `project:A` au lieu de `project:B`, puis `conversation-A` au lieu d’une identité absente. Les frontières de stockage/réseau sont contrôlées par des promesses différées ; le hook React et la logique de repli sont exécutés réellement.

## Correction

L’effet invalide ses callbacks à sa destruction. Les lectures mémoire, IndexedDB, snapshot et les erreurs tardives ne publient plus leur résultat après cette invalidation. Les callbacks du repli serveur ne posent ni messages ni identité et ne démarrent aucune écriture de métadonnées lorsqu’ils sont obsolètes. Les opérations déjà engagées ne sont pas annulées.

Le test existant du branchement serveur conserve désormais une instance stable de `URLSearchParams`, conformément au routeur : son ancien mock créait une nouvelle dépendance à chaque rendu et invalidait artificiellement le premier callback.

## Validation

- 37 tests ciblés réussis : `useChatHistory.stale-load`, `useChatHistory.fil-serveur`, `useChatHistory.i18n`, `serveur-fil-projet`.
- Quatre nouvelles régressions : transition dans le même montage, démontage/remontage, repli serveur tardif sans adoption/écriture et rejet mémoire tardif sans toast.
- ESLint ciblé et `git diff --check` réussis.
- Phase web du typecheck officiel réussie ; phases suivantes arrêtées volontairement pour laisser la validation générale au coordinateur.

Pas de preuve navigateur, mobile, production, déploiement ou exécution de modèle. Cette correction ne prétend pas annuler une restauration de fichiers déjà engagée ni résoudre tous les cas de concurrence entre instances simultanées du chat.
