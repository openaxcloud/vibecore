# Restauration de la sélection mobile — 12 octobre 2026

Branche de travail : `codex/mobile-selection-restore-20261012`, base exacte `dfd1d1f071a2e19a516833e8fff491fb5a818bd0`. Travail distinct de la PR #731 ; aucun changement de sa branche. Correctifs validés localement, non publiés et non fusionnés ; lot suspendu pour prioriser le diagnostic CI de #731. La fiche `BUG-IDE-MOBILE-RETOUR-SELECTION-001` et les preuves historiques restent dans #731 ; cette note ne ferme pas la fiche.

## Deux mécanismes distincts

**Retour avec sélection absente.** Reproduit sur la base à 768 et 390 px : fichier `audit.txt` ouvert et sélection effectivement persistée, langue française, tableau de bord puis Retour navigateur. La carte des fichiers devient vide et l'éditeur affiche « Aucun fichier sélectionné » après 10 secondes. La trace d'observation confirme : `configureRuntime` vide la carte, le provider efface la sélection, puis trois appels à `loadProjectStorageFiles` renvoient `true` avec une carte toujours vide. Le cache de 30 secondes conserve le booléen d'une hydratation antérieure, sans rejouer ses effets. [Chronologie](mesures/selection-mobile-2026-10-12/cause-archives.json), [capture 768](captures/selection-mobile-2026-10-12/avant-retour-768.png), [capture 390](captures/selection-mobile-2026-10-12/avant-retour-390.png).

Le correctif retire ce délai de conservation pour le seul chargeur d'archives. La déduplication des appels simultanés et les gardes de projet restent actives. Aucune archive périmée n'est réappliquée depuis un nouveau cache.

**Navigation immédiate avec ancien fichier sélectionné.** Reproduit séparément aux deux largeurs, après le correctif précédent : `other.txt` est effectivement persisté, l'utilisateur choisit `audit.txt` puis recharge immédiatement avec `?lang=fr`. Après 10 secondes, l'éditeur affiche toujours `SECOND-DOCUMENT`. La sauvegarde UI de BaseChat attend 1 seconde ; la navigation annule ce délai avant que la nouvelle sélection atteigne la mémoire locale. Le correctif persiste immédiatement le seul chemin sélectionné après restauration du contexte projet/workspace. La couche de mémoire conserve son regroupement réseau de 1,5 seconde ; la disposition, le curseur et le défilement gardent leur délai existant.

La garde du nouvel effet exige le projet ET le workspace dont la restauration a réussi : une readiness héritée du projet précédent ou le simple fallback de 6 secondes ne suffit pas. Une sélection momentanément absente n'est pas enregistrée par ce nouvel effet.

La variante historique README n'est pas confondue avec la sélection absente : dans la trace 390 px de #731, le GET de mémoire à 21:42:00.408 UTC ne contient pas de `ui.selectedFile`, puis un PUT à 21:42:03.891 UTC porte `/home/project/README.md`. Cela est compatible avec un repli faute de sélection sauvegardée ; cette trace historique ne contient pas le relevé local synchrone nécessaire à une attribution exhaustive. La contre-épreuve nouvelle utilise volontairement un autre fichier identifiable.

## Interruption pendant l’hydratation

La contre-épreuve supplémentaire quitte l’IDE pendant qu’une réponse d’archive réelle est retenue, puis revient après sa libération. Elle a d’abord échoué : README était affiché. Relevés : mémoire `audit.txt` sur le tableau de bord initial puis pendant l’attente, champ absent après l’interruption (~2 secondes plus tard), toujours absent lors de la libération. Le délai de sauvegarde UI avait enregistré `selectedFile: undefined` alors que `pendingProjectSelectedFile` attendait encore les fichiers.

La sauvegarde conserve maintenant `selectedFile ?? pendingProjectSelectedFile.current`. Un chemin courant défini garde la priorité ; sans sélection ni attente, le comportement précédent est conservé. Ce changement ne restaure aucun contenu de fichier et n’invente aucun repli README. Le test d’interruption conserve son assertion initiale.

## Validation

- Base exacte : deux échecs navigateur sur Retour, à 768 et 390 ; captures inspectées. Trace d'instrumentation séparée confirmant le faux succès du chargeur.
- Code d'origine réintroduit temporairement : trois des cinq nouvelles contre-épreuves unitaires échouent ; correctif restauré ensuite.
- Premier correctif : deux parcours complets langue / Retour / Suivant / rechargement passent en 21,8 et 21,3 secondes. Captures inspectées : [768](captures/selection-mobile-2026-10-12/apres-archives-retour-768.png), [390](captures/selection-mobile-2026-10-12/apres-archives-retour-390.png).
- Deux échecs indépendants sur sélection puis changement de langue immédiat, avant le second correctif.
- 47 tests ciblés passent : vrais stores fichiers/éditeur, concurrence, archive vide, erreur HTTP puis reprise, réponse tardive interprojet, conservation d'un brouillon pendant réhydratation, mémoire locale et regroupement réseau.
- Version finale : 12/12 passages navigateur réussis (six scénarios répétés deux fois, un worker, zéro retry, 2,9 minutes), dont interruption et transition A → B. Journal : `/tmp/mobile-selection-evidence/repeated.log`.
- Sept gardes AST BaseChat réussies, distinctes des 47 tests ciblés. Typecheck global, contrôle strict du nouveau test E2E, lint, formatage et build final réussis. `BaseChat.tsx` garde la limite de typage décrite ci-dessous.
- Les captures finales des répétitions restent dans `/tmp/mobile-selection-evidence/repeated` ; leur inspection finale et leur archivage sont suspendus à la priorité CI #731. Les captures antérieures liées ci-dessus ont été inspectées.

Les premiers essais de harnais interrompus (ancien serveur encore présent, puis URL forçant le panneau Bibliothèque) ne comptent pas comme preuves du défaut. Les reproductions retenues sont sous `/tmp/mobile-selection-evidence/base-corrected`, `/tmp/mobile-selection-evidence/trace-nav` et `/tmp/mobile-selection-evidence/immediate`.

## Limites

Chromium local à largeurs 768/390, sans émulation tactile native ; aucune certification production. Fichiers importés dans des projets synthétiques locaux, appels runtime/chat bloqués et écritures fichiers navigateur bloquées. Aucun appel d'inférence, démarrage de workspace utilisateur, Save, preview distante, génération ou publication validé par ce travail.

Le test de brouillon couvre une nouvelle hydratation dans le même montage, avec le fichier toujours présent dans l'archive. Il ne prouve ni la persistance du contenu non sauvegardé après navigation/rechargement, ni sa conservation si le fichier disparaît de l'archive. Les resets existants au démontage restent à examiner séparément. Un README déjà sélectionné alors qu'un autre chemin attend encore ses fichiers reste prioritaire dans l'expression de sauvegarde ; cette variante n'est pas déclarée résolue. La validité du chemin différé demeure celle du mécanisme existant. Après échec de restauration, la persistance immédiate reste désactivée et le mécanisme différé existant demeure.

Le test A → B contrôle les mémoires finales et le maintien du même document navigateur ; il ne mesure pas toutes les écritures transitoires. `BaseChat.tsx` conserve son `@ts-nocheck` préexistant : le typecheck global ne certifie pas ce fichier. Les contrôles AST, le build et les parcours navigateur apportent une validation distincte.

Relecture indépendante : correction du cache approuvée ; effet de sélection revu puis borné par le contexte restauré à la suite d'une réserve sur les transitions interprojets. Aucun push avant relecture du parent et livraison de #731.
