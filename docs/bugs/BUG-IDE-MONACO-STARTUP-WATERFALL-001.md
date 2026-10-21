---
id: BUG-IDE-MONACO-STARTUP-WATERFALL-001
section: "IDE — initialisation et persistance"
---

## Bug

L'éditeur desktop ne commence à importer Monaco qu'après l'arrivée et la
sélection d'un fichier. À froid, cette attente en série laisse le conteneur
sans widget alors que l'arbre et l'onglet README sont déjà prêts. Sur le build
production de main `4af4dd1a`, `ide-floating-file-tabs` échoue trois fois à la
ligne 63 avant les gestes flottants, avec Chromium système dans cet environnement.

## 📤 Dispatché

☑ — 21 octobre 2026, reprise indépendante des deux E2E bloquants.

## 💻 Codé

☐ — candidat non fusionné : préchargement dès l'évaluation de la route IDE desktop, avant React et parallèle
à l'hydratation des fichiers ; promesse partagée avec les montages de widgets,
réinitialisée après rejet. La création des modèles et leur synchronisation
restent dans le widget. Pas de changement des délais/assertions/exemptions E2E.

## ✅ Testé live

☐ — production non testée. Le test unitaire d'import retardé a échoué sur le
premier candidat (promesses distinctes), puis les quatre tests Monaco ont passé
après partage de la promesse. La validation navigateur du candidat reste requise.

## Preuve et limites

Voir [le rapport de reprise](../reprise/2026-10-21-monaco-layout.md) pour les
horodatages, traces et différences avec la CI. Ce défaut est distinct de
`BUG-IDE-MONACO-CONTENU-INITIAL-001` : ici le widget manque ; ce n'est pas un
widget affichant le contenu d'un ancien modèle. Le préchargement est un candidat
à valider par les E2E, pas une justification pour élargir leurs attentes.

### Complément du 21 octobre — import de la coquille interactive

Sur le candidat d'intégration `7924745`, deux échecs README montrent le
module Monaco téléchargé en 118–185 ms, mais le téléchargement de Chat.client
ne démarre que 1,3–1,7 s plus tard. Le DOM contient finalement le widget après
l'échéance de l'assertion. L'archive prend 510–824 ms dans ces deux traces ;
ce ne sont pas les archives à 8,9 s du banc saturé.

Candidat suivant : démarrer aussi l'import de Chat.client à l'évaluation de
la route dans le navigateur ; React.lazy reprend la même promesse. Aucun
import navigateur anticipé en SSR, aucun délai ou contrôle E2E modifié.
Deux tests sur les déclarations réelles vérifient le démarrage avant render,
la déduplication et l'absence de préchargement SSR. Recette navigateur requise.

### Décodage ZIP — mesure locale du 21 octobre

Le candidat séparé `42fd1867` retire des lectures de style, mais le coût est
reporté vers PaneTabStrip (~368 ms). Sa recette originale donne six succès
directs, un flaky viewport et un échec fichiers ; aucune amélioration globale
n'est établie. Il reste isolé, sans fusion.

Une observation des vraies méthodes JSZip, sur le test original sans changement
d'assertion, mesure neuf lectures successives : 26 octets attendent 211 ms,
42 octets 115 ms, et l'ensemble du décodage prend 1 038 ms. Des tâches UI
longues s'intercalent ; ce n'est pas un coût CPU équivalent de décompression.
L'observation n'altère ni le résultat ni l'ordre des lectures.

Candidat ciblé : quatre lectures indépendantes au maximum, résultats remis
dans l'ordre d'archive, formats texte/binaire identiques, publication atomique
après succès complet. Une erreur arrête le lancement de nouvelles lectures.
Le test de concurrence échoue avant le changement (une lecture démarrée au
lieu de quatre) ; les 23 autres tests de stockage passent. Après correction, les 63 tests de
stockage et de décodage passent, dont l’arrêt des nouvelles lectures après
erreur et la conservation des documents précédents. Les recettes
production et la mesure après changement restent nécessaires.

