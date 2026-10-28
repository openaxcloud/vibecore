# Assemblage palette et durée de vie du preview

Base commune : `58fa0702a2824015e879665e227228f8b4d8c76a`. Sources : palette PR #823 `f0e2af039cd3f3a7686cd5384fd824bd08e5f0e8`, runtime PR #822 `b9ae8542ea7d9c5a21caf33912fe2dd516924ce0`.

La fusion conserve les 43 blobs sources hors index documentaire, seul chevauchement. L'index dérivé réunit 540 fiches. Aucun test palette existant modifié, aucune suppression de garde ou modification de workflow. La revue indépendante est jointe.

Validation exécutée sur l'assemblage local : 97 tests web ciblés, 79 tests runtime-remote, 158 tests workspace-agent, 4 tests du watcher API HTTP/WebSocket, 16 gardes d'index. Tous réussis, aucun ignoré dans ces commandes. Lint app : zéro erreur, 52 avertissements existants. Les tests API utilisent un store isolé et un manager contrôlé ; ils ne prouvent pas un environnement de production. Les tests lifecycle workspace-agent utilisent des processus locaux isolés.

La preuve Vite de plus de 30 minutes appartient à la validation source #822 transmise par son propriétaire ; elle n'a pas été répétée pour cette fusion. Les tests de navigateur préexistants ci-dessus utilisent des API synthétiques. Le typage et le build complets sont réussis ; la CI de la tête combinée reste nécessaire. Aucun déploiement n'est établi par ce document.

Typage officiel complet et build client/SSR : exit 0 sur ces sources assemblées. Journaux complets conservés localement dans `/workspace/ui-palette-recovery-evidence/assembly-*.log` ; ils ne sont pas versionnés. Résultats structurés joints. La recette compilée passe sur les six formats ci-dessous ; la CI exacte reste à exécuter.

Recette Chromium compilée assemblée : 6/6 formats réussis (320, 390, 768, 1024, 1280, 1440 px), zéro erreur JavaScript. Recherche/focus pendant remplacement de coque, Escape, clic extérieur, redimensionnement pendant saisie, Database, Back et isolation de projet vérifiés. API synthétique uniquement ; ni Safari local, ni appareil physique, ni production. Receipts/captures/sources/cleanup joints dans `browser/`. Scan gitleaks 8.21.2 de l’export suivi : exit 0, zéro finding.
