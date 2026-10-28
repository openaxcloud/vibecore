# Couverture de cette passe UI IDE — 28 octobre 2026

Le registre `app/lib/ide/panel-registry.ts` contient **31 panneaux adressables canoniques**, alias exclus. Cette passe a exercé de façon ciblée **7 panneaux sur 31**, plus les sous-pages Usage/Memory de Settings. Aucun de ces nombres ne signifie une certification complète de panneau ou de plateforme. Les validations antérieures et celles des autres sessions ne sont pas reprises comme nos propres résultats.

| Surface | Recette réellement effectuée | État / limite |
| --- | --- | --- |
| Files | 390/820/1280 × FR/EN, noms longs, menu clavier et resize ; IME en composants | #833 protège IME. Menu local : 13 contextes et 143 cibles clavier/hit-test verts, plus zoom navigateur 200 % ; lot non publié. |
| Editor | Texte modifié conservé sur six transitions ; curseur sélectionné mesuré sur trois transitions CodeMirror/Monaco | Focus et sélection perdus avant correction ; trois transferts corrigés et vérifiés localement, y compris chargement LazyWorkbench à froid et absence de flash Agent ; CRLF non pris en charge ; aucun backend réel validé. |
| Terminal | Menus clavier 390/768/1280/1920, portrait/paysage844×390, visibilité intégrale des huit contrôles | #833 : workflows verts, avec quatre reprises E2E documentées dont le menu1280 non reproduit localement. Pas de Shell réel, clavier virtuel ou recette Safari de ce lot. |
| Search | Réponses périmées, remplacement de coque, 390/1280, sélection/caret, resize, Agent/Retour/Suivant | #833 protège le réseau ; #836 protège brouillon/focus. Contre-preuve avec ancien nœud détaché sur Chromium ; API synthétique. |
| Settings / Usage | Première passe320/390/768/1024/1280/1440 ; après CSS360/1280 avec scroll clavier du tableau | Aucune opération financière réelle. Les autres formulaires Settings ne sont pas certifiés. |
| Settings / Memory | Trois resize, états loading/erreur/vide, sauvegarde503 interceptée, six recettes finales360/390/820/1280 dont sombre et zoom natif 200 % | #835 validée localement ; aucun enregistrement client ni backend Memory réel. |
| Ports | 1280 FR/EN, GET synthétiques, aucun clic de mutation | Correction locale compilée vérifiée : action private proposée en FR/EN ; aucun port réel modifié. |
| Packages | 1280 FR/EN, gestionnaire sélectionné via bouton local | aria-pressed corrigé et vérifié en navigateur FR/EN. Aucune installation exécutée. |

Agent est traversé par les tests de navigation et de focus extérieur, pas audité intégralement ici. L'affichage de Preview dans les fixtures ne constitue pas une recette runtime ou production.

## Panneaux sans audit complet dans cette passe

`agent`, `preview`, `locks`, `overview`, `studio`, `problems`, `database`, `object-storage`, `skills`, `monitoring`, `extensions`, `integrations`, `workflows`, `debugger`, `deployments`, `security`, `env`, `secrets`, `git`, `activity`, `logs`, `collaborators`, `domains`, `snapshots`.

Publish/Domains, messages Agent et historique sont suivis dans d'autres sessions (#831, #830 et #832) ; leur seule existence ne vaut pas preuve de livraison ou de couverture complète. Les fichiers modèles/budget/workbench store du hub #828/#829 sont préservés.

## Nature des preuves

Chromium local et fixtures synthétiques isolées, composants/CSS réellement compilés. Tests unitaires, tests de CI, recette locale et version déployée sont distincts. Les PR #833/#835/#836 sont des brouillons tant que leurs contrôles exacts et la fenêtre de livraison ne sont pas satisfaits. Pas de certification Safari, appareil physique, safe areas matérielles, clavier virtuel, lecteur d'écran, ultralarge ou contraste exhaustif. Aucun mock ajouté au produit et aucun contrôle de CI diminué.

Le canari WebKit CI de #833 passe 19 tests et en ignore 3 ; ce résultat ciblé ne valide pas les sept panneaux sur Safari ou appareil physique. Les recettes détaillées de cette passe utilisent Chromium.