Pour le viewport, la trace d'échec au retour du dashboard conserve un panneau
flottant dans la réponse serveur et dans window-main. Une observation du garde
de restauration passe ensuite : acceptation de l'arbre initial puis protection
de l'arbre déjà restauré. Pas de preuve de perte de fichiers ni de causalité du
garde sur cet échec ; le calendrier de chargement reste à vérifier.

### Amorçage du transport avant l’interface

Le candidat de décodage `219c5708` passe 12 cas directs, puis sa répétition
donne trois succès et trois échecs persistants (deux fichiers, un viewport).
Sur trois échecs fichiers, la requête route termine rapidement mais Chat.client
part environ trois secondes plus tard ; archive et mémoire IDE commencent
encore après. IndexedDB ne représente que 173–358 ms dans l’observation
suivante : ce n’est pas l’explication du retard entier.

Le document SSR d’un IDE sans erreur expose désormais son projectId dans un
attribut dédié. Un petit module indépendant du graphe UI démarre le GET archive
avant l’hydratation ; le workbench consomme une fois cette même promesse. Le
transport garde les mêmes credentials, erreurs et endpoint. Un refus n’est pas
réessayé silencieusement ; aucun état de fichier n’est écrit par le préchargement.
Les écritures locales pouvant être postérieures à ce GET sont protégées lors
de sa consommation ; les relectures ordinaires suivantes restent fraîches.

Le module est une exception explicite à sideEffects:false et possède son chunk
propre pour ne pas tirer le workbench sur toutes les pages. Il ne fait aucun
appel hors du document IDE marqué, ni en SSR, ni quand le loader signale une
erreur projet. Les 35 tests ciblés passent ; le graphe compilé et les E2E
restent à vérifier avant toute conclusion de résolution.

## Correction du marqueur SSR après aced48d

La recette `archive-bootstrap-profile` donne deux succès directs et un succès après retry. Le HTML de la tentative échouée ne contient pas le marqueur : AppShell enveloppe la route IDE dans ClientOnly. Le module feuille ne pouvait donc pas démarrer son transport tôt, malgré son inclusion dans le build. Le marqueur est déplacé dans Layout, sur html, à partir du seul loader IDE réussi ; aucune erreur de route ou projet ne déclenche ce préchargement. Six tests du module passent. Validation production du nouveau placement encore en attente ; aucune disparition du flaky revendiquée.

Le préchargement non consommé est invalidé quand Layout quitte le projet IDE autorisé et sur pagehide, y compris un retour BFCache. Cela ne relance pas la requête abandonnée. La garantie de non-réessai après 403 est limitée au helper : les mécanismes de fallback existants du produit ne sont pas modifiés. La protection de versions couvre les sauvegardes achevées ; une écriture runtime encore en vol reste une course préexistante distincte, sans perte physique démontrée ici.

### Mesures locales après déplacement du marqueur

Le build `aced48d` + patch SHA256 `166daa38e280484f195693788ba4e67b9da366bec86b0151158570a39b7c6b93` (archive récupérable commentaire #749/6314488603 ; voir empreinte exacte dans ce commentaire) a passé trois cas fichiers flottants instrumentés sans retry. Transport à 1,53–1,70 s, avant hydratation ; montage Monaco à 3,93–5,75 s. Les handlers archive corrélés par projet unique prennent 36,5–48,6 ms. Cela ne prouve pas la disparition du pic historique de 8,86 s ni des flaky CI. Les mesures détaillées et request IDs sont publiés dans #749/6314589819.

Le garde supplémentaire de fraîcheur passe huit tests unitaires ; sa recette sur le nouvel arbre de publication reste en cours. Chromium local 154 et runtime par défaut (`VITE_RUNTIME_MODE` absent), pas le navigateur CI dont le téléchargement a été refusé. Aucun changement de délai, assertion, exemption ou retry pour ces résultats.
