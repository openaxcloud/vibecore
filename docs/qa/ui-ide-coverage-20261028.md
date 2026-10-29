# Couverture de cette passe UI IDE — 28 octobre 2026

Le registre `app/lib/ide/panel-registry.ts` contient **31 panneaux adressables canoniques**, alias exclus. Cette passe a exercé de façon ciblée **21 panneaux sur 31**, plus cinq sous-pages Settings exercées partiellement sur sept (Projet, Compte, Préférences, Usage, Memory). Aucun de ces nombres ne signifie une certification complète de panneau ou de plateforme. Les validations antérieures et celles des autres sessions ne sont pas reprises comme nos propres résultats.

| Surface | Recette réellement effectuée | État / limite |
| --- | --- | --- |
| Snapshots | 390/820/1280, loading/vide, texte long, détails clavier et503→Retry | Neuf recettes synthétiques ; aucune création/restauration réelle. |
| Collaborators | 390/820/1280, loading/vide/503→Retry, commentaire URL long | Six recettes vide/reprise ; débordement reproduit trois formats, correctif local validé sur build compilé390/820/1280 sans injectionCSS, non publié. Deux pertes initiales de brouillon restent inexpliquées, remplacement de coque non prouvé. Aucune invitation/permission réelle. |
| Extensions | 390/820/1280, loading/vide,503→Retry, texte long, recherche et clavier | Neuf recettes synthétiques ; aucune installation/activation réelle. |
| Workflows | 390/820/1280, loading/vide,503→Retry, détails et historique longs au clavier | Six recettes vide/reprise ; débordement reproduit trois formats, correctif local compilé sans injectionCSS3/3vert, non publié. Aucune commande exécutée ni sauvegarde. Poignée de déplacement clavier hors validation. |
| Files | 390/820/1280 × FR/EN, noms longs, menu clavier et resize ; IME en composants | #833 protège IME. Menu local : 13 contextes et 143 cibles clavier/hit-test verts, plus zoom navigateur 200 % ; lot assemblé en brouillon dans #838. |
| Editor | Texte modifié conservé sur six transitions ; curseur sélectionné mesuré sur trois transitions CodeMirror/Monaco | Focus et sélection perdus avant correction ; trois transferts corrigés et vérifiés localement, y compris chargement LazyWorkbench à froid et absence de flash Agent ; CRLF non pris en charge ; aucun backend réel validé. |
| Terminal | Menus clavier 390/768/1280/1920, portrait/paysage844×390, visibilité intégrale des huit contrôles | #837 : échec Terminal1280 sur trois tentatives. Remplacement de coque et perte du menu/focus ensuite reproduits localement à390/768/1280 ; transfert éphémère corrigé et trois recettes finales compilées vertes, sans retard du chat. Pas de Shell réel, clavier virtuel ou recette Safari de ce lot. |
| Search | Réponses périmées, remplacement de coque, 390/1280, sélection/caret, resize, Agent/Retour/Suivant | #833 protège le réseau ; #836 protège brouillon/focus. #838 contient la synchronisation du test sur le routeur, mais une reprise CI persiste après route idle. Le désaccord URL Search/surface Agent est ensuite reproduit et corrigé dans le lot local suivant : quatre recettes compilées390/768/390/820 passent. CI/livraison de ce complément non exécutées à ce stade ; #834 reste ouvert. Contre-preuve avec ancien nœud détaché sur Chromium ; API synthétique. |
| Settings / Usage | Première passe320/390/768/1024/1280/1440 ; après CSS360/1280 avec scroll clavier du tableau | Aucune opération financière réelle. Les autres formulaires Settings ne sont pas certifiés. |
| Settings / Memory | Trois resize, états loading/erreur/vide, sauvegarde503 interceptée, six recettes finales360/390/820/1280 dont sombre et zoom natif 200 % | #835 validée localement ; aucun enregistrement client ni backend Memory réel. |
| Ports | 1280 FR/EN, GET synthétiques, aucun clic de mutation | Correction locale compilée vérifiée : action private proposée en FR/EN ; aucun port réel modifié. |
| Packages | 1280 FR/EN, gestionnaire sélectionné via bouton local | aria-pressed corrigé et vérifié en navigateur FR/EN. Aucune installation exécutée. |
| Problems | 390/820/1280, chacun à100% et zoom natif200%, chemin long en état frontend synthétique | Six recettes compilées vertes, focus/Entrée ouvrent le fichier synthétique ; aucun backend réel. |
| Skills | 390/820/1280/1536, vide/Community et description Built-in longue synthétique | Débordement reproduit puis corrigé localement ; quatre recettes compilées sans override passent. Aucune installation/toggle, backend réel, Safari ou zoom200%. |
| Locks | États vide390/820/1280 et peuplé synthétique390/1280 | Géométrie seulement ; aucune opération verrouiller/déverrouiller et petites cibles encore à caractériser. |
| Settings / Compte et Préférences | FR/EN1280/1920, aller-retour390, zoom200%, deux panneaux simultanés | Six recettes compilées vertes : brouillons isolés, onglets conservés, thème accessible ; aucune sauvegarde de compte réelle. |
| Logs | 390/820/1280, 60 lignes synthétiques, URL longue, filtre vide puis reprise, clavier | Trois recettes passent ; scroll horizontal local permis, aucun défaut confirmé. Aucun flux réel. |
| Activity | 390/820/1280/1536/1920, split réel sur grands écrans et resize avec filtre | Grille trop large reproduite puis corrigée localement ; cinq recettes compilées passent. Pas de backend réel. |
| Overview | 390/820/1280, libellés longs et503→Retry clavier→récupération | Six recettes passent. Vide390/820 passe ; premier vide1280 dépasse5s avant affichage, cause inconnue : pas un succès sans reprise. |
| Monitoring | 390/820/1280, libellés longs et503→Retry clavier→récupération | Six recettes passent ; filtre24h activable par Entrée. Pas de métriques runtime réelles. |
| Database | Vide390/820/1280, boutons et géométrie | Trois recettes passent, aucun clic Create ni SQL ; provisionnement non exercé. |
| Object Storage | 390/820/1280, chargement,503, Retry clavier, état confirmé | Erreur masquée reproduite puis corrigée localement ; six recettes compilées passent. enabled:true/provisioned:false ne signifie pas bucket prêt ; Enable jamais cliqué. |

