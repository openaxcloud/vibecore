# Assemblage palette et durée de vie du preview

Base commune : `58fa0702a2824015e879665e227228f8b4d8c76a`. Sources : palette PR #823 `f0e2af039cd3f3a7686cd5384fd824bd08e5f0e8`, runtime PR #822 `b9ae8542ea7d9c5a21caf33912fe2dd516924ce0`.

La fusion conserve les 43 blobs sources hors index documentaire, seul chevauchement. L'index dérivé réunit 540 fiches. Aucun test palette existant modifié, aucune suppression de garde ou modification de workflow. La revue indépendante est jointe.

Validation exécutée sur l'assemblage local : 97 tests web ciblés, 79 tests runtime-remote, 158 tests workspace-agent, 4 tests du watcher API HTTP/WebSocket, 16 gardes d'index. Tous réussis, aucun ignoré dans ces commandes. Lint app : zéro erreur, 52 avertissements existants. Les tests API utilisent un store isolé et un manager contrôlé ; ils ne prouvent pas un environnement de production. Les tests lifecycle workspace-agent utilisent des processus locaux isolés.

La preuve Vite de plus de 30 minutes appartient à la validation source #822 transmise par son propriétaire ; elle n'a pas été répétée pour cette fusion. Les tests de navigateur préexistants ci-dessus utilisent des API synthétiques. Le typage, build, recette compilée et CI de la tête combinée doivent être rapportés séparément lorsqu'ils sont terminés. Aucun déploiement n'est établi par ce document.

Typage officiel complet et build client/SSR : exit 0 sur ces sources assemblées. Journaux joints. La nouvelle recette compilée et la CI exacte restent en cours/prévues ; aucun résultat anticipé.
