# Navigation normale en attente puis déplacement — rouge conservé

Contre-épreuve locale sur le produit `d0ef212609d3af7f652cc216427ecb7a55570723` (également présent dans la tête documentaire afe8). Un clic normal sélectionne Webview et démarre une requête de navigation réelle ; sa continuation est retenue jusqu’au déplacement du même onglet du panneau A vers B, puis libérée. Aucune réponse réseau simulée, aucun clic forcé ni délai fixe.

**0/1 : échec direct, zéro retry et zéro omission.** Après déplacement, les trois identifiants sont conservés. Après application de la navigation, quatre onglets existent : Webview a été recréé dans A alors que l’original reste dans B. Le reçu `red.json` conserve les observations et l’empreinte du rapport original. La capture inspectée montre les deux Webviews ; `capture.json` en donne la provenance et l’empreinte.

La navigation ordinaire ne porte pas l’identifiant réservé au déplacement. Le setter la juge redondante mais retourne false ; le reçu du déplacement est effacé, et l’effet URL rouvre le panneau dans la source. Ce cas n’était pas dans les 73 succès précédents : ils restent des résultats historiques, pas une validation de ce scénario.

Au stade rouge, la correction et sa revalidation restaient à effectuer. Le risque spécifique d’une clé POP déjà présente dans l’historique a aussi été identifié ; le résultat local ultérieur est distingué ci-dessous.

Extraction sur liste blanche : seuls verdicts, assertions et identifiants des onglets synthétiques sont conservés. Aucun rapport brut, trace réseau, cookie, session ou secret publié.

## Résultat local du correctif

Le build `edb558bc326be7075ce042beeea25685a0e8864f` passe les **9 cas directement, zéro retry et zéro omission** (`green.json`). Le scénario normal-click auparavant rouge conserve les trois identifiants. Le reçu peut désormais suivre la clé de la navigation normale en attente ; une navigation terminée ailleurs invalide le reçu avant la synchronisation URL.

Le scénario POP interrompu était **déjà vert sur le baseline** : il protège contre une régression du nouveau mécanisme, et ne démontre pas un ancien bug POP corrigé. Il vérifie l’annulation réseau, puis un Retour réel vers la même clé historique et la sélection du Webview. Les deux captures vertes inspectées et leurs empreintes figurent dans `green-captures.json`.

Vérification indépendante : 9 339 sources comparées aux blobs du commit et 2 306 fichiers de l’archive comparés au manifeste, aucun écart (`independent-build-check.json`). La suite complémentaire et la CI sont suivies séparément par le chantier principal. Aucune validation de production ni certification complète des panneaux.