Agent : défaut Escape du menu outils reproduit sur quatre formats puis corrigé dans un lot local séparé de #838. Neuf formats compilés320/360/390/768/820/1280/1536/1920 et paysage844×390 passent fermeture, focus, géométrie et brouillon. Deux parcours supplémentaires390/1280 conservent le brouillon pendant resize vers768 puis1280 puis format initial. API synthétiques, aucun prompt envoyé. Pas d’audit intégral du fil, interruptions ou exécution Agent. L'affichage de Preview dans les fixtures ne constitue pas une recette runtime ou production.

## Autres panneaux sans recette ciblée dans cette passe

`preview`, `studio`, `integrations`, `debugger`, `deployments`, `security`, `env`, `secrets`, `git`, `domains` (10 panneaux).

Publish/Domains, messages Agent et historique sont suivis dans d'autres sessions (#831, #830 et #832) ; leur seule existence ne vaut pas preuve de livraison ou de couverture complète. Les fichiers modèles/budget/workbench store du hub #828/#829 sont préservés.

## Nature des preuves

Chromium local et fixtures synthétiques isolées, composants/CSS réellement compilés. Tests unitaires, tests de CI, recette locale et version déployée sont distincts. Les PR #833/#835/#836 sont des brouillons tant que leurs contrôles exacts et la fenêtre de livraison ne sont pas satisfaits. Pas de certification Safari, appareil physique, safe areas matérielles, clavier virtuel, lecteur d'écran, ultralarge ou contraste exhaustif. Aucun mock ajouté au produit et aucun contrôle de CI diminué.

Le canari WebKit CI de #833 passe 19 tests et en ignore 3 ; ce résultat ciblé ne valide pas les sept panneaux sur Safari ou appareil physique. Les recettes détaillées de cette passe utilisent Chromium.

Les sous-pages IA et Sécurité ont été lues statiquement seulement dans ce complément. Les notifications Settings globales restent un incident distinct à caractériser ; aucune isolation de ces notifications n’est revendiquée. La correction Problems est groupée avec le complément Settings dans le brouillon #838, assemblage des PR833/835/836/837, sans fusion ni déploiement. Le gate SBOM de main bloque la fenêtre de livraison.

## Complément messages et données local, distinct des têtes838/839

Le header des blocs de code Agent recouvrait la première ligne. Six recettes compilées passent après correction (clair390/820/1280/1536, sombre390/1280), avec erreur de copie puis reprise, texte exact, clavier et scroll horizontal. Le helper géométrique exact ajouté aux deux scénarios E2E existants passe localement à390/1440 ; la suite complète attend l’API de seed isolée en CI. Le contraste mesuré concerne seulement le retour de copie, pas tout le thème syntaxique.

Les nouveaux reçus sont dans [le dossier de preuves](../bugs/ui-agent-data-panels-evidence-20261028/README.md). Les nouveaux correctifs ne sont pas fusionnés ni livrés. Aucun résultat de cette section ne certifie Safari, appareil physique, zoom200%, clavier virtuel, safe areas matérielles ou backend réel. Search après Retour et retourB→A#834 restent ouverts dans cette matrice jusqu’à leurs preuves spécifiques ; ils ne sont pas déclarés corrigés par ces recettes.

Complément du29octobre : retour interprojetB→A#834 non reproduit dans six parcours locaux768 (troisCPU×4surRetour). Deux timeoutsCPU×4au démarrage se produisent avantRetour, aucune conclusion produit. Agent : quatreimages respectant contrat ne débordent pas dans six recettesFR/EN390/820/1280 ; Maj+F10 ne déclenche pas le menu utilisateur malgré focus Tab. Ce défaut est réservé au propriétaire messages/historique ; aucune correction dans ce lot.
