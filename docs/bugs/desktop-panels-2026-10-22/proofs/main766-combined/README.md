# Intégration de main #766 dans le lot UX #768

Commit compilé `c742be17b6f5cca708394c2c497b6607f4b70c82`, arbre `1ed7cfbd270fb067a6d2105be34842fbd32ac272`. Main intégré : `3680f4fadf2f88655cce702c7e8cdfe835a1131f`. Le seul conflit concernait l’index documentaire, régénéré à 476 fiches. Le reçu de comparaison conserve les 12 blobs entrants de main et les 95 blobs UX exacts ; il s’agit d’une comparaison de sources, pas d’une preuve d’exécution.

Le build termine avec code 0. L’attestation compare 9 466 sources aux blobs Git sans différence et recense 2 307 fichiers compilés. L’archive privée porte le SHA-256 `9b6085a5132ba32d5732a7dafda8b20eb77fdacbbc15a1d64a021f16aa212202` ; elle n’est pas jointe. Les manifestes joints contiennent uniquement chemins relatifs et empreintes. L’asset servi vérifié est décrit séparément.

## Banc et résultats

Application locale port 5229 ; API locale port 3018 issue de la source exacte, PostgreSQL synthétique existant. Le harness interdit les accès HTTP externes et les emails. Aucun compte réel, achat ou nouvel accès n’est utilisé. Les hooks sont rapportés verts par le responsable du lot ; cette affirmation ne remplace pas une future CI sur la tête publiée.

La recette principale termine avec **21 succès directs, zéro échec, retry ou omission**, en 177,108 s. Les titres et durées des cas sont conservés dans `e2e-summary.json`. Le rapport provisoire issu de `--list` inventorie 21 cas et ne représente aucune exécution : ses compteurs d’omission ne sont pas un échec de préparation ni un verdict E2E. Le rapport d’exécution terminé a remplacé ce résultat de découverte. Les deux cas tactiles Preview terminent également avec **deux succès directs, zéro échec, retry ou omission**, aux formats 390×844 et 768×1024, Chromium système avec isMobile/hasTouch activés, un worker et zéro retry. Le détail est dans `touch-summary.json`. Total de cette combinaison : **23 succès directs**, sans reprendre les résultats historiques comme nouveaux résultats.

Les preuves historiques ne sont ni réécrites ni appliquées à cette nouvelle combinaison. Les intermittences historiques restent ouvertes tant que leur résolution n’est pas démontrée. Aucun panneau complet, scénario Save/runtime ou déploiement production n’est certifié par ces reçus.

## Confidentialité

Aucun rapport brut, trace ZIP, token, cookie, identité privée, réponse API ou archive de build n’est copié. Les reçus de provenance et comparaisons ne contiennent que chemins techniques, hashes et métadonnées Git. Les documents présents sont postérieurs au build et ne prétendent pas figurer dans son manifeste de sources.

## Contrôles ciblés et reproduction

Les tests unitaires ciblés terminent avec **237/237 succès dans six fichiers**, zéro omission, en 8,59 s. Les gardes API isolées terminent avec **31/31 succès dans deux fichiers**, zéro omission, en 6,79 s. Les empreintes des logs privés sont conservées dans `unit-summary.json`, sans recopier les logs. Les gardes API ne constituent pas une validation réelle de durabilité auprès d’un runtime fournisseur.

`configurations-exactes.txt` contient les deux configurations Playwright employées et leurs empreintes. La configuration principale hérite du fichier suivi `playwright.config.ts` à la révision attestée ; la configuration tactile référence sa recette privée, suivie par le responsable du banc. Les trois captures sélectionnées ont été inspectées : palette avec recherche préservée après remplacement de coque à 1440 px, barre Preview à 1440 px et Preview tactile à 390 px. Les noms d’espace de travail visibles sont exclusivement synthétiques. Les captures illustrent ces instants ; les assertions et résultats attestent les gestes, pas les images seules.

Le banc de portée B→A constitue un lot distinct. Ses interruptions runtime/WebSocket/écritures ne sont pas automatiquement attribuées aux cinq specs de cette combinaison. Ces résultats ne certifient pas Save ou un runtime fournisseur réel.
